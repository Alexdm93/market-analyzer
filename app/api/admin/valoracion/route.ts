import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KEY = "valoracion-list";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false as const, res: Response.json({ message: "No autorizado." }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { ok: false as const, res: Response.json({ message: "Acceso restringido a administradores." }, { status: 403 }) };
  return { ok: true as const };
}

export type ValoracionItem = {
  id: string;
  cargo: string;
  departamento: string;
  grade?: number;
  familia?: string;
  rol?: string;
  updatedAt?: string;
};

async function readList(): Promise<ValoracionItem[]> {
  const row = await prisma.globalConfig.findUnique({ where: { key: KEY } });
  try {
    if (row?.value) return JSON.parse(row.value) as ValoracionItem[];
  } catch { /* empty */ }
  return [];
}

async function writeList(items: ValoracionItem[]) {
  await prisma.globalConfig.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(items) },
    update: { value: JSON.stringify(items) },
  });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  return Response.json({ items: await readList() });
}

/** POST: add one cargo to the list */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as { cargo?: string; departamento?: string } | null;
  const cargo = body?.cargo?.trim();
  const departamento = body?.departamento?.trim() ?? "";
  if (!cargo) return Response.json({ message: "Indica el cargo." }, { status: 400 });

  const items = await readList();
  if (items.some((i) => i.cargo === cargo && i.departamento === departamento)) {
    return Response.json({ message: "El cargo ya está en la lista." }, { status: 409 });
  }

  const newItem: ValoracionItem = { id: crypto.randomUUID(), cargo, departamento };
  items.push(newItem);
  await writeList(items);
  return Response.json({ items });
}

/** PUT: save CAPRI classification for an existing item */
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    grade?: number;
    familia?: string;
    rol?: string;
  } | null;

  const { id, grade, familia, rol } = body ?? {};
  if (!id || typeof grade !== "number") return Response.json({ message: "Datos inválidos." }, { status: 400 });

  const items = await readList();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return Response.json({ message: "Cargo no encontrado." }, { status: 404 });

  items[idx] = { ...items[idx], grade, familia: familia ?? "", rol: rol ?? "", updatedAt: new Date().toISOString().split("T")[0] };
  await writeList(items);
  return Response.json({ items });
}

/** DELETE: remove a cargo from the list */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) return Response.json({ message: "Indica el id." }, { status: 400 });

  const items = (await readList()).filter((i) => i.id !== id);
  await writeList(items);
  return Response.json({ items });
}
