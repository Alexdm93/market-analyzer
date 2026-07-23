import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeParseSnapshots } from "@/lib/workspace";

export type SnapshotCargoItem = {
  departamento: string;
  tituloCargo: string;
};

function configKey(snapshotId: string) {
  return `snapshot-cargos-${snapshotId}`;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId") ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  try {
    const row = await prisma.globalConfig.findUnique({ where: { key: configKey(snapshotId) } });
    if (row?.value) {
      const parsed = JSON.parse(row.value) as SnapshotCargoItem[];
      if (Array.isArray(parsed)) {
        // null means "not configured" (allow all), [] means "explicitly empty" (allow nothing)
        return Response.json({ cargos: parsed });
      }
    }
  } catch {
    // GlobalConfig table may not exist yet — treat as not configured
  }

  return Response.json({ cargos: null });
}

type PutBody = {
  snapshotId?: string;
  cargos?: SnapshotCargoItem[];
};

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as PutBody | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  const cargos = body?.cargos;

  if (!snapshotId || !Array.isArray(cargos)) {
    return Response.json({ message: "Formato inválido." }, { status: 400 });
  }

  try {
    const key = configKey(snapshotId);
    await prisma.globalConfig.upsert({
      where: { key },
      create: { key, value: JSON.stringify(cargos) },
      update: { value: JSON.stringify(cargos) },
    });

    // Limpiar rows de todos los workspaces que no estén en la nueva lista de cargos.
    await pruneWorkspaceRows(snapshotId, cargos);

    return Response.json({ message: "Cargos del corte guardados correctamente." });
  } catch {
    return Response.json(
      { message: "No se pudo guardar. Verifica que la migración de base de datos esté aplicada." },
      { status: 500 }
    );
  }
}

async function pruneWorkspaceRows(snapshotId: string, allowedCargos: SnapshotCargoItem[]) {
  const normAllowed = allowedCargos.map((c) => ({
    normTitle: c.tituloCargo.trim().toLowerCase(),
    normDept: c.departamento.trim().toLowerCase(),
  }));

  // Never touch workspaces that already submitted — their data is locked.
  const submittedUserIds = new Set(
    (
      await prisma.userSnapshot.findMany({
        where: { snapshotId, submittedAt: { not: null } },
        select: { userId: true },
      })
    ).map((s) => s.userId),
  );

  const workspaces = await prisma.userWorkspace.findMany({
    select: { userId: true, snapshotsJson: true },
  });

  type WorkspaceUpdate = {
    userId: string;
    snapshotsJson: string;
    removedPositionIds: string[];
  };

  const updates: WorkspaceUpdate[] = [];

  for (const workspace of workspaces) {
    if (submittedUserIds.has(workspace.userId)) continue;

    const snapshots = safeParseSnapshots(workspace.snapshotsJson);
    const snapshot = snapshots[snapshotId];
    if (!snapshot?.rows?.length) continue;

    const validRows = snapshot.rows.filter((r) => {
      const normTitle = (r.tituloCargo ?? "").trim().toLowerCase();
      const normDept = (r.departamento ?? "").trim().toLowerCase();
      return normAllowed.some((c) => {
        if (c.normTitle !== normTitle) return false;
        return !normDept || normDept === c.normDept;
      });
    });

    if (validRows.length === snapshot.rows.length) continue;

    const validIds = new Set(validRows.map((r) => r.id));
    const removedPositionIds = snapshot.rows
      .filter((r) => !validIds.has(r.id))
      .map((r) => r.id);

    snapshots[snapshotId] = { ...snapshot, rows: validRows };
    updates.push({ userId: workspace.userId, snapshotsJson: JSON.stringify(snapshots), removedPositionIds });
  }

  if (updates.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.userWorkspace.update({
        where: { userId: update.userId },
        data: { snapshotsJson: update.snapshotsJson },
      });
      if (update.removedPositionIds.length > 0) {
        await tx.userPosition.deleteMany({
          where: { userId: update.userId, snapshotId, positionId: { in: update.removedPositionIds } },
        });
      }
    }
  });
}
