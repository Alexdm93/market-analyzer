/**
 * Informe General de Tendencias Salariales: el que se vende.
 *
 * Es primo del de cortesía —misma plantilla de origen, mismas hojas de
 * portada, empresas participantes y distribución, que se escriben desde
 * `lib/informe-hojas-comunes.ts`— y se separa en el Market Analyzer:
 *
 *  - publica los cinco percentiles, no solo la mediana;
 *  - la métrica la elige el cliente entre TEM, TEMz, CIM y PCTA, y el título
 *    y la descripción de la hoja siguen a esa elección;
 *  - el TCR no es una columna aparte: cuando se activa, las nueve cifras ya
 *    vienen convertidas (AC Consulting, 2026-10-12).
 *
 * La plantilla `templates/informe-general.xlsx` trae el Market Analyzer con
 * las columnas P90, P75, P50, P25, P10, Promedio, Mínimo, Máximo y
 * Participantes, y la lista de cargos vacía: la llena el generador.
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
import { LibroPlantilla } from "@/lib/xlsx-plantilla";

export const HOJA_MARKET = "Market Analyzer";

/** Hasta dónde llega dibujada la tabla del Market Analyzer en la plantilla. */
const ULTIMA_FILA_MARKET = 215;

const CELDA = {
  metrica: "B4",
  concepto: "B5",
  primeraFilaCargos: 7,
} as const;

/** Las columnas de la tabla, en el orden en que las dibuja la plantilla. */
const COLUMNAS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;

/**
 * Las cuatro métricas, con el mismo nombre interno que usan `computeRowTotals`
 * y las rutas de percentiles.
 */
export type MetricaInforme =
  | "sinPasivosMensual"
  | "directoMensualizado"
  | "conPasivosMensual"
  | "conPasivosAnual";

/**
 * Título y descripción de cada métrica, tal como los redactó AC Consulting
 * (2026-10-12). Son los mismos textos que lleva la hoja de Metodología, así
 * que si cambian hay que cambiarlos en los dos lados.
 */
export const METRICAS: Record<MetricaInforme, { titulo: string; concepto: string }> = {
  sinPasivosMensual: {
    titulo: "Total Efectivo Mensual (TEM)",
    concepto:
      "Refleja la liquidez real y directa que percibe el colaborador en un mes ordinario. Representa la suma de " +
      "todas las remuneraciones y conceptos de pago (fijos y variables) que se cobran con una frecuencia " +
      "estrictamente mensual. Este indicador es \"limpio\", por lo que no incluye provisiones, reservas ni las " +
      "porciones (alícuotas) de los pasivos laborales o beneficios de ley, tales como utilidades, bono vacacional " +
      "y prestaciones sociales.",
  },
  directoMensualizado: {
    titulo: "Total Efectivo Mensualizado (TEMz)",
    concepto:
      "Muestra el flujo de caja promedio del trabajador llevado a la escala de un mes estándar de 30 días. Este " +
      "cálculo consolida todos los pagos mensuales más la proyección de aquellos ingresos con frecuencias " +
      "distintas (bimestrales, trimestrales, bonos por desempeño anuales, etc.), sumándolos en un monto anual que " +
      "luego se divide entre 12. Al igual que el TEM, excluye estrictamente el impacto de las alícuotas de los " +
      "pasivos laborales. Es ideal para medir el ingreso real disponible del trabajador en promedio.",
  },
  conPasivosMensual: {
    titulo: "Compensación Integral Mensualizada (CIM)",
    concepto:
      "Es el indicador del valor económico total del paquete retributivo expresado en fracciones mensuales. " +
      "Integra el \"Total Efectivo Mensualizado\" y le suma el peso financiero (las alícuotas mensuales) de todos " +
      "los pasivos laborales garantizados por ley o contrato, entiéndase: utilidades, bono vacacional y " +
      "prestaciones sociales. Este cálculo permite a la empresa visualizar el impacto económico integral de la " +
      "posición mes a mes, incluyendo las provisiones obligatorias.",
  },
  conPasivosAnual: {
    titulo: "Paquete de Compensación Total Anual (PCTA)",
    concepto:
      "Representa el valor global del paquete del trabajador proyectado a un ejercicio fiscal completo (12 meses). " +
      "Es la sumatoria absoluta y anualizada de todos los ingresos regulares, todos los pagos de frecuencia " +
      "variable y el costo total de los pasivos laborales (utilidades, bono vacacional y prestaciones sociales). " +
      "Es el indicador definitivo y más robusto para comparar la competitividad del puesto contra las curvas del " +
      "mercado laboral general.",
  },
};

/** Las nueve cifras que publica cada cargo. */
export type EstadisticaGeneral = {
  p90: number | null;
  p75: number | null;
  p50: number | null;
  p25: number | null;
  p10: number | null;
  promedio: number | null;
  min: number | null;
  max: number | null;
};

export type GrupoMercadoGeneral = {
  tituloCargo: string;
  /** El departamento del catálogo del corte. */
  unidadFuncional: string;
  n: number;
  valores: EstadisticaGeneral;
};

export type DatosGeneral = {
  tituloEstudio: string;
  /** Vacío genera el informe genérico, sin empresa en la portada. */
  cliente: string;
  fechaInforme: string;
  fechaData: string;
  metrica: MetricaInforme;
  participantes: ParticipanteInforme[];
  cargos: GrupoMercadoGeneral[];
  distribucion: FilaDistribucionInforme[];
  categoriasDistribucion: string[];
  moneda: FilaMonedaInforme[];
};

export function rutaPlantillaGeneral(): string {
  return path.join(process.cwd(), "templates", "informe-general.xlsx");
}

/** Un número, o "ND" cuando la muestra no alcanza para publicarlo. */
function cifra(valor: number | null | undefined): string | number {
  return valor === null || valor === undefined ? SIN_DATO : valor;
}

export async function generarInformeGeneral(datos: DatosGeneral): Promise<Buffer> {
  const wb = await LibroPlantilla.abrir(rutaPlantillaGeneral());

  escribirPortada(wb, datos);
  escribirEmpresasParticipantes(wb, datos.participantes);
  escribirDistribucion(wb, datos.categoriasDistribucion, datos.distribucion, datos.moneda);

  const hoja = wb.hoja(HOJA_MARKET);
  if (hoja) {
    const metrica = METRICAS[datos.metrica];
    hoja.set(CELDA.metrica, metrica.titulo);
    hoja.set(CELDA.concepto, metrica.concepto);

    datos.cargos.forEach((cargo, i) => {
      const f = CELDA.primeraFilaCargos + i;
      const v = cargo.valores;
      hoja.set(`A${f}`, cargo.unidadFuncional || SIN_DATO);
      hoja.set(`B${f}`, cargo.tituloCargo);
      hoja.set(`C${f}`, cifra(v.p90));
      hoja.set(`D${f}`, cifra(v.p75));
      hoja.set(`E${f}`, cifra(v.p50));
      hoja.set(`F${f}`, cifra(v.p25));
      hoja.set(`G${f}`, cifra(v.p10));
      hoja.set(`H${f}`, cifra(v.promedio));
      hoja.set(`I${f}`, cifra(v.min));
      hoja.set(`J${f}`, cifra(v.max));
      hoja.set(`K${f}`, cargo.n);
    });

    // La plantilla trae la tabla dibujada hasta la 215. Las filas que sobran se
    // vacían con formato y todo: si no, el informe termina con decenas de
    // filas rayadas en blanco.
    const despues = CELDA.primeraFilaCargos + datos.cargos.length;
    for (let f = despues; f <= Math.max(despues + 40, ULTIMA_FILA_MARKET); f++) {
      for (const col of COLUMNAS) hoja.limpiar(`${col}${f}`);
    }
  }

  return wb.aBuffer();
}
