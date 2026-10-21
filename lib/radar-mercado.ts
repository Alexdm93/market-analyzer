/**
 * Lo que publica un informe del Radar: la muestra y el posicionamiento.
 *
 * El posicionamiento son TEM y PCTA en los cinco percentiles, y salen del
 * mismo cálculo de mercado que el resto de la plataforma —con el suavizado ya
 * aplicado cuando se compara por grado—, así que un Radar y un Estudio de
 * Competitividad del mismo corte no pueden contradecirse.
 *
 * La muestra se arma con las MISMAS observaciones que alimentaron esos
 * percentiles, no con un recorrido aparte: por eso `calcularPercentiles*`
 * recibe un observador en vez de que acá se vuelva a leer la data.
 */
import { CATEGORIAS, composicionDe, type Categoria } from "@/lib/distribucion-compensacion";
import { tamanoDeEmpresa } from "@/lib/filtros-mercado";
import type { ObservacionMercado } from "@/lib/percentiles-mercado";

/** Las métricas del Radar, con el nombre que usa el mercado. */
export const METRICA_TEM = "sinPasivosMensual" as const;
export const METRICA_TEMZ = "directoMensualizado" as const;
export const METRICA_CIM = "conPasivosMensual" as const;
export const METRICA_PCTA = "conPasivosAnual" as const;

export type MetricaRadar =
  | typeof METRICA_TEM | typeof METRICA_TEMZ | typeof METRICA_CIM | typeof METRICA_PCTA;

/**
 * Las cuatro métricas, en el orden en que se leen.
 *
 * Un informe de empresa publica solo TEM y PCTA, que es el modelo que aprobó
 * AC Consulting. El administrador las ve las cuatro, para poder revisar un
 * corte con la misma vara que el resto de la plataforma
 * (AC Consulting, 2026-10-21).
 */
export const METRICAS_RADAR: Array<{ clave: MetricaRadar; etiqueta: string }> = [
  { clave: METRICA_TEM,  etiqueta: "TEM (Total Efectivo Mensual)" },
  { clave: METRICA_TEMZ, etiqueta: "TEMz (Total Efectivo Mensualizado)" },
  { clave: METRICA_CIM,  etiqueta: "CIM (Compensación Integral Mensualizada)" },
  { clave: METRICA_PCTA, etiqueta: "PCTA (Paquete de Compensación Total Anual)" },
];

/** Las que ve una empresa. */
export const METRICAS_DEL_CLIENTE: MetricaRadar[] = [METRICA_TEM, METRICA_PCTA];

export const PERCENTILES_RADAR = ["p10", "p25", "p50", "p75", "p90"] as const;
export type PercentilRadar = (typeof PERCENTILES_RADAR)[number];

export type FilaPosicionamiento = {
  etiqueta: string;
  valores: Record<PercentilRadar, number | null>;
};

export type RebanadaMuestra = { nombre: string; porcentaje: number };

export type MuestraDelRadar = {
  /** Cuántas EMPRESAS distintas aportaron al número. */
  empresas: number;
  sectores: RebanadaMuestra[];
  tamanos: RebanadaMuestra[];
  /** Las ocho categorías, en el orden del informe. */
  composicion: Array<{ categoria: Categoria; porcentaje: number }>;
};

/** Cómo se escribe el tamaño en el informe, que no es como se calcula. */
const TAMANO_EN_INFORME: Record<string, string> = {
  "pequeña": "Pequeña",
  "mediana": "Mediana",
  "grande": "Grande",
};

function reparto(cuenta: Map<string, number>, total: number): RebanadaMuestra[] {
  if (total === 0) return [];
  return [...cuenta.entries()]
    .map(([nombre, n]) => ({ nombre, porcentaje: n / total }))
    .sort((a, b) => b.porcentaje - a.porcentaje || a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Describe la muestra a partir de las observaciones que el mercado contó.
 *
 * Se le pasan las observaciones de UN cargo o UN grado. El mercado ya cuenta
 * una sola por empresa y por cargo/grado, así que acá cada observación es una
 * empresa y los porcentajes salen por empresa, no por ocupante: una empresa
 * grande con mucha gente en el cargo no pesa más que una chica.
 */
export function describirMuestra(
  observaciones: ObservacionMercado[],
  bcvGeneral: number | null,
): MuestraDelRadar {
  const empresas = new Set<string>();
  const porSector = new Map<string, number>();
  const porTamano = new Map<string, number>();

  for (const { companyInfo: info } of observaciones) {
    const nombre = (info.companyName || "").trim().toLowerCase();
    if (nombre) empresas.add(nombre);

    const sector = (info.sector || "").trim() || "Sin sector";
    porSector.set(sector, (porSector.get(sector) ?? 0) + 1);

    const tamano = tamanoDeEmpresa(info.headcount || "");
    const etiqueta = tamano ? TAMANO_EN_INFORME[tamano] ?? tamano : "Sin tamaño";
    porTamano.set(etiqueta, (porTamano.get(etiqueta) ?? 0) + 1);
  }

  // Cada empresa convierte con SUS tasas y con la que tenía al guardar, que es
  // la misma regla con la que el mercado calculó los percentiles.
  const composicion = composicionDe(observaciones.map(({ fila, companyInfo }) => ({
    fila,
    tasas: companyInfo.tasas ?? [],
    bcv: companyInfo.ratesAtSave?.bcvUsd ?? bcvGeneral,
  })));

  return {
    empresas: empresas.size,
    sectores: reparto(porSector, observaciones.length),
    tamanos: reparto(porTamano, observaciones.length),
    composicion: CATEGORIAS.map((c) => ({ categoria: c, porcentaje: composicion[c] })),
  };
}
