import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE, safeParseSnapshots, type Snapshot } from "@/lib/workspace";

/**
 * Reparte el corte entre los usuarios de las empresas elegidas, así que puede
 * tardar más que el tope por omisión de Vercel. Es el mismo valor que ya usan
 * las rutas de informes.
 */
export const maxDuration = 60;

function companiesKey(snapshotId: string) {
  return `snapshot-companies-${snapshotId}`;
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

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  if (!snapshotId) return Response.json({ companyIds: [] });

  const record = await prisma.globalConfig.findUnique({ where: { key: companiesKey(snapshotId) } });
  // null = no restriction exists (all companies see it)
  if (!record) return Response.json({ companyIds: null });

  try {
    const parsed = JSON.parse(record.value) as { companyIds?: string[] };
    return Response.json({ companyIds: Array.isArray(parsed.companyIds) ? parsed.companyIds : null });
  } catch {
    return Response.json({ companyIds: null });
  }
}

/** Cuántas actualizaciones de workspace van en cada lote. */
const TAMANO_LOTE = 20;

/**
 * Le deja el corte servido a cada usuario de las empresas indicadas.
 *
 * Antes esto era un bucle dentro de UNA sola transacción interactiva, con
 * cuatro consultas por usuario: mirar si ya lo tenía, crear o traer su
 * workspace, actualizarlo y crear la fila del corte. Con treinta empresas y
 * más de trescientos usuarios son más de trescientas idas y vueltas seguidas
 * contra el pooler, dentro de una transacción que Prisma corta a los cinco
 * segundos por omisión. Guardar la lista de participantes reventaba por tiempo
 * y la pantalla solo sabía decir "No se pudo guardar"
 * (AC Consulting, 2026-11-17).
 *
 * Ahora se averigua en UNA consulta quién ya lo tiene, se trabaja solo sobre
 * los que faltan —que suelen ser unos pocos— y las escrituras van en lotes.
 */
async function pushSnapshotToNewCompanies(snapshotId: string, newCompanyIds: string[]) {
  if (newCompanyIds.length === 0) return;

  // Snapshot metadata may not exist yet if no company had it before — fall back to snapshotId
  const snapshotRow = await prisma.userSnapshot.findFirst({
    where: { snapshotId },
    select: { label: true, date: true },
  });
  const snapshotLabel = snapshotRow?.label ?? snapshotId;
  const snapshotDate = snapshotRow?.date ?? new Date(`${snapshotId}T00:00:00.000Z`);

  const snapshot: Snapshot = {
    id: snapshotId,
    label: snapshotLabel,
    date: snapshotId,
    rows: [],
  };

  const users = await prisma.user.findMany({
    where: { companyId: { in: newCompanyIds } },
    select: { id: true, companyId: true },
  });
  if (users.length === 0) return;

  // Quién ya lo tiene, de una sola vez en vez de preguntarlo usuario por usuario.
  const yaRegistrados = new Set(
    (
      await prisma.userSnapshot.findMany({
        where: { snapshotId, userId: { in: users.map((u) => u.id) } },
        select: { userId: true },
      })
    ).map((s) => s.userId),
  );

  const faltantes = users.filter((u) => !yaRegistrados.has(u.id));
  if (faltantes.length === 0) return;

  const workspaces = await prisma.userWorkspace.findMany({
    where: { userId: { in: faltantes.map((u) => u.id) } },
    select: { userId: true, snapshotsJson: true, selectedSnapshotId: true },
  });
  const porUsuario = new Map(workspaces.map((w) => [w.userId, w]));

  const aCrear: {
    userId: string;
    inflation: number;
    snapshotsJson: string;
    selectedSnapshotId: string;
    companyInfoJson: string;
  }[] = [];
  const aActualizar: { userId: string; snapshotsJson: string; selectedSnapshotId: string }[] = [];

  for (const user of faltantes) {
    const actual = porUsuario.get(user.id);
    const existentes = actual ? safeParseSnapshots(actual.snapshotsJson) : {};

    // Si el corte ya está en su workspace, lo único que falta es la fila de
    // UserSnapshot. Volver a armarlo duplicaría los cargos arrastrados.
    if (existentes[snapshot.id]) continue;

    const ultimo = Object.values(existentes).sort((a, b) => b.date.localeCompare(a.date))[0];
    const filasArrastradas = (ultimo?.rows ?? []).map((r) => ({ ...r, _carried: true as const }));
    const siguientes = { ...existentes, [snapshot.id]: { ...snapshot, rows: filasArrastradas } };
    const snapshotsJson = JSON.stringify(siguientes);

    if (actual) {
      aActualizar.push({
        userId: user.id,
        snapshotsJson,
        selectedSnapshotId: actual.selectedSnapshotId || snapshot.id,
      });
    } else {
      aCrear.push({
        userId: user.id,
        inflation: DEFAULT_WORKSPACE.inflation,
        snapshotsJson,
        selectedSnapshotId: snapshot.id,
        companyInfoJson: JSON.stringify(DEFAULT_WORKSPACE.companyInfo),
      });
    }
  }

  if (aCrear.length > 0) {
    await prisma.userWorkspace.createMany({ data: aCrear, skipDuplicates: true });
  }

  // En lotes: cada `snapshotsJson` pesa decenas de kilobytes y mandarlos todos
  // de golpe es una petición enorme contra el pooler.
  for (let i = 0; i < aActualizar.length; i += TAMANO_LOTE) {
    await prisma.$transaction(
      aActualizar.slice(i, i + TAMANO_LOTE).map((w) =>
        prisma.userWorkspace.update({
          where: { userId: w.userId },
          data: { snapshotsJson: w.snapshotsJson, selectedSnapshotId: w.selectedSnapshotId },
        }),
      ),
    );
  }

  // `skipDuplicates` se apoya en la unicidad (userId, snapshotId): si dos
  // guardados se pisan, el segundo no revienta.
  await prisma.userSnapshot.createMany({
    data: faltantes.map((u) => ({
      userId: u.id,
      companyId: u.companyId,
      snapshotId: snapshot.id,
      label: snapshotLabel,
      date: snapshotDate,
    })),
    skipDuplicates: true,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as {
    snapshotId?: string;
    companyIds?: string[];
  } | null;

  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const newCompanyIds = Array.isArray(body?.companyIds) ? body.companyIds.filter((id) => typeof id === "string" && id.trim()) : [];

  // Antes se leía la lista anterior para sacar la diferencia, pero desde que
  // se empuja siempre la lista completa el resultado no se usaba: era una
  // consulta de más en cada guardado (AC Consulting, 2026-11-17).
  await prisma.globalConfig.upsert({
    where: { key: companiesKey(snapshotId) },
    update: { value: JSON.stringify({ companyIds: newCompanyIds }) },
    create: { key: companiesKey(snapshotId), value: JSON.stringify({ companyIds: newCompanyIds }) },
  });

  // Ensure all selected companies have a UserSnapshot record.
  // Always push to the full list — pushSnapshotToNewCompanies skips companies that already have one.
  await pushSnapshotToNewCompanies(snapshotId, newCompanyIds);

  return Response.json({ snapshotId, companyIds: newCompanyIds });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { snapshotId?: string } | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  await prisma.globalConfig.deleteMany({ where: { key: companiesKey(snapshotId) } });

  // No restriction = all companies can access. Ensure every company has UserSnapshot records.
  const allCompanies = await prisma.company.findMany({ select: { id: true } });
  await pushSnapshotToNewCompanies(snapshotId, allCompanies.map((c) => c.id));

  return Response.json({ snapshotId, companyIds: null });
}
