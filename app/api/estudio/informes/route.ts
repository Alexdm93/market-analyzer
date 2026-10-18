/**
 * Informes guardados del Estudio de Competitividad.
 *
 * El cliente genera los que quiera, eligiendo qué cargos entran, y los va
 * guardando y borrando: es self-service. Cada informe queda congelado.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { cupoAgotado, huellaDelCorte, type ConfiguracionDelCorte } from "@/lib/cupo-informes";
import { asegurarCorte, resolverAcceso } from "@/lib/estudio-cargos";
import { parseDatosInforme, validarDatosInforme } from "@/lib/estudio-informes";
import { prisma } from "@/lib/prisma";

async function sesion() {
  return getServerSession(authOptions).catch(() => null);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const acceso = resolverAcceso(await sesion(), searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const id = searchParams.get("id")?.trim() ?? "";

  if (id) {
    const informe = await prisma.estudioInforme.findUnique({ where: { id } });
    if (!informe || informe.companyId !== acceso.companyId) {
      return Response.json({ message: "Ese informe no existe en esta empresa." }, { status: 404 });
    }
    return Response.json({
      informe: {
        id: informe.id,
        nombre: informe.nombre,
        snapshotId: informe.snapshotId,
        snapshotLabel: informe.snapshotLabel,
        generadoPor: informe.generadoPor,
        createdAt: informe.createdAt.toISOString(),
        datos: parseDatosInforme(informe.datosJson),
      },
    });
  }

  const informes = await prisma.estudioInforme.findMany({
    where: { companyId: acceso.companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, nombre: true, snapshotId: true, snapshotLabel: true,
      generadoPor: true, createdAt: true, datosJson: true,
    },
  });

  return Response.json({
    informes: informes.map((i) => {
      const datos = parseDatosInforme(i.datosJson);
      return {
        id: i.id,
        nombre: i.nombre,
        snapshotId: i.snapshotId,
        snapshotLabel: i.snapshotLabel,
        generadoPor: i.generadoPor,
        createdAt: i.createdAt.toISOString(),
        cargos: datos?.filas.length ?? 0,
        modo: datos?.modo ?? "cargo",
        metrica: datos?.metrica ?? "sinPasivosMensual",
      };
    }),
  });
}

type CuerpoCrear = {
  companyId?: string;
  nombre?: string;
  snapshotId?: string;
  snapshotLabel?: string;
  modo?: string;
  metrica?: string;
  filas?: unknown[];
  /** Con qué criterios se armó, para poder volver a emitirlo. */
  criterios?: unknown;
  /** Lo que define el corte de data, para saber si consume cupo. */
  tcr?: string | null;
  comisiones?: boolean;
  filtrosGrupo?: string;
  grados?: number[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CuerpoCrear | null;
  const session = await sesion();
  const acceso = resolverAcceso(session, body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const nombre = (body?.nombre ?? "").replace(/\s+/g, " ").trim();
  if (!nombre) return Response.json({ message: "El informe necesita un nombre." }, { status: 400 });
  if (nombre.length > 150) return Response.json({ message: "El nombre del informe es demasiado largo." }, { status: 400 });

  const snapshotId = (body?.snapshotId ?? "").trim();
  if (!snapshotId) return Response.json({ message: "Indica el estudio del informe." }, { status: 400 });

  const vetado = await asegurarCorte(acceso, snapshotId);
  if (vetado) return vetado;

  const validacion = validarDatosInforme({
    modo: body?.modo,
    metrica: body?.metrica,
    filas: body?.filas,
    // Sin esto el informe queda sin criterios y después no se puede volver a
    // emitir: el cuerpo los traía y se perdían acá.
    criterios: body?.criterios,
  });
  if (!validacion.ok) return Response.json({ message: validacion.mensaje }, { status: 400 });

  const configuracion: ConfiguracionDelCorte = {
    snapshotId,
    modo: body?.modo ?? "",
    metrica: body?.metrica ?? "",
    tcr: body?.tcr ?? null,
    comisiones: Boolean(body?.comisiones),
    filtros: body?.filtrosGrupo ?? "",
    grados: Array.isArray(body?.grados) ? body.grados : [],
  };

  // El cupo limita cuántos cortes de data distintos configura la empresa, no
  // cuántas veces baja los que ya tiene. El admin no tiene tope.
  if (!acceso.esAdmin) {
    const agotado = await cupoAgotado(acceso.companyId, configuracion);
    if (agotado) {
      return Response.json(
        {
          message: `Ya configuraste los ${agotado.estado.cupo} cortes de data de este estudio. `
            + "Los que guardaste los puedes volver a descargar cuando quieras; para armar uno nuevo "
            + "necesitas que el administrador te autorice.",
          cupo: agotado.estado,
        },
        { status: 409 },
      );
    }
  }

  const creado = await prisma.estudioInforme.create({
    data: {
      companyId: acceso.companyId,
      nombre,
      snapshotId,
      snapshotLabel: (body?.snapshotLabel ?? "").trim(),
      datosJson: JSON.stringify(validacion.datos),
      configHash: huellaDelCorte(configuracion),
      generadoPor: session?.user?.name ?? session?.user?.email ?? "",
    },
    select: { id: true },
  });

  return Response.json({ id: creado.id, message: `Informe "${nombre}" guardado.` });
}

/**
 * Borrar un informe quedó solo para el admin.
 *
 * El cupo se cuenta por informes generados, así que si el cliente pudiera
 * borrarlos se regalaría descargas (AC Consulting, 2026-10-14).
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const acceso = resolverAcceso(await sesion(), searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  if (!acceso.esAdmin) {
    return Response.json(
      { message: "Los informes generados no se borran: el cupo se cuenta sobre ellos." },
      { status: 403 },
    );
  }

  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ message: "Indica el informe a borrar." }, { status: 400 });

  const informe = await prisma.estudioInforme.findUnique({ where: { id }, select: { companyId: true, nombre: true } });
  if (!informe || informe.companyId !== acceso.companyId) {
    return Response.json({ message: "Ese informe no existe en esta empresa." }, { status: 404 });
  }

  await prisma.estudioInforme.delete({ where: { id } });
  return Response.json({ message: `Informe "${informe.nombre}" eliminado.` });
}
