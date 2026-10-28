/**
 * Los videos publicados de una sección, para quien tenga sesión.
 *
 * No distingue por empresa ni por rol: un tutorial de la plataforma y una
 * cápsula de formación son lo mismo para todos los clientes. Lo único que se
 * filtra es que esté publicado, para que el admin pueda dejar borradores.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esCategoriaRecurso, type RecursoFila } from "@/lib/recursos-formacion";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const categoria = new URL(request.url).searchParams.get("categoria")?.trim() ?? "";
  if (!esCategoriaRecurso(categoria)) {
    return Response.json({ message: "Esa sección no existe." }, { status: 400 });
  }

  const recursos = await prisma.recursoFormacion.findMany({
    where: { categoria, publicado: true },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
  });

  return Response.json({ recursos: recursos as RecursoFila[] });
}
