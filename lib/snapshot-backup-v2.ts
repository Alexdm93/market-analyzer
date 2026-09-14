import { prisma } from "@/lib/prisma";
import { safeParseSnapshots } from "@/lib/workspace";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";

/**
 * Respaldo completo de un corte, versión 2.
 *
 * Principio de diseño: en vez de curar una selección de campos (que es como el
 * formato v1 terminó dejando afuera companyInfo, status y processedAt), este
 * respaldo copia LAS FILAS TAL CUAL de las tablas que componen un corte. Si
 * mañana se agrega una columna, viene sola.
 *
 * Todo lo que hace este módulo es LEER. No contiene ninguna escritura.
 */

export type SnapshotBackupV2 = {
  version: "2";
  generatedAt: string;

  source: {
    snapshotId: string;
    label: string;
    date: string;
    wasPublished: boolean;
  };

  counts: {
    companies: number;
    userSnapshots: number;
    submittedCompanies: number;
    positions: number;
  };

  /** Filas de UserSnapshot del corte, tal cual */
  userSnapshots: Array<{
    userId: string;
    companyId: string;
    snapshotId: string;
    label: string;
    date: string;
    status: string;
    processedAt: string | null;
    submittedAt: string | null;
  }>;

  /** Filas de UserPosition del corte. dataJson se guarda como string crudo para no
   *  alterar nada al serializar y volver a leer. */
  positions: Array<{
    userId: string;
    companyId: string;
    snapshotId: string;
    snapshotLabel: string;
    snapshotDate: string;
    positionId: string;
    title: string | null;
    dataJson: string;
  }>;

  /** Contexto de cálculo: sin esto los percentiles no se reproducen. */
  workspaces: Array<{
    userId: string;
    inflation: number;
    companyInfoJson: string;
    /** Solo el fragmento de ESTE corte dentro de snapshotsJson */
    snapshotFragment: unknown | null;
  }>;

  /** Perfil de las empresas involucradas. Referencia — restaurarlo es opcional. */
  companies: Array<Record<string, unknown>>;

  /** Identidad mínima para poder mapear la data al restaurar. Sin contraseñas. */
  users: Array<{
    id: string;
    companyId: string;
    name: string;
    email: string;
  }>;

  /** Configuración del corte (GlobalConfig) */
  config: {
    cargos: unknown | null;
    companies: unknown | null;
    ranges: unknown | null;
  };

  /** Solicitudes de edición de este corte */
  editRequests: Array<Record<string, unknown>>;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseJsonOrNull(raw: string | null | undefined): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Construye el respaldo completo de un corte. Operación de SOLO LECTURA.
 */
export async function buildSnapshotBackup(snapshotId: string): Promise<SnapshotBackupV2 | null> {
  const userSnapshots = await prisma.userSnapshot.findMany({
    where: { snapshotId },
    select: {
      userId: true,
      companyId: true,
      snapshotId: true,
      label: true,
      date: true,
      status: true,
      processedAt: true,
      submittedAt: true,
    },
    orderBy: { companyId: "asc" },
  });

  // Un corte que no existe no se puede respaldar
  if (userSnapshots.length === 0) return null;

  const userIds = [...new Set(userSnapshots.map((s) => s.userId))];
  const companyIds = [...new Set(userSnapshots.map((s) => s.companyId))];

  const [positions, workspaceRows, companies, users, cargosRow, companiesRow, rangesRow, editRequests, publishedIds] =
    await Promise.all([
      prisma.userPosition.findMany({
        where: { snapshotId },
        select: {
          userId: true,
          companyId: true,
          snapshotId: true,
          snapshotLabel: true,
          snapshotDate: true,
          positionId: true,
          title: true,
          dataJson: true,
        },
        orderBy: [{ companyId: "asc" }, { positionId: "asc" }],
      }),
      prisma.userWorkspace.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, inflation: true, companyInfoJson: true, snapshotsJson: true },
      }),
      prisma.company.findMany({ where: { id: { in: companyIds } } }),
      prisma.user.findMany({
        where: { id: { in: userIds } },
        // Deliberadamente sin passwordHash ni passwordPlain
        select: { id: true, companyId: true, name: true, email: true },
      }),
      prisma.globalConfig.findUnique({ where: { key: `snapshot-cargos-${snapshotId}` }, select: { value: true } }),
      prisma.globalConfig.findUnique({ where: { key: `snapshot-companies-${snapshotId}` }, select: { value: true } }),
      prisma.globalConfig.findUnique({ where: { key: `snapshot-ranges-${snapshotId}` }, select: { value: true } }),
      prisma.editRequest.findMany({ where: { snapshotId } }),
      getPublishedSnapshotIds(),
    ]);

  const meta = userSnapshots[0];

  return {
    version: "2",
    generatedAt: new Date().toISOString(),

    source: {
      snapshotId,
      label: meta.label,
      date: meta.date.toISOString().split("T")[0],
      wasPublished: publishedIds.includes(snapshotId),
    },

    counts: {
      companies: companyIds.length,
      userSnapshots: userSnapshots.length,
      submittedCompanies: userSnapshots.filter((s) => s.submittedAt !== null).length,
      positions: positions.length,
    },

    userSnapshots: userSnapshots.map((s) => ({
      userId: s.userId,
      companyId: s.companyId,
      snapshotId: s.snapshotId,
      label: s.label,
      date: s.date.toISOString(),
      status: String(s.status),
      processedAt: iso(s.processedAt),
      submittedAt: iso(s.submittedAt),
    })),

    positions: positions.map((p) => ({
      userId: p.userId,
      companyId: p.companyId,
      snapshotId: p.snapshotId,
      snapshotLabel: p.snapshotLabel,
      snapshotDate: p.snapshotDate.toISOString(),
      positionId: p.positionId,
      title: p.title,
      dataJson: p.dataJson,
    })),

    workspaces: workspaceRows.map((w) => {
      const all = safeParseSnapshots(w.snapshotsJson);
      return {
        userId: w.userId,
        inflation: w.inflation,
        companyInfoJson: w.companyInfoJson,
        snapshotFragment: (all[snapshotId] as unknown) ?? null,
      };
    }),

    companies: companies.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),

    users,

    config: {
      cargos: parseJsonOrNull(cargosRow?.value),
      companies: parseJsonOrNull(companiesRow?.value),
      ranges: parseJsonOrNull(rangesRow?.value),
    },

    editRequests: editRequests.map((r) => ({
      ...r,
      resolvedAt: iso(r.resolvedAt),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}
