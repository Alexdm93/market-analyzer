/**
 * Los documentos que puede ver quien pregunta.
 *
 * Un documento público lo ve cualquier empresa registrada; uno asignado, solo
 * las empresas de su lista. El filtro se hace acá y no en la pantalla: lo que
 * no se devuelve no existe para el cliente.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type DocumentoVisible = {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  tamano: number;
  createdAt: string;
};

export async function GET() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const companyId = session.user.companyId ?? "";
  const esAdmin = session.user.role === "ADMIN";

  const documentos = await prisma.documentoBiblioteca.findMany({
    where: { publicado: true },
    orderBy: { createdAt: "desc" },
  });

  const visibles = documentos.filter((d) => {
    if (d.visibilidad === "publico") return true;
    // El admin ve todo: es quien los reparte y tiene que poder comprobarlos.
    if (esAdmin) return true;
    if (!companyId) return false;
    try {
      const lista = JSON.parse(d.empresasJson) as unknown;
      return Array.isArray(lista) && lista.includes(companyId);
    } catch {
      return false;
    }
  });

  return Response.json({
    documentos: visibles.map((d): DocumentoVisible => ({
      id: d.id, nombre: d.nombre, descripcion: d.descripcion,
      tipo: d.tipo, tamano: d.tamano, createdAt: d.createdAt.toISOString(),
    })),
  });
}
