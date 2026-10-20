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
