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
const ULTIMA_FILA_MARKET = 215;

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
  totalEmpresas: "I28",
  primeraEmpresa: 30,
  filaCargos: 7,
  primeraFilaDistribucion: 9,
  // El cuadro de monedas va debajo del de niveles, como pidió el CEO.
  filaTituloMoneda: 17,
  filaCabeceraMoneda: 18,
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

export type FilaDistribucionInforme = {
  nivel: string;
  valores: number[];
};

/** Una categoría de pago con su reparto entre moneda de cuenta y de pago. */
export type FilaMonedaInforme = {
  categoria: string;
  participacion: number;
  cuentaUSD: number;
  cuentaVES: number;
  pagoUSD: number;
  pagoVES: number;
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
  empresas: string[];
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
  const hojaEmpresas = wb.hoja(HOJA_EMPRESAS);
  if (hojaEmpresas) {
    escribir(hojaEmpresas, CELDA.totalEmpresas, `Total: ${datos.empresas.length} empresas`);

    // La plantilla las reparte en dos columnas (A y G), en orden alfabético y
    // llenando primero la izquierda.
    const mitad = Math.ceil(datos.empresas.length / 2);
    const izquierda = datos.empresas.slice(0, mitad);
    const derecha = datos.empresas.slice(mitad);
    const maximo = Math.max(izquierda.length, derecha.length);

    for (let i = 0; i < maximo; i++) {
      const fila = CELDA.primeraEmpresa + i;
      escribir(hojaEmpresas, `A${fila}`, izquierda[i] ?? null);
      escribir(hojaEmpresas, `G${fila}`, derecha[i] ?? null);
    }
    // Limpia lo que hubiera quedado del ejemplo más abajo.
    for (let i = maximo; i < maximo + 60; i++) {
      const fila = CELDA.primeraEmpresa + i;
      escribir(hojaEmpresas, `A${fila}`, null);
      escribir(hojaEmpresas, `G${fila}`, null);
    }

    escribirDatosDeGraficos(hojaEmpresas, datos.participantes);
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
    const columnas = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

    // Cabecera: "Niveles" más las ocho categorías del CEO.
    ["Niveles", ...datos.categoriasDistribucion].forEach((titulo, i) => {
      hojaDist.set(`${columnas[i]}8`, titulo, "A8");
    });

    datos.distribucion.forEach((f, idx) => {
      const fila = CELDA.primeraFilaDistribucion + idx;
      escribir(hojaDist, `A${fila}`, f.nivel);
      f.valores.forEach((v, i) => escribir(hojaDist, `${columnas[i + 1]}${fila}`, v));
    });
    // La plantilla traía siete niveles y ahora son seis. Se limpia hasta donde
    // empieza el cuadro de monedas, sin pisarlo.
    for (let fila = CELDA.primeraFilaDistribucion + datos.distribucion.length; fila < CELDA.filaTituloMoneda; fila++) {
      for (const col of columnas) hojaDist.limpiar(`${col}${fila}`);
    }

    escribirCuadroDeMonedas(hojaDist, datos.moneda);
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
 * La plantilla no llega hasta acá, así que cada celda copia el formato de la
 * fila equivalente del cuadro de arriba.
 */
function escribirCuadroDeMonedas(hoja: HojaPlantilla, filas: FilaMonedaInforme[]) {
  const titulo = CELDA.filaTituloMoneda;
  const cabecera = CELDA.filaCabeceraMoneda;

  hoja.set(`A${titulo}`, "MONEDA DE CUENTA Y MONEDA DE PAGO POR ELEMENTO", "A8");

  const cabeceras = ["Elemento de pago", "% del total", "Cuenta USD", "Cuenta Bs", "Pago USD", "Pago Bs"];
  cabeceras.forEach((texto, i) => {
    hoja.set(`${String.fromCharCode(65 + i)}${cabecera}`, texto, i === 0 ? "A8" : "B8");
  });

  filas.forEach((f, idx) => {
    const fila = cabecera + 1 + idx;
    hoja.set(`A${fila}`, f.categoria, "A9");
    const valores = [f.participacion, f.cuentaUSD, f.cuentaVES, f.pagoUSD, f.pagoVES];
    valores.forEach((v, i) => hoja.set(`${String.fromCharCode(66 + i)}${fila}`, v, "B9"));
  });
}

/**
 * La tabla que alimenta los gráficos de sector y tamaño.
 *
 * Hasta ahora esos dos cuadros eran imágenes pegadas en la plantilla, así que
 * nunca cambiaban por más que cambiara el corte. Acá se escribe la data cruda
 * —una fila por empresa— y los dos conteos ya hechos, que es lo que un gráfico
 * de Excel necesita para dibujarse sin tabla dinámica.
 *
 * Va fuera del área de impresión (A1:K61), en columnas que no se ven al
 * imprimir ni al leer el informe.
 */
function escribirDatosDeGraficos(hoja: HojaPlantilla, participantes: ParticipanteInforme[]) {
  hoja.set("U1", "Empresa");
  hoja.set("V1", "Sector");
  hoja.set("W1", "Tamaño");

  participantes.forEach((p, i) => {
    const fila = 2 + i;
    hoja.set(`U${fila}`, p.empresa);
    hoja.set(`V${fila}`, p.sector || SIN_DATO);
    hoja.set(`W${fila}`, p.tamano || SIN_DATO);
  });
  for (let i = participantes.length; i < participantes.length + 60; i++) {
    const fila = 2 + i;
    for (const col of ["U", "V", "W"]) hoja.set(`${col}${fila}`, null);
  }

  const contar = (valores: string[]) => {
    const cuenta = new Map<string, number>();
    for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  };

  const porSector = contar(participantes.map((p) => p.sector || SIN_DATO));
  const porTamano = contar(participantes.map((p) => p.tamano || SIN_DATO));

  hoja.set("Y1", "Sector");
  hoja.set("Z1", "Empresas");
  porSector.forEach(([nombre, n], i) => {
    hoja.set(`Y${2 + i}`, nombre);
    hoja.set(`Z${2 + i}`, n);
  });
  for (let i = porSector.length; i < porSector.length + 30; i++) {
    hoja.set(`Y${2 + i}`, null);
    hoja.set(`Z${2 + i}`, null);
  }

  hoja.set("AB1", "Tamaño");
  hoja.set("AC1", "Empresas");
  porTamano.forEach(([nombre, n], i) => {
    hoja.set(`AB${2 + i}`, nombre);
    hoja.set(`AC${2 + i}`, n);
  });
  for (let i = porTamano.length; i < porTamano.length + 10; i++) {
    hoja.set(`AB${2 + i}`, null);
    hoja.set(`AC${2 + i}`, null);
  }
}
