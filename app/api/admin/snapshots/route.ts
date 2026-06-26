import { SnapshotProcessingStatus } from "@prisma/client";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE, type Snapshot, safeParseSnapshots } from "@/lib/workspace";

type SnapshotMutationBody = {
  snapshotId?: string;
  date?: string;
  label?: string;
  companyIds?: string[] | null;
};

type GlobalSnapshotSummary = {
  id: string;
  label: string;
  date: string;
  status: SnapshotProcessingStatus;
  processedAt: string | null;
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
      status: true,
      processedAt: true,
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
    status: snapshot.status,
    processedAt: snapshot.processedAt?.toISOString() ?? null,
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
  const cloned = JSON.parse(JSON.stringify(rows ?? [])) as Snapshot["rows"];
  return cloned.map((r) => ({ ...r, _carried: true as const }));
}

async function rebuildRelationalWorkspace(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  user: UserSummary,
  snapshots: Record<string, Snapshot>
) {
  const existingStatuses = await tx.userSnapshot.findMany({
    where: { userId: user.id },
    select: {
      snapshotId: true,
      status: true,
      processedAt: true,
    },
  });
  const statusBySnapshotId = new Map(existingStatuses.map((snapshot) => [snapshot.snapshotId, { status: snapshot.status, processedAt: snapshot.processedAt }]));

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
        status: statusBySnapshotId.get(snapshot.id)?.status ?? SnapshotProcessingStatus.IN_REVIEW,
        processedAt: statusBySnapshotId.get(snapshot.id)?.processedAt ?? null,
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

async function getSnapshotCompanyRestrictions(snapshotIds: string[]): Promise<Map<string, string[]>> {
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
    } catch { /* ignore */ }
  }
  return result;
}

function isUserAllowedForSnapshot(userCompanyId: string, restriction: string[] | undefined): boolean {
  if (restriction === undefined) return true;   // no restriction = all
  if (restriction.length === 0) return false;   // empty = nobody
  return restriction.includes(userCompanyId);
}

async function applySnapshotToCompanies(snapshot: Snapshot, companyIds: string[] | null) {
  // null = all users; [] = nobody; [...] = only those companies
  let users: UserSummary[];
  if (companyIds === null) {
    users = await getUsers();
  } else if (companyIds.length === 0) {
    users = [];
  } else {
    users = await prisma.user.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true, companyId: true },
      orderBy: { createdAt: "asc" },
    });
  }

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

  const restrictions = await getSnapshotCompanyRestrictions(globalSnapshots.map((s) => s.id));

  await prisma.$transaction(async (tx) => {
    for (const user of users) {
      const allowedSnapshots = globalSnapshots.filter((s) =>
        isUserAllowedForSnapshot(user.companyId, restrictions.get(s.id))
      );

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
        allowedSnapshots.map((globalSnapshot) => {
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
          : allowedSnapshots[0]?.id ?? "";

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
  const companyIds = Array.isArray(body?.companyIds) ? (body.companyIds as string[]) : null;

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

  if (companyIds !== null) {
    await prisma.globalConfig.upsert({
      where: { key: `snapshot-companies-${snapshotDate}` },
      update: { value: JSON.stringify({ companyIds }) },
      create: { key: `snapshot-companies-${snapshotDate}`, value: JSON.stringify({ companyIds }) },
    });
  }

  const snapshot: Snapshot = {
    id: snapshotDate,
    label: snapshotLabel,
    date: snapshotDate,
    rows: [],
  };

  const affectedUsers = await applySnapshotToCompanies(snapshot, companyIds);

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