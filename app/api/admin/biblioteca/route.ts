/**
 * La Biblioteca de Descargas, del lado del administrador.
 *
 * Subir es en dos pasos: primero se pide un permiso de subida firmado (POST
 * con `?firmar=1`), el navegador le manda el archivo directo a Supabase, y
 * recién entonces se registra la ficha. El archivo no pasa por acá porque en
 * Vercel el cuerpo de una petición no puede con un PDF grande.
 *
 * La visibilidad es obligatoria al registrar: o el documento es para todas las
 * empresas, o lleva la lista de las que pueden verlo. No hay término medio.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { almacenListo, borrarArchivo, firmarSubida, rutaNueva } from "@/lib/almacen";

async function soloAdmin() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { ok: false as const, response: Response.json({ message: "Acceso restringido a administradores." }, { status: 403 }) };
  }
  return { ok: true as const, session };
}

export type DocumentoFila = {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  tamano: number;
  visibilidad: string;
  empresas: string[];
  publicado: boolean;
  subidoPor: string;
  createdAt: string;
};

function aFila(d: {
  id: string; nombre: string; descripcion: string; tipo: string; tamano: number;
  visibilidad: string; empresasJson: string; publicado: boolean; subidoPor: string; createdAt: Date;
}): DocumentoFila {
  let empresas: string[] = [];
  try {
    const p = JSON.parse(d.empresasJson) as unknown;
    if (Array.isArray(p)) empresas = p.filter((x): x is string => typeof x === "string");
  } catch { /* ficha vieja o rota: sin empresas asignadas */ }
  return {
    id: d.id, nombre: d.nombre, descripcion: d.descripcion, tipo: d.tipo, tamano: d.tamano,
    visibilidad: d.visibilidad, empresas, publicado: d.publicado, subidoPor: d.subidoPor,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function GET() {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const documentos = await prisma.documentoBiblioteca.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json({ documentos: documentos.map(aFila), almacenListo: almacenListo() });
}

type Cuerpo = {
  /** Paso 1: solo el nombre del archivo, para firmar la subida. */
  nombreArchivo?: string;
  /** Paso 2: la ficha. */
  ruta?: string;
  nombre?: string;
  descripcion?: string;
  tipo?: string;
  tamano?: number;
  visibilidad?: string;
  empresas?: string[];
};

export async function POST(request: Request) {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const firmar = new URL(request.url).searchParams.get("firmar") === "1";

  if (firmar) {
    const nombreArchivo = (body?.nombreArchivo ?? "").trim();
    if (!nombreArchivo) return Response.json({ message: "Indica el archivo." }, { status: 400 });
    const ruta = rutaNueva(nombreArchivo);
    const firma = await firmarSubida(ruta);
    if ("error" in firma) return Response.json({ message: firma.error }, { status: 502 });
    return Response.json({ ruta, url: firma.url });
  }

  const ruta = (body?.ruta ?? "").trim();
  const nombre = (body?.nombre ?? "").trim();
  const visibilidad = body?.visibilidad === "publico" ? "publico" : "asignado";
  const empresas = Array.isArray(body?.empresas)
    ? body.empresas.filter((e): e is string => typeof e === "string" && e.trim() !== "")
    : [];

  if (!ruta) return Response.json({ message: "Falta el archivo subido." }, { status: 400 });
  if (nombre.length < 2) return Response.json({ message: "Ponle un nombre al documento." }, { status: 400 });
  // Un documento asignado sin empresas no lo vería nadie: es un error, no un
  // caso válido.
  if (visibilidad === "asignado" && empresas.length === 0) {
    return Response.json(
      { message: "Elige al menos una empresa, o márcalo como público." },
      { status: 400 },
    );
  }

  const documento = await prisma.documentoBiblioteca.create({
    data: {
      ruta, nombre, visibilidad,
      descripcion: (body?.descripcion ?? "").trim(),
      tipo: (body?.tipo ?? "").trim().slice(0, 120),
      tamano: Number.isFinite(body?.tamano) ? Math.max(0, Math.round(body!.tamano!)) : 0,
      empresasJson: JSON.stringify(visibilidad === "publico" ? [] : empresas),
      subidoPor: acceso.session.user.name ?? acceso.session.user.email ?? "Administrador",
    },
  });

  return Response.json({ documento: aFila(documento) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const body = (await request.json().catch(() => null)) as (Cuerpo & { id?: string; publicado?: boolean }) | null;
  const id = (body?.id ?? "").trim();
  if (!id) return Response.json({ message: "Indica el documento." }, { status: 400 });

  const datos: Record<string, unknown> = {};
  if (typeof body?.nombre === "string") {
    const n = body.nombre.trim();
    if (n.length < 2) return Response.json({ message: "Ponle un nombre al documento." }, { status: 400 });
    datos.nombre = n;
  }
  if (typeof body?.descripcion === "string") datos.descripcion = body.descripcion.trim();
  if (typeof body?.publicado === "boolean") datos.publicado = body.publicado;

  if (typeof body?.visibilidad === "string") {
    const v = body.visibilidad === "publico" ? "publico" : "asignado";
    const empresas = Array.isArray(body.empresas)
      ? body.empresas.filter((e): e is string => typeof e === "string" && e.trim() !== "")
      : [];
    if (v === "asignado" && empresas.length === 0) {
      return Response.json({ message: "Elige al menos una empresa, o márcalo como público." }, { status: 400 });
    }
    datos.visibilidad = v;
    datos.empresasJson = JSON.stringify(v === "publico" ? [] : empresas);
  }

  const documento = await prisma.documentoBiblioteca.update({ where: { id }, data: datos });
  return Response.json({ documento: aFila(documento) });
}

export async function DELETE(request: Request) {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ message: "Indica el documento." }, { status: 400 });

  const doc = await prisma.documentoBiblioteca.findUnique({ where: { id }, select: { ruta: true } });
  if (!doc) return Response.json({ message: "No se encontró ese documento." }, { status: 404 });

  // Primero la ficha: si el borrado del objeto falla, queda un huérfano en el
  // bucket —invisible y sin ficha— y eso es preferible a una ficha que apunta
  // a un archivo que ya no está.
  await prisma.documentoBiblioteca.delete({ where: { id } });
  const limpio = await borrarArchivo(doc.ruta);

  return Response.json({
    message: limpio
      ? "Documento eliminado."
      : "Ficha eliminada, pero el archivo sigue en el almacén. Bórralo a mano desde Supabase.",
  });
}
