import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * La lista de anuncios para Inicio.
 *
 * Son dos consultas en vez de una a propósito: hace falta saber cuáles tienen
 * imagen sin traérselas. Antes se seleccionaba `mediaData` entero —la imagen
 * en base64, hasta casi 3 MB de texto por anuncio— y eso viajaba de Supabase a
 * Vercel y de Vercel al navegador en cada visita a Inicio, de cada usuario.
 * Ahora solo viaja la dirección de /api/announcements/<id>/media, que el
 * navegador se trae una vez y guarda. La segunda consulta devuelve ids y nada
 * más, así que cuesta nada (AC Consulting, 2026-10-30).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const [filas, conImagen] = await Promise.all([
    prisma.announcement.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, content: true, type: true, publishedAt: true, mediaUrl: true },
    }),
    prisma.announcement.findMany({
      where: { published: true, mediaData: { not: null } },
      select: { id: true },
    }),
  ]);

  const tienenImagen = new Set(conImagen.map((a) => a.id));

  const announcements = filas.map((a) => ({
    ...a,
    mediaSrc: tienenImagen.has(a.id) ? `/api/announcements/${a.id}/media` : null,
  }));

  return Response.json(
    { announcements },
    { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" } },
  );
}
