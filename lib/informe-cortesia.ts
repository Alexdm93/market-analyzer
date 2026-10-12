/**
 * Informe de cortesía: el que recibe toda empresa que participó en un corte y
 * envió su data.
 *
 * No se genera un libro desde cero: se **rellena la plantilla del cliente**
 * (`templates/informe-cortesia.xlsx`), que trae portada, agradecimiento,
 * índice, páginas institucionales, logos y diseño.
 *
 * Se parchea el XML de la plantilla (ver `lib/xlsx-plantilla.ts`) en vez de
 * reescribir el libro: así los cuadros de texto y las imágenes llegan intactos.
 * Solo se escriben las celdas de datos.
 *
 * La plantilla es la que revisó AC Consulting (2026-10-01): los títulos de cada
 * hoja son formas, no celdas, las pestañas perdieron el prefijo "F - ", y el
 * índice ya viene escrito. Por eso acá no se tocan ni los títulos ni el índice.
 *
 * La revisión anterior sumó la hoja "Metodologia" —conceptos, percentiles y el
 * mínimo de participantes de cada uno— y la agregó al Contenido. Las dos son
 * texto fijo de la plantilla: el generador no escribe nada en ellas.
 *
 * La última corrigió la nota del CIM en el Market Analyzer, que traía la
 * descripción del TEMz; alineó los textos de Metodología; quitó las redes
 * sociales repetidas de Empresas Participantes y cambió las imágenes de
 * portada de "Estudio de Mercado General" y "Acerca de AC Consulting". Todo
 * eso vive en la plantilla, no en este archivo.
 */
import path from "node:path";

import {
  SIN_DATO,
  escribirDistribucion,
  escribirEmpresasParticipantes,
  escribirPortada,
  type FilaDistribucionInforme,
  type FilaMonedaInforme,
  type ParticipanteInforme,
} from "@/lib/informe-hojas-comunes";
import { LibroPlantilla, type HojaPlantilla } from "@/lib/xlsx-plantilla";

export const HOJA_MARKET = "Market Analyzer";

// Se vuelven a exportar porque media docena de archivos los importa desde acá.
export { SIN_DATO, mesYAnio } from "@/lib/informe-hojas-comunes";
export type { FilaDistribucionInforme, FilaMonedaInforme, ParticipanteInforme } from "@/lib/informe-hojas-comunes";

/** Hasta dónde llega dibujada la tabla del Market Analyzer en la plantilla. */
const ULTIMA_FILA_MARKET = 260;

/** Direcciones tomadas de la plantilla real, no inventadas. */
const CELDA = {
  filaCargos: 7,
} as const;

export type EstadisticaMercado = {
  p50: number | null;
  promedio: number | null;
  min: number | null;
  max: number | null;
};

/**
 * Un cargo del Market Analyzer. Solo lleva CIM: de las cuatro métricas que se
 * publicaron al principio, AC Consulting dejó esta (2026-09-26).
 */
export type GrupoMercado = {
  tituloCargo: string;
  /** El departamento del catálogo del corte. */
  unidadFuncional: string;
  n: number;
  cim: EstadisticaMercado;
  /** La mediana del CIM expresada en TCR BCV-USD. */
  cimTcrP50: number | null;
};

export type DatosCortesia = {
  tituloEstudio: string;
  /** Vacío genera el informe genérico, sin empresa en la portada. */
  cliente: string;
  fechaInforme: string;
  fechaData: string;
  participantes: ParticipanteInforme[];
  cargos: GrupoMercado[];
  distribucion: FilaDistribucionInforme[];
  categoriasDistribucion: string[];
  moneda: FilaMonedaInforme[];
};

export function rutaPlantillaCortesia(): string {
  return path.join(process.cwd(), "templates", "informe-cortesia.xlsx");
}

/**
 * Escribe un valor conservando el formato de la celda: la plantilla ya trae el
 * tipo de letra, los bordes y los formatos numéricos.
 */
function escribir(ws: HojaPlantilla, direccion: string, valor: string | number | null) {
  ws.set(direccion, valor);
}

/** Un número, o "ND" cuando la muestra no alcanza para publicarlo. */
function cifra(valor: number | null | undefined): string | number {
  return valor === null || valor === undefined ? SIN_DATO : valor;
}

export async function generarInformeCortesia(datos: DatosCortesia): Promise<Buffer> {
  const wb = await LibroPlantilla.abrir(rutaPlantillaCortesia());

  escribirPortada(wb, datos);
  escribirEmpresasParticipantes(wb, datos.participantes);
  escribirDistribucion(wb, datos.categoriasDistribucion, datos.distribucion, datos.moneda);

  // ── Market Analyzer ──
  const hojaMarket = wb.hoja(HOJA_MARKET);
  if (hojaMarket) {
    datos.cargos.forEach((cargo, i) => {
      const f = CELDA.filaCargos + i;
      escribir(hojaMarket, `A${f}`, cargo.unidadFuncional || SIN_DATO);
      escribir(hojaMarket, `B${f}`, cargo.tituloCargo);
      escribir(hojaMarket, `C${f}`, cifra(cargo.cimTcrP50));
      escribir(hojaMarket, `D${f}`, cifra(cargo.cim.p50));
      escribir(hojaMarket, `E${f}`, cifra(cargo.cim.promedio));
      escribir(hojaMarket, `F${f}`, cifra(cargo.cim.min));
      escribir(hojaMarket, `G${f}`, cifra(cargo.cim.max));
      escribir(hojaMarket, `H${f}`, cargo.n);
    });

    // La plantilla trae la tabla dibujada hasta la fila 215 (bordes y bandas).
    // Las filas que sobran se vacían con formato y todo: si no, el informe
    // termina con decenas de filas rayadas en blanco.
    const despues = CELDA.filaCargos + datos.cargos.length;
    for (let f = despues; f <= Math.max(despues + 40, ULTIMA_FILA_MARKET); f++) {
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
        hojaMarket.limpiar(`${col}${f}`);
      }
    }
  }

  return wb.aBuffer();
}
