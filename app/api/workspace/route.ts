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

// Fields that change automatically on every save and should not trigger a _lastModified update
const VOLATILE_FIELDS = new Set([
  "_carried", "_lastModified",
  "_cachedTotalSinPasivosMensual", "_cachedTotalConPasivosMensual",
  "_cachedTotalConPasivosAnual", "_cachedTotalDirectoMensualizado",
]);

function stripVolatile(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !VOLATILE_FIELDS.has(k)));
}

async function syncRelationalWorkspace(
  tx: TransactionClient,
  userId: string,
  companyId: string,
  snapshots: Record<string, Snapshot>
) {
  const [existingStatuses, existingPositions] = await Promise.all([
    tx.userSnapshot.findMany({
      where: { userId },
      select: { snapshotId: true, status: true, processedAt: true },
    }),
    tx.userPosition.findMany({
      where: { userId },
      select: { snapshotId: true, positionId: true, dataJson: true },
    }),
  ]);

  const statusBySnapshotId = new Map(existingStatuses.map((s) => [s.snapshotId, { status: s.status, processedAt: s.processedAt }]));

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

  await tx.userPosition.deleteMany({ where: { userId } });
  await tx.userSnapshot.deleteMany({ where: { userId } });

  const now = new Date().toISOString();

  const snapshotInserts: {
    id: string; userId: string; companyId: string; snapshotId: string;
    label: string; date: Date; status: SnapshotProcessingStatus; processedAt: Date | null;
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
  inflation: number;
  snapshots: Record<string, Snapshot>;
  selectedSnapshotId: string;
  companyInfo: CompanyInfo;
}>;

async function getCurrentSession() {
  return getServerSession(authOptions);
}

async function getOrCreateWorkspace(userId: string) {
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

  const publishedSet = new Set(publishedIds);
  const publishedParticipatedSnapshotIds = Object.entries(payload.snapshots)
    .filter(([id, snap]) => publishedSet.has(id) && snap.submittedAt && snap.rows?.some((row) => !row._carried))
    .map(([id]) => id);

  return Response.json({
    ...injectSystemTasas(payload, bcv, bcvEur),
    publishedParticipatedSnapshotIds,
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

    const companyUser = await prisma.user.findFirst({
      where: { companyId: targetCompanyId },
      select: { id: true },
    });

    if (!companyUser) {
      return Response.json({ message: "No se encontró usuario para esta empresa." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Borrar todas las posiciones y snapshots de la empresa (todos los usuarios)
      // para que el save del admin sea la fuente de verdad sin residuos de otros usuarios
      await tx.userPosition.deleteMany({ where: { companyId: targetCompanyId } });
      await tx.userSnapshot.deleteMany({ where: { companyId: targetCompanyId } });
      await syncRelationalWorkspace(tx, companyUser.id, targetCompanyId, nextSnapshots);
      await tx.userWorkspace.updateMany({
        where: { userId: companyUser.id },
        data: { snapshotsJson: JSON.stringify(nextSnapshots) },
      });
    });

    return Response.json({ message: "Guardado correctamente." });
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

  const snapshotsJson = JSON.stringify(nextSnapshots);
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

    await syncRelationalWorkspace(tx, userId, companyId, nextSnapshots);
    await cleanupUnusedCompany(tx, previousCompanyId);

    return updatedWorkspace;
  });

  const updatedCompany = await getCompanyIdentity(userId);

  return Response.json(toPayload(workspace, updatedCompany));
}