import { prisma } from "@/lib/prisma";
import { safeParseSnapshots } from "@/lib/workspace";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";
import type { SnapshotBackupV2 } from "@/lib/snapshot-backup-v2";

/**
 * Análisis previo y restauración de un respaldo v2.
 *
 * `analyzeRestore` es SOLO LECTURA: compara el archivo contra la base y reporta
 * qué pasaría, sin escribir nada. `applyRestore` es la única función de este
 * módulo que escribe, y lo hace en UNA sola transacción: o entra todo lo
 * seleccionado, o no entra nada.
 */

export type CompanyStatus = "lista" | "sobreescribe" | "fuera_de_catalogo" | "empresa_borrada" | "sin_usuario";

export type CompanyAnalysis = {
  companyId: string;
  companyName: string;
  status: CompanyStatus;
  /** true si se puede restaurar (los dos estados de error lo dejan en false) */
  restorable: boolean;
  posicionesEnRespaldo: number;
  posicionesQueSeReemplazan: number;
  fueEnviado: boolean;
  /** El usuario original ya no existe — la data se reasignaría a otro */
  usuarioOriginalAusente: boolean;
  cargosFueraDeCatalogo: string[];
};

export type RestoreAnalysis = {
  ok: boolean;
  error?: string;
  origen: { snapshotId: string; label: string; date: string; generatedAt: string; wasPublished: boolean };
  destino: { snapshotId: string; existe: boolean; estaPublicado: boolean; label: string | null };
  advertencias: string[];
  empresas: CompanyAnalysis[];
  totales: { empresasRestaurables: number; posicionesARestaurar: number; posicionesQueSeReemplazan: number };
};

/** Valida que un objeto arbitrario tenga la forma de un respaldo v2. */
export function validateBackupShape(raw: unknown): { ok: true; backup: SnapshotBackupV2 } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "El archivo no contiene un objeto JSON válido." };
  const b = raw as Partial<SnapshotBackupV2>;

  if (b.version !== "2") {
    return { ok: false, error: `Versión de respaldo no soportada: ${String(b.version ?? "desconocida")}. Este restaurador espera la versión 2.` };
  }
  if (!b.source?.snapshotId) return { ok: false, error: "El archivo no indica de qué corte proviene." };
  if (!Array.isArray(b.userSnapshots)) return { ok: false, error: "El archivo no trae la sección userSnapshots." };
  if (!Array.isArray(b.positions)) return { ok: false, error: "El archivo no trae la sección positions." };
  if (!Array.isArray(b.workspaces)) return { ok: false, error: "El archivo no trae la sección workspaces." };
  if (!Array.isArray(b.companies)) return { ok: false, error: "El archivo no trae la sección companies." };
  if (!b.config) return { ok: false, error: "El archivo no trae la sección config." };

  // Cada posición debe traer su dataJson parseable
  for (const p of b.positions) {
    if (typeof p?.dataJson !== "string") {
      return { ok: false, error: `Una posición del respaldo no tiene dataJson (${String(p?.positionId ?? "sin id")}).` };
    }
    try {
      JSON.parse(p.dataJson);
    } catch {
      return { ok: false, error: `La posición ${p.positionId} tiene dataJson corrupto.` };
    }
  }

  return { ok: true, backup: raw as SnapshotBackupV2 };
}

/** SOLO LECTURA — reporta qué pasaría al restaurar, sin tocar nada. */
export async function analyzeRestore(
  backup: SnapshotBackupV2,
  targetSnapshotId: string
): Promise<RestoreAnalysis> {
  const companyIds = backup.companies.map((c) => c.id as string);

  const [existingCompanies, usersOfCompanies, targetSnapshots, targetPositions, publishedIds, targetCargosRow] =
    await Promise.all([
      prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { companyId: { in: companyIds } }, select: { id: true, companyId: true } }),
      prisma.userSnapshot.findMany({
        where: { snapshotId: targetSnapshotId },
        select: { companyId: true, label: true },
      }),
      prisma.userPosition.findMany({
        where: { snapshotId: targetSnapshotId },
        select: { companyId: true },
      }),
      getPublishedSnapshotIds(),
      prisma.globalConfig.findUnique({
        where: { key: `snapshot-cargos-${targetSnapshotId}` },
        select: { value: true },
      }),
    ]);

  const existingById = new Map(existingCompanies.map((c) => [c.id, c]));
  const usersByCompany = new Map<string, string[]>();
  for (const u of usersOfCompanies) {
    usersByCompany.set(u.companyId, [...(usersByCompany.get(u.companyId) ?? []), u.id]);
  }
  const existingUserIds = new Set(usersOfCompanies.map((u) => u.id));

  const replacedByCompany = new Map<string, number>();
  for (const p of targetPositions) {
    replacedByCompany.set(p.companyId, (replacedByCompany.get(p.companyId) ?? 0) + 1);
  }

  // Catálogo de cargos del corte destino (si está configurado)
  let catalogTitles: Set<string> | null = null;
  try {
    if (targetCargosRow?.value) {
      const parsed = JSON.parse(targetCargosRow.value) as Array<{ tituloCargo?: string }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        catalogTitles = new Set(parsed.map((c) => (c.tituloCargo ?? "").trim().toLowerCase()).filter(Boolean));
      }
    }
  } catch { /* catálogo no configurado */ }

  const empresas: CompanyAnalysis[] = backup.companies.map((c) => {
    const companyId = c.id as string;
    const companyName = (c.name as string) ?? companyId;

    const backupSnap = backup.userSnapshots.find((s) => s.companyId === companyId);
    const backupPositions = backup.positions.filter((p) => p.companyId === companyId);

    const existe = existingById.has(companyId);
    const usuarios = usersByCompany.get(companyId) ?? [];
    const usuarioOriginalAusente = backupSnap ? !existingUserIds.has(backupSnap.userId) : false;

    const fueraDeCatalogo = catalogTitles
      ? [...new Set(
          backupPositions
            .map((p) => (p.title ?? "").trim())
            .filter((t) => t && !catalogTitles!.has(t.toLowerCase()))
        )]
      : [];

    const posicionesQueSeReemplazan = replacedByCompany.get(companyId) ?? 0;

    let status: CompanyStatus;
    let restorable = true;

    if (!existe) {
      status = "empresa_borrada";
      restorable = false;
    } else if (usuarios.length === 0) {
      status = "sin_usuario";
      restorable = false;
    } else if (fueraDeCatalogo.length > 0) {
      status = "fuera_de_catalogo";
    } else if (posicionesQueSeReemplazan > 0) {
      status = "sobreescribe";
    } else {
      status = "lista";
    }

    return {
      companyId,
      companyName,
      status,
      restorable,
      posicionesEnRespaldo: backupPositions.length,
      posicionesQueSeReemplazan,
      fueEnviado: Boolean(backupSnap?.submittedAt),
      usuarioOriginalAusente,
      cargosFueraDeCatalogo: fueraDeCatalogo,
    };
  });

  const advertencias: string[] = [];

  if (publishedIds.includes(targetSnapshotId)) {
    advertencias.push("El corte destino está PUBLICADO. Restaurar cambiaría un estudio que las empresas ya están viendo.");
  }
  if (targetSnapshotId !== backup.source.snapshotId) {
    advertencias.push(`El respaldo es del corte "${backup.source.label}" (${backup.source.snapshotId}) y lo vas a cargar en "${targetSnapshotId}". Esto reemplaza la data actual del corte destino.`);
  }
  if (targetSnapshots.length === 0) {
    advertencias.push("El corte destino no existe todavía. Se va a crear con la data del respaldo.");
  }
  if (empresas.some((e) => e.usuarioOriginalAusente)) {
    advertencias.push("Algunas empresas tienen su usuario original eliminado. Su data se reasignará al usuario más reciente de esa empresa.");
  }

  const restorables = empresas.filter((e) => e.restorable);

  return {
    ok: true,
    origen: {
      snapshotId: backup.source.snapshotId,
      label: backup.source.label,
      date: backup.source.date,
      generatedAt: backup.generatedAt,
      wasPublished: backup.source.wasPublished,
    },
    destino: {
      snapshotId: targetSnapshotId,
      existe: targetSnapshots.length > 0,
      estaPublicado: publishedIds.includes(targetSnapshotId),
      label: targetSnapshots[0]?.label ?? null,
    },
    advertencias,
    empresas: empresas.sort((a, b) => a.companyName.localeCompare(b.companyName, "es")),
    totales: {
      empresasRestaurables: restorables.length,
      posicionesARestaurar: restorables.reduce((s, e) => s + e.posicionesEnRespaldo, 0),
      posicionesQueSeReemplazan: restorables.reduce((s, e) => s + e.posicionesQueSeReemplazan, 0),
    },
  };
}

export type RestoreOptions = {
  targetSnapshotId: string;
  /** Nombre para el corte destino. Si no viene: se conserva el del corte
   *  existente, y si el corte es nuevo se usa el del respaldo. */
  targetLabel?: string;
  /** Qué empresas restaurar. Si viene vacío, no se restaura nada. */
  companyIds: string[];
  /** Restaurar también el perfil de la empresa y su companyInfo. Por defecto false. */
  restoreCompanyProfile: boolean;
  /** Restaurar las claves de configuración del corte (catálogo, accesos, rangos). */
  restoreConfig: boolean;
};

export type RestoreResult = {
  empresasRestauradas: number;
  posicionesRestauradas: number;
  detalle: Array<{ companyName: string; posiciones: number; usuarioReasignado: boolean }>;
};

/**
 * ESCRIBE. Restaura las empresas seleccionadas en UNA sola transacción:
 * si algo falla, no queda nada a medias.
 */
export async function applyRestore(
  backup: SnapshotBackupV2,
  options: RestoreOptions
): Promise<RestoreResult> {
  const { targetSnapshotId, targetLabel, companyIds, restoreCompanyProfile, restoreConfig } = options;

  const selected = new Set(companyIds);
  const detalle: RestoreResult["detalle"] = [];
  let posicionesRestauradas = 0;

  // Resolver a qué usuario va la data de cada empresa, ANTES de abrir la transacción
  const users = await prisma.user.findMany({
    where: { companyId: { in: companyIds } },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const existingUserIds = new Set(users.map((u) => u.id));
  const newestUserByCompany = new Map<string, string>();
  for (const u of users) {
    if (!newestUserByCompany.has(u.companyId)) newestUserByCompany.set(u.companyId, u.id);
  }

  const snapshotDate = new Date(backup.userSnapshots[0]?.date ?? `${backup.source.date}T00:00:00.000Z`);

  // Restaurar no debe renombrar un corte que ya existe: se respeta su nombre
  // salvo que se pida uno explícito.
  const existingTarget = await prisma.userSnapshot.findFirst({
    where: { snapshotId: targetSnapshotId },
    select: { label: true },
  });
  const label = targetLabel?.trim() || existingTarget?.label || backup.source.label;

  await prisma.$transaction(async (tx) => {
    for (const company of backup.companies) {
      const companyId = company.id as string;
      if (!selected.has(companyId)) continue;

      const backupSnap = backup.userSnapshots.find((s) => s.companyId === companyId);
      if (!backupSnap) continue;

      // Preferir el usuario ORIGINAL si todavía existe — así no se pierde la
      // atribución, que es justo el defecto del restaurador anterior.
      const originalStillExists = existingUserIds.has(backupSnap.userId);
      const targetUserId = originalStillExists
        ? backupSnap.userId
        : newestUserByCompany.get(companyId);

      if (!targetUserId) continue;

      const created = await tx.userSnapshot.upsert({
        where: { userId_snapshotId: { userId: targetUserId, snapshotId: targetSnapshotId } },
        create: {
          userId: targetUserId,
          companyId,
          snapshotId: targetSnapshotId,
          label,
          date: snapshotDate,
          status: backupSnap.status as never,
          processedAt: backupSnap.processedAt ? new Date(backupSnap.processedAt) : null,
          submittedAt: backupSnap.submittedAt ? new Date(backupSnap.submittedAt) : null,
        },
        update: {
          label,
          date: snapshotDate,
          status: backupSnap.status as never,
          processedAt: backupSnap.processedAt ? new Date(backupSnap.processedAt) : null,
          submittedAt: backupSnap.submittedAt ? new Date(backupSnap.submittedAt) : null,
        },
        select: { id: true },
      });

      // Reemplazar las posiciones de ESTE usuario en ESTE corte
      await tx.userPosition.deleteMany({ where: { userId: targetUserId, snapshotId: targetSnapshotId } });

      const companyPositions = backup.positions.filter((p) => p.companyId === companyId);
      if (companyPositions.length > 0) {
        await tx.userPosition.createMany({
          data: companyPositions.map((p) => ({
            userId: targetUserId,
            companyId,
            userSnapshotId: created.id,
            snapshotId: targetSnapshotId,
            snapshotLabel: label,
            snapshotDate,
            positionId: p.positionId,
            title: p.title,
            dataJson: p.dataJson,
          })),
        });
      }

      // Workspace: el fragmento del corte, y opcionalmente el companyInfo
      const backupWorkspace = backup.workspaces.find((w) => w.userId === backupSnap.userId);
      const current = await tx.userWorkspace.findUnique({
        where: { userId: targetUserId },
        select: { snapshotsJson: true, companyInfoJson: true, inflation: true },
      });

      const snaps = safeParseSnapshots(current?.snapshotsJson ?? "{}");
      if (backupWorkspace?.snapshotFragment) {
        snaps[targetSnapshotId] = backupWorkspace.snapshotFragment as never;
      }

      await tx.userWorkspace.upsert({
        where: { userId: targetUserId },
        create: {
          userId: targetUserId,
          inflation: backupWorkspace?.inflation ?? 5,
          snapshotsJson: JSON.stringify(snaps),
          companyInfoJson: backupWorkspace?.companyInfoJson ?? "{}",
        },
        update: {
          snapshotsJson: JSON.stringify(snaps),
          ...(restoreCompanyProfile && backupWorkspace?.companyInfoJson
            ? { companyInfoJson: backupWorkspace.companyInfoJson }
            : {}),
        },
      });

      // Perfil de la empresa — solo si se pidió explícitamente
      if (restoreCompanyProfile) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...profile } = company as Record<string, unknown>;
        await tx.company.update({
          where: { id: companyId },
          data: profile as never,
        });
      }

      posicionesRestauradas += companyPositions.length;
      detalle.push({
        companyName: (company.name as string) ?? companyId,
        posiciones: companyPositions.length,
        usuarioReasignado: !originalStillExists,
      });
    }

    // Configuración del corte
    if (restoreConfig) {
      const entries: Array<[string, unknown]> = [
        [`snapshot-cargos-${targetSnapshotId}`, backup.config.cargos],
        [`snapshot-companies-${targetSnapshotId}`, backup.config.companies],
        [`snapshot-ranges-${targetSnapshotId}`, backup.config.ranges],
      ];
      for (const [key, value] of entries) {
        if (value === null || value === undefined) continue;
        await tx.globalConfig.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value) },
          update: { value: JSON.stringify(value) },
        });
      }
    }
  }, { timeout: 120_000 });

  return { empresasRestauradas: detalle.length, posicionesRestauradas, detalle };
}
