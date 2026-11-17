import { SnapshotProcessingStatus } from "@prisma/client";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE, type Snapshot, safeParseSnapshots } from "@/lib/workspace";
import { unpublishSnapshot } from "@/lib/published-snapshots";

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

/**
 * Crear, renombrar y borrar un corte escriben en el workspace de cada usuario,
 * así que tardan más que el tope por omisión de Vercel. Es el mismo valor que
 * ya usan las rutas de informes (AC Consulting, 2026-11-17).
 */
export const maxDuration = 60;

/** Workspaces por lote de escrituras. Cada uno lleva su JSON, que pesa. */
const WORKSPACES_POR_LOTE = 20;

/** Posiciones por `createMany`. Son filas chicas, así que caben muchas. */
const POSICIONES_POR_LOTE = 1000;

function cloneRows(rows: Snapshot["rows"]) {
  const cloned = JSON.parse(JSON.stringify(rows ?? [])) as Snapshot["rows"];
  return cloned.map((r) => ({ ...r, _carried: true as const }));
}

/**
 * Crea el corte para los usuarios de las empresas indicadas.
 *
 * Antes esto era un bucle por usuario con unas trece idas y vueltas cada uno:
 * el upsert del workspace, el update, y una reconstrucción que borraba y
 * recreaba las filas relacionales de TODOS los cortes de ese usuario, no solo
 * del que se estaba creando. Con trescientos usuarios y cuatro cortes cada uno
 * son unas cuatro mil consultas en serie contra el pooler.
 *
 * Reconstruir los otros cortes no hacía falta: esta función solo corre al
 * crear, el POST rechaza con 409 un corte que ya exista, y nada de lo que hace
 * toca los cortes anteriores. Los borraba y los volvía a escribir idénticos.
 *
 * Ahora el número de consultas ya no depende de cuántos usuarios haya: se leen
 * todos los workspaces de una vez, se calcula en memoria, y se escribe en
 * `createMany` y lotes. De unas cuatro mil consultas a unas treinta
 * (AC Consulting, 2026-11-17).
 */
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

  if (users.length === 0) return 0;

  const userIds = users.map((user) => user.id);

  const existentes = await prisma.userWorkspace.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, snapshotsJson: true, selectedSnapshotId: true },
  });
  const workspacePorUsuario = new Map(existentes.map((w) => [w.userId, w]));

  const workspacesACrear: {
    userId: string;
    inflation: number;
    snapshotsJson: string;
    selectedSnapshotId: string;
    companyInfoJson: string;
  }[] = [];
  const workspacesAActualizar: {
    userId: string;
    snapshotsJson: string;
    selectedSnapshotId: string;
  }[] = [];
  /** Las filas que arrastra cada usuario, para no volver a calcularlas abajo. */
  const filasPorUsuario = new Map<string, Snapshot["rows"]>();

  for (const user of users) {
    const actual = workspacePorUsuario.get(user.id);
    const nextSnapshots = actual ? safeParseSnapshots(actual.snapshotsJson) : {};
    const latestSnapshot = Object.values(nextSnapshots)
      .sort((left, right) => right.date.localeCompare(left.date))[0];
    const clonedRows = cloneRows(latestSnapshot?.rows ?? []);

    nextSnapshots[snapshot.id] = {
      id: snapshot.id,
      label: snapshot.label,
      date: snapshot.date,
      rows: clonedRows,
    };

    filasPorUsuario.set(user.id, clonedRows);
    const snapshotsJson = JSON.stringify(nextSnapshots);

    if (actual) {
      workspacesAActualizar.push({
        userId: user.id,
        snapshotsJson,
        selectedSnapshotId: actual.selectedSnapshotId || snapshot.id,
      });
    } else {
      workspacesACrear.push({
        userId: user.id,
        inflation: DEFAULT_WORKSPACE.inflation,
        snapshotsJson,
        selectedSnapshotId: snapshot.id,
        companyInfoJson: JSON.stringify(DEFAULT_WORKSPACE.companyInfo),
      });
    }
  }

  if (workspacesACrear.length > 0) {
    await prisma.userWorkspace.createMany({ data: workspacesACrear, skipDuplicates: true });
  }

  // Los updates no se pueden agrupar en una sola consulta porque cada uno lleva
  // su propio JSON, así que van en lotes de escrituras agrupadas.
  for (let i = 0; i < workspacesAActualizar.length; i += WORKSPACES_POR_LOTE) {
    await prisma.$transaction(
      workspacesAActualizar.slice(i, i + WORKSPACES_POR_LOTE).map((w) =>
        prisma.userWorkspace.update({
          where: { userId: w.userId },
          data: { snapshotsJson: w.snapshotsJson, selectedSnapshotId: w.selectedSnapshotId },
        }),
      ),
    );
  }

  // Las filas relacionales SOLO del corte que se está creando. No hay nada que
  // borrar antes: el POST ya rechazó el caso de que el corte exista.
  const fecha = resolveSnapshotDate(snapshot.date);

  await prisma.userSnapshot.createMany({
    data: users.map((user) => ({
      userId: user.id,
      companyId: user.companyId,
      snapshotId: snapshot.id,
      label: snapshot.label,
      date: fecha,
    })),
    skipDuplicates: true,
  });

  // Hace falta el id que la base le dio a cada fila para colgarle las
  // posiciones; `createMany` no los devuelve.
  const creados = await prisma.userSnapshot.findMany({
    where: { snapshotId: snapshot.id, userId: { in: userIds } },
    select: { id: true, userId: true },
  });
  const userSnapshotPorUsuario = new Map(creados.map((fila) => [fila.userId, fila.id]));

  const posiciones: {
    userId: string;
    companyId: string;
    userSnapshotId: string;
    snapshotId: string;
    snapshotLabel: string;
    snapshotDate: Date;
    positionId: string;
    title: string | null;
    dataJson: string;
  }[] = [];

  for (const user of users) {
    const userSnapshotId = userSnapshotPorUsuario.get(user.id);
    if (!userSnapshotId) continue;
    for (const row of filasPorUsuario.get(user.id) ?? []) {
      posiciones.push({
        userId: user.id,
        companyId: user.companyId,
        userSnapshotId,
        snapshotId: snapshot.id,
        snapshotLabel: snapshot.label,
        snapshotDate: fecha,
        positionId: row.id,
        title: row.tituloCargo || null,
        dataJson: JSON.stringify(row),
      });
    }
  }

  for (let i = 0; i < posiciones.length; i += POSICIONES_POR_LOTE) {
    await prisma.userPosition.createMany({
      data: posiciones.slice(i, i + POSICIONES_POR_LOTE),
      skipDuplicates: true,
    });
  }

  return users.length;
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

  // En lotes de escrituras agrupadas, no una transacción interactiva que
  // encadene un update por workspace: con trescientos usuarios eso pasaba del
  // tope de cinco segundos de Prisma (AC Consulting, 2026-11-17).
  for (let i = 0; i < updatedWorkspaces.length; i += WORKSPACES_POR_LOTE) {
    await prisma.$transaction(
      updatedWorkspaces.slice(i, i + WORKSPACES_POR_LOTE).map((workspace) =>
        prisma.userWorkspace.update({
          where: { userId: workspace.userId },
          data: { snapshotsJson: workspace.snapshotsJson },
        }),
      ),
    );
  }

  // Fuera de los lotes: es una sola consulta y volver a ponerle el mismo
  // nombre no cambia nada, así que repetirla no hace daño.
  await prisma.userPosition.updateMany({
    where: { snapshotId },
    data: { snapshotLabel: label },
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

  for (let i = 0; i < updatedWorkspaces.length; i += WORKSPACES_POR_LOTE) {
    await prisma.$transaction(
      updatedWorkspaces.slice(i, i + WORKSPACES_POR_LOTE).map((workspace) =>
        prisma.userWorkspace.update({
          where: { userId: workspace.userId },
          data: {
            selectedSnapshotId: workspace.selectedSnapshotId,
            snapshotsJson: workspace.snapshotsJson,
          },
        }),
      ),
    );
  }

  // Limpiar configuración huérfana del corte eliminado (restricción de empresas y
  // cargos configurados) para que, si luego se crea otro corte con la misma fecha,
  // no herede en silencio restricciones de este corte ya borrado.
  // snapshot-backup-{id} se deja intacto a propósito: es el respaldo del usuario y
  // debe sobrevivir a la eliminación del corte para poder restaurarlo después.
  await prisma.globalConfig.deleteMany({
    where: {
      key: {
        in: [
          `snapshot-companies-${snapshotId}`,
          `snapshot-cargos-${snapshotId}`,
          `snapshot-ranges-${snapshotId}`,
          // La lista de cargos con data del Radar se calcula por corte; si el
          // corte ya no existe, lo guardado tampoco sirve.
          `radar-cargos-con-datos-${snapshotId}`,
        ],
      },
    },
  });

  // Y sacarlo de la lista de publicados. Si no, el id queda ahí colgando y un
  // corte nuevo con la misma fecha nacería publicado sin que nadie lo publique.
  await unpublishSnapshot(snapshotId);

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

