/**
 * El catálogo de informes de beneficios no salariales.
 *
 * Son PDF que AC Consulting arma por fuera: la plataforma solo los guarda y
 * los reparte. Puede haber varios a la vez —el del mercado general, el de un
 * sector— y a cada empresa se le autoriza uno desde `/api/admin/informe-general`.
 *
 * El archivo viaja y se guarda en base64, como la imagen de un anuncio.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { InformeBeneficiosFicha } from "@/app/api/admin/informe-general/route";

export const maxDuration = 60;

/**
 * Tope del PDF. Un informe de 38 páginas pesa kilo y medio; 12 MB deja aire de
 * sobra sin que un archivo suelto haga pesada la tabla.
 */
const MAX_BYTES = 12 * 1024 * 1024;

async function requerirAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });
  return null;
}

export async function GET() {
  const noAutorizado = await requerirAdmin();
  if (noAutorizado) return noAutorizado;

  const informes = await prisma.informeBeneficios.findMany({
    select: { id: true, titulo: true, nombreArchivo: true, bytes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    informes: informes.map((i): InformeBeneficiosFicha => ({
      id: i.id,
      titulo: i.titulo,
      nombreArchivo: i.nombreArchivo,
      bytes: i.bytes,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const noAutorizado = await requerirAdmin();
  if (noAutorizado) return noAutorizado;

  const body = (await request.json().catch(() => null)) as {
    titulo?: string;
    nombreArchivo?: string;
    /** El PDF en base64, con o sin el prefijo `data:application/pdf;base64,`. */
    archivo?: string;
  } | null;

  const titulo = body?.titulo?.trim() ?? "";
  if (!titulo) return Response.json({ message: "Ponle un título al informe." }, { status: 400 });

  const archivo = (body?.archivo ?? "").replace(/^data:[^;]*;base64,/, "").trim();
  if (!archivo) return Response.json({ message: "Falta el archivo." }, { status: 400 });

  // El tamaño real, no el del texto en base64, que es un tercio más grande.
  const bytes = Math.floor((archivo.length * 3) / 4);
  if (bytes > MAX_BYTES) {
    return Response.json(
      { message: `El PDF pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y el tope son ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 400 },
    );
  }

  const nombreArchivo = (body?.nombreArchivo?.trim() || `${titulo}.pdf`).replace(/[/\\]/g, "-");

  const creado = await prisma.informeBeneficios.create({
    data: { titulo, nombreArchivo, archivo, bytes },
    select: { id: true },
  });

  return Response.json({ ok: true, id: creado.id });
}

export async function PATCH(request: Request) {
  const noAutorizado = await requerirAdmin();
  if (noAutorizado) return noAutorizado;

  const body = (await request.json().catch(() => null)) as { id?: string; titulo?: string } | null;
  const titulo = body?.titulo?.trim() ?? "";
  if (!body?.id || !titulo) return Response.json({ message: "Formato inválido." }, { status: 400 });

  await prisma.informeBeneficios.update({ where: { id: body.id }, data: { titulo } });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const noAutorizado = await requerirAdmin();
  if (noAutorizado) return noAutorizado;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ message: "Indica el informe." }, { status: 400 });

  // Las empresas que lo tenían autorizado quedan sin informe de beneficios,
  // no sin empresa: la relación es onDelete: SetNull.
  await prisma.informeBeneficios.delete({ where: { id } });
  return Response.json({ ok: true });
}
