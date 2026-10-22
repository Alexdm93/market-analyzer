/**
 * La bandeja de solicitudes de acceso, del lado del administrador.
 *
 * Aceptar y crear el usuario son dos pasos separados: el admin puede aceptar
 * hoy y crear la cuenta cuando tenga la empresa dada de alta. Mientras tanto
 * la solicitud queda aprobada y sin usuario, que es como la bandeja marca lo
 * que todavía falta (AC Consulting, 2026-10-21).
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SolicitudAccesoFila = {
  id: string;
  nombre: string;
  correo: string;
  cargo: string;
  telefono: string;
  empresa: string;
  sector: string;
  clasificacion: string;
  headcount: string;
  localidad: string;
  actividad: string;
  comoSeEntero: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  motivoRechazo: string;
  resueltoPor: string;
  resueltoEn: string | null;
  usuarioCreadoId: string | null;
  createdAt: string;
  /** Si ese correo ya tiene cuenta en alguna empresa, cuáles. */
  yaTieneCuentaEn: string[];
  /** La empresa del catálogo que calza por nombre, si existe. */
  empresaDelCatalogo: { id: string; name: string } | null;
};

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

/** Para calzar "Industrias ACME, C.A." con "industrias acme c a". */
function normalizar(nombre: string): string {
  return nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export async function GET() {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const solicitudes = await prisma.solicitudAcceso.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });

  // Dos cruces que el admin necesita para decidir sin salir de la pantalla:
  // si esa persona ya tiene cuenta, y si su empresa ya está en el catálogo.
  const correos = [...new Set(solicitudes.map((s) => s.correo))];
  const [cuentas, empresas] = await Promise.all([
    correos.length === 0 ? Promise.resolve([]) : prisma.user.findMany({
      where: { email: { in: correos, mode: "insensitive" } },
      select: { email: true, company: { select: { name: true } } },
    }),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);

  const porCorreo = new Map<string, string[]>();
  for (const c of cuentas) {
    const clave = c.email.toLowerCase();
    porCorreo.set(clave, [...(porCorreo.get(clave) ?? []), c.company?.name ?? ""]);
  }
  const porNombre = new Map(empresas.map((e) => [normalizar(e.name), e]));

  return Response.json({
    solicitudes: solicitudes.map((s): SolicitudAccesoFila => ({
      id: s.id,
      nombre: s.nombre, correo: s.correo, cargo: s.cargo, telefono: s.telefono,
      empresa: s.empresa, sector: s.sector, clasificacion: s.clasificacion,
      headcount: s.headcount, localidad: s.localidad,
      actividad: s.actividad, comoSeEntero: s.comoSeEntero,
      status: s.status,
      motivoRechazo: s.motivoRechazo,
      resueltoPor: s.resueltoPor,
      resueltoEn: s.resueltoEn ? s.resueltoEn.toISOString() : null,
      usuarioCreadoId: s.usuarioCreadoId,
      createdAt: s.createdAt.toISOString(),
      yaTieneCuentaEn: porCorreo.get(s.correo.toLowerCase()) ?? [],
      empresaDelCatalogo: porNombre.get(normalizar(s.empresa)) ?? null,
    })),
  });
}

type Cuerpo = {
  id?: string;
  /** "aceptar", "denegar", "reabrir" o "usuario-creado". */
  accion?: string;
  motivo?: string;
  usuarioId?: string;
};

export async function PATCH(request: Request) {
  const acceso = await soloAdmin();
  if (!acceso.ok) return acceso.response;

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const id = body?.id?.trim() ?? "";
  if (!id) return Response.json({ message: "Indica la solicitud." }, { status: 400 });

  const solicitud = await prisma.solicitudAcceso.findUnique({ where: { id }, select: { id: true } });
  if (!solicitud) return Response.json({ message: "No se encontró esa solicitud." }, { status: 404 });

  const quien = acceso.session.user.name ?? acceso.session.user.email ?? "Administrador";
  const ahora = new Date();

  switch (body?.accion) {
    case "aceptar":
      await prisma.solicitudAcceso.update({
        where: { id },
        data: { status: "APPROVED", resueltoPor: quien, resueltoEn: ahora, motivoRechazo: "" },
      });
      break;

    case "denegar":
      await prisma.solicitudAcceso.update({
        where: { id },
        data: {
          status: "REJECTED", resueltoPor: quien, resueltoEn: ahora,
          motivoRechazo: (body.motivo ?? "").trim().slice(0, 500),
        },
      });
      break;

    // Vuelve a pendiente: para deshacer un clic equivocado. No borra el
    // usuario si ya se creó, solo suelta la solicitud.
    case "reabrir":
      await prisma.solicitudAcceso.update({
        where: { id },
        data: { status: "PENDING", resueltoPor: "", resueltoEn: null, motivoRechazo: "" },
      });
      break;

    // La manda la pantalla después de crear la cuenta, para que la solicitud
    // deje de aparecer como "falta crear el usuario".
    case "usuario-creado": {
      const usuarioId = (body.usuarioId ?? "").trim();
      if (!usuarioId) return Response.json({ message: "Indica el usuario creado." }, { status: 400 });
      await prisma.solicitudAcceso.update({
        where: { id },
        data: { status: "APPROVED", usuarioCreadoId: usuarioId, resueltoPor: quien, resueltoEn: ahora },
      });
      break;
    }

    default:
      return Response.json({ message: "Esa acción no existe." }, { status: 400 });
  }

  return Response.json({ message: "Solicitud actualizada." });
}
