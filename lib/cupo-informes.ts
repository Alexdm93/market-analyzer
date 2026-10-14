/**
 * El cupo de informes del Estudio Especializado.
 *
 * Lo que el cupo limita no son las descargas: es **cuántos cortes de data
 * distintos** puede configurar una empresa dentro de un estudio. Si configuró
 * tres, esos tres los baja las veces que quiera; lo que no puede es armar un
 * cuarto recorte del mercado sin que el admin se lo autorice (AC Consulting,
 * 2026-10-14).
 *
 * El cupo se cuenta por estudio, no por empresa: una que compró la 2da ENS y
 * la 2da CAVEDATOS puede tener tres en cada una, o la combinación que el admin
 * decida.
 */
import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

/** Lo que recibe una empresa en cada estudio si el admin no dice otra cosa. */
export const CUPO_POR_DEFECTO = 3;

/**
 * La huella de un corte de data.
 *
 * Dos informes con la misma huella son el mismo recorte visto dos veces, así
 * que el segundo no consume cupo: es la regla de "los que ya configuró los
 * baja las veces que quiera".
 */
export type ConfiguracionDelCorte = {
  snapshotId: string;
  modo: string;
  metrica: string;
  tcr: string | null;
  comisiones: boolean;
  /** Los filtros del grupo de comparación, como viajan en la URL. */
  filtros: string;
  grados: number[];
};

export function huellaDelCorte(c: ConfiguracionDelCorte): string {
  const partes = [
    c.snapshotId,
    c.modo,
    c.metrica,
    c.tcr ?? "sin-tcr",
    c.comisiones ? "con-comisiones" : "sin-comisiones",
    // Los filtros se ordenan: el mismo grupo elegido en otro orden es el mismo
    // grupo, y si no la huella cambiaría por nada.
    [...new URLSearchParams(c.filtros).entries()]
      .map(([k, v]) => `${k}=${v.split(",").sort().join(",")}`)
      .sort()
      .join("&"),
    [...c.grados].sort((a, b) => a - b).join(","),
  ];
  return createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 32);
}

function cuposDeLaEmpresa(json: string): Record<string, number> {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const salida: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) salida[k] = Math.floor(n);
    }
    return salida;
  } catch {
    return {};
  }
}

export function cupoDelCorte(estudioCuposJson: string, snapshotId: string): number {
  const cupos = cuposDeLaEmpresa(estudioCuposJson);
  return snapshotId in cupos ? cupos[snapshotId] : CUPO_POR_DEFECTO;
}

export function conCupoCambiado(estudioCuposJson: string, snapshotId: string, cupo: number): string {
  const cupos = cuposDeLaEmpresa(estudioCuposJson);
  cupos[snapshotId] = Math.max(0, Math.floor(cupo));
  return JSON.stringify(cupos);
}

export type EstadoDelCupo = {
  cupo: number;
  /** Cuántos cortes de data distintos ya configuró. */
  usados: number;
  /** Cuántos le quedan. Nunca negativo. */
  disponibles: number;
  /** Si tiene una solicitud de ampliación esperando respuesta. */
  solicitudPendiente: boolean;
};

export async function estadoDelCupo(companyId: string, snapshotId: string): Promise<EstadoDelCupo> {
  const [empresa, informes, pendiente] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { estudioCuposJson: true } }),
    prisma.estudioInforme.findMany({
      where: { companyId, snapshotId },
      select: { configHash: true },
    }),
    prisma.solicitudInforme.findFirst({
      where: { companyId, snapshotId, status: "PENDING" },
      select: { id: true },
    }),
  ]);

  const cupo = cupoDelCorte(empresa?.estudioCuposJson ?? "{}", snapshotId);
  // Los informes viejos no tienen huella; cada uno cuenta como un corte.
  const usados = new Set(informes.map((i, n) => i.configHash || `sin-huella-${n}`)).size;

  return {
    cupo,
    usados,
    disponibles: Math.max(0, cupo - usados),
    solicitudPendiente: Boolean(pendiente),
  };
}

/**
 * ¿Puede emitir este corte? Devuelve `null` si sí.
 *
 * Un corte que ya configuró nunca se bloquea, aunque esté en el tope: eso es
 * volver a bajar algo que ya pagó.
 */
export async function cupoAgotado(
  companyId: string,
  configuracion: ConfiguracionDelCorte,
): Promise<{ estado: EstadoDelCupo; huella: string } | null> {
  const huella = huellaDelCorte(configuracion);

  const yaLoTiene = await prisma.estudioInforme.findFirst({
    where: { companyId, snapshotId: configuracion.snapshotId, configHash: huella },
    select: { id: true },
  });
  if (yaLoTiene) return null;

  const estado = await estadoDelCupo(companyId, configuracion.snapshotId);
  if (estado.disponibles > 0) return null;

  return { estado, huella };
}
