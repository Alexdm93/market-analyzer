import { gunzipSync } from "node:zlib";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSnapshotBackup } from "@/lib/snapshot-backup-v2";
import { analyzeRestore, applyRestore, validateBackupShape } from "@/lib/snapshot-restore-v2";

type Body = {
  mode?: "analyze" | "apply";
  /** Respaldo subido como archivo */
  backup?: unknown;
  /** O bien: cargar el respaldo guardado de este corte */
  fromStoredSnapshotId?: string;
  targetSnapshotId?: string;
  targetLabel?: string;
  companyIds?: string[];
  restoreCompanyProfile?: boolean;
  restoreConfig?: boolean;
  hideFromCompanies?: boolean;
};

function preRestoreKey(snapshotId: string) {
  return `snapshot-prerestore-${snapshotId}`;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  // Un respaldo real pesa bastante (13 MB en un corte de ~2.500 posiciones) y
  // Vercel corta los cuerpos de petición cerca de los 4,5 MB. Por eso el cliente
  // puede mandar el cuerpo comprimido: lo detectamos por el content-type.
  let body: Body | null = null;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/octet-stream")) {
    try {
      const buf = Buffer.from(await request.arrayBuffer());
      body = JSON.parse(gunzipSync(buf).toString("utf8")) as Body;
    } catch {
      return Response.json({ message: "No se pudo leer el respaldo comprimido." }, { status: 400 });
    }
  } else {
    body = (await request.json().catch(() => null)) as Body | null;
  }

  const mode = body?.mode ?? "analyze";

  // ── Resolver de dónde sale el respaldo ────────────────────────────────────
  let raw: unknown = body?.backup;

  if (!raw && body?.fromStoredSnapshotId) {
    const row = await prisma.globalConfig.findUnique({
      where: { key: `snapshot-backup-v2-${body.fromStoredSnapshotId}` },
      select: { value: true },
    });
    if (!row?.value) {
      return Response.json({ message: "No hay un respaldo guardado para ese corte." }, { status: 404 });
    }
    try {
      raw = JSON.parse(row.value) as unknown;
    } catch {
      return Response.json({ message: "El respaldo guardado está corrupto." }, { status: 422 });
    }
  }

  if (!raw) {
    return Response.json({ message: "Sube un archivo de respaldo o indica un corte con respaldo guardado." }, { status: 400 });
  }

  // ── Validar el archivo ANTES de tocar nada ────────────────────────────────
  const validation = validateBackupShape(raw);
  if (!validation.ok) {
    return Response.json({ message: validation.error }, { status: 422 });
  }
  const backup = validation.backup;

  const targetSnapshotId = body?.targetSnapshotId?.trim() || backup.source.snapshotId;

  // ── Modo análisis: SOLO LECTURA ───────────────────────────────────────────
  if (mode === "analyze") {
    const analysis = await analyzeRestore(backup, targetSnapshotId);
    return Response.json(analysis);
  }

  // ── Modo aplicar: escribe ─────────────────────────────────────────────────
  const companyIds = Array.isArray(body?.companyIds) ? body.companyIds.filter((id) => typeof id === "string") : [];

  if (companyIds.length === 0) {
    return Response.json({ message: "Selecciona al menos una empresa para restaurar." }, { status: 400 });
  }

  // Re-analizar y rechazar empresas que el análisis marcó como no restaurables.
  // Esto evita que una selección vieja (hecha antes de un cambio) rompa la restauración.
  const analysis = await analyzeRestore(backup, targetSnapshotId);
  const noRestorables = companyIds.filter(
    (id) => !analysis.empresas.find((e) => e.companyId === id)?.restorable
  );
  if (noRestorables.length > 0) {
    const nombres = noRestorables
      .map((id) => analysis.empresas.find((e) => e.companyId === id)?.companyName ?? id)
      .join(", ");
    return Response.json(
      { message: `Estas empresas ya no se pueden restaurar: ${nombres}. Vuelve a analizar el respaldo.` },
      { status: 409 }
    );
  }

  // Respaldo automático del estado ACTUAL del corte destino, para poder deshacer
  // una restauración equivocada. Si el corte destino no existe todavía, no hay
  // nada que respaldar.
  const preRestore = await buildSnapshotBackup(targetSnapshotId);
  if (preRestore) {
    await prisma.globalConfig.upsert({
      where: { key: preRestoreKey(targetSnapshotId) },
      create: { key: preRestoreKey(targetSnapshotId), value: JSON.stringify(preRestore) },
      update: { value: JSON.stringify(preRestore) },
    });
  }

  const result = await applyRestore(backup, {
    targetSnapshotId,
    targetLabel: body?.targetLabel,
    companyIds,
    restoreCompanyProfile: body?.restoreCompanyProfile === true,
    restoreConfig: body?.restoreConfig !== false,
    hideFromCompanies: body?.hideFromCompanies === true,
  });

  return Response.json({
    message: `Restaurado: ${result.empresasRestauradas} empresas, ${result.posicionesRestauradas} posiciones.`,
    ...result,
    respaldoPrevioGuardado: preRestore !== null,
  });
}
