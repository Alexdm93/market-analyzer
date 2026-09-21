import { SnapshotProcessingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WORKSPACE,
  EMPTY_COMPANY_INFO,
  type CompanyInfo,
  type ExchangeRate,
  type Snapshot,
  safeParseCompanyInfo,
  safeParseSnapshots,
} from "@/lib/workspace";
import { getBcvRate, getBcvEuroRate, getBinanceRate, buildBcvTasa, buildBcvEurTasa } from "@/lib/bcv";
import { computeRowTotals } from "@/lib/compensation";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";
import { getLockedSnapshotsForUser } from "@/lib/snapshot-lock";

type TransactionClient = Prisma.TransactionClient;

function resolveSnapshotDate(value: string) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return parsedDate;
}

function resolveCompanyName(companyInfo: CompanyInfo, fallbackName: string) {
  const normalized = companyInfo.companyName.trim();
  return normalized || fallbackName;
}

function getDuplicateCargoTitles(snapshots: Record<string, Snapshot>) {
  const duplicateTitles = new Set<string>();

  Object.values(snapshots).forEach((snapshot) => {
    const seen = new Map<string, string>();

    (snapshot.rows ?? []).forEach((row) => {
      const rawTitle = (row.tituloCargo ?? "").trim();
      const normalizedTitle = rawTitle.toLocaleLowerCase();

      if (!normalizedTitle) {
        return;
      }

      const previousTitle = seen.get(normalizedTitle);

      if (previousTitle) {
        duplicateTitles.add(previousTitle);
        duplicateTitles.add(rawTitle);
        return;
      }

      seen.set(normalizedTitle, rawTitle);
    });
  });

  return Array.from(duplicateTitles);
}

async function getCompanyIdentity(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      company: {
        select: {
          name: true,
          description: true,
          economicSector: true,
          classification: true,
          headcount: true,
          revenueUSD: true,
          avgProfitPercent: true,
          hrName: true,
          hrPosition: true,
          hrEmail: true,
          hrPhone: true,
          hrCell: true,
          minVacationDays: true,
          minUtilityDays: true,
          conversionRate: true,
          locality: true,
        },
      },
    },
  });

  return user?.company ?? null;
}

function mergeCompanyIdentity(companyInfo: CompanyInfo, company: {
  name: string;
  description: string;
  economicSector: string;
  classification: string;
  headcount: string;
  revenueUSD: string;
  avgProfitPercent: string;
  hrName: string;
  hrPosition: string;
  hrEmail: string;
  hrPhone: string;
  hrCell: string;
  minVacationDays: string;
  minUtilityDays: string;
  conversionRate: string;
  locality: string;
} | null): CompanyInfo {
  if (!company) {
    return companyInfo;
  }

  return {
    ...companyInfo,
    companyName: company.name,
    sector: company.economicSector,
    classification: company.classification,
    description: company.description,
    headcount: company.headcount,
    revenueUSD: company.revenueUSD,
    avgProfitPercent: company.avgProfitPercent,
    hrName: company.hrName,
    hrPosition: company.hrPosition,
    hrEmail: company.hrEmail,
    hrPhone: company.hrPhone,
    hrCell: company.hrCell,
    minVacationDays: company.minVacationDays,
    minUtilityDays: company.minUtilityDays,
    conversionRate: company.conversionRate,
    locality: company.locality,
  };
}

async function syncCompanyInfo(
  tx: TransactionClient,
  companyId: string,
  companyInfo: CompanyInfo
) {
  await tx.company.update({
    where: { id: companyId },
    data: {
      name: companyInfo.companyName,
      description: companyInfo.description,
      economicSector: companyInfo.sector,
      classification: companyInfo.classification,
      headcount: companyInfo.headcount,
      revenueUSD: companyInfo.revenueUSD,
      avgProfitPercent: companyInfo.avgProfitPercent,
      hrName: companyInfo.hrName,
      hrPosition: companyInfo.hrPosition,
      hrEmail: companyInfo.hrEmail,
      hrPhone: companyInfo.hrPhone,
      hrCell: companyInfo.hrCell,
      minVacationDays: companyInfo.minVacationDays,
      minUtilityDays: companyInfo.minUtilityDays,
      conversionRate: companyInfo.conversionRate,
      locality: companyInfo.locality,
    },
  });
}

async function ensureCompanyIdForUser(
  tx: TransactionClient,
  userId: string,
  companyInfo: CompanyInfo
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              users: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const fallbackCompanyName = user.company?.name?.trim() || (user.name.trim() ? `Empresa ${user.name.trim()}` : `Empresa ${user.email}`);
  const companyName = resolveCompanyName(companyInfo, fallbackCompanyName);

  if (user.company?.name === companyName) {
    return {
      companyId: user.company.id,
      previousCompanyId: null,
    };
  }

  const existingCompany = await tx.company.findUnique({
    where: { name: companyName },
    select: { id: true },
  });

  if (user.company && user.company._count.users === 1 && !existingCompany) {
    const renamedCompany = await tx.company.update({
      where: { id: user.company.id },
      data: { name: companyName },
      select: { id: true },
    });

    return {
      companyId: renamedCompany.id,
      previousCompanyId: null,
    };
  }

  const company =
    existingCompany ??
    (await tx.company.create({
      data: { name: companyName },
      select: { id: true },
    }));

  const previousCompanyId = user.companyId !== company.id ? user.companyId : null;

  if (previousCompanyId) {
    await tx.user.update({
      where: { id: userId },
      data: { companyId: company.id },
    });
  }

  return {
    companyId: company.id,
    previousCompanyId,
  };
}

async function cleanupUnusedCompany(tx: TransactionClient, companyId: string | null) {
  if (!companyId) {
    return;
  }

  const companyUsage = await tx.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });

  if (!companyUsage) {
    return;
  }

  const [userCount, snapshotCount, positionCount] = await Promise.all([
    tx.user.count({ where: { companyId } }),
    tx.userSnapshot.count({ where: { companyId } }),
    tx.userPosition.count({ where: { companyId } }),
  ]);

  if (userCount === 0 && snapshotCount === 0 && positionCount === 0) {
    await tx.company.delete({
      where: { id: companyId },
    });
  }
}

/** Tope de tasas propias por empresa, igual que el formulario de Empresa. */
const MAX_TASAS_POR_EMPRESA = 5;

// Fields that change automatically on every save and should not trigger a _lastModified update
const VOLATILE_FIELDS = new Set([
  "_carried", "_lastModified",
  "_cachedTotalSinPasivosMensual", "_cachedTotalConPasivosMensual",
  "_cachedTotalConPasivosAnual", "_cachedTotalDirectoMensualizado",
]);

function stripVolatile(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !VOLATILE_FIELDS.has(k)));
}

type SnapshotStatusRow = {
  snapshotId: string;
  status: SnapshotProcessingStatus;
  processedAt: Date | null;
  submittedAt: Date | null;
};

/**
 * Construye el mapa de estados dando prioridad a la fila que ya tiene un envío
 * registrado: una empresa puede tener varios usuarios y solo uno de ellos haber
 * enviado el corte.
 */
function buildStatusMap(rows: SnapshotStatusRow[]) {
  const map = new Map<string, { status: SnapshotProcessingStatus; processedAt: Date | null; submittedAt: Date | null }>();
  for (const row of rows) {
    const previous = map.get(row.snapshotId);
    if (previous && previous.submittedAt && !row.submittedAt) continue;
    map.set(row.snapshotId, { status: row.status, processedAt: row.processedAt, submittedAt: row.submittedAt });
  }
  return map;
}

async function syncRelationalWorkspace(
  tx: TransactionClient,
  userId: string,
  companyId: string,
  snapshots: Record<string, Snapshot>,
  /**
   * Estados leídos por quien llama ANTES de borrar nada. El guardado del admin a
   * nombre de una empresa borra sus snapshots antes de llegar aquí, así que sin
   * esto la consulta de abajo salía vacía y el corte perdía su `submittedAt`.
   */
  statusesAntesDeBorrar?: SnapshotStatusRow[],
) {
  const [existingStatuses, existingPositions] = await Promise.all([
    statusesAntesDeBorrar
      ? Promise.resolve(statusesAntesDeBorrar)
      : tx.userSnapshot.findMany({
          where: { userId },
          select: { snapshotId: true, status: true, processedAt: true, submittedAt: true },
        }),
    tx.userPosition.findMany({
      where: { userId },
      select: { snapshotId: true, positionId: true, dataJson: true },
    }),
  ]);

  const statusBySnapshotId = buildStatusMap(existingStatuses);

  // Build lookup: snapshotId:positionId → existing normalized data + _lastModified
  type ExistingEntry = { normalized: string; lastModified: string | undefined };
  const existingMap = new Map<string, ExistingEntry>();
  for (const p of existingPositions) {
    try {
      const parsed = JSON.parse(p.dataJson) as Record<string, unknown>;
      existingMap.set(`${p.snapshotId}:${p.positionId}`, {
        normalized: JSON.stringify(stripVolatile(parsed), Object.keys(stripVolatile(parsed)).sort()),
        lastModified: typeof parsed._lastModified === "string" ? parsed._lastModified : undefined,
      });
    } catch { /* skip malformed */ }
  }

  // Solo tocar los cortes que vienen en este guardado — cualquier otro corte del
  // usuario que no esté en `snapshots` (p. ej. porque quedó fuera del payload de esta
  // pestaña) se deja intacto en la base de datos en vez de borrarse.
  const snapshotIdsInPayload = Object.keys(snapshots);
  await tx.userPosition.deleteMany({ where: { userId, snapshotId: { in: snapshotIdsInPayload } } });
  await tx.userSnapshot.deleteMany({ where: { userId, snapshotId: { in: snapshotIdsInPayload } } });

  const now = new Date().toISOString();

  const snapshotInserts: {
    id: string; userId: string; companyId: string; snapshotId: string;
    label: string; date: Date; status: SnapshotProcessingStatus; processedAt: Date | null; submittedAt: Date | null;
  }[] = [];
  const positionInserts: {
    userId: string; companyId: string; userSnapshotId: string; snapshotId: string;
    snapshotLabel: string; snapshotDate: Date; positionId: string;
    title: string | null; dataJson: string;
  }[] = [];

  for (const snapshot of Object.values(snapshots)) {
    const snapshotPk = crypto.randomUUID();
    snapshotInserts.push({
      id: snapshotPk,
      userId,
      companyId,
      snapshotId: snapshot.id,
      label: snapshot.label,
      date: resolveSnapshotDate(snapshot.date),
      status: statusBySnapshotId.get(snapshot.id)?.status ?? SnapshotProcessingStatus.IN_REVIEW,
      processedAt: statusBySnapshotId.get(snapshot.id)?.processedAt ?? null,
      submittedAt: statusBySnapshotId.get(snapshot.id)?.submittedAt ?? null,
    });

    for (const row of snapshot.rows ?? []) {
      const key = `${snapshot.id}:${row.id}`;
      const existing = existingMap.get(key);
      const rowStripped = stripVolatile(row as unknown as Record<string, unknown>);
      const rowNormalized = JSON.stringify(rowStripped, Object.keys(rowStripped).sort());

      // Preserve _lastModified if data didn't change; set to now if modified.
      // If new to this snapshot (cloned from previous cut), preserve whatever
      // _lastModified the row already carries — only fall back to now if it has none.
      const rowExistingLastModified = row._lastModified;
      const lastModified = existing
        ? (existing.normalized === rowNormalized ? (existing.lastModified ?? now) : now)
        : (rowExistingLastModified ?? now);

      positionInserts.push({
        userId,
        companyId,
        userSnapshotId: snapshotPk,
        snapshotId: snapshot.id,
        snapshotLabel: snapshot.label,
        snapshotDate: resolveSnapshotDate(snapshot.date),
        positionId: row.id,
        title: row.tituloCargo || null,
        dataJson: JSON.stringify({ ...row, _lastModified: lastModified }),
      });
    }
  }

  if (snapshotInserts.length > 0) {
    await tx.userSnapshot.createMany({ data: snapshotInserts });
  }
  if (positionInserts.length > 0) {
    await tx.userPosition.createMany({ data: positionInserts });
  }
}

async function backfillRelationalWorkspace(userId: string, companyInfoJson: string, snapshotsJson: string) {
  const nextCompanyInfo = safeParseCompanyInfo(companyInfoJson);
  const nextSnapshots = safeParseSnapshots(snapshotsJson);

  await prisma.$transaction(async (tx) => {
    const { companyId, previousCompanyId } = await ensureCompanyIdForUser(tx, userId, nextCompanyInfo);
    const snapshotCount = await tx.userSnapshot.count({ where: { userId } });

    if (snapshotCount === 0 && Object.keys(nextSnapshots).length > 0) {
      await syncRelationalWorkspace(tx, userId, companyId, nextSnapshots);
    }

    await cleanupUnusedCompany(tx, previousCompanyId);
  });
}

type UpdateWorkspaceBody = Partial<{
  /** Marca de versión que leyó el admin; si no coincide, el guardado se rechaza. */
  baseUpdatedAt: string;
  inflation: number;
  snapshots: Record<string, Snapshot>;
  selectedSnapshotId: string;
  companyInfo: CompanyInfo;
}>;

async function getCurrentSession() {
  return getServerSession(authOptions);
}

async function getOrCreateWorkspace(userId: string) {
  // Leer primero y no tocar nada si ya existe — un upsert con `update: {}` sigue
  // siendo un UPDATE para Postgres/Prisma, así que @updatedAt se actualizaba en
  // cada simple GET, disparando falsos indicadores de "hay datos nuevos".
  const existing = await prisma.userWorkspace.findUnique({ where: { userId } });
  if (existing) return existing;

  // Solo se ejecuta en el primer fetch del workspace de un usuario — el upsert
  // sigue protegiendo el caso raro de dos requests concurrentes de primera vez.
  return prisma.userWorkspace.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      inflation: DEFAULT_WORKSPACE.inflation,
      snapshotsJson: JSON.stringify(DEFAULT_WORKSPACE.snapshots),
      selectedSnapshotId: DEFAULT_WORKSPACE.selectedSnapshotId,
      companyInfoJson: JSON.stringify(DEFAULT_WORKSPACE.companyInfo),
    },
  });
}

function toPayload(workspace: {
  inflation: number;
  snapshotsJson: string;
  selectedSnapshotId: string | null;
  companyInfoJson: string;
}, company: {
  name: string;
  description: string;
  economicSector: string;
  classification: string;
  headcount: string;
  revenueUSD: string;
  avgProfitPercent: string;
  hrName: string;
  hrPosition: string;
  hrEmail: string;
  hrPhone: string;
  hrCell: string;
  minVacationDays: string;
  minUtilityDays: string;
  conversionRate: string;
  locality: string;
} | null) {
  const parsedCompanyInfo = safeParseCompanyInfo(workspace.companyInfoJson);

  return {
    inflation: Number.isFinite(workspace.inflation) ? workspace.inflation : DEFAULT_WORKSPACE.inflation,
    snapshots: safeParseSnapshots(workspace.snapshotsJson),
    selectedSnapshotId: workspace.selectedSnapshotId ?? "",
    companyInfo: mergeCompanyIdentity(parsedCompanyInfo, company),
  };
}

async function getSnapshotCompanyFilter(snapshotIds: string[]): Promise<Map<string, string[]>> {
  if (snapshotIds.length === 0) return new Map();
  const keys = snapshotIds.map((id) => `snapshot-companies-${id}`);
  const records = await prisma.globalConfig.findMany({ where: { key: { in: keys } } });
  const result = new Map<string, string[]>();
  for (const record of records) {
    const snapshotId = record.key.replace("snapshot-companies-", "");
    try {
      const parsed = JSON.parse(record.value) as { companyIds?: string[] };
      if (Array.isArray(parsed.companyIds)) {
        result.set(snapshotId, parsed.companyIds);
      }
    } catch {
      // ignore malformed
    }
  }
  return result;
}

async function buildUserPayload(userId: string, userCompanyId: string, workspace: {
  inflation: number;
  selectedSnapshotId: string | null;
  companyInfoJson: string;
}, company: {
  name: string;
  description: string;
  economicSector: string;
  classification: string;
  headcount: string;
  revenueUSD: string;
  avgProfitPercent: string;
  hrName: string;
  hrPosition: string;
  hrEmail: string;
  hrPhone: string;
  hrCell: string;
  minVacationDays: string;
  minUtilityDays: string;
  conversionRate: string;
  locality: string;
} | null) {
  const [allSnapshots, positions, companyFilterRecords] = await Promise.all([
    prisma.userSnapshot.findMany({
      where: { userId },
      select: {
        snapshotId: true,
        label: true,
        date: true,
        submittedAt: true,
        updatedAt: true,
      },
      orderBy: [
        { date: "desc" },
        { snapshotId: "desc" },
      ],
    }),
    prisma.userPosition.findMany({
      where: { userId },
      select: {
        snapshotId: true,
        positionId: true,
        dataJson: true,
      },
      orderBy: [
        { snapshotDate: "desc" },
        { updatedAt: "desc" },
      ],
    }),
    prisma.globalConfig.findMany({
      where: { key: { startsWith: 'snapshot-companies-' } },
      select: { key: true, value: true },
    }),
  ]);

  const companyFilter = new Map<string, string[]>();
  for (const record of companyFilterRecords) {
    const snapshotId = record.key.replace('snapshot-companies-', '');
    try {
      const parsed = JSON.parse(record.value) as { companyIds?: string[] };
      if (Array.isArray(parsed.companyIds)) {
        companyFilter.set(snapshotId, parsed.companyIds);
      }
    } catch {}
  }
  const snapshots = allSnapshots.filter((s) => {
    const allowed = companyFilter.get(s.snapshotId);
    return !allowed || allowed.includes(userCompanyId);
  });

  const relationalSnapshots = Object.fromEntries(
    snapshots.map((snapshot) => [
      snapshot.snapshotId,
      {
        id: snapshot.snapshotId,
        label: snapshot.label,
        date: snapshot.date.toISOString().split("T")[0],
        rows: [],
        submittedAt: snapshot.submittedAt?.toISOString() ?? null,
        updatedAt: snapshot.updatedAt?.toISOString() ?? null,
      },
    ])
  ) as Record<string, Snapshot>;

  const seenPositions = new Set<string>();

  for (const position of positions) {
    const dedupeKey = `${position.snapshotId}:${position.positionId}`;

    if (seenPositions.has(dedupeKey)) {
      continue;
    }

    const targetSnapshot = relationalSnapshots[position.snapshotId];

    if (!targetSnapshot) {
      continue;
    }

    try {
      targetSnapshot.rows.push(JSON.parse(position.dataJson));
      seenPositions.add(dedupeKey);
    } catch {
      continue;
    }
  }

  const parsedCompanyInfo = safeParseCompanyInfo(workspace.companyInfoJson);

  return {
    inflation: workspace.inflation,
    snapshots: relationalSnapshots,
    selectedSnapshotId:
      (workspace.selectedSnapshotId && relationalSnapshots[workspace.selectedSnapshotId]
        ? workspace.selectedSnapshotId
        : snapshots[0]?.snapshotId) ?? "",
    companyInfo: mergeCompanyIdentity(parsedCompanyInfo, company),
  };
}

async function buildCompanyPayload(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      description: true,
      economicSector: true,
      classification: true,
      headcount: true,
      revenueUSD: true,
      avgProfitPercent: true,
      hrName: true,
      hrPosition: true,
      hrEmail: true,
      hrPhone: true,
      hrCell: true,
      minVacationDays: true,
      minUtilityDays: true,
      conversionRate: true,
      locality: true,
    },
  });

  if (!company) {
    return null;
  }

  const [workspace, snapshots, positions, companyFilterRecords] = await Promise.all([
    prisma.userWorkspace.findFirst({
      where: {
        user: {
          companyId,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        updatedAt: true,
        inflation: true,
        selectedSnapshotId: true,
        companyInfoJson: true,
      },
    }),
    prisma.userSnapshot.findMany({
      where: { companyId },
      select: {
        snapshotId: true,
        label: true,
        date: true,
      },
      distinct: ["snapshotId"],
      orderBy: [
        { date: "desc" },
        { snapshotId: "desc" },
      ],
    }),
    prisma.userPosition.findMany({
      where: { companyId },
      select: {
        snapshotId: true,
        positionId: true,
        dataJson: true,
      },
      orderBy: [
        { snapshotDate: "desc" },
        { updatedAt: "desc" },
      ],
    }),
    prisma.globalConfig.findMany({
      where: { key: { startsWith: 'snapshot-companies-' } },
      select: { key: true, value: true },
    }),
  ]);

  const companyFilter = new Map<string, string[]>();
  for (const record of companyFilterRecords) {
    const snapshotId = record.key.replace('snapshot-companies-', '');
    try {
      const parsed = JSON.parse(record.value) as { companyIds?: string[] };
      if (Array.isArray(parsed.companyIds)) {
        companyFilter.set(snapshotId, parsed.companyIds);
      }
    } catch {}
  }
  const allowedSnapshots = snapshots.filter((s) => {
    const allowed = companyFilter.get(s.snapshotId);
    return !allowed || allowed.includes(companyId);
  });

  const companySnapshots = Object.fromEntries(
    allowedSnapshots.map((snapshot) => [
      snapshot.snapshotId,
      {
        id: snapshot.snapshotId,
        label: snapshot.label,
        date: snapshot.date.toISOString().split("T")[0],
        rows: [],
      },
    ])
  ) as Record<string, Snapshot>;

  const seenPositions = new Set<string>();

  for (const position of positions) {
    const dedupeKey = `${position.snapshotId}:${position.positionId}`;

    if (seenPositions.has(dedupeKey)) {
      continue;
    }

    const targetSnapshot = companySnapshots[position.snapshotId];

    if (!targetSnapshot) {
      continue;
    }

    try {
      targetSnapshot.rows.push(JSON.parse(position.dataJson));
      seenPositions.add(dedupeKey);
    } catch {
      continue;
    }
  }

  const parsedCompanyInfo = safeParseCompanyInfo(workspace?.companyInfoJson);

  return {
    // Marca de versión para la concurrencia optimista del guardado del admin.
    workspaceUpdatedAt: workspace?.updatedAt?.toISOString() ?? null,
    inflation: workspace?.inflation ?? DEFAULT_WORKSPACE.inflation,
    snapshots: companySnapshots,
    selectedSnapshotId:
      (workspace?.selectedSnapshotId && companySnapshots[workspace.selectedSnapshotId]
        ? workspace.selectedSnapshotId
        : snapshots[0]?.snapshotId) ?? "",
    companyInfo: {
      ...parsedCompanyInfo,
      companyName: company.name,
      sector: company.economicSector,
      classification: company.classification,
      description: company.description,
      headcount: company.headcount,
      revenueUSD: company.revenueUSD,
      avgProfitPercent: company.avgProfitPercent,
      hrName: company.hrName,
      hrPosition: company.hrPosition,
      hrEmail: company.hrEmail,
      hrPhone: company.hrPhone,
      hrCell: company.hrCell,
      minVacationDays: company.minVacationDays,
      minUtilityDays: company.minUtilityDays,
      conversionRate: company.conversionRate,
      locality: company.locality,
    },
  };
}

function injectSystemTasas<T extends { companyInfo: CompanyInfo }>(
  payload: T,
  bcv: { rate: number | null; updatedAt: string | null },
  bcvEur: { rate: number | null; updatedAt: string | null }
): T {
  const userTasas = (payload.companyInfo.tasas ?? []).filter((t) => !t.isSystem);
  return {
    ...payload,
    companyInfo: {
      ...payload.companyInfo,
      tasas: [buildBcvTasa(bcv.rate, bcv.updatedAt), buildBcvEurTasa(bcvEur.rate, bcvEur.updatedAt), ...userTasas],
    },
  };
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId")?.trim() ?? "";

  if (companyId) {
    if (session.user.role !== "ADMIN") {
      return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
    }

    const [companyPayload, bcv, bcvEur, posDescConfig] = await Promise.all([
      buildCompanyPayload(companyId),
      getBcvRate(),
      getBcvEuroRate(),
      prisma.globalConfig.findUnique({ where: { key: 'position-descriptions' }, select: { value: true } }),
    ]);

    if (!companyPayload) {
      return Response.json({ message: "La empresa seleccionada no existe." }, { status: 404 });
    }

    let positionDescriptions: Record<string, string> = {};
    try { if (posDescConfig?.value) positionDescriptions = JSON.parse(posDescConfig.value) as Record<string, string>; } catch {}

    return Response.json({ ...injectSystemTasas(companyPayload, bcv, bcvEur), positionDescriptions });
  }

  const workspace = await getOrCreateWorkspace(userId);
  const alreadyHasRelationalData = (await prisma.userSnapshot.count({ where: { userId } })) > 0;
  if (!alreadyHasRelationalData) {
    await backfillRelationalWorkspace(userId, workspace.companyInfoJson, workspace.snapshotsJson);
  }
  const [company, userRecord] = await Promise.all([
    getCompanyIdentity(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } }),
  ]);
  const userCompanyId = userRecord?.companyId ?? "";

  const [payload, bcv, bcvEur, publishedIds, posDescConfig] = await Promise.all([
    buildUserPayload(userId, userCompanyId, workspace, company),
    getBcvRate(),
    getBcvEuroRate(),
    getPublishedSnapshotIds(),
    prisma.globalConfig.findUnique({ where: { key: 'position-descriptions' }, select: { value: true } }),
  ]);

  let positionDescriptions: Record<string, string> = {};
  try { if (posDescConfig?.value) positionDescriptions = JSON.parse(posDescConfig.value) as Record<string, string>; } catch {}

  const { locked: lockedForUser } = await getLockedSnapshotsForUser(userId, session.user.role);

  const publishedSet = new Set(publishedIds);
  const publishedParticipatedSnapshotIds = Object.entries(payload.snapshots)
    .filter(([id, snap]) => publishedSet.has(id) && snap.submittedAt && snap.rows?.some((row) => !row._carried))
    .map(([id]) => id);

  return Response.json({
    ...injectSystemTasas(payload, bcv, bcvEur),
    publishedParticipatedSnapshotIds,
    // Cortes publicados que este usuario ya no puede editar
    lockedSnapshotIds: [...lockedForUser],
    positionDescriptions,
  });
}

export async function PUT(request: Request) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetCompanyId = searchParams.get("companyId")?.trim() ?? "";

  const body = (await request.json()) as UpdateWorkspaceBody;

  if (targetCompanyId) {
    if (session.user.role !== "ADMIN") {
      return Response.json({ message: "Acceso restringido." }, { status: 403 });
    }

    const nextSnapshots = body.snapshots && typeof body.snapshots === "object" ? body.snapshots : {};
    const duplicateCargoTitles = getDuplicateCargoTitles(nextSnapshots);

    if (duplicateCargoTitles.length > 0) {
      return Response.json(
        { message: `No puedes guardar cargos repetidos. Revisa: ${duplicateCargoTitles.join(", ")}.` },
        { status: 400 }
      );
    }

    // Determinístico: el usuario más reciente de la empresa (mismo criterio que ya
    // se usa al restaurar backups), en vez de un `findFirst` sin orden que podía
    // devolver cualquier fila física de la tabla.
    const companyUser = await prisma.user.findFirst({
      where: { companyId: targetCompanyId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!companyUser) {
      return Response.json({ message: "No se encontró usuario para esta empresa." }, { status: 404 });
    }

    // El guardado del admin no pasaba por el resellado de totales del camino
    // normal, así que las filas quedaban con el `_cachedTotal*` que trajera el
    // cliente. Se recalcula aquí con la tasa viva, igual que en el otro camino.
    const [companyRecord, companyWorkspace, currentBcv] = await Promise.all([
      prisma.company.findUnique({
        where: { id: targetCompanyId },
        select: { minVacationDays: true, minUtilityDays: true },
      }),
      prisma.userWorkspace.findFirst({
        where: { userId: companyUser.id },
        select: { companyInfoJson: true },
      }),
      getBcvRate(),
    ]);

    const companyInfoGuardada = safeParseCompanyInfo(companyWorkspace?.companyInfoJson ?? "");
    const liveBcvUsd = currentBcv.rate;

    if (liveBcvUsd) {
      const tasas = (companyInfoGuardada.tasas ?? []).filter((t: ExchangeRate) => !t.isSystem);
      const diasVac = Number(companyRecord?.minVacationDays ?? companyInfoGuardada.minVacationDays) || 0;
      const diasUtil = Number(companyRecord?.minUtilityDays ?? companyInfoGuardada.minUtilityDays) || 0;

      for (const snapshot of Object.values(nextSnapshots)) {
        snapshot.rows = (snapshot.rows ?? []).map((row) => {
          const totals = computeRowTotals(row, tasas, liveBcvUsd, diasVac, diasUtil);
          return {
            ...row,
            _cachedTotalSinPasivosMensual:   totals.totalSinPasivosMensual,
            _cachedTotalConPasivosMensual:    totals.totalConPasivosMensual,
            _cachedTotalConPasivosAnual:      totals.totalConPasivosAnual,
            _cachedTotalDirectoMensualizado:  totals.totalDirectoMensualizado,
          };
        });
      }
    }

    // ── Concurrencia optimista ──────────────────────────────────────────
    // El admin arma su payload sobre una lectura que puede tener minutos: si la
    // empresa guardó en el medio, escribir acá le pisaría lo que acaba de
    // editar. Se compara la marca de versión y se rechaza en vez de sobrescribir.
    const baseUpdatedAt = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : "";
    if (baseUpdatedAt) {
      const actual = await prisma.userWorkspace.findFirst({
        where: { user: { companyId: targetCompanyId } },
        select: { updatedAt: true },
      });
      const enBase = actual?.updatedAt?.toISOString() ?? null;
      if (enBase && enBase !== baseUpdatedAt) {
        return Response.json(
          {
            message: "La empresa guardó su data mientras editabas. Recarga para ver lo último y vuelve a intentarlo.",
            conflicto: true,
          },
          { status: 409 },
        );
      }
    }

    // Tasas declaradas en una carga masiva. Es deliberadamente ADITIVO: solo se
    // agregan las que la empresa no tiene, nunca se modifica ni se borra una
    // suya, porque el admin está escribiendo sobre configuración que mantiene
    // ella. El tope es el mismo del formulario de Empresa.
    const tasasPedidas = (body.companyInfo as CompanyInfo | undefined)?.tasas;
    let companyInfoJsonActualizado: string | null = null;

    if (Array.isArray(tasasPedidas) && tasasPedidas.length > 0) {
      const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const actuales = (companyInfoGuardada.tasas ?? []).filter((t: ExchangeRate) => !t.isSystem);
      const vistas = new Set(actuales.map((t: ExchangeRate) => normalizar(t.nombre || t.referencia)));
      const agregadas: ExchangeRate[] = [];

      for (const tasa of tasasPedidas) {
        if (!tasa || tasa.isSystem) continue;
        const nombre = String(tasa.nombre ?? "").trim();
        const valor = Number(tasa.valor);
        if (!nombre || !Number.isFinite(valor) || valor <= 0) continue;

        const clave = normalizar(nombre);
        if (vistas.has(clave)) continue;
        if (actuales.length + agregadas.length >= MAX_TASAS_POR_EMPRESA) break;

        vistas.add(clave);
        agregadas.push({
          id: String(tasa.id ?? `t-${Date.now()}-${agregadas.length}`),
          nombre,
          referencia: String(tasa.referencia ?? ""),
          valor: String(valor),
        });
      }

      if (agregadas.length > 0) {
        companyInfoJsonActualizado = JSON.stringify({
          ...companyInfoGuardada,
          tasas: [...actuales, ...agregadas],
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Los estados se leen ANTES de borrar: si no, el corte pierde su
      // `submittedAt` cada vez que el admin guarda a nombre de la empresa.
      const estadosPrevios = await tx.userSnapshot.findMany({
        where: { companyId: targetCompanyId },
        select: { snapshotId: true, status: true, processedAt: true, submittedAt: true },
      });

      // Borrar todas las posiciones y snapshots de la empresa (todos los usuarios)
      // para que el save del admin sea la fuente de verdad sin residuos de otros usuarios
      await tx.userPosition.deleteMany({ where: { companyId: targetCompanyId } });
      await tx.userSnapshot.deleteMany({ where: { companyId: targetCompanyId } });
      await syncRelationalWorkspace(tx, companyUser.id, targetCompanyId, nextSnapshots, estadosPrevios);
      await tx.userWorkspace.updateMany({
        where: { userId: companyUser.id },
        data: {
          snapshotsJson: JSON.stringify(nextSnapshots),
          ...(companyInfoJsonActualizado ? { companyInfoJson: companyInfoJsonActualizado } : {}),
        },
      });
    });

    // Se devuelve la marca nueva para que el admin pueda volver a guardar sin
    // recargar: si no, su segundo guardado chocaría contra el primero.
    const traslaEscritura = await prisma.userWorkspace.findFirst({
      where: { user: { companyId: targetCompanyId } },
      select: { updatedAt: true },
    });

    return Response.json({
      message: "Guardado correctamente.",
      workspaceUpdatedAt: traslaEscritura?.updatedAt?.toISOString() ?? null,
    });
  }
  const existingWorkspace = await getOrCreateWorkspace(userId);

  const nextInflation =
    typeof body.inflation === "number" && Number.isFinite(body.inflation)
      ? body.inflation
      : existingWorkspace.inflation;

  const nextSnapshots = body.snapshots && typeof body.snapshots === "object" ? body.snapshots : safeParseSnapshots(existingWorkspace.snapshotsJson);
  const nextSelectedSnapshotId = typeof body.selectedSnapshotId === "string" ? body.selectedSnapshotId : existingWorkspace.selectedSnapshotId ?? "";

  const existingCompanyInfo = safeParseCompanyInfo(existingWorkspace.companyInfoJson);

  // Build companyInfo preserving existing ratesAtSave — rates are only refreshed
  // when the user explicitly saves snapshot (salary) data, not just profile info.
  const requestedCompanyInfo =
    body.companyInfo && typeof body.companyInfo === "object"
      ? {
          ...EMPTY_COMPANY_INFO,
          ...body.companyInfo,
          tasas: ((body.companyInfo as CompanyInfo).tasas ?? []).filter(
            (t: ExchangeRate) => !t.isSystem
          ),
          ratesAtSave: existingCompanyInfo.ratesAtSave,
        }
      : existingCompanyInfo;

  // Capture current rates only when snapshot data is being saved
  const savingSnapshots = body.snapshots && typeof body.snapshots === "object";
  if (savingSnapshots) {
    const [currentBcv, currentBcvEur, currentBinance] = await Promise.all([
      getBcvRate(), getBcvEuroRate(), getBinanceRate(),
    ]);
    const liveBcvUsd = currentBcv.rate;
    requestedCompanyInfo.ratesAtSave = {
      bcvUsd:  liveBcvUsd,
      bcvEur:  currentBcvEur.rate,
      binance: currentBinance.rate,
      savedAt: new Date().toISOString(),
    };

    // Reseal _cachedTotal* with the live rate captured right now so that
    // the cache always reflects the rate at the exact moment of this save.
    if (liveBcvUsd) {
      const tasas = requestedCompanyInfo.tasas ?? [];
      const diasVac = Number(requestedCompanyInfo.minVacationDays) || 0;
      const diasUtil = Number(requestedCompanyInfo.minUtilityDays) || 0;
      for (const snapshot of Object.values(nextSnapshots)) {
        snapshot.rows = (snapshot.rows ?? []).map((row) => {
          const totals = computeRowTotals(row, tasas, liveBcvUsd, diasVac, diasUtil);
          return {
            ...row,
            _cachedTotalSinPasivosMensual:   totals.totalSinPasivosMensual,
            _cachedTotalConPasivosMensual:    totals.totalConPasivosMensual,
            _cachedTotalConPasivosAnual:      totals.totalConPasivosAnual,
            _cachedTotalDirectoMensualizado:  totals.totalDirectoMensualizado,
          };
        });
      }
    }
  }
  const duplicateCargoTitles = getDuplicateCargoTitles(nextSnapshots);

  if (duplicateCargoTitles.length > 0) {
    return Response.json(
      {
        message: `No puedes guardar cargos repetidos. Revisa: ${duplicateCargoTitles.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  // ── Candado de publicación ──────────────────────────────────────────────
  // El cliente siempre manda TODOS sus cortes al guardar, no solo el que está
  // editando. Por eso no se rechaza el guardado completo: se preservan los
  // cortes publicados con lo que ya hay en la base y se ignora lo que mandó el
  // cliente para ellos. Así el usuario puede seguir guardando los demás cortes.
  const { locked: lockedSnapshotIds } = await getLockedSnapshotsForUser(userId, session.user.role);
  const snapshotsFromDb = safeParseSnapshots(existingWorkspace.snapshotsJson);

  const snapshotsForJson: Record<string, Snapshot> = { ...nextSnapshots };
  const snapshotsForSync: Record<string, Snapshot> = { ...nextSnapshots };
  const ignoredLockedIds: string[] = [];

  for (const snapshotId of Object.keys(nextSnapshots)) {
    if (!lockedSnapshotIds.has(snapshotId)) continue;

    ignoredLockedIds.push(snapshotId);
    // Nunca se toca en la parte relacional
    delete snapshotsForSync[snapshotId];
    // Y en el blob se deja la versión de la base, no la del cliente
    if (snapshotsFromDb[snapshotId]) {
      snapshotsForJson[snapshotId] = snapshotsFromDb[snapshotId];
    } else {
      delete snapshotsForJson[snapshotId];
    }
  }

  const snapshotsJson = JSON.stringify(snapshotsForJson);
  const companyInfoJson = JSON.stringify(requestedCompanyInfo);

  const workspace = await prisma.$transaction(async (tx) => {
    const { companyId, previousCompanyId } = await ensureCompanyIdForUser(tx, userId, requestedCompanyInfo);
    await syncCompanyInfo(tx, companyId, requestedCompanyInfo);

    const updatedWorkspace = await tx.userWorkspace.update({
      where: { userId },
      data: {
        inflation: nextInflation,
        snapshotsJson,
        selectedSnapshotId: nextSelectedSnapshotId,
        companyInfoJson,
      },
    });

    await syncRelationalWorkspace(tx, userId, companyId, snapshotsForSync);
    await cleanupUnusedCompany(tx, previousCompanyId);

    return updatedWorkspace;
  });

  const updatedCompany = await getCompanyIdentity(userId);

  return Response.json({
    ...toPayload(workspace, updatedCompany),
    ...(ignoredLockedIds.length > 0
      ? { lockedSnapshotIds: ignoredLockedIds, lockedMessage: "Uno o más cortes ya fueron publicados y no se modificaron." }
      : {}),
  });
}