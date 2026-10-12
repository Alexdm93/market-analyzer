/**
 * Las hojas que el informe de cortesía y el general tienen iguales.
 *
 * Las dos plantillas salieron de la misma: portada, empresas participantes y
 * distribución de compensación están en las mismas celdas, con las mismas
 * fórmulas y los mismos gráficos. Lo único que cambia entre un informe y otro
 * es el Market Analyzer.
 *
 * Por eso estas tres se escriben desde un solo lado. Si mañana AC Consulting
 * mueve una celda en una de las dos plantillas, lo que hay que hacer es
 * separarlas acá a propósito, no descubrirlo porque un informe salió mal.
 */
import type { HojaPlantilla, LibroPlantilla } from "@/lib/xlsx-plantilla";

/** Lo que se escribe donde no hay dato o no hay observaciones suficientes. */
export const SIN_DATO = "ND";

export type FilaDistribucionInforme = {
  nivel: string;
  valores: number[];
};

/**
 * Un nivel con el reparto de cada categoría entre moneda de cuenta y moneda de
 * pago. Cada arreglo va en el orden de `categoriasDistribucion`, y el número es
 * la parte en dólares: lo que falta hasta 100% son bolívares.
 */
export type FilaMonedaInforme = {
  nivel: string;
  cuentaVES: number[];
  cuentaUSD: number[];
  pagoVES: number[];
  pagoUSD: number[];
};

/** Una empresa del corte, para los gráficos de sector y tamaño. */
export type ParticipanteInforme = {
  empresa: string;
  sector: string;
  tamano: string;
};

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** "ABRIL 2026", como en la plantilla. */
export function mesYAnio(fecha: Date): string {
  return `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;
}


export const HOJA_INICIO = "Inicio";
export const HOJA_EMPRESAS = "Empresas Participantes";
export const HOJA_DISTRIBUCION = "Distribución de Compensación";

/**
 * Cada categoría ocupa DOS columnas, porque el cuadro de monedas reparte cada
 * elemento entre bolívares y dólares. En el cuadro de niveles las dos van
 * combinadas y el valor vive en la primera.
 */
const COLS_CATEGORIAS = ["C", "E", "G", "I", "K", "M", "O", "Q"];
const COLS_CATEGORIAS_USD = ["D", "F", "H", "J", "L", "N", "P", "R"];

const CELDA = {
  titulo: "A12",
  fechaInforme: "B14",
  fechaData: "B16",
  etiquetaCliente: "A18",
  cliente: "B18",
  totalEmpresas: "A30",
  primeraEmpresa: 33,
  primeraFilaDistribucion: 9,
  filaCabeceraMoneda: 18,
  // La 19 es la subcabecera Bs/USD, que ya viene en la plantilla.
  primeraFilaMoneda: 20,
} as const;

/**
 * Hasta dónde llega el rango de los COUNTIF que alimentan los treemaps de
 * sector y tamaño (`$B$33:$B$232`). Más empresas que eso no entrarían en los
 * gráficos.
 */
const ULTIMA_FILA_EMPRESAS = 232;

export type Portada = {
  tituloEstudio: string;
  /** Vacío genera el informe genérico, sin empresa en la portada. */
  cliente: string;
  fechaInforme: string;
  fechaData: string;
};

export function escribirPortada(wb: LibroPlantilla, datos: Portada) {
  const inicio = wb.hoja(HOJA_INICIO);
  if (!inicio) return;

  inicio.set(CELDA.titulo, datos.tituloEstudio);
  inicio.set(CELDA.fechaInforme, datos.fechaInforme);
  inicio.set(CELDA.fechaData, datos.fechaData);
  inicio.set(CELDA.etiquetaCliente, datos.cliente ? "CLIENTE:" : null);
  inicio.set(CELDA.cliente, datos.cliente || null);
}

/**
 * Una sola tabla: empresa, sector y tamaño. Los COUNTIF de la plantilla
 * cuentan sobre estas columnas y alimentan los dos treemaps, así que los
 * conteos no se escriben: se recalculan al abrir el archivo.
 */
export function escribirEmpresasParticipantes(wb: LibroPlantilla, participantes: ParticipanteInforme[]) {
  const hoja = wb.hoja(HOJA_EMPRESAS);
  if (!hoja) return;

  hoja.set(CELDA.totalEmpresas, `Total: ${participantes.length} empresas`);

  participantes.forEach((p, i) => {
    const fila = CELDA.primeraEmpresa + i;
    hoja.set(`A${fila}`, p.empresa);
    hoja.set(`B${fila}`, p.sector || SIN_DATO);
    hoja.set(`C${fila}`, p.tamano || SIN_DATO);
  });

  const despues = CELDA.primeraEmpresa + participantes.length;
  for (let f = despues; f <= Math.max(despues + 20, ULTIMA_FILA_EMPRESAS); f++) {
    for (const col of ["A", "B", "C"]) hoja.limpiar(`${col}${f}`);
  }
}

export function escribirDistribucion(
  wb: LibroPlantilla,
  categorias: string[],
  distribucion: FilaDistribucionInforme[],
  moneda: FilaMonedaInforme[],
) {
  const hoja = wb.hoja(HOJA_DISTRIBUCION);
  if (!hoja) return;

  // Cabecera: "Niveles" en la A (combinada con la B) y las ocho categorías del
  // CEO de la C a la Q. Sin tocar el formato: la plantilla ya lo trae, y
  // copiarle el de otra celda le cambia los bordes.
  hoja.set("A8", "Niveles");
  categorias.forEach((titulo, i) => hoja.set(`${COLS_CATEGORIAS[i]}8`, titulo));

  distribucion.forEach((f, idx) => {
    const fila = CELDA.primeraFilaDistribucion + idx;
    hoja.set(`A${fila}`, f.nivel);
    f.valores.forEach((v, i) => hoja.set(`${COLS_CATEGORIAS[i]}${fila}`, v));
  });

  escribirCuadroDeMonedas(hoja, categorias, moneda);
}

/**
 * El cuadro de monedas, debajo del de niveles.
 *
 * Responde a las dos preguntas que el mismo porcentaje no distingue: en qué
 * moneda está pactado el pago (moneda de cuenta) y en cuál se entrega (moneda
 * de pago). Una empresa puede pactar en dólares y pagar en bolívares al cambio.
 *
 * Cada nivel ocupa dos filas —cuenta y pago— y la plantilla ya trae esas
 * etiquetas en la columna B, con la A combinada de a dos.
 */
function escribirCuadroDeMonedas(hoja: HojaPlantilla, categorias: string[], filas: FilaMonedaInforme[]) {
  const cabecera = CELDA.filaCabeceraMoneda;
  hoja.set(`A${cabecera}`, "Niveles");
  // La plantilla arrastra un título de más en la B de la cabecera. Se borra el
  // texto pero no el formato: la celda es parte de la banda del encabezado.
  hoja.set(`B${cabecera}`, null);
  categorias.forEach((titulo, i) => hoja.set(`${COLS_CATEGORIAS[i]}${cabecera}`, titulo));

  filas.forEach((f, idx) => {
    const filaCuenta = CELDA.primeraFilaMoneda + idx * 2;
    const filaPago = filaCuenta + 1;
    hoja.set(`A${filaCuenta}`, f.nivel);
    f.cuentaVES.forEach((v, i) => hoja.set(`${COLS_CATEGORIAS[i]}${filaCuenta}`, v));
    f.cuentaUSD.forEach((v, i) => hoja.set(`${COLS_CATEGORIAS_USD[i]}${filaCuenta}`, v));
    f.pagoVES.forEach((v, i) => hoja.set(`${COLS_CATEGORIAS[i]}${filaPago}`, v));
    f.pagoUSD.forEach((v, i) => hoja.set(`${COLS_CATEGORIAS_USD[i]}${filaPago}`, v));
  });
}
