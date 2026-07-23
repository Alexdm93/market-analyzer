import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeParseSnapshots } from "@/lib/workspace";
import { createSnapshotBackup } from "@/lib/snapshot-backup";

export type BackupSummary = {
  snapshotId: string;
  snapshotLabel: string;
  snapshotDate: string;
  publishedAt: string;
  totalCompanies: number;
  totalPositions: number;
};

export type SnapshotBackup = {
  version: "1";
  snapshotId: string;
  snapshotLabel: string;
  snapshotDate: string;
  publishedAt: string;
  totalCompanies: number;
  totalPositions: number;
  companies: {
    companyId: string;
    companyName: string;
    submittedAt: string;
    positions: { positionId: string; title: string | null; data: Record<string, unknown> }[];
    workspaceRows: unknown[];
  }[];
  cargoConfig: { departamento: string; tituloCargo: string }[] | null;
  participatingCompanyIds: string[] | null;
};

function backupKey(snapshotId: string) {
  return `snapshot-backup-${snapshotId}`;
}

async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { ok: false as const, response: Response.json({ message: "Acceso restringido a administradores." }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const records = await prisma.globalConfig.findMany({
    where: { key: { startsWith: "snapshot-backup-" } },
    select: { key: true, value: true },
    orderBy: { updatedAt: "desc" },
  });

  const backups: BackupSummary[] = [];
  for (const record of records) {
    try {
      const parsed = JSON.parse(record.value) as SnapshotBackup;
      backups.push({
        snapshotId: parsed.snapshotId,
        snapshotLabel: parsed.snapshotLabel,
        snapshotDate: parsed.snapshotDate,
        publishedAt: parsed.publishedAt,
        totalCompanies: parsed.totalCompanies,
        totalPositions: parsed.totalPositions,
      });
    } catch {
      // skip malformed entries
    }
  }

  return Response.json({ backups });
}

type RestoreBody = {
  snapshotId?: string;
  label?: string;
};

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as RestoreBody | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  const customLabel = body?.label?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte a restaurar." }, { status: 400 });
  }

  const record = await prisma.globalConfig.findUnique({
    where: { key: backupKey(snapshotId) },
    select: { value: true },
  });

  if (!record) {
    return Response.json({ message: "No existe un respaldo para ese corte." }, { status: 404 });
  }

  let backup: SnapshotBackup;
  try {
    backup = JSON.parse(record.value) as SnapshotBackup;
  } catch {
    return Response.json({ message: "El respaldo está dañado y no puede restaurarse." }, { status: 422 });
  }

  const label = customLabel || backup.snapshotLabel;
  const snapshotDate = new Date(`${backup.snapshotDate}T00:00:00.000Z`);

  let restoredCompanies = 0;
  let restoredPositions = 0;

  for (const company of backup.companies) {
    // Use the most recently created user for this company
    const user = await prisma.user.findFirst({
      where: { companyId: company.companyId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!user) continue;

    await prisma.$transaction(async (tx) => {
      // Upsert UserSnapshot
      const upserted = await tx.userSnapshot.upsert({
        where: { userId_snapshotId: { userId: user.id, snapshotId } },
        create: {
          userId: user.id,
          companyId: company.companyId,
          snapshotId,
          label,
          date: snapshotDate,
          submittedAt: new Date(company.submittedAt),
        },
        update: {
          label,
          submittedAt: new Date(company.submittedAt),
        },
        select: { id: true },
      });

      // Clean slate for this user+snapshot
      await tx.userPosition.deleteMany({ where: { userId: user.id, snapshotId } });

      // Recreate positions from backup
      if (company.positions.length > 0) {
        await tx.userPosition.createMany({
          data: company.positions.map((pos) => ({
            userId: user.id,
            companyId: company.companyId,
            userSnapshotId: upserted.id,
            snapshotId,
            snapshotLabel: label,
            snapshotDate,
            positionId: pos.positionId,
            title: pos.title,
            dataJson: JSON.stringify(pos.data),
          })),
        });
      }

      // Restore workspace rows for this snapshot period
      const ws = await tx.userWorkspace.findUnique({
        where: { userId: user.id },
        select: { snapshotsJson: true },
      });
      const snaps = safeParseSnapshots(ws?.snapshotsJson ?? "{}");
      snaps[snapshotId] = {
        id: snapshotId,
        label,
        date: backup.snapshotDate,
        rows: company.workspaceRows as never,
      };
      await tx.userWorkspace.upsert({
        where: { userId: user.id },
        update: { snapshotsJson: JSON.stringify(snaps) },
        create: { userId: user.id, snapshotsJson: JSON.stringify(snaps), inflation: 5 },
      });
    });

    restoredCompanies++;
    restoredPositions += company.positions.length;
  }

  // Restore GlobalConfig entries
  if (backup.cargoConfig) {
    await prisma.globalConfig.upsert({
      where: { key: `snapshot-cargos-${snapshotId}` },
      create: { key: `snapshot-cargos-${snapshotId}`, value: JSON.stringify(backup.cargoConfig) },
      update: { value: JSON.stringify(backup.cargoConfig) },
    });
  }
  if (backup.participatingCompanyIds) {
    await prisma.globalConfig.upsert({
      where: { key: `snapshot-companies-${snapshotId}` },
      create: { key: `snapshot-companies-${snapshotId}`, value: JSON.stringify({ companyIds: backup.participatingCompanyIds }) },
      update: { value: JSON.stringify({ companyIds: backup.participatingCompanyIds }) },
    });
  }

  return Response.json({
    message: `Corte restaurado: ${restoredCompanies} empresas, ${restoredPositions} posiciones.`,
    snapshotId,
    label,
    restoredCompanies,
    restoredPositions,
  });
}

// Manual backup trigger — admin can call this from the data page without publishing.
export async function PUT(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { snapshotId?: string } | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte a respaldar." }, { status: 400 });
  }

  const exists = await prisma.userSnapshot.count({ where: { snapshotId } });
  if (exists === 0) {
    return Response.json({ message: "El corte no existe." }, { status: 404 });
  }

  await createSnapshotBackup(snapshotId);

  return Response.json({ message: `Respaldo del corte ${snapshotId} creado correctamente.`, snapshotId });
}
