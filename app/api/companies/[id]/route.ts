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
    description?: string;
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

  /**
   * Solo se toca lo que vino en el cuerpo.
   *
   * Antes cada campo caía a `?? ""`, así que una pantalla que mandara tres
   * campos le borraba los demás sin decir nada: la de Empresas manda nombre,
   * sector y clasificación, y con cada edición se llevaba por delante la
   * localidad y el headcount de la empresa (AC Consulting, 2026-10-26).
   */
  const data: Record<string, string> = { name };
  for (const campo of ["description", "economicSector", "classification", "locality", "headcount"] as const) {
    const valor = body[campo];
    if (typeof valor === "string") data[campo] = valor.trim();
  }

  const company = await prisma.company.update({
    where: { id },
    data,
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
