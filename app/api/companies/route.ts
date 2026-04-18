import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const userCount = await prisma.user.count();
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      economicSector: true,
      classification: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return Response.json({
    companies,
    userCount,
    bootstrapRequired: userCount === 0,
  });
}

type CreateCompanyBody = {
  name?: string;
  description?: string;
  economicSector?: string;
  classification?: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json()) as CreateCompanyBody;
  const name = body.name?.trim() ?? "";
  const description = body.description?.trim() ?? "";
  const economicSector = body.economicSector?.trim() ?? "";
  const classification = body.classification?.trim() ?? "";

  if (name.length < 2) {
    return Response.json({ message: "La empresa debe tener al menos 2 caracteres." }, { status: 400 });
  }

  const existingCompany = await prisma.company.findUnique({
    where: { name },
    select: { id: true },
  });

  if (existingCompany) {
    return Response.json({ message: "Esa empresa ya existe." }, { status: 409 });
  }

  const company = await prisma.company.create({
    data: {
      name,
      description,
      economicSector,
      classification,
    },
    select: {
      id: true,
      name: true,
      description: true,
      economicSector: true,
      classification: true,
      createdAt: true,
    },
  });

  return Response.json({ company }, { status: 201 });
}