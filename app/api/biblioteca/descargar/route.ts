/**
 * La descarga de un documento.
 *
 * Comprueba el permiso y recién entonces le pide a Supabase un enlace que
 * vence en un minuto, al que se redirige. El cliente nunca ve una URL fija:
 * si la viera, podría pasársela a alguien de otra empresa y el nivel asignado
 * dejaría de significar nada (AC Consulting, 2026-10-27).
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { firmarDescarga } from "@/lib/almacen";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ message: "Indica el documento." }, { status: 400 });

  const doc = await prisma.documentoBiblioteca.findUnique({ where: { id } });
  if (!doc || !doc.publicado) {
    return Response.json({ message: "No se encontró ese documento." }, { status: 404 });
  }

  const esAdmin = session.user.role === "ADMIN";
  const companyId = session.user.companyId ?? "";

  let permitido = doc.visibilidad === "publico" || esAdmin;
  if (!permitido && companyId) {
    try {
      const lista = JSON.parse(doc.empresasJson) as unknown;
      permitido = Array.isArray(lista) && lista.includes(companyId);
    } catch { permitido = false; }
  }

  // Mismo mensaje que si no existiera: a quien no tiene permiso no se le
  // confirma que el documento exista.
  if (!permitido) return Response.json({ message: "No se encontró ese documento." }, { status: 404 });

  const firma = await firmarDescarga(doc.ruta, doc.nombre);
  if ("error" in firma) return Response.json({ message: firma.error }, { status: 502 });

  return Response.redirect(firma.url, 302);
}
