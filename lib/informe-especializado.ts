/**
 * Informe del Estudio Especializado: rellena la plantilla del cliente.
 *
 * Sale como .xlsx y no .xlsm porque exceljs no conserva las macros. El usuario
 * decidió descartarlas (eran una comodidad para propagar la configuración de
 * comisiones entre hojas, y acá la configuración se escribe ya aplicada).
 *
 * También se pierde el único gráfico nativo, que está en la hoja de dispersión.
 * Los 24 dibujos e imágenes sí se conservan.
 */
import path from "node:path";

import ExcelJS from "exceljs";

import {
  CONCEPTOS,
  PERCENTILES_ORDEN,
  type ConfigSimulador,
  type ConfiguracionInforme,
  type FilaAnalisis,
  type FilaCompetitividad,
  type FilaEquidad,
  type FilaMapaCalor,
  type FilaSimulador,
  type PercentilesGrado,
} from "@/lib/analisis-especializado";

export const HOJAS = {
  inicio: "Inicio",
  empresas: "Empresas Participantes",
  dispersion: "Analisis de Dispersión",
  equidad: "Analisis de Equidad Interna",
  competitividad: "Análisis de Competitividad",
  mapaCalor: "Mapa de Calor",
  mercado: "Data Mercado General",
  simulador: "Simulador de Ajuste Salarial",
} as const;

/** Primera fila de datos de cada hoja, tomadas de la plantilla real. */
const PRIMERA_FILA = {
  empresas: 27,
  dispersion: 13,
  equidad: 13,
  competitividad: 15,
  mapaCalor: 15,
  mercado: 8,
  // Las filas 15 y 16 son la leyenda de desempeño, no datos.
  simulador: 17,
} as const;

export type DatosEspecializado = {
  cliente: string;
  proyecto: string;
  fechaInforme: string;
  fechaData: string;
  version: string;
  empresasParticipantes: string[];
  config: ConfiguracionInforme;
  configSimulador: ConfigSimulador;
  dispersion: FilaAnalisis[];
  equidad: { filas: FilaEquidad[]; indiceGlobal: number | null };
  competitividad: FilaCompetitividad[];
  mapaCalor: FilaMapaCalor[];
  simulador: FilaSimulador[];
  mercadoPorGrado: Map<number, PercentilesGrado>;
};

/** "JUNIO 2026", el formato que usa la plantilla. */
export { mesYAnio as mesYAnioEsp } from "@/lib/informe-cortesia";

export function rutaPlantillaEspecializado(): string {
  return path.join(process.cwd(), "templates", "informe-especializado.xlsm");
}

function set(ws: ExcelJS.Worksheet | undefined, dir: string, valor: string | number | null) {
  if (ws) ws.getCell(dir).value = valor;
}

/** Escribe valores en columnas dadas, de una fila. */
function setFila(ws: ExcelJS.Worksheet, fila: number, pares: Array<[string, string | number | null]>) {
  for (const [col, valor] of pares) ws.getCell(`${col}${fila}`).value = valor;
}

/** Borra las filas de ejemplo que queden debajo de lo escrito. */
function limpiarDesde(ws: ExcelJS.Worksheet, desde: number, columnas: string[], cuantas = 160) {
  for (let i = 0; i < cuantas; i++) {
    for (const col of columnas) ws.getCell(`${col}${desde + i}`).value = null;
  }
}

const COLS_ID = ["A", "B", "C", "D", "E", "F"];

function etiquetaConcepto(c: ConfiguracionInforme["concepto"]) {
  return CONCEPTOS.find((x) => x.clave === c)?.etiqueta ?? "";
}

export async function generarInformeEspecializado(datos: DatosEspecializado): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(rutaPlantillaEspecializado());

  const concepto = etiquetaConcepto(datos.config.concepto);
  const comisiones = datos.config.incluirComisiones ? "Si" : "No";

  // ── Portada ──
  const inicio = wb.getWorksheet(HOJAS.inicio);
  set(inicio, "B12", datos.proyecto);
  set(inicio, "B14", datos.fechaInforme);
  set(inicio, "B16", datos.fechaData);
  set(inicio, "B18", datos.cliente);
  set(inicio, "B20", datos.version);

  // ── Empresas participantes ──
  const hojaEmpresas = wb.getWorksheet(HOJAS.empresas);
  if (hojaEmpresas) {
    set(hojaEmpresas, "I25", `Total: ${datos.empresasParticipantes.length} empresas`);
    const mitad = Math.ceil(datos.empresasParticipantes.length / 2);
    const izq = datos.empresasParticipantes.slice(0, mitad);
    const der = datos.empresasParticipantes.slice(mitad);
    const maximo = Math.max(izq.length, der.length);
    for (let i = 0; i < maximo; i++) {
      setFila(hojaEmpresas, PRIMERA_FILA.empresas + i, [["A", izq[i] ?? null], ["G", der[i] ?? null]]);
    }
    limpiarDesde(hojaEmpresas, PRIMERA_FILA.empresas + maximo, ["A", "G"], 80);
  }

  // ── Dispersión ──
  const disp = wb.getWorksheet(HOJAS.dispersion);
  if (disp) {
    set(disp, "B5", "Grados");
    set(disp, "B6", concepto);
    set(disp, "B7", comisiones);
    datos.dispersion.forEach((f, i) => {
      setFila(disp, PRIMERA_FILA.dispersion + i, [
        ["A", f.empresa], ["B", f.ocupanteId], ["C", f.unidadFuncional],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null],
      ]);
    });
    limpiarDesde(disp, PRIMERA_FILA.dispersion + datos.dispersion.length, COLS_ID);
  }

  // ── Equidad interna ──
  const eq = wb.getWorksheet(HOJAS.equidad);
  if (eq) {
    set(eq, "B5", "Grados");
    set(eq, "B6", concepto);
    set(eq, "B7", datos.config.aperturaBandas);
    set(eq, "B8", comisiones);
    set(eq, "K11", datos.equidad.indiceGlobal);
    datos.equidad.filas.forEach((f, i) => {
      setFila(eq, PRIMERA_FILA.equidad + i, [
        ["A", f.empresa], ["B", f.ocupanteId], ["C", f.unidadFuncional],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null],
        ["G", f.banda?.minimo ?? null], ["H", f.banda?.media ?? null], ["I", f.banda?.maximo ?? null],
        ["J", f.resultado], ["K", f.indice],
      ]);
    });
    limpiarDesde(eq, PRIMERA_FILA.equidad + datos.equidad.filas.length, [...COLS_ID, "G", "H", "I", "J", "K"]);
  }

  // ── Competitividad ──
  // Cada percentil ocupa un par de columnas: mercado y diferencia.
  const PARES_COMP: Array<[string, string]> = [["H", "I"], ["K", "L"], ["N", "O"], ["Q", "R"], ["T", "U"]];
  const comp = wb.getWorksheet(HOJAS.competitividad);
  if (comp) {
    set(comp, "B5", "Grados");
    set(comp, "B7", concepto);
    set(comp, "B8", comisiones);
    datos.competitividad.forEach((f, i) => {
      const fila = PRIMERA_FILA.competitividad + i;
      setFila(comp, fila, [
        ["A", f.empresa], ["B", f.ocupanteId], ["C", f.unidadFuncional],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null], ["G", f.compensacion || null],
      ]);
      PERCENTILES_ORDEN.forEach((p, idx) => {
        const [colMercado, colDif] = PARES_COMP[idx];
        setFila(comp, fila, [[colMercado, f.mercado?.[p] ?? null], [colDif, f.diferencias[idx]]]);
      });
    });
    limpiarDesde(comp, PRIMERA_FILA.competitividad + datos.competitividad.length,
      [...COLS_ID, "G", ...PARES_COMP.flat()]);
  }

  // ── Mapa de calor ──
  // Cada percentil ocupa un trío: máximo, mercado y mínimo, con el margen.
  const TRIOS: Array<[string, string, string]> = [["H", "I", "J"], ["K", "L", "M"], ["N", "O", "P"], ["Q", "R", "S"], ["T", "U", "V"]];
  const mapa = wb.getWorksheet(HOJAS.mapaCalor);
  if (mapa) {
    set(mapa, "B5", "Grados");
    set(mapa, "B6", concepto);
    set(mapa, "B7", datos.config.margenMapaCalor);
    set(mapa, "B8", comisiones);
    const m = datos.config.margenMapaCalor;
    datos.mapaCalor.forEach((f, i) => {
      const fila = PRIMERA_FILA.mapaCalor + i;
      setFila(mapa, fila, [
        ["A", f.empresa], ["B", f.ocupanteId], ["C", f.unidadFuncional],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null],
        ["G", f.compensacion || null], ["H", f.compaRatio],
      ]);
      PERCENTILES_ORDEN.forEach((p, idx) => {
        const [colMax, colMercado, colMin] = TRIOS[idx];
        const valor = f.mercado?.[p] ?? null;
        setFila(mapa, fila, [
          [colMax, valor === null ? null : valor * (1 + m)],
          [colMercado, valor],
          [colMin, valor === null ? null : valor * (1 - m)],
        ]);
      });
    });
    limpiarDesde(mapa, PRIMERA_FILA.mapaCalor + datos.mapaCalor.length, [...COLS_ID, "G", ...TRIOS.flat()]);
  }

  // ── Data de mercado general ──
  const merc = wb.getWorksheet(HOJAS.mercado);
  if (merc) {
    const grados = [...datos.mercadoPorGrado.keys()].sort((a, b) => b - a);
    grados.forEach((grado, i) => {
      const fila = PRIMERA_FILA.mercado + i;
      const p = datos.mercadoPorGrado.get(grado)!;
      setFila(merc, fila, [
        ["A", grado],
        ["B", p.p90], ["C", p.p75], ["D", p.p50], ["E", p.p25], ["F", p.p10],
      ]);
    });
    limpiarDesde(merc, PRIMERA_FILA.mercado + grados.length, ["A", "B", "C", "D", "E", "F"], 40);
  }

  // ── Simulador de ajuste salarial ──
  const sim = wb.getWorksheet(HOJAS.simulador);
  if (sim) {
    set(sim, "B5", "Grados");
    set(sim, "B6", concepto);
    set(sim, "B7", datos.configSimulador.percentil.toUpperCase().replace("P", "P"));
    set(sim, "B8", datos.configSimulador.variacionGeneral);
    set(sim, "B9", datos.configSimulador.variacionMaxima);
    set(sim, "B10", datos.configSimulador.delta);
    set(sim, "B11", comisiones);
    datos.simulador.forEach((f, i) => {
      setFila(sim, PRIMERA_FILA.simulador + i, [
        ["A", f.empresa], ["B", f.ocupanteId], ["C", f.unidadFuncional],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null],
        ["G", f.compensacion || null], ["H", f.mercadoReferencia], ["I", f.compaRatio],
        ["J", f.indiceEquidad], ["K", f.indiceCompuesto],
        // Un porcentaje por calificación de desempeño.
        ["L", f.porcentajesPorDesempeno[0]], ["M", f.porcentajesPorDesempeno[1]],
        ["N", f.porcentajesPorDesempeno[2]], ["O", f.porcentajesPorDesempeno[3]],
        ["P", f.ajusteMinimo], ["Q", f.ajusteMaximo],
      ]);
    });
    // No se tocan R, S ni T: R es el desempeño que llena el cliente a mano y
    // S y T son las fórmulas que lo resuelven.
    limpiarDesde(sim, PRIMERA_FILA.simulador + datos.simulador.length,
      [...COLS_ID, "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"]);
  }

  return wb.xlsx.writeBuffer();
}
