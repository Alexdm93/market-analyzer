import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ReferenceRanges = {
  nivelMin: Record<string, number>;
  nivelMax: Record<string, number>;
};

function rangesKey(snapshotId: string) {
  return `snapshot-ranges-${snapshotId}`;
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
  if (!snapshotId) {
    return Response.json({ nivelMin: {}, nivelMax: {} });
  }

  const record = await prisma.globalConfig.findUnique({ where: { key: rangesKey(snapshotId) } });
  if (!record) {
    return Response.json({ nivelMin: {}, nivelMax: {} });
  }

  try {
    const parsed = JSON.parse(record.value) as ReferenceRanges;
    return Response.json({ nivelMin: parsed.nivelMin ?? {}, nivelMax: parsed.nivelMax ?? {} });
  } catch {
    return Response.json({ nivelMin: {}, nivelMax: {} });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as {
    snapshotId?: string;
    nivelMin?: Record<string, number>;
    nivelMax?: Record<string, number>;
  } | null;

  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const ranges: ReferenceRanges = {
    nivelMin: body?.nivelMin ?? {},
    nivelMax: body?.nivelMax ?? {},
  };

  await prisma.globalConfig.upsert({
    where: { key: rangesKey(snapshotId) },
    update: { value: JSON.stringify(ranges) },
    create: { key: rangesKey(snapshotId), value: JSON.stringify(ranges) },
  });

  return Response.json({ ...ranges, snapshotId });
}
