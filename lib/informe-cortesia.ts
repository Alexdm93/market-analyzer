/**
 * Informe de cortesía: el que recibe toda empresa que participó en un corte y
 * envió su data.
 *
 * No se genera un libro desde cero: se **rellena la plantilla del cliente**
 * (`templates/informe-cortesia.xlsx`), que trae portada, agradecimiento,
 * índice, páginas institucionales, logos y diseño. Se comprobó que exceljs
 * conserva las 11 hojas y las 13 imágenes en un ciclo de lectura y escritura,
 * y que la plantilla no tiene gráficos nativos (que exceljs sí perdería).
 *
 * Solo se escriben las celdas de datos; todo lo demás queda como lo diseñaron.
 */
import path from "node:path";

import ExcelJS from "exceljs";

export const HOJA_INICIO = "Inicio";
export const HOJA_EMPRESAS = "Empresas Participantes";
export const HOJA_MARKET = "Market Analyzer";
export const HOJA_DISTRIBUCION = "Distribución de Compensación";
export const HOJA_CONTENIDO = "F - Contenido";

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
  primeraEmpresaCol1: 30,
  primeraEmpresaCol2: 30,
  filaCargos: 7,
} as const;

export type EstadisticaMercado = {
  p50: number | null;
  promedio: number | null;
  min: number | null;
  max: number | null;
};

export type GrupoMercado = {
  tituloCargo: string;
  n: number;
  tem: EstadisticaMercado;
  temz: EstadisticaMercado;
  cim: EstadisticaMercado;
  pcta: EstadisticaMercado;
};

/** Las cuatro métricas que pidió el CEO, en el orden en que van en el informe. */
export const METRICAS_CORTESIA = [
  { clave: "tem"  as const, titulo: "TEM — Total Efectivo Mensual" },
  { clave: "temz" as const, titulo: "TEMz — Total Efectivo Mensualizado" },
  { clave: "cim"  as const, titulo: "CIM — Compensación Integral Mensualizada" },
  { clave: "pcta" as const, titulo: "PCTA — Paquete de Compensación Total Anual" },
];

export type FilaDistribucionInforme = {
  nivel: string;
  valores: number[];
};

export type DatosCortesia = {
  tituloEstudio: string;
  /** Vacío genera el informe genérico, sin empresa en la portada. */
  cliente: string;
  fechaInforme: string;
  fechaData: string;
  empresas: string[];
  cargos: GrupoMercado[];
  distribucion: FilaDistribucionInforme[];
  categoriasDistribucion: string[];
  /** Secciones que realmente lleva el informe, para reescribir el índice. */
  secciones: string[];
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
 * Escribe un valor conservando el formato de la celda. exceljs mantiene el
 * estilo al reemplazar solo `.value`, que es justamente lo que interesa: la
 * plantilla ya tiene el tipo de letra, los bordes y los formatos numéricos.
 */
function escribir(ws: ExcelJS.Worksheet, direccion: string, valor: string | number | null) {
  ws.getCell(direccion).value = valor;
}

export async function generarInformeCortesia(datos: DatosCortesia): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(rutaPlantillaCortesia());

  // ── Portada ──
  const inicio = wb.getWorksheet(HOJA_INICIO);
  if (inicio) {
    escribir(inicio, CELDA.titulo, datos.tituloEstudio);
    escribir(inicio, CELDA.fechaInforme, datos.fechaInforme);
    escribir(inicio, CELDA.fechaData, datos.fechaData);
    escribir(inicio, CELDA.etiquetaCliente, datos.cliente ? "CLIENTE:" : null);
    escribir(inicio, CELDA.cliente, datos.cliente || null);
  }

  // ── Empresas participantes ──
  const hojaEmpresas = wb.getWorksheet(HOJA_EMPRESAS);
  if (hojaEmpresas) {
    escribir(hojaEmpresas, CELDA.totalEmpresas, `Total: ${datos.empresas.length} empresas`);

    // La plantilla las reparte en dos columnas (A y G), en orden alfabético y
    // llenando primero la izquierda.
    const mitad = Math.ceil(datos.empresas.length / 2);
    const izquierda = datos.empresas.slice(0, mitad);
    const derecha = datos.empresas.slice(mitad);
    const maximo = Math.max(izquierda.length, derecha.length);

    for (let i = 0; i < maximo; i++) {
      const fila = CELDA.primeraEmpresaCol1 + i;
      escribir(hojaEmpresas, `A${fila}`, izquierda[i] ?? null);
      escribir(hojaEmpresas, `G${fila}`, derecha[i] ?? null);
    }
    // Limpia lo que hubiera quedado del ejemplo más abajo.
    for (let i = maximo; i < maximo + 60; i++) {
      const fila = CELDA.primeraEmpresaCol1 + i;
      escribir(hojaEmpresas, `A${fila}`, null);
      escribir(hojaEmpresas, `G${fila}`, null);
    }
  }

  // ── Market Analyzer ──
  // La hoja está diseñada para UNA métrica y ahora van cuatro. Se apilan en
  // bloques dentro del mismo ancho de columnas (A a F) en vez de crecer a lo
  // ancho, que dejaría las columnas nuevas fuera del área con formato.
  const hojaMarket = wb.getWorksheet(HOJA_MARKET);
  if (hojaMarket) {
    const estiloTitulo = hojaMarket.getCell("A6").style;
    let fila = CELDA.filaCargos;

    for (const metrica of METRICAS_CORTESIA) {
      const filaTitulo = fila - 1;
      const celdaTitulo = hojaMarket.getCell(`A${filaTitulo}`);
      celdaTitulo.value = metrica.titulo;
      celdaTitulo.style = { ...estiloTitulo };
      for (const col of ["B", "C", "D", "E", "F"]) {
        const c = hojaMarket.getCell(`${col}${filaTitulo}`);
        c.value = { tem: "P50 (Mediana)", temz: "P50 (Mediana)", cim: "P50 (Mediana)", pcta: "P50 (Mediana)" }[metrica.clave] && col === "B"
          ? "P50 (Mediana)"
          : col === "C" ? "Promedio" : col === "D" ? "Minimo" : col === "E" ? "Maximo" : col === "F" ? "Participantes" : null;
        c.style = { ...estiloTitulo };
      }

      datos.cargos.forEach((cargo, i) => {
        const f = fila + i;
        const e = cargo[metrica.clave];
        escribir(hojaMarket, `A${f}`, cargo.tituloCargo);
        escribir(hojaMarket, `B${f}`, e.p50);
        escribir(hojaMarket, `C${f}`, e.promedio);
        escribir(hojaMarket, `D${f}`, e.min);
        escribir(hojaMarket, `E${f}`, e.max);
        escribir(hojaMarket, `F${f}`, cargo.n);
      });

      fila += datos.cargos.length + 3; // hueco entre bloques
    }

    // La plantilla trae ~113 cargos de ejemplo: se borra lo que quede debajo.
    for (let i = 0; i < 160; i++) {
      const f = fila + i;
      for (const col of ["A", "B", "C", "D", "E", "F"]) escribir(hojaMarket, `${col}${f}`, null);
    }
  }

  // ── Distribución de compensación ──
  const hojaDist = wb.getWorksheet(HOJA_DISTRIBUCION);
  if (hojaDist) {
    const estiloCabecera = hojaDist.getCell("A8").style;
    const columnas = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

    // Cabecera: "Niveles" más las ocho categorías del CEO.
    ["Niveles", ...datos.categoriasDistribucion].forEach((titulo, i) => {
      const c = hojaDist.getCell(`${columnas[i]}8`);
      c.value = titulo;
      c.style = { ...estiloCabecera };
    });
    // Se limpian las columnas que sobran de la cabecera vieja.
    for (let i = datos.categoriasDistribucion.length + 1; i < 12; i++) {
      escribir(hojaDist, `${String.fromCharCode(65 + i)}8`, null);
    }

    datos.distribucion.forEach((f, idx) => {
      const fila = 9 + idx;
      escribir(hojaDist, `A${fila}`, f.nivel);
      f.valores.forEach((v, i) => escribir(hojaDist, `${columnas[i + 1]}${fila}`, v));
      for (let i = f.valores.length + 1; i < 12; i++) {
        escribir(hojaDist, `${String.fromCharCode(65 + i)}${fila}`, null);
      }
    });
    // La plantilla traía siete niveles y ahora son seis.
    for (let i = datos.distribucion.length; i < datos.distribucion.length + 4; i++) {
      const fila = 9 + i;
      for (let c = 0; c < 12; c++) escribir(hojaDist, `${String.fromCharCode(65 + c)}${fila}`, null);
    }
  }

  // ── Índice ──
  // El CEO sacó del índice las secciones que se publicarán como informe aparte.
  const hojaContenido = wb.getWorksheet(HOJA_CONTENIDO);
  if (hojaContenido) {
    const primeraFila = 3;
    datos.secciones.forEach((seccion, i) => escribir(hojaContenido, `B${primeraFila + i}`, seccion));
    for (let i = datos.secciones.length; i < datos.secciones.length + 10; i++) {
      escribir(hojaContenido, `B${primeraFila + i}`, null);
    }
  }

  return wb.xlsx.writeBuffer();
}
