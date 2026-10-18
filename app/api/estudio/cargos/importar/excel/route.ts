/**
 * Alta masiva de ocupantes del Estudio de Competitividad.
 *
 * El archivo lo lee el navegador —ahí ya está la librería de Excel— y acá
 * llegan las filas ya interpretadas. El servidor vuelve a validarlas de todos
 * modos: lo que manda el navegador nunca es la última palabra.
 *
 * Importar desde un corte es la otra forma de llenar la lista y vive en
 * `../corte`, no acá.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { resolverAcceso, validarCargo, type EntradaCargo } from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

/** Tope por archivo. Más que esto no es una carga, es una migración. */
const MAX_FILAS = 1000;

type Cuerpo = {
  companyId?: string;
  filas?: EntradaCargo[];
  /** Cuando es true, la lista actual se borra antes de cargar la nueva. */
  reemplazar?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const acceso = resolverAcceso(await getServerSession(authOptions).catch(() => null), body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const entrada = Array.isArray(body?.filas) ? body.filas : [];
  if (entrada.length === 0) return Response.json({ message: "El archivo no trae ninguna fila." }, { status: 400 });
  if (entrada.length > MAX_FILAS) {
    return Response.json({ message: `El archivo trae ${entrada.length} filas y el tope son ${MAX_FILAS}.` }, { status: 400 });
  }

  const rechazadas: Array<{ fila: number; motivo: string }> = [];
  const aCrear: Array<{
    ocupanteId: string | null; departamento: string; tituloCargo: string; descripcion: string;
    reportaA: string; hayGrade: number | null; capriFamily: string | null; dataJson: string;
  }> = [];

  // Los identificadores ya usados: los del archivo y, si no se reemplaza, los
  // que la empresa ya tenía.
  const usados = new Set<string>();
  if (!body?.reemplazar) {
    const previos = await prisma.estudioCargo.findMany({
      where: { companyId: acceso.companyId, ocupanteId: { not: null } },
      select: { ocupanteId: true },
    });
    for (const p of previos) if (p.ocupanteId) usados.add(p.ocupanteId.toLowerCase());
  }

  entrada.forEach((cruda, i) => {
    const validacion = validarCargo(cruda);
    if (!validacion.ok) {
      rechazadas.push({ fila: i + 1, motivo: validacion.mensaje });
      return;
    }

    const { ocupanteId } = validacion.valor;
    if (ocupanteId) {
      if (usados.has(ocupanteId.toLowerCase())) {
        rechazadas.push({ fila: i + 1, motivo: `El identificador "${ocupanteId}" ya está en uso.` });
        return;
      }
      usados.add(ocupanteId.toLowerCase());
    }

    aCrear.push({
      ocupanteId: ocupanteId || null,
      departamento: validacion.valor.departamento,
      tituloCargo: validacion.valor.tituloCargo,
      descripcion: validacion.valor.descripcion,
      reportaA: validacion.valor.reportaA,
      hayGrade: validacion.valor.hayGrade,
      capriFamily: validacion.valor.capriFamily,
      dataJson: JSON.stringify(validacion.valor.data),
    });
  });

  if (aCrear.length === 0) {
    return Response.json(
      { message: "Ninguna fila del archivo se pudo cargar.", creados: 0, rechazadas },
      { status: 400 },
    );
  }

  // Reemplazar y cargar van juntos: si la carga falla a mitad de camino, la
  // empresa no puede quedarse sin su lista anterior.
  await prisma.$transaction(async (tx) => {
    if (body?.reemplazar) {
      await tx.estudioCargo.deleteMany({ where: { companyId: acceso.companyId } });
    }
    await tx.estudioCargo.createMany({
      data: aCrear.map((c) => ({ ...c, companyId: acceso.companyId, origen: "importado" })),
    });
  });

  return Response.json({
    creados: aCrear.length,
    rechazadas,
    message: `Se cargaron ${aCrear.length} ${aCrear.length === 1 ? "ocupante" : "ocupantes"}.`
      + (rechazadas.length > 0 ? ` ${rechazadas.length} ${rechazadas.length === 1 ? "fila quedó" : "filas quedaron"} fuera.` : ""),
  });
}
