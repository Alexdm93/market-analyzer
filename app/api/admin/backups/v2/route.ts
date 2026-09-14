import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSnapshotBackup } from "@/lib/snapshot-backup-v2";

export function storedBackupKey(snapshotId: string) {
  return `snapshot-backup-v2-${snapshotId}`;
}

/**
 * GET /api/admin/backups/v2?snapshotId=YYYY-MM-DD
 *   → descarga el respaldo completo del corte como archivo JSON
 *
 * GET /api/admin/backups/v2?snapshotId=YYYY-MM-DD&summary=1
 *   → solo el encabezado y los conteos, para verificar sin descargar todo
 *
 * SOLO LECTURA: este endpoint no escribe absolutamente nada.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  const summaryOnly = searchParams.get("summary") === "1";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const backup = await buildSnapshotBackup(snapshotId);

  if (!backup) {
    return Response.json({ message: "El corte no existe o no tiene data." }, { status: 404 });
  }

  if (summaryOnly) {
    return Response.json({
      version: backup.version,
      generatedAt: backup.generatedAt,
      source: backup.source,
      counts: {
        ...backup.counts,
        workspaces: backup.workspaces.length,
        users: backup.users.length,
        editRequests: backup.editRequests.length,
      },
      config: {
        cargos: backup.config.cargos !== null,
        companies: backup.config.companies !== null,
        ranges: backup.config.ranges !== null,
      },
      // Desglose por empresa, para verificar de un vistazo que no falta ninguna
      porEmpresa: backup.companies
        .map((c) => {
          const companyId = c.id as string;
          const snap = backup.userSnapshots.find((s) => s.companyId === companyId);
          return {
            empresa: c.name as string,
            posiciones: backup.positions.filter((p) => p.companyId === companyId).length,
            enviado: snap?.submittedAt !== null && snap?.submittedAt !== undefined,
          };
        })
        .sort((a, b) => a.empresa.localeCompare(b.empresa, "es")),
    });
  }

  const filename = `respaldo-${snapshotId}-${new Date().toISOString().split("T")[0]}.json`;

  return new Response(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * POST /api/admin/backups/v2  { snapshotId }
 *   → genera el respaldo y guarda una copia en la base como copia de trabajo.
 *
 * Escribe UNA sola fila de GlobalConfig (la del respaldo). No toca data de cortes.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { snapshotId?: string } | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const backup = await buildSnapshotBackup(snapshotId);
  if (!backup) {
    return Response.json({ message: "El corte no existe o no tiene data." }, { status: 404 });
  }

  const serialized = JSON.stringify(backup);

  await prisma.globalConfig.upsert({
    where: { key: storedBackupKey(snapshotId) },
    create: { key: storedBackupKey(snapshotId), value: serialized },
    update: { value: serialized },
  });

  return Response.json({
    message: `Respaldo creado: ${backup.counts.companies} empresas, ${backup.counts.positions} posiciones.`,
    source: backup.source,
    counts: backup.counts,
    tamañoBytes: serialized.length,
  });
}
