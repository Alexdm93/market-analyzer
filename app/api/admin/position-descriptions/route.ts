import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CONFIG_KEY = "position-descriptions";

function requireAdmin() {
  return getServerSession(authOptions).then((session) => {
    if (!session?.user?.id) return { ok: false as const, status: 401, message: "No autorizado." };
    if (session.user.role !== "ADMIN") return { ok: false as const, status: 403, message: "Acceso restringido." };
    return { ok: true as const };
  });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

  const [titlesRaw, configRecord] = await Promise.all([
    prisma.userPosition.findMany({
      select: { title: true },
      distinct: ["title"],
      orderBy: { title: "asc" },
    }),
    prisma.globalConfig.findUnique({ where: { key: CONFIG_KEY }, select: { value: true } }),
  ]);

  const titles = titlesRaw.map((r) => r.title).filter((t): t is string => Boolean(t));

  let descriptions: Record<string, string> = {};
  try {
    if (configRecord?.value) descriptions = JSON.parse(configRecord.value) as Record<string, string>;
  } catch {}

  return Response.json({ titles, descriptions });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

  const body = (await request.json()) as { descriptions?: Record<string, string> };
  const descriptions = body.descriptions ?? {};

  await prisma.globalConfig.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(descriptions) },
    create: { key: CONFIG_KEY, value: JSON.stringify(descriptions) },
  });

  return Response.json({ ok: true });
}
