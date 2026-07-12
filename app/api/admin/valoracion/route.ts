import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KEY = "capri-valoraciones";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false as const, res: Response.json({ message: "No autorizado." }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { ok: false as const, res: Response.json({ message: "Acceso restringido a administradores." }, { status: 403 }) };
  return { ok: true as const };
}

export type ValoracionEntry = {
  grade: number;
  familia: string;
  rol: string;
  updatedAt: string;
};

export type ValoracionMap = Record<string, ValoracionEntry>;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const row = await prisma.globalConfig.findUnique({ where: { key: KEY } });
  let valoraciones: ValoracionMap = {};
  try {
    if (row?.value) valoraciones = JSON.parse(row.value) as ValoracionMap;
  } catch { /* empty */ }

  return Response.json({ valoraciones });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as {
    cargoName?: string;
    entry?: ValoracionEntry;
  } | null;

  const cargoName = body?.cargoName?.trim();
  const entry = body?.entry;

  if (!cargoName || !entry || typeof entry.grade !== "number") {
    return Response.json({ message: "Datos inválidos." }, { status: 400 });
  }

  const row = await prisma.globalConfig.findUnique({ where: { key: KEY } });
  let valoraciones: ValoracionMap = {};
  try {
    if (row?.value) valoraciones = JSON.parse(row.value) as ValoracionMap;
  } catch { /* empty */ }

  valoraciones[cargoName] = entry;

  await prisma.globalConfig.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(valoraciones) },
    update: { value: JSON.stringify(valoraciones) },
  });

  return Response.json({ valoraciones });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as { cargoName?: string } | null;
  const cargoName = body?.cargoName?.trim();
  if (!cargoName) return Response.json({ message: "Indica el cargo." }, { status: 400 });

  const row = await prisma.globalConfig.findUnique({ where: { key: KEY } });
  let valoraciones: ValoracionMap = {};
  try {
    if (row?.value) valoraciones = JSON.parse(row.value) as ValoracionMap;
  } catch { /* empty */ }

  delete valoraciones[cargoName];

  await prisma.globalConfig.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(valoraciones) },
    update: { value: JSON.stringify(valoraciones) },
  });

  return Response.json({ valoraciones });
}
