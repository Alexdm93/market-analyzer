/**
 * El Radar Salarial: reglas de acceso, cupo y corte vigente.
 *
 * Es el reporte suelto de UN cargo o UN grado, aparte del Estudio de
 * Competitividad. Tres cosas lo gobiernan y las tres las decide el admin
 * (AC Consulting, 2026-10-20):
 *
 *  - a qué empresas se les habilita;
 *  - cuántos informes puede bajar cada una por TRIMESTRE;
 *  - de qué corte salen las cifras, que es uno solo para toda la plataforma y
 *    que el admin va cambiando cada tanto.
 *
 * El cupo se cuenta por trimestre de calendario, no por ventana móvil: es lo
 * que el cliente entiende por "trimestral" y lo que permite decirle cuándo se
 * le repone sin que tenga que recordar en qué día bajó el primero.
 */
import { getBcvRate } from "@/lib/bcv";
import { PERCENTILE_MIN_N } from "@/lib/compensation";
import { calcularPercentilesMercado, workspacesDelCorte } from "@/lib/percentiles-mercado";
import { prisma } from "@/lib/prisma";

/** Lo que puede bajar una empresa por trimestre si el admin no dijo otra cosa. */
export const CUPO_RADAR_POR_DEFECTO = 2;

const CLAVE_CORTE = "radar-snapshot";
const CLAVE_CUPO = "radar-cupo";

/** El trimestre de una fecha, escrito "2026-T4". */
export function trimestreDe(fecha: Date): string {
  return `${fecha.getFullYear()}-T${Math.floor(fecha.getMonth() / 3) + 1}`;
}

/** Cuándo empieza el trimestre siguiente, para avisar cuándo se repone. */
export function inicioDelProximoTrimestre(fecha: Date): Date {
  const trimestre = Math.floor(fecha.getMonth() / 3);
  return new Date(fecha.getFullYear(), (trimestre + 1) * 3, 1);
}

export type EstadoCupoRadar = {
  trimestre: string;
  cupo: number;
  usados: number;
  restantes: number;
  /** Cuándo vuelve a cero. */
  seRepone: string;
};

/** El corte del que se sacan los Radar. Vacío significa que el admin no lo eligió. */
export async function corteDelRadar(): Promise<string> {
  const fila = await prisma.globalConfig.findUnique({ where: { key: CLAVE_CORTE } });
  return (fila?.value ?? "").trim();
}

export async function fijarCorteDelRadar(snapshotId: string): Promise<void> {
  await prisma.globalConfig.upsert({
    where: { key: CLAVE_CORTE },
    create: { key: CLAVE_CORTE, value: snapshotId },
    update: { value: snapshotId },
  });
  // Qué cargos tienen data depende del corte, así que lo guardado ya no sirve.
  await olvidarCargosConDatos(snapshotId);
}

/** El tope general, que vale para toda empresa sin cupo propio. */
export async function cupoGeneral(): Promise<number> {
  const fila = await prisma.globalConfig.findUnique({ where: { key: CLAVE_CUPO } });
  const n = Number(fila?.value);
  return Number.isFinite(n) && n >= 0 ? n : CUPO_RADAR_POR_DEFECTO;
}

export async function fijarCupoGeneral(cupo: number): Promise<void> {
  await prisma.globalConfig.upsert({
    where: { key: CLAVE_CUPO },
    create: { key: CLAVE_CUPO, value: String(cupo) },
    update: { value: String(cupo) },
  });
}

/** Cuántos le quedan a una empresa en el trimestre en curso. */
export async function estadoDelCupo(companyId: string, ahora = new Date()): Promise<EstadoCupoRadar> {
  const trimestre = trimestreDe(ahora);
  const [empresa, general, usados] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { radarCupoTrimestral: true } }),
    cupoGeneral(),
    prisma.radarInforme.count({ where: { companyId, trimestre } }),
  ]);

  const cupo = empresa?.radarCupoTrimestral ?? general;
  return {
    trimestre,
    cupo,
    usados,
    restantes: Math.max(0, cupo - usados),
    seRepone: inicioDelProximoTrimestre(ahora).toISOString().slice(0, 10),
  };
}

/**
 * Qué le falta a la empresa para poder bajar un Radar.
 *
 * El CEO lo puso como condición: sin la ficha de la empresa y sin el contacto
 * de RR.HH. no se entrega el reporte, porque es la contraparte de recibirlo.
 */
export function faltaEnLaFicha(empresa: {
  name?: string | null;
  economicSector?: string | null;
  headcount?: string | null;
  revenueUSD?: string | null;
  hrName?: string | null;
  hrEmail?: string | null;
  hrPhone?: string | null;
}): string[] {
  const falta: string[] = [];
  if (!empresa.name?.trim()) falta.push("el nombre de la empresa");
  if (!empresa.economicSector?.trim()) falta.push("el sector económico");
  if (!empresa.headcount?.trim()) falta.push("el número de empleados");
  if (!empresa.revenueUSD?.trim()) falta.push("la facturación anual");
  if (!empresa.hrName?.trim()) falta.push("el nombre del contacto de RR.HH.");
  if (!empresa.hrEmail?.trim()) falta.push("el correo del contacto de RR.HH.");
  if (!empresa.hrPhone?.trim()) falta.push("el teléfono del contacto de RR.HH.");
  return falta;
}

/* ---------------------------------------------------------------------------
 * Qué cargos se pueden consultar de verdad en un corte.
 * ------------------------------------------------------------------------ */

const CLAVE_DISPONIBLES = "radar-cargos-con-datos-";

/**
 * Cuántas empresas hacen falta para que un cargo valga la pena ofrecerlo.
 *
 * Es el mínimo de la mediana, que es el primer percentil que la metodología
 * deja calcular. Por debajo de eso `computeMetricPercentiles` devuelve null en
 * todo y el informe saldría entero en ND.
 */
export const MINIMO_EMPRESAS_RADAR = PERCENTILE_MIN_N.p50;

/** Cada cuánto se vuelve a mirar qué cargos tienen data. */
const VIGENCIA_MS = 12 * 60 * 60 * 1000;

/** Título del cargo en minúsculas → cuántas empresas lo reportaron. */
export type CargosConDatos = Record<string, number>;

type Guardado = { calculadoEn: string; cargos: CargosConDatos };

/**
 * La lista de cargos que la pantalla del Radar puede ofrecer.
 *
 * Hasta ahora la pantalla ofrecía el catálogo del corte entero —el diccionario
 * de cargos de la encuesta— y las cifras salían de otro lado, del recorrido de
 * los workspaces. Nadie cruzaba las dos: por eso aparecían cargos que al
 * intentar extraerlos contestaban "el estudio no tiene data de mercado para
 * X". Esto devuelve la otra mitad, para poder cruzarlas.
 *
 * Va con caché porque averiguarlo cuesta caro: hay que recorrer el workspace
 * de cada empresa que envió el corte, que es justo la descarga que estamos
 * tratando de no repetir. Se calcula una vez cada doce horas por corte, y se
 * tira al cambiar el corte del Radar (AC Consulting, 2026-10-30).
 */
export async function cargosConDatos(snapshotId: string): Promise<CargosConDatos> {
  if (!snapshotId) return {};

  const fila = await prisma.globalConfig.findUnique({
    where: { key: CLAVE_DISPONIBLES + snapshotId },
    select: { value: true },
  });

  if (fila?.value) {
    try {
      const guardado = JSON.parse(fila.value) as Guardado;
      const edad = Date.now() - new Date(guardado.calculadoEn).getTime();
      if (guardado.cargos && edad >= 0 && edad < VIGENCIA_MS) return guardado.cargos;
    } catch {
      // Guardado ilegible: se recalcula abajo.
    }
  }

  return recalcularCargosConDatos(snapshotId);
}

export async function recalcularCargosConDatos(snapshotId: string): Promise<CargosConDatos> {
  const [{ workspaces, enviaron }, bcv] = await Promise.all([
    workspacesDelCorte(snapshotId),
    getBcvRate(),
  ]);

  // Sin recorte: la lista que se ofrece es la del corte entero. El admin que
  // además recorta el mercado puede toparse con un cargo que dentro de su
  // recorte no llegue al mínimo; para eso el POST sigue comprobándolo por su
  // cuenta antes de emitir nada.
  const { cargos } = calcularPercentilesMercado({
    snapshotId,
    filtros: { sectores: [], clasificaciones: [], empresas: [], localidades: [], tamanos: [] },
    workspaces,
    enviaron,
    bcvGeneral: bcv.rate,
  });

  const mapa: CargosConDatos = {};
  for (const c of cargos) mapa[c.tituloCargo.trim().toLowerCase()] = c.n;

  const guardado: Guardado = { calculadoEn: new Date().toISOString(), cargos: mapa };
  await prisma.globalConfig.upsert({
    where: { key: CLAVE_DISPONIBLES + snapshotId },
    create: { key: CLAVE_DISPONIBLES + snapshotId, value: JSON.stringify(guardado) },
    update: { value: JSON.stringify(guardado) },
  });

  return mapa;
}

/** Tira la lista guardada de un corte, para que se vuelva a calcular. */
export async function olvidarCargosConDatos(snapshotId: string): Promise<void> {
  if (!snapshotId) return;
  await prisma.globalConfig.deleteMany({ where: { key: CLAVE_DISPONIBLES + snapshotId } });
}
