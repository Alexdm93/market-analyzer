/**
 * El ABM de los videos del Centro de Ayuda y la Academia C&B.
 *
 * Una sola ruta para las dos secciones: lo que cambia es la categoría. El
 * orden se asigna solo al crear —al final de su sección— y después se mueve
 * con PATCH, que es más simple que pedirle un número al admin.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esCategoriaRecurso, idDeYouTube } from "@/lib/recursos-formacion";

async function soloAdmin() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { ok: false as const, response: Response.json({ message: "Acceso restringido a administradores." }, { status: 403 }) };
  }
  return { ok: true as const };
}

type Cuerpo = {
  id?: string;
  categoria?: string;
  titulo?: string;
  descripcion?: string;
  videoUrl?: string;
  publicado?: boolean;
  /** Para PATCH: mover una posición arriba o abajo dentro de su sección. */
  mover?: "arriba" | "abajo";
};

export async function GET() {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const recursos = await prisma.recursoFormacion.findMany({
    orderBy: [{ categoria: "asc" }, { orden: "asc" }, { createdAt: "asc" }],
  });
  return Response.json({ recursos });
}

export async function POST(request: Request) {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const categoria = (body?.categoria ?? "").trim();
  const titulo = (body?.titulo ?? "").trim();
  const videoUrl = (body?.videoUrl ?? "").trim();

  if (!esCategoriaRecurso(categoria)) {
    return Response.json({ message: "Esa sección no existe." }, { status: 400 });
  }
  if (titulo.length < 3) {
    return Response.json({ message: "Ponle un título al tutorial." }, { status: 400 });
  }
  // Se valida acá y no solo en la pantalla: una URL que no sea de YouTube deja
  // la tarjeta sin reproductor y nadie se entera hasta que un cliente la abre.
  if (!idDeYouTube(videoUrl)) {
    return Response.json(
      { message: "El enlace tiene que ser de YouTube (youtube.com/watch?v=… o youtu.be/…)." },
      { status: 400 },
    );
  }

  const ultimo = await prisma.recursoFormacion.findFirst({
    where: { categoria }, orderBy: { orden: "desc" }, select: { orden: true },
  });

  const recurso = await prisma.recursoFormacion.create({
    data: {
      categoria, titulo, videoUrl,
      descripcion: (body?.descripcion ?? "").trim(),
      publicado: body?.publicado ?? false,
      orden: (ultimo?.orden ?? -1) + 1,
    },
  });

  return Response.json({ recurso }, { status: 201 });
}

export async function PATCH(request: Request) {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const id = (body?.id ?? "").trim();
  if (!id) return Response.json({ message: "Indica el tutorial." }, { status: 400 });

  const actual = await prisma.recursoFormacion.findUnique({ where: { id } });
  if (!actual) return Response.json({ message: "No se encontró ese tutorial." }, { status: 404 });

  // Mover es intercambiar el orden con el vecino: así no hay que renumerar la
  // sección entera ni quedan huecos.
  if (body?.mover) {
    const vecino = await prisma.recursoFormacion.findFirst({
      where: {
        categoria: actual.categoria,
        orden: body.mover === "arriba" ? { lt: actual.orden } : { gt: actual.orden },
      },
      orderBy: { orden: body.mover === "arriba" ? "desc" : "asc" },
    });
    if (!vecino) return Response.json({ message: "Ya está en el extremo." });
    await prisma.$transaction([
      prisma.recursoFormacion.update({ where: { id: actual.id }, data: { orden: vecino.orden } }),
      prisma.recursoFormacion.update({ where: { id: vecino.id }, data: { orden: actual.orden } }),
    ]);
    return Response.json({ message: "Orden actualizado." });
  }

  const datos: { titulo?: string; descripcion?: string; videoUrl?: string; publicado?: boolean } = {};
  if (typeof body?.titulo === "string") {
    const t = body.titulo.trim();
    if (t.length < 3) return Response.json({ message: "Ponle un título al tutorial." }, { status: 400 });
    datos.titulo = t;
  }
  if (typeof body?.descripcion === "string") datos.descripcion = body.descripcion.trim();
  if (typeof body?.videoUrl === "string") {
    const u = body.videoUrl.trim();
    if (!idDeYouTube(u)) {
      return Response.json({ message: "El enlace tiene que ser de YouTube." }, { status: 400 });
    }
    datos.videoUrl = u;
  }
  if (typeof body?.publicado === "boolean") datos.publicado = body.publicado;

  const recurso = await prisma.recursoFormacion.update({ where: { id }, data: datos });
  return Response.json({ recurso });
}

export async function DELETE(request: Request) {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ message: "Indica el tutorial." }, { status: 400 });

  await prisma.recursoFormacion.delete({ where: { id } }).catch(() => null);
  return Response.json({ message: "Tutorial eliminado." });
}
