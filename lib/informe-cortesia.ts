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

/** Direcciones tomadas de la plantilla real, no inventadas. */
const CELDA = {
  titulo: "A12",
  fechaInforme: "B14",
  fechaData: "B16",
  totalEmpresas: "I28",
  primeraEmpresaCol1: 30,
  primeraEmpresaCol2: 30,
  filaCargos: 7,
} as const;

export type GrupoMercado = {
  tituloCargo: string;
  n: number;
  p50: number | null;
  promedio: number | null;
  min: number | null;
  max: number | null;
};

export type DatosCortesia = {
  tituloEstudio: string;
  fechaInforme: string;
  fechaData: string;
  empresas: string[];
  cargos: GrupoMercado[];
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
  const hojaMarket = wb.getWorksheet(HOJA_MARKET);
  if (hojaMarket) {
    datos.cargos.forEach((c, i) => {
      const fila = CELDA.filaCargos + i;
      escribir(hojaMarket, `A${fila}`, c.tituloCargo);
      escribir(hojaMarket, `B${fila}`, c.p50);
      escribir(hojaMarket, `C${fila}`, c.promedio);
      escribir(hojaMarket, `D${fila}`, c.min);
      escribir(hojaMarket, `E${fila}`, c.max);
      escribir(hojaMarket, `F${fila}`, c.n);
    });
    // La plantilla trae ~113 cargos de ejemplo; se borra lo que sobre.
    for (let i = datos.cargos.length; i < datos.cargos.length + 150; i++) {
      const fila = CELDA.filaCargos + i;
      for (const col of ["A", "B", "C", "D", "E", "F"]) escribir(hojaMarket, `${col}${fila}`, null);
    }
  }

  return wb.xlsx.writeBuffer();
}
