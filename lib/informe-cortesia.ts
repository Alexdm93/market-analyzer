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
 * La plantilla es la que revisó AC Consulting (2026-09-26): los títulos de cada
 * hoja son formas, no celdas, las pestañas perdieron el prefijo "F - ", y el
 * índice ya viene escrito. Por eso acá no se tocan ni los títulos ni el índice.
 */
import path from "node:path";

import { LibroPlantilla, type HojaPlantilla } from "@/lib/xlsx-plantilla";

export const HOJA_INICIO = "Inicio";
export const HOJA_EMPRESAS = "Empresas Participantes";
export const HOJA_MARKET = "Market Analyzer";
export const HOJA_DISTRIBUCION = "Distribución de Compensación";

/** Hasta dónde llega dibujada la tabla del Market Analyzer en la plantilla. */
const ULTIMA_FILA_MARKET = 260;

/** Lo que se escribe donde no hay dato o no hay observaciones suficientes. */
export const SIN_DATO = "ND";

/** Direcciones tomadas de la plantilla real, no inventadas. */
const CELDA = {
  titulo: "A12",
  fechaInforme: "B14",
  fechaData: "B16",
  // La plantilla del cortesía no traía cliente. Se agrega en A18/B18, las
  // mismas celdas donde lo lleva la del informe especializado, para que las dos
  // portadas queden iguales.
  etiquetaCliente: "A18",
  cliente: "B18",
  totalEmpresas: "A30",
  primeraEmpresa: 33,
  filaCargos: 7,
  primeraFilaDistribucion: 9,
  // El cuadro de monedas va debajo del de niveles, como pidió el CEO.
  filaCabeceraMoneda: 18,
  primeraFilaMoneda: 19,
} as const;

/**
 * Las ocho categorías empiezan en la C: la A lleva el nivel (combinada con la
 * B en el cuadro de arriba) y la B, en el de monedas, dice si la fila es la
 * moneda de cuenta o la de pago.
 */
const COLS_CATEGORIAS = ["C", "D", "E", "F", "G", "H", "I", "J"];

/**
 * Hasta dónde llega el rango de los COUNTIF que alimentan los treemaps de
 * sector y tamaño (`$B$33:$B$232`). Más empresas que eso no entrarían en los
 * gráficos.
 */
const ULTIMA_FILA_EMPRESAS = 232;

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
  cuentaUSD: number[];
  pagoUSD: number[];
};

/** Una empresa del corte, para los gráficos de sector y tamaño. */
export type ParticipanteInforme = {
  empresa: string;
  sector: string;
  tamano: string;
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

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** "ABRIL 2026", como en la plantilla. */
export function mesYAnio(fecha: Date): string {
  return `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

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

  // ── Portada ──
  const inicio = wb.hoja(HOJA_INICIO);
  if (inicio) {
    escribir(inicio, CELDA.titulo, datos.tituloEstudio);
    escribir(inicio, CELDA.fechaInforme, datos.fechaInforme);
    escribir(inicio, CELDA.fechaData, datos.fechaData);
    escribir(inicio, CELDA.etiquetaCliente, datos.cliente ? "CLIENTE:" : null);
    escribir(inicio, CELDA.cliente, datos.cliente || null);
  }

  // ── Empresas participantes ──
  // Una sola tabla: empresa, sector y tamaño. Los COUNTIF de la plantilla
  // cuentan sobre estas columnas y alimentan los dos treemaps, así que los
  // conteos no se escriben desde acá: se recalculan al abrir el archivo.
  const hojaEmpresas = wb.hoja(HOJA_EMPRESAS);
  if (hojaEmpresas) {
    escribir(hojaEmpresas, CELDA.totalEmpresas, `Total: ${datos.participantes.length} empresas`);

    datos.participantes.forEach((p, i) => {
      const fila = CELDA.primeraEmpresa + i;
      escribir(hojaEmpresas, `A${fila}`, p.empresa);
      escribir(hojaEmpresas, `B${fila}`, p.sector || SIN_DATO);
      escribir(hojaEmpresas, `C${fila}`, p.tamano || SIN_DATO);
    });

    const despues = CELDA.primeraEmpresa + datos.participantes.length;
    for (let f = despues; f <= Math.max(despues + 20, ULTIMA_FILA_EMPRESAS); f++) {
      for (const col of ["A", "B", "C"]) hojaEmpresas.limpiar(`${col}${f}`);
    }
  }

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

  // ── Distribución de compensación ──
  const hojaDist = wb.hoja(HOJA_DISTRIBUCION);
  if (hojaDist) {
    // Cabecera: "Niveles" en la A (combinada con la B) y las ocho categorías
    // del CEO de la C a la J. Sin tocar el formato: la plantilla ya lo trae, y
    // copiarle el de otra celda le cambia los bordes.
    escribir(hojaDist, "A8", "Niveles");
    datos.categoriasDistribucion.forEach((titulo, i) => {
      escribir(hojaDist, `${COLS_CATEGORIAS[i]}8`, titulo);
    });

    datos.distribucion.forEach((f, idx) => {
      const fila = CELDA.primeraFilaDistribucion + idx;
      escribir(hojaDist, `A${fila}`, f.nivel);
      f.valores.forEach((v, i) => escribir(hojaDist, `${COLS_CATEGORIAS[i]}${fila}`, v));
    });

    escribirCuadroDeMonedas(hojaDist, datos.categoriasDistribucion, datos.moneda);
  }

  return wb.aBuffer();
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
  categorias.forEach((titulo, i) => {
    hoja.set(`${COLS_CATEGORIAS[i]}${cabecera}`, titulo);
  });

  filas.forEach((f, idx) => {
    const filaCuenta = CELDA.primeraFilaMoneda + idx * 2;
    hoja.set(`A${filaCuenta}`, f.nivel);
    f.cuentaUSD.forEach((v, i) => hoja.set(`${COLS_CATEGORIAS[i]}${filaCuenta}`, v));
    f.pagoUSD.forEach((v, i) => hoja.set(`${COLS_CATEGORIAS[i]}${filaCuenta + 1}`, v));
  });
}
