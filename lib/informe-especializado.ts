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

import { MAX_BLOQUES_FIJOS, MAX_BLOQUES_VARIABLES, type DataEmpresa } from "@/lib/data-empresa";
import { LibroPlantilla, type HojaPlantilla } from "@/lib/xlsx-plantilla";

import {
  CONCEPTOS,
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
  mercado: "Data Mercado",
  simulador: "Simulador de Ajuste Salarial",
  mapeo: "Mapeo de cargos",
  dataEmpresa: "Data Empresa",
  contenido: "Contenido",
  listas: "Listas desplegables",
} as const;

/** Primera fila de datos de cada hoja, tomadas de la plantilla real. */
const PRIMERA_FILA = {
  empresas: 28,
  dispersion: 13,
  equidad: 13,
  competitividad: 13,
  mapaCalor: 13,
  mercado: 7,
  // Las filas 15 y 16 son la leyenda de desempeño, no datos.
  simulador: 17,
  dataEmpresa: 13,
} as const;

/** La hoja de data de la empresa llega hasta la columna AQ. */
const COLS_DATA_EMPRESA = (() => {
  const cols: string[] = [];
  for (let i = 1; i <= 43; i++) {
    let n = i, s = "";
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    cols.push(s);
  }
  return cols;
})();

/** Una empresa del corte, para la lista y los dos treemaps. */
export type ParticipanteEspecializado = {
  empresa: string;
  sector: string;
  tamano: string;
};

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
  empresasParticipantes: ParticipanteEspecializado[];
  config: ConfiguracionInforme;
  configSimulador: ConfigSimulador;
  /** Contra qué grupo de mercado se comparó: "Mercado general", un sector, etc. */
  grupoComparacion: string;
  /** Los parámetros con los que se calculó, para la hoja de data de la empresa. */
  parametros: { diasVacaciones: number; diasUtilidades: number; bcv: number | null };
  /** Cuando el estudio va en TCR, con qué referencia y a qué tasa. */
  tcr?: { etiqueta: string; tasa: number } | null;
  dataEmpresa: DataEmpresa;
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

/**
 * Un importe de la hoja de data ocupa tres columnas seguidas: monto, moneda de
 * cuenta y moneda de pago.
 */

function etiquetaConcepto(c: ConfiguracionInforme["concepto"]) {
  return CONCEPTOS.find((x) => x.clave === c)?.etiqueta ?? "";
}

/** El título con que la hoja de mercado encabeza sus percentiles. */
const TITULO_METRICA: Record<ConfiguracionInforme["concepto"], string> = {
  sinPasivosMensual:   "TOTAL EFECTIVO MENSUAL (TEM)",
  directoMensualizado: "TOTAL EFECTIVO MENSUALIZADO (TEMz)",
  conPasivosMensual:   "COMPENSACIÓN INTEGRAL MENSUALIZADA (CIM)",
  conPasivosAnual:     "PAQUETE DE COMPENSACIÓN TOTAL ANUAL (PCTA)",
};

/**
 * Las tres métricas mensuales se leen por mes y el PCTA por año. Las hojas
 * rotulan sus columnas con esto, así que tiene que seguir a la métrica
 * elegida o el informe diría "mensual" sobre cifras anuales.
 */
function frecuenciaDe(c: ConfiguracionInforme["concepto"]): string {
  return c === "conPasivosAnual" ? "USD Anual" : "USD Mensual";
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
const MAPEO_PRIMERA_FILA = 5;
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
        // Una sola celda: "Reporta a: Fulano". Antes iba la etiqueta en una
        // fila y el nombre en la siguiente, y cuando el cliente no cargaba a
        // quién reporta quedaba un "Reporta a:" suelto sin nadie detrás.
        ws.set(`${col}${base + 2}`, c.reportaA ? `Reporta a: ${c.reportaA}` : null);
        ws.set(`${col}${base + 3}`, null);
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

  // Si el estudio va en TCR, el concepto lo dice: si no, el informe parecería
  // estar en dólares BCV y los montos no cuadrarían con nada.
  const concepto = datos.tcr
    ? `${etiquetaConcepto(datos.config.concepto)} — TCR ${datos.tcr.etiqueta}`
    : etiquetaConcepto(datos.config.concepto);
  const comisiones = datos.config.incluirComisiones ? "Si" : "No";

  // "General" cuando entran todas las empresas del corte; "Selecto" cuando se
  // comparó contra un recorte. Lo pidió así AC Consulting.
  const frecuencia = frecuenciaDe(datos.config.concepto);

  const mercadoSeleccionado = datos.grupoComparacion.trim().toLowerCase() === "mercado general"
    ? "General"
    : "Selecto";

  // ── Portada ──
  const inicio = wb.hoja(HOJAS.inicio);
  set(inicio, "B12", datos.proyecto);
  set(inicio, "B14", datos.fechaInforme);
  set(inicio, "B16", datos.fechaData);
  set(inicio, "A18", datos.cliente ? "CLIENTE:" : null);
  set(inicio, "B18", datos.cliente);

  // ── Empresas participantes ──
  // Una tabla de empresa, sector y tamaño desde la fila 28. Los dos treemaps
  // de arriba se dibujan con los COUNTIF de la plantilla sobre estas columnas,
  // así que acá no se escribe ningún conteo.
  const hojaEmpresas = wb.hoja(HOJAS.empresas);
  if (hojaEmpresas) {
    set(hojaEmpresas, "I25", `Total: ${datos.empresasParticipantes.length} empresas`);
    datos.empresasParticipantes.forEach((p, i) => {
      setFila(hojaEmpresas, PRIMERA_FILA.empresas + i, [
        ["A", p.empresa], ["B", p.sector || "ND"], ["C", p.tamano || "ND"],
      ]);
    });
    limpiarDesde(hojaEmpresas, PRIMERA_FILA.empresas + datos.empresasParticipantes.length,
      ["A", "B", "C", "G"], 200);
  }

  // ── Dispersión ──
  const disp = wb.hoja(HOJAS.dispersion);
  if (disp) {
    set(disp, "B5", mercadoSeleccionado);
    set(disp, "B6", concepto);
    set(disp, "B7", comisiones);
    datos.dispersion.forEach((f, i) => {
      setFila(disp, PRIMERA_FILA.dispersion + i, [
        ["A", f.ocupanteId], ["B", f.unidadFuncional], ["C", f.reportaA || null],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null],
      ]);
    });
    limpiarDesde(disp, PRIMERA_FILA.dispersion + datos.dispersion.length, COLS_ID);
  }

  // ── Equidad interna ──
  const eq = wb.hoja(HOJAS.equidad);
  if (eq) {
    set(eq, "B5", mercadoSeleccionado);
    set(eq, "B6", concepto);
    set(eq, "B7", datos.config.aperturaBandas);
    set(eq, "B8", comisiones);
    set(eq, "K11", datos.equidad.indiceGlobal);
    datos.equidad.filas.forEach((f, i) => {
      setFila(eq, PRIMERA_FILA.equidad + i, [
        ["A", f.ocupanteId], ["B", f.unidadFuncional], ["C", f.reportaA || null],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null],
        ["G", f.banda?.minimo ?? null], ["H", f.banda?.media ?? null], ["I", f.banda?.maximo ?? null],
        ["J", f.resultado], ["K", f.indice],
      ]);
    });
    limpiarDesde(eq, PRIMERA_FILA.equidad + datos.equidad.filas.length, [...COLS_ID, "G", "H", "I", "J", "K"]);
  }

  // ── Competitividad ──
  // De la H a la V la hoja se calcula sola: busca cada percentil en "Data
  // Mercado" y saca la diferencia. Escribir esas columnas pisaría las fórmulas.
  const comp = wb.hoja(HOJAS.competitividad);
  if (comp) {
    set(comp, "B5", mercadoSeleccionado);
    set(comp, "B6", concepto);
    set(comp, "B7", comisiones);
    datos.competitividad.forEach((f, i) => {
      setFila(comp, PRIMERA_FILA.competitividad + i, [
        ["A", f.ocupanteId], ["B", f.unidadFuncional], ["C", f.reportaA || null],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null], ["G", f.compensacion || null],
      ]);
    });
    for (const col of ["H", "K", "N", "Q", "T"]) set(comp, `${col}12`, frecuencia);
    limpiarDesde(comp, PRIMERA_FILA.competitividad + datos.competitividad.length, [...COLS_ID, "G"]);
  }

  // ── Mapa de calor ──
  // Los cinco compa-ratios los calcula la hoja contra "Data Mercado".
  const mapa = wb.hoja(HOJAS.mapaCalor);
  if (mapa) {
    set(mapa, "B5", mercadoSeleccionado);
    set(mapa, "B6", concepto);
    set(mapa, "B7", datos.config.margenMapaCalor);
    set(mapa, "B8", comisiones);
    datos.mapaCalor.forEach((f, i) => {
      setFila(mapa, PRIMERA_FILA.mapaCalor + i, [
        ["A", f.ocupanteId], ["B", f.unidadFuncional], ["C", f.reportaA || null],
        ["D", f.tituloCargo], ["E", f.grado], ["F", f.compensacion || null],
        ["G", f.compensacion || null],
      ]);
    });
    for (const col of ["H", "I", "J", "K", "L"]) set(mapa, `${col}12`, frecuencia);
    limpiarDesde(mapa, PRIMERA_FILA.mapaCalor + datos.mapaCalor.length, [...COLS_ID, "G"]);
  }

  // ── Data de mercado general ──
  const merc = wb.hoja(HOJAS.mercado);
  if (merc) {
    set(merc, "B4", TITULO_METRICA[datos.config.concepto]);
    set(merc, "B6", frecuencia);
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

  // ── Data de la empresa ──
  // Solo se escriben las ENTRADAS: las columnas de totales llevan las fórmulas
  // de la plantilla y Excel las recalcula al abrir. La nómina del cliente de
  // ejemplo se borra entera, incluidas sus fórmulas, en las filas sobrantes.
  const dataEmpresa = wb.hoja(HOJAS.dataEmpresa);
  if (dataEmpresa) {
    const { diasVacaciones, diasUtilidades, bcv } = datos.parametros;
    set(dataEmpresa, "B5", diasVacaciones || null);
    set(dataEmpresa, "B6", diasUtilidades || null);
    set(dataEmpresa, "B7", datos.config.incluirComisiones ? "Sí" : "No");
    set(dataEmpresa, "B8", datos.tcr ? `TCR ${datos.tcr.etiqueta}` : "TCR BCV dólar");
    set(dataEmpresa, "C8", datos.tcr ? datos.tcr.tasa : bcv);

    // Un bloque de cinco columnas por concepto que la empresa reportó. Los
    // fijos arrancan en la F y los variables en la AE.
    const { conceptosFijos, conceptosVariables, filas } = datos.dataEmpresa;

    for (let i = 0; i < MAX_BLOQUES_FIJOS; i++) {
      set(dataEmpresa, `${COLS_DATA_EMPRESA[5 + i * 5]}11`, conceptosFijos[i] ?? null);
    }
    for (let i = 0; i < MAX_BLOQUES_VARIABLES; i++) {
      set(dataEmpresa, `${COLS_DATA_EMPRESA[30 + i * 5]}11`, conceptosVariables[i] ?? null);
    }

    const primera = PRIMERA_FILA.dataEmpresa;
    limpiarDesde(dataEmpresa, primera, COLS_DATA_EMPRESA, filas.length + 60);

    filas.forEach((f, i) => {
      const fila = primera + i;
      setFila(dataEmpresa, fila, [
        ["A", f.ocupanteId], ["B", f.unidadFuncional], ["C", f.reportaA || null],
        ["D", f.tituloCargo], ["E", f.grado],
        ["AO", f.metrica], ["AP", f.metricaTcr],
      ]);
      const escribirBloque = (celda: { monto: number | null; cuenta: string | null; pago: string | null; impacto: string | null; frecuencia: string | null }, desde: number) => {
        setFila(dataEmpresa, fila, [
          [COLS_DATA_EMPRESA[desde],     celda.monto],
          [COLS_DATA_EMPRESA[desde + 1], celda.cuenta],
          [COLS_DATA_EMPRESA[desde + 2], celda.pago],
          [COLS_DATA_EMPRESA[desde + 3], celda.impacto],
          [COLS_DATA_EMPRESA[desde + 4], celda.frecuencia],
        ]);
      };
      f.fijos.forEach((celda, idx) => escribirBloque(celda, 5 + idx * 5));
      f.variables.forEach((celda, idx) => escribirBloque(celda, 30 + idx * 5));
    });
  }

  // La lista del desplegable de "Compañía / Unidad" trae los grupos de
  // comparación del cliente de ejemplo, con nombres de empresas reales.
  const listas = wb.hoja(HOJAS.listas);
  if (listas) {
    set(listas, "D3", datos.grupoComparacion || "Mercado general");
    for (const fila of [4, 5, 6, 7, 8]) set(listas, `D${fila}`, null);
  }

  // El título de esta hoja es un cuadro de texto, no una celda.
  wb.reemplazarEnFormas("DATA SALARIAL: TEALCA", `DATA SALARIAL: ${datos.cliente || "—"}`);

  // El índice también nombra al cliente de ejemplo.
  const contenido = wb.hoja(HOJAS.contenido);
  if (contenido) set(contenido, "C9", `DATA ${(datos.cliente || "—").toUpperCase()}`);

  return wb.aBuffer();
}
