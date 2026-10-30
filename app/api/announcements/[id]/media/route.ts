import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * La imagen de un anuncio, servida aparte.
 *
 * Antes `mediaData` —la imagen entera en base64, hasta 2 MB de archivo que en
 * base64 son casi 3 MB de texto— viajaba dentro del JSON de `/api/announcements`,
 * y ese JSON se pide cada vez que alguien abre Inicio. Con varios anuncios con
 * foto eran varios megas por visita, por usuario: lento en el teléfono y una
 * mordida grande al egress de Supabase.
 *
 * Ahora la lista manda solo la dirección de esta ruta y el navegador se trae
 * cada imagen una sola vez. La respuesta es cacheable por un año porque la
 * dirección depende del id: si cambian la imagen de un anuncio hay que cambiar
 * el anuncio, y entonces cambia también lo que el navegador tenía guardado
 * solo si cambia el id — por eso el `ETag` con la fecha de modificación, que
 * es lo que invalida la copia vieja (AC Consulting, 2026-10-30).
 */
export async function GET(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const anuncio = await prisma.announcement.findFirst({
    where: { id, published: true },
    select: { mediaData: true, updatedAt: true },
  });

  if (!anuncio?.mediaData) {
    return new Response(null, { status: 404 });
  }

  // El navegador ya tiene esta versión: no hace falta mandarla de nuevo.
  const etag = `"${id}-${anuncio.updatedAt.getTime()}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  // Lo guardado es una URI de datos: `data:image/png;base64,AAAA...`
  const partes = /^data:([^;,]+);base64,([\s\S]*)$/.exec(anuncio.mediaData);
  if (!partes) {
    return new Response(null, { status: 404 });
  }

  const tipo = partes[1];
  const bytes = Buffer.from(partes[2], "base64");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": tipo,
      "Content-Length": String(bytes.byteLength),
      ETag: etag,
      // Privada: es contenido que solo ve quien tiene sesión.
      "Cache-Control": "private, max-age=86400, must-revalidate",
    },
  });
}
