import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type EstudioCompany = {
  id: string;
  name: string;
  economicSector: string;
  estudioEnabled: boolean;
  userCount: number;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      economicSector: true,
      estudioEnabled: true,
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });

  const result: EstudioCompany[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    economicSector: c.economicSector || "—",
    estudioEnabled: c.estudioEnabled,
    userCount: c._count.users,
  }));

  return Response.json({ companies: result });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { companyId?: string; enabled?: boolean } | null;
  if (!body?.companyId || typeof body.enabled !== "boolean") {
    return Response.json({ message: "Formato inválido." }, { status: 400 });
  }

  await prisma.company.update({
    where: { id: body.companyId },
    data: { estudioEnabled: body.enabled },
  });

  return Response.json({ ok: true });
}
