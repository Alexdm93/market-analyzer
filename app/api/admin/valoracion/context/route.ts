import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KEY = "valoracion-context";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false as const, res: Response.json({ message: "No autorizado." }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { ok: false as const, res: Response.json({ message: "Acceso restringido a administradores." }, { status: 403 }) };
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const row = await prisma.globalConfig.findUnique({ where: { key: KEY } });
  try {
    if (row?.value) return Response.json(JSON.parse(row.value));
  } catch { /* empty */ }
  return Response.json({ revenueUSD: "", headcount: "" });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as { revenueUSD?: string; headcount?: string } | null;
  const value = JSON.stringify({ revenueUSD: body?.revenueUSD ?? "", headcount: body?.headcount ?? "" });

  await prisma.globalConfig.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });

  return Response.json({ revenueUSD: body?.revenueUSD ?? "", headcount: body?.headcount ?? "" });
}
