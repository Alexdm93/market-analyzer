import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE, type Snapshot, safeParseSnapshots } from "@/lib/workspace";

type SnapshotMutationBody = {
  snapshotId?: string;
  date?: string;
  label?: string;
};

type GlobalSnapshotSummary = {
  id: string;
  label: string;
  date: string;
};

type UserSummary = {
  id: string;
  companyId: string;
};

function forbiddenResponse() {
  return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
}

async function requireAdminSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }

  if (session.user.role !== "ADMIN") {
    return { ok: false as const, response: forbiddenResponse() };
  }

  return { ok: true as const, session };
}

function normalizeSnapshotDate(value?: string) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return "";
  }

  const parsedDate = new Date(trimmed);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toISOString().split("T")[0];
}

function resolveSnapshotDate(value: string) {
  const parsedDate = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return parsedDate;
}

async function getGlobalSnapshots() {
  const snapshots = await prisma.userSnapshot.findMany({
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
  });

  return snapshots.map<GlobalSnapshotSummary>((snapshot) => ({
    id: snapshot.snapshotId,
    label: snapshot.label,
    date: snapshot.date.toISOString().split("T")[0],
  }));
}

async function getUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      companyId: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

function cloneRows(rows: Snapshot["rows"]) {
  return JSON.parse(JSON.stringify(rows ?? [])) as Snapshot["rows"];
}

async function rebuildRelationalWorkspace(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  user: UserSummary,
  snapshots: Record<string, Snapshot>
) {
  await tx.userPosition.deleteMany({
    where: { userId: user.id },
  });

  await tx.userSnapshot.deleteMany({
    where: { userId: user.id },
  });

  for (const snapshot of Object.values(snapshots)) {
    const createdSnapshot = await tx.userSnapshot.create({
      data: {
        userId: user.id,
        companyId: user.companyId,
        snapshotId: snapshot.id,
        label: snapshot.label,
        date: resolveSnapshotDate(snapshot.date),
      },
      select: { id: true },
    });

    if ((snapshot.rows ?? []).length > 0) {
      await tx.userPosition.createMany({
        data: snapshot.rows.map((row) => ({
          userId: user.id,
          companyId: user.companyId,
          userSnapshotId: createdSnapshot.id,
          snapshotId: snapshot.id,
          snapshotLabel: snapshot.label,
          snapshotDate: resolveSnapshotDate(snapshot.date),
          positionId: row.id,
          title: row.tituloCargo || null,
          dataJson: JSON.stringify(row),
        })),
      });
    }
  }
}

async function applySnapshotToAllUsers(snapshot: Snapshot) {
  const users = await getUsers();

  await prisma.$transaction(async (tx) => {
    for (const user of users) {
      const workspace = await tx.userWorkspace.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          inflation: DEFAULT_WORKSPACE.inflation,
          snapshotsJson: JSON.stringify(DEFAULT_WORKSPACE.snapshots),
          selectedSnapshotId: DEFAULT_WORKSPACE.selectedSnapshotId,
          companyInfoJson: JSON.stringify(DEFAULT_WORKSPACE.companyInfo),
        },
      });

      const nextSnapshots = safeParseSnapshots(workspace.snapshotsJson);
      const latestSnapshot = Object.values(nextSnapshots)
        .sort((left, right) => right.date.localeCompare(left.date))[0];
      const clonedRows = cloneRows(latestSnapshot?.rows ?? []);

      nextSnapshots[snapshot.id] = {
        id: snapshot.id,
        label: snapshot.label,
        date: snapshot.date,
        rows: clonedRows,
      };

      await tx.userWorkspace.update({
        where: { userId: user.id },
        data: {
          snapshotsJson: JSON.stringify(nextSnapshots),
          selectedSnapshotId: workspace.selectedSnapshotId || snapshot.id,
        },
      });

      await rebuildRelationalWorkspace(tx, user, nextSnapshots);
    }
  });

  return users.length;
}

async function syncGlobalSnapshotsForAllUsers() {
  const [users, globalSnapshots] = await Promise.all([getUsers(), getGlobalSnapshots()]);

  await prisma.$transaction(async (tx) => {
    for (const user of users) {
      const workspace = await tx.userWorkspace.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          inflation: DEFAULT_WORKSPACE.inflation,
          snapshotsJson: JSON.stringify(DEFAULT_WORKSPACE.snapshots),
          selectedSnapshotId: DEFAULT_WORKSPACE.selectedSnapshotId,
          companyInfoJson: JSON.stringify(DEFAULT_WORKSPACE.companyInfo),
        },
      });

      const currentSnapshots = safeParseSnapshots(workspace.snapshotsJson);
      const latestSnapshot = Object.values(currentSnapshots)
        .sort((left, right) => right.date.localeCompare(left.date))[0];
      const latestRows = cloneRows(latestSnapshot?.rows ?? []);
      const nextSnapshots = Object.fromEntries(
        globalSnapshots.map((globalSnapshot) => {
          const currentSnapshot = currentSnapshots[globalSnapshot.id];

          return [
            globalSnapshot.id,
            {
              id: globalSnapshot.id,
              label: globalSnapshot.label,
              date: globalSnapshot.date,
              rows: currentSnapshot ? cloneRows(currentSnapshot.rows ?? []) : cloneRows(latestRows),
            },
          ];
        })
      ) as Record<string, Snapshot>;

      const nextSelectedSnapshotId =
        workspace.selectedSnapshotId && nextSnapshots[workspace.selectedSnapshotId]
          ? workspace.selectedSnapshotId
          : globalSnapshots[0]?.id ?? "";

      await tx.userWorkspace.update({
        where: { userId: user.id },
        data: {
          snapshotsJson: JSON.stringify(nextSnapshots),
          selectedSnapshotId: nextSelectedSnapshotId,
        },
      });

      await rebuildRelationalWorkspace(tx, user, nextSnapshots);
    }
  });

  return {
    affectedUsers: users.length,
    snapshotCount: globalSnapshots.length,
  };
}

async function renameSnapshotForAllUsers(snapshotId: string, label: string) {
  const workspaces = await prisma.userWorkspace.findMany({
    select: {
      userId: true,
      snapshotsJson: true,
    },
  });

  const updatedWorkspaces = workspaces
    .map((workspace) => {
      const snapshots = safeParseSnapshots(workspace.snapshotsJson);
      const current = snapshots[snapshotId];

      if (!current) {
        return null;
      }

      snapshots[snapshotId] = {
        ...current,
        label,
      };

      return {
        userId: workspace.userId,
        snapshotsJson: JSON.stringify(snapshots),
      };
    })
    .filter((workspace): workspace is { userId: string; snapshotsJson: string } => workspace !== null);

  const updatedSnapshotRows = await prisma.userSnapshot.updateMany({
    where: { snapshotId },
    data: { label },
  });

  if (updatedSnapshotRows.count === 0) {
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    for (const workspace of updatedWorkspaces) {
      await tx.userWorkspace.update({
        where: { userId: workspace.userId },
        data: { snapshotsJson: workspace.snapshotsJson },
      });
    }

    await tx.userPosition.updateMany({
      where: { snapshotId },
      data: { snapshotLabel: label },
    });
  });

  return updatedSnapshotRows.count;
}

async function deleteSnapshotForAllUsers(snapshotId: string) {
  const workspaces = await prisma.userWorkspace.findMany({
    select: {
      userId: true,
      selectedSnapshotId: true,
      snapshotsJson: true,
    },
  });

  const updatedWorkspaces = workspaces
    .map((workspace) => {
      const snapshots = safeParseSnapshots(workspace.snapshotsJson);

      if (!snapshots[snapshotId]) {
        return null;
      }

      delete snapshots[snapshotId];
      const nextSelectedSnapshotId = workspace.selectedSnapshotId === snapshotId ? Object.keys(snapshots)[0] ?? "" : workspace.selectedSnapshotId ?? "";

      return {
        userId: workspace.userId,
        selectedSnapshotId: nextSelectedSnapshotId,
        snapshotsJson: JSON.stringify(snapshots),
      };
    })
    .filter((workspace): workspace is { userId: string; selectedSnapshotId: string; snapshotsJson: string } => workspace !== null);

  const deletedSnapshots = await prisma.userSnapshot.deleteMany({
    where: { snapshotId },
  });

  if (deletedSnapshots.count === 0) {
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    for (const workspace of updatedWorkspaces) {
      await tx.userWorkspace.update({
        where: { userId: workspace.userId },
        data: {
          selectedSnapshotId: workspace.selectedSnapshotId,
          snapshotsJson: workspace.snapshotsJson,
        },
      });
    }
  });

  return deletedSnapshots.count;
}

export async function GET() {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const [snapshots, userCount] = await Promise.all([
    getGlobalSnapshots(),
    prisma.user.count(),
  ]);

  return Response.json({ snapshots, userCount });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as SnapshotMutationBody | null;
  const snapshotDate = normalizeSnapshotDate(body?.date);
  const snapshotLabel = body?.label?.trim() || snapshotDate;

  if (!snapshotDate) {
    return Response.json({ message: "Debes indicar la fecha del corte." }, { status: 400 });
  }

  const existingSnapshot = await prisma.userSnapshot.findFirst({
    where: { snapshotId: snapshotDate },
    select: { id: true },
  });

  if (existingSnapshot) {
    return Response.json({ message: `Ya existe un corte para la fecha ${snapshotDate}.` }, { status: 409 });
  }

  const snapshot: Snapshot = {
    id: snapshotDate,
    label: snapshotLabel,
    date: snapshotDate,
    rows: [],
  };

  const affectedUsers = await applySnapshotToAllUsers(snapshot);

  return Response.json({
    message: `Corte ${snapshotDate} creado para ${affectedUsers} usuarios.`,
    snapshot,
    affectedUsers,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as SnapshotMutationBody | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  const label = body?.label?.trim() ?? "";

  if (!snapshotId || !label) {
    return Response.json({ message: "Debes indicar el corte y su nueva etiqueta." }, { status: 400 });
  }

  const updatedRows = await renameSnapshotForAllUsers(snapshotId, label);

  if (updatedRows === 0) {
    return Response.json({ message: "El corte no existe." }, { status: 404 });
  }

  return Response.json({
    message: `Corte ${snapshotId} renombrado para todos los usuarios.`,
    snapshot: {
      id: snapshotId,
      label,
    },
    affectedUsers: updatedRows,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as SnapshotMutationBody | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Debes indicar el corte a eliminar." }, { status: 400 });
  }

  const deletedRows = await deleteSnapshotForAllUsers(snapshotId);

  if (deletedRows === 0) {
    return Response.json({ message: "El corte no existe." }, { status: 404 });
  }

  return Response.json({
    message: `Corte ${snapshotId} eliminado para todos los usuarios.`,
    affectedUsers: deletedRows,
  });
}

export async function PUT() {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const result = await syncGlobalSnapshotsForAllUsers();

  return Response.json({
    message: `Sincronización completada: ${result.snapshotCount} cortes globales aplicados a ${result.affectedUsers} usuarios.`,
    ...result,
  });
}