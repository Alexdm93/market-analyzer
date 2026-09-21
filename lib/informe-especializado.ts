/**
 * Informe del Estudio Especializado: rellena la plantilla del cliente.
 *
 * Se parchea el XML de la plantilla (ver `lib/xlsx-plantilla.ts`) en vez de
 * reescribir el libro. Así llegan intactos los 81 formatos condicionales, el
 * gráfico de la hoja de dispersión, los 21 cuadros de texto y las 18 imágenes.
 *
 * Sale como .xlsx y no .xlsm: se quita el proyecto VBA para que Excel no avise
 * de macros. El usuario decidió descartarlas (eran una comodidad para propagar
 * la configuración de comisiones entre hojas, y acá se escribe ya aplicada).
 */
import path from "node:path";

import { LibroPlantilla, type HojaPlantilla } from "@/lib/xlsx-plantilla";

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
  mapeo: "Mapeo de cargos",
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

export type CargoMapeado = {
  grado: number;
  area: string;
  tituloCargo: string;
  unidadFuncional: string;
  reportaA: string;
};

export type DatosEspecializado = {
  cliente: string;
  proyecto: string;
  fechaInforme: string;
  fechaData: string;
  version: string;
  empresasParticipantes: string[];
  config: ConfiguracionInforme;
  configSimulador: ConfigSimulador;
  /** Contra qué grupo de mercado se comparó: "Transversales", un sector, etc. */
  grupoComparacion: string;
  dispersion: FilaAnalisis[];
  equidad: { filas: FilaEquidad[]; indiceGlobal: number | null };
  competitividad: FilaCompetitividad[];
  mapaCalor: FilaMapaCalor[];
  simulador: FilaSimulador[];
  mercadoPorGrado: Map<number, PercentilesGrado>;
  mapeo: CargoMapeado[];
};

/** "JUNIO 2026", el formato que usa la plantilla. */
export { mesYAnio as mesYAnioEsp } from "@/lib/informe-cortesia";

export function rutaPlantillaEspecializado(): string {
  return path.join(process.cwd(), "templates", "informe-especializado.xlsm");
}

function set(ws: HojaPlantilla | undefined, dir: string, valor: string | number | null) {
  ws?.set(dir, valor);
}

/** Escribe valores en columnas dadas, de una fila. */
function setFila(ws: HojaPlantilla, fila: number, pares: Array<[string, string | number | null]>) {
  for (const [col, valor] of pares) ws.set(`${col}${fila}`, valor);
}

/** Borra las filas de ejemplo que queden debajo de lo escrito. */
function limpiarDesde(ws: HojaPlantilla, desde: number, columnas: string[], cuantas = 160) {
  for (let i = 0; i < cuantas; i++) {
    for (const col of columnas) ws.set(`${col}${desde + i}`, null);
  }
}

const COLS_ID = ["A", "B", "C", "D", "E", "F"];

function etiquetaConcepto(c: ConfiguracionInforme["concepto"]) {
  return CONCEPTOS.find((x) => x.clave === c)?.etiqueta ?? "";
}


/**
 * Hoja "Mapeo de cargos": la cuadrícula de grado × área funcional.
 *
 * Cada cargo ocupa cuatro filas — título, unidad funcional, "Reporta a:" y el
 * cargo padre — y los cargos de un mismo grado se apilan con una fila en
 * blanco entre ellos. La altura de la banda de un grado la marca el área que
 * más cargos tenga.
 *
 * Las áreas salen de las unidades funcionales de la propia empresa, no de las
 * de la plantilla. Y hay que rehacer las combinaciones: las 119 que trae el
 * archivo están atadas a la estructura del cliente del ejemplo.
 */
const MAPEO_PRIMERA_FILA = 6;
const MAPEO_FILAS_POR_CARGO = 4;
const MAPEO_COLUMNAS = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];

function escribirMapeo(ws: HojaPlantilla, cargos: CargoMapeado[]): string[] {
  // Las combinaciones de la plantilla no sirven para otra empresa.
  ws.limpiarCombinaciones();

  const areas = [...new Set(cargos.map((c) => c.area || "Sin unidad"))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .slice(0, MAPEO_COLUMNAS.length);

  // Cabecera de áreas
  areas.forEach((area, i) => { ws.set(`${MAPEO_COLUMNAS[i]}4`, area); });
  for (let i = areas.length; i < MAPEO_COLUMNAS.length; i++) {
    ws.set(`${MAPEO_COLUMNAS[i]}4`, null);
  }

  const grados = [...new Set(cargos.map((c) => c.grado))].sort((a, b) => b - a);
  let fila = MAPEO_PRIMERA_FILA;

  for (const grado of grados) {
    const delGrado = cargos.filter((c) => c.grado === grado);
    const porArea = new Map<string, CargoMapeado[]>();
    for (const c of delGrado) {
      const area = c.area || "Sin unidad";
      const lista = porArea.get(area) ?? [];
      lista.push(c);
      porArea.set(area, lista);
    }

    const maxApilados = Math.max(...[...porArea.values()].map((l) => l.length));
    const alto = maxApilados * MAPEO_FILAS_POR_CARGO + (maxApilados - 1);

    ws.set(`A${fila}`, grado);
    if (alto > 1) ws.combinar(`A${fila}:A${fila + alto - 1}`);

    areas.forEach((area, i) => {
      const col = MAPEO_COLUMNAS[i];
      const lista = porArea.get(area) ?? [];

      lista.forEach((c, idx) => {
        const base = fila + idx * (MAPEO_FILAS_POR_CARGO + 1);
        ws.set(`${col}${base}`, c.tituloCargo);
        ws.set(`${col}${base + 1}`, c.unidadFuncional);
        ws.set(`${col}${base + 2}`, c.reportaA ? "Reporta a:" : null);
        ws.set(`${col}${base + 3}`, c.reportaA || null);
      });

      // Lo que sobra de la banda se limpia y se combina, como en la plantilla.
      const ocupadas = lista.length * (MAPEO_FILAS_POR_CARGO + 1) - (lista.length > 0 ? 1 : 0);
      for (let f = fila + ocupadas; f < fila + alto; f++) ws.set(`${col}${f}`, null);
      if (lista.length === 0 && alto > 1) ws.combinar(`${col}${fila}:${col}${fila + alto - 1}`);
    });

    // La fila separadora entre bandas también hay que limpiarla: si no, se
    // asoman los datos del cliente de ejemplo que trae la plantilla.
    const separadora = fila + alto;
    ws.set(`A${separadora}`, null);
    for (const col of MAPEO_COLUMNAS) ws.set(`${col}${separadora}`, null);

    fila += alto + 1;
  }

  // Se borra lo que quede de la plantilla más abajo.
  for (let f = fila; f < fila + 160; f++) {
    ws.set(`A${f}`, null);
    for (const col of MAPEO_COLUMNAS) ws.set(`${col}${f}`, null);
  }

  return areas;
}

export async function generarInformeEspecializado(datos: DatosEspecializado): Promise<Buffer> {
  const wb = await LibroPlantilla.abrir(rutaPlantillaEspecializado());
  // La plantilla es .xlsm y se entrega como .xlsx: sin el proyecto VBA, Excel
  // no avisa de macros. Todo lo demás —gráfico, formatos condicionales,
  // cuadros de texto— viaja intacto.
  wb.sinMacros();

  const concepto = etiquetaConcepto(datos.config.concepto);
  const comisiones = datos.config.incluirComisiones ? "Si" : "No";

  // ── Portada ──
  const inicio = wb.hoja(HOJAS.inicio);
  set(inicio, "B12", datos.proyecto);
  set(inicio, "B14", datos.fechaInforme);
  set(inicio, "B16", datos.fechaData);
  set(inicio, "B18", datos.cliente);
  set(inicio, "B20", datos.version);

  // ── Empresas participantes ──
  const hojaEmpresas = wb.hoja(HOJAS.empresas);
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
  const disp = wb.hoja(HOJAS.dispersion);
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
  const eq = wb.hoja(HOJAS.equidad);
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
  const comp = wb.hoja(HOJAS.competitividad);
  if (comp) {
    set(comp, "B5", "Grados");
    set(comp, "B6", datos.grupoComparacion);
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
  const mapa = wb.hoja(HOJAS.mapaCalor);
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
  const merc = wb.hoja(HOJAS.mercado);
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
  const sim = wb.hoja(HOJAS.simulador);
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

  // ── Mapeo de cargos ──
  const mapeo = wb.hoja(HOJAS.mapeo);
  if (mapeo && datos.mapeo.length > 0) escribirMapeo(mapeo, datos.mapeo);

  return wb.aBuffer();
}
