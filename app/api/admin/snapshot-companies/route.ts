import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE, safeParseSnapshots, type Snapshot } from "@/lib/workspace";

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

async function pushSnapshotToNewCompanies(snapshotId: string, newCompanyIds: string[]) {
  if (newCompanyIds.length === 0) return;

  const snapshotRow = await prisma.userSnapshot.findFirst({
    where: { snapshotId },
    select: { label: true, date: true },
  });
  if (!snapshotRow) return;

  const snapshot: Snapshot = {
    id: snapshotId,
    label: snapshotRow.label,
    date: snapshotRow.date.toISOString().split("T")[0],
    rows: [],
  };

  const users = await prisma.user.findMany({
    where: { companyId: { in: newCompanyIds } },
    select: { id: true, companyId: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const user of users) {
      // Skip if user already has this snapshot
      const existing = await tx.userSnapshot.findFirst({
        where: { userId: user.id, snapshotId },
        select: { id: true },
      });
      if (existing) continue;

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
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const clonedRows = (latestSnapshot?.rows ?? []).map((r) => ({ ...r, _carried: true as const }));

      nextSnapshots[snapshot.id] = { ...snapshot, rows: clonedRows };

      await tx.userWorkspace.update({
        where: { userId: user.id },
        data: {
          snapshotsJson: JSON.stringify(nextSnapshots),
          selectedSnapshotId: workspace.selectedSnapshotId || snapshot.id,
        },
      });

      await tx.userSnapshot.create({
        data: {
          userId: user.id,
          companyId: user.companyId,
          snapshotId: snapshot.id,
          label: snapshot.label,
          date: snapshotRow.date,
        },
      });
    }
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

  // Read old list before updating so we can compute the diff
  const oldRecord = await prisma.globalConfig.findUnique({ where: { key: companiesKey(snapshotId) }, select: { value: true } });
  let oldCompanyIds: string[] | null = null;
  try {
    if (oldRecord?.value) oldCompanyIds = (JSON.parse(oldRecord.value) as { companyIds?: string[] }).companyIds ?? null;
  } catch {}

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

  return Response.json({ snapshotId, companyIds: null });
}
