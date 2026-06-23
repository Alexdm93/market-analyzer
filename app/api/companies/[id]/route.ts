import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    economicSector?: string;
    classification?: string;
    locality?: string;
    headcount?: string;
  } | null;

  if (!body) return Response.json({ message: "Formato inválido." }, { status: 400 });

  const name = body.name?.trim() ?? "";
  if (name.length < 2) return Response.json({ message: "El nombre debe tener al menos 2 caracteres." }, { status: 400 });

  const existing = await prisma.company.findFirst({ where: { name, NOT: { id } }, select: { id: true } });
  if (existing) return Response.json({ message: "Ya existe otra empresa con ese nombre." }, { status: 409 });

  const company = await prisma.company.update({
    where: { id },
    data: {
      name,
      economicSector: body.economicSector?.trim() ?? "",
      classification: body.classification?.trim() ?? "",
      locality: body.locality?.trim() ?? "",
      headcount: body.headcount?.trim() ?? "",
    },
    select: {
      id: true, name: true, description: true, economicSector: true,
      classification: true, headcount: true, revenueUSD: true,
      locality: true, hrName: true, hrEmail: true, createdAt: true,
    },
  });

  return Response.json({ company });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const { id } = await params;

  const userCount = await prisma.user.count({ where: { companyId: id } });
  if (userCount > 0) {
    return Response.json(
      { message: `Esta empresa tiene ${userCount} ${userCount === 1 ? "usuario activo" : "usuarios activos"}. Elimínalos primero.` },
      { status: 409 }
    );
  }

  await prisma.company.delete({ where: { id } });
  return Response.json({ ok: true });
}
