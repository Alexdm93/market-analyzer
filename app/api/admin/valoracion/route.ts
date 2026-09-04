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

class ValoracionApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readList(): Promise<ValoracionItem[]> {
  const row = await prisma.globalConfig.findUnique({ where: { key: KEY } });
  try {
    if (row?.value) return JSON.parse(row.value) as ValoracionItem[];
  } catch { /* empty */ }
  return [];
}

/**
 * Lee, modifica y escribe la lista dentro de una sola transacción, tomando un
 * advisory lock de Postgres sobre esta key para que dos admins editando al mismo
 * tiempo (o dos pestañas del mismo admin) no se pisen entre sí — sin esto, un
 * PUT/POST/DELETE concurrente podía leer una copia vieja y sobreescribir el cambio
 * del otro en silencio. `mutate` puede lanzar ValoracionApiError para abortar sin
 * escribir nada (p. ej. cargo duplicado, item no encontrado).
 */
async function updateListAtomically(
  mutate: (items: ValoracionItem[]) => ValoracionItem[]
): Promise<ValoracionItem[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${KEY}))`;

    const row = await tx.globalConfig.findUnique({ where: { key: KEY } });
    let items: ValoracionItem[] = [];
    try {
      if (row?.value) items = JSON.parse(row.value) as ValoracionItem[];
    } catch { /* empty */ }

    const nextItems = mutate(items);

    await tx.globalConfig.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(nextItems) },
      update: { value: JSON.stringify(nextItems) },
    });

    return nextItems;
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

  try {
    const items = await updateListAtomically((current) => {
      if (current.some((i) => i.cargo === cargo && i.departamento === departamento)) {
        throw new ValoracionApiError("El cargo ya está en la lista.", 409);
      }
      return [...current, { id: crypto.randomUUID(), cargo, departamento }];
    });
    return Response.json({ items });
  } catch (error) {
    if (error instanceof ValoracionApiError) return Response.json({ message: error.message }, { status: error.status });
    throw error;
  }
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

  try {
    const items = await updateListAtomically((current) => {
      const idx = current.findIndex((i) => i.id === id);
      if (idx === -1) throw new ValoracionApiError("Cargo no encontrado.", 404);
      const next = [...current];
      next[idx] = { ...next[idx], grade, familia: familia ?? "", rol: rol ?? "", updatedAt: new Date().toISOString().split("T")[0] };
      return next;
    });
    return Response.json({ items });
  } catch (error) {
    if (error instanceof ValoracionApiError) return Response.json({ message: error.message }, { status: error.status });
    throw error;
  }
}

/** DELETE: remove a cargo from the list */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) return Response.json({ message: "Indica el id." }, { status: 400 });

  const items = await updateListAtomically((current) => current.filter((i) => i.id !== id));
  return Response.json({ items });
}
