import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  if (!record) return Response.json({ companyIds: [] });

  try {
    const parsed = JSON.parse(record.value) as { companyIds?: string[] };
    return Response.json({ companyIds: Array.isArray(parsed.companyIds) ? parsed.companyIds : [] });
  } catch {
    return Response.json({ companyIds: [] });
  }
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

  const companyIds = Array.isArray(body?.companyIds) ? body.companyIds.filter((id) => typeof id === "string" && id.trim()) : [];

  await prisma.globalConfig.upsert({
    where: { key: companiesKey(snapshotId) },
    update: { value: JSON.stringify({ companyIds }) },
    create: { key: companiesKey(snapshotId), value: JSON.stringify({ companyIds }) },
  });

  return Response.json({ snapshotId, companyIds });
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
