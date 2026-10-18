/**
 * Informe del Estudio de Competitividad: rellena la plantilla del cliente.
 *
 * Son **dos** informes, no uno. AC Consulting partió la plantilla según contra
 * qué se compara (2026-10-14):
 *
 *  - **por grados CAPRI**: lleva Valoración, Mapeo de cargos, Dispersión y
 *    Equidad Interna, y busca el mercado por grado;
 *  - **por cargos homologados**: no lleva ninguna de esas cuatro, suma una
 *    hoja de Información Empresa y busca el mercado por el nombre del cargo.
 *
 * Fuera de eso son hermanas: las mismas hojas con las mismas celdas, salvo que
 * la de cargos no tiene la columna de grado y todo lo que va a su derecha se
 * corre una posición. Por eso acá hay un solo generador con un mapa de celdas
 * por variante, en vez de dos archivos que se irían separando solos.
 *
 * Se parchea el XML de la plantilla (ver `lib/xlsx-plantilla.ts`) en vez de
 * reescribir el libro: así llegan intactos los formatos condicionales, el
 * gráfico de dispersión, los cuadros de texto y las imágenes. Y la protección
 * de hojas, que es lo que impide que el cliente vea las fórmulas.
 */
import path from "node:path";

import { type DataEmpresa } from "@/lib/data-empresa";
import { type Tendencia } from "@/lib/tendencia-compensacion";
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

/** Contra qué se compara el estudio. Decide qué plantilla se rellena. */
export type VarianteInforme = "grados" | "cargos";

export const HOJAS = {
  portada: "Portada",
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
  distribucion: "Distribución de Compensación",
} as const;

/** Primera fila de datos de cada hoja, tomadas de las plantillas reales. */
const PRIMERA_FILA = {
  empresas: 33,
  dispersion: 10,
  equidad: 11,
  competitividad: 11,
  mapaCalor: 11,
  mercado: 7,
  simulador: 15,
  dataEmpresa: 13,
} as const;

/** Hasta dónde llegan dibujadas las tablas de la plantilla. */
const ULTIMA_FILA = {
  empresas: 620,
  analisis: 1010,
  dataEmpresa: 1048,
  mercado: 215,
} as const;

/** "A", "B", … "AQ". */
const COLS = (() => {
  const cols: string[] = [];
  for (let i = 1; i <= 45; i++) {
    let n = i, s = "";
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    cols.push(s);
  }
  return cols;
})();

/**
 * Lo que cambia de una variante a la otra.
 *
 * La de cargos no tiene columna de grado, así que el monto y todo lo que sigue
 * se corre una posición a la izquierda.
 */
type MapaVariante = {
  archivo: string;
  /** Columna donde va el grado en las hojas de análisis, o null. */
  colGrado: string | null;
  /** Columna del monto de la métrica. */
  colMonto: string;
  /** Columna del cargo homologado, solo en la variante por cargos. */
  colHomologado: string | null;
  dataEmpresa: {
    /** Índice en COLS del primer bloque de compensación fija. */
    primerFijo: number;
    primerVariable: number;
    colMetrica: string;
    ultimaCol: string;
    maxFijos: number;
    maxVariables: number;
  };
  /** La hoja de mercado se indexa por grado o por nombre de cargo. */
  mercadoPorCargo: boolean;
};

const VARIANTES: Record<VarianteInforme, MapaVariante> = {
  grados: {
    archivo: "informe-competitividad-grados.xlsx",
    colGrado: "E",
    colMonto: "F",
    colHomologado: null,
    dataEmpresa: { primerFijo: 5, primerVariable: 30, colMetrica: "AO", ultimaCol: "AP", maxFijos: 5, maxVariables: 2 },
    mercadoPorCargo: false,
  },
  cargos: {
    archivo: "informe-competitividad-cargos.xlsx",
    colGrado: null,
    colMonto: "E",
    colHomologado: "F",
    dataEmpresa: { primerFijo: 4, primerVariable: 29, colMetrica: "AN", ultimaCol: "AO", maxFijos: 5, maxVariables: 2 },
    mercadoPorCargo: true,
  },
};

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

/** Una fila de la hoja de mercado cuando se compara por cargo homologado. */
export type MercadoPorCargo = PercentilesGrado & {
  tituloCargo: string;
  promedio: number | null;
  minimo: number | null;
  maximo: number | null;
};

export type DatosEspecializado = {
  variante: VarianteInforme;
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
  /** La curva elegida para la dispersión, y con ella el punto medio de equidad. */
  tendencia: Tendencia | null;
  equidad: { filas: FilaEquidad[]; indiceGlobal: number | null };
  competitividad: FilaCompetitividad[];
  mapaCalor: FilaMapaCalor[];
  simulador: FilaSimulador[];
  mercadoPorGrado: Map<number, PercentilesGrado>;
  mercadoPorCargo: MercadoPorCargo[];
  mapeo: CargoMapeado[];
};

/** "JUNIO 2026", el formato que usa la plantilla. */
export { mesYAnio as mesYAnioEsp } from "@/lib/informe-cortesia";

export function rutaPlantillaEspecializado(variante: VarianteInforme): string {
  return path.join(process.cwd(), "templates", VARIANTES[variante].archivo);
}

function set(ws: HojaPlantilla | undefined, dir: string, valor: string | number | null) {
  ws?.set(dir, valor);
}

function setFila(ws: HojaPlantilla, fila: number, pares: Array<[string, string | number | null]>) {
  for (const [col, valor] of pares) ws.set(`${col}${fila}`, valor);
}

/** Borra las filas de ejemplo que queden debajo de lo escrito. */
function limpiarHasta(ws: HojaPlantilla, desde: number, hasta: number, columnas: string[]) {
  for (let f = desde; f <= hasta; f++) {
    for (const col of columnas) ws.set(`${col}${f}`, null);
  }
}

function etiquetaConcepto(c: ConfiguracionInforme["concepto"]) {
  return CONCEPTOS.find((x) => x.clave === c)?.etiqueta ?? "";
}

/**
 * El nombre corto de la métrica, el que va en la cabecera de la columna de
 * montos. La plantilla trae ahí "TEM / TEMz / CIM / PCTA" como marcador.
 */
const SIGLA_METRICA: Record<ConfiguracionInforme["concepto"], string> = {
  sinPasivosMensual:   "TEM",
  directoMensualizado: "TEMz",
  conPasivosMensual:   "CIM",
  conPasivosAnual:     "PCTA",
};

/** El título con que la hoja de mercado encabeza sus percentiles. */
const TITULO_METRICA: Record<ConfiguracionInforme["concepto"], string> = {
  sinPasivosMensual:   "TOTAL EFECTIVO MENSUAL (TEM)",
  directoMensualizado: "TOTAL EFECTIVO MENSUALIZADO (TEMz)",
  conPasivosMensual:   "COMPENSACIÓN INTEGRAL MENSUALIZADA (CIM)",
  conPasivosAnual:     "PAQUETE DE COMPENSACIÓN TOTAL ANUAL (PCTA)",
};

/**
 * Hoja "Mapeo de cargos": la cuadrícula de grado × área funcional.
 *
 * Cada cargo ocupa cuatro filas — título, unidad funcional, "Reporta a:" y una
 * en blanco — y los cargos de un mismo grado se apilan con una fila de
 * separación. La altura de la banda de un grado la marca el área que más
 * cargos tenga.
 *
 * Las áreas salen de las unidades funcionales de la propia empresa, no de las
 * de la plantilla, así que hay que rehacer las combinaciones.
 */
const MAPEO_PRIMERA_FILA = 5;
const MAPEO_FILAS_POR_CARGO = 4;
const MAPEO_COLUMNAS = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];

function escribirMapeo(ws: HojaPlantilla, cargos: CargoMapeado[]): string[] {
  ws.limpiarCombinaciones();

  const areas = [...new Set(cargos.map((c) => c.area || "Sin unidad"))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .slice(0, MAPEO_COLUMNAS.length);

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
        // Una sola celda: "Reporta a: Fulano". Si va la etiqueta en una fila y
        // el nombre en la siguiente, cuando el cliente no lo cargó queda un
        // "Reporta a:" suelto sin nadie detrás.
        ws.set(`${col}${base + 2}`, c.reportaA ? `Reporta a: ${c.reportaA}` : null);
        ws.set(`${col}${base + 3}`, null);
      });

      const ocupadas = lista.length * (MAPEO_FILAS_POR_CARGO + 1) - (lista.length > 0 ? 1 : 0);
      for (let f = fila + ocupadas; f < fila + alto; f++) ws.set(`${col}${f}`, null);
      if (lista.length === 0 && alto > 1) ws.combinar(`${col}${fila}:${col}${fila + alto - 1}`);
    });

    const separadora = fila + alto;
    ws.set(`A${separadora}`, null);
    for (const col of MAPEO_COLUMNAS) ws.set(`${col}${separadora}`, null);

    fila += alto + 1;
  }

  for (let f = fila; f < fila + 160; f++) {
    ws.set(`A${f}`, null);
    for (const col of MAPEO_COLUMNAS) ws.set(`${col}${f}`, null);
  }

  return areas;
}

export async function generarInformeEspecializado(datos: DatosEspecializado): Promise<Buffer> {
  const mapa = VARIANTES[datos.variante];
  const wb = await LibroPlantilla.abrir(rutaPlantillaEspecializado(datos.variante));

  // Si el estudio va en TCR, la métrica lo dice: si no, el informe parecería
  // estar en dólares BCV y los montos no cuadrarían con nada.
  const metrica = datos.tcr
    ? `${etiquetaConcepto(datos.config.concepto)} — TCR ${datos.tcr.etiqueta}`
    : etiquetaConcepto(datos.config.concepto);
  const sigla = SIGLA_METRICA[datos.config.concepto];

  /** Las columnas de identificación de las hojas de análisis. */
  const colsId = ["A", "B", "C", "D", mapa.colMonto, ...(mapa.colGrado ? [mapa.colGrado] : []), ...(mapa.colHomologado ? [mapa.colHomologado] : [])];

  /** Lo que identifica a una fila en una hoja de análisis, en orden. */
  const identidad = (f: FilaAnalisis): Array<[string, string | number | null]> => [
    ["A", f.ocupanteId], ["B", f.unidadFuncional], ["C", f.reportaA || null], ["D", f.tituloCargo],
    ...(mapa.colGrado ? ([[mapa.colGrado, f.grado]] as Array<[string, string | number | null]>) : []),
    [mapa.colMonto, f.compensacion || null],
    ...(mapa.colHomologado ? ([[mapa.colHomologado, f.cargoHomologado ?? f.tituloCargo]] as Array<[string, string | number | null]>) : []),
  ];

  // ── Portada ──
  // El título ya viene escrito en la plantilla; acá van los cuatro datos del
  // informe. Las etiquetas corrieron una fila al entrar "ORIGEN DATA"
  // (AC Consulting, 2026-10-18).
  const portada = wb.hoja(HOJAS.portada);
  set(portada, "B14", datos.proyecto);
  set(portada, "B16", datos.fechaData);
  set(portada, "B18", datos.fechaInforme);
  set(portada, "B22", datos.cliente || null);

  // ── Empresas participantes ──
  // Los dos treemaps se dibujan con los COUNTIF de la plantilla sobre estas
  // columnas, así que acá no se escribe ningún conteo.
  const hojaEmpresas = wb.hoja(HOJAS.empresas);
  if (hojaEmpresas) {
    datos.empresasParticipantes.forEach((p, i) => {
      setFila(hojaEmpresas, PRIMERA_FILA.empresas + i, [
        ["A", p.empresa], ["B", p.sector || "ND"], ["C", p.tamano || "ND"],
      ]);
    });
    limpiarHasta(hojaEmpresas, PRIMERA_FILA.empresas + datos.empresasParticipantes.length,
      ULTIMA_FILA.empresas, ["A", "B", "C"]);
  }

  // ── Dispersión ──
  const disp = wb.hoja(HOJAS.dispersion);
  if (disp) {
    set(disp, "B5", metrica);
    set(disp, `${mapa.colMonto}7`, sigla);
    datos.dispersion.forEach((f, i) => setFila(disp, PRIMERA_FILA.dispersion + i, identidad(f)));
    limpiarHasta(disp, PRIMERA_FILA.dispersion + datos.dispersion.length, ULTIMA_FILA.analisis, colsId);

    // La ecuación de la curva y su bondad de ajuste, que es de donde sale el
    // punto medio de las bandas de equidad.
    set(disp, "I10", datos.tendencia?.formula ?? null);
    set(disp, "I11", datos.tendencia ? Number(datos.tendencia.r2.toFixed(4)) : null);
  }

  // ── Equidad interna ──
  const eq = wb.hoja(HOJAS.equidad);
  if (eq) {
    set(eq, "B5", metrica);
    set(eq, "B6", datos.config.aperturaBandas);
    set(eq, `${mapa.colMonto}8`, sigla);
    set(eq, "K9", datos.equidad.indiceGlobal);
    datos.equidad.filas.forEach((f, i) => {
      // El mínimo y el máximo los calcula la hoja a partir de la media y de la
      // apertura; acá solo va la media, que es la curva evaluada en su grado.
      setFila(eq, PRIMERA_FILA.equidad + i, [...identidad(f), ["H", f.banda?.media ?? null]]);
    });
    limpiarHasta(eq, PRIMERA_FILA.equidad + datos.equidad.filas.length, ULTIMA_FILA.analisis, [...colsId, "H"]);
  }

  // ── Competitividad ──
  // De la G en adelante la hoja se calcula sola: busca cada percentil en "Data
  // Mercado" y saca la diferencia. Escribir esas columnas pisaría las fórmulas.
  const comp = wb.hoja(HOJAS.competitividad);
  if (comp) {
    set(comp, "B5", metrica);
    set(comp, `${mapa.colMonto}7`, sigla);
    datos.competitividad.forEach((f, i) => setFila(comp, PRIMERA_FILA.competitividad + i, identidad(f)));
    limpiarHasta(comp, PRIMERA_FILA.competitividad + datos.competitividad.length, ULTIMA_FILA.analisis, colsId);
  }

  // ── Mapa de calor ──
  // Los cinco compa-ratios los calcula la hoja contra "Data Mercado".
  const mapaCalor = wb.hoja(HOJAS.mapaCalor);
  if (mapaCalor) {
    set(mapaCalor, "B5", metrica);
    set(mapaCalor, "B6", datos.config.margenMapaCalor);
    set(mapaCalor, `${mapa.colMonto}8`, sigla);
    datos.mapaCalor.forEach((f, i) => setFila(mapaCalor, PRIMERA_FILA.mapaCalor + i, identidad(f)));
    limpiarHasta(mapaCalor, PRIMERA_FILA.mapaCalor + datos.mapaCalor.length, ULTIMA_FILA.analisis, colsId);
  }

  // ── Data de mercado ──
  const merc = wb.hoja(HOJAS.mercado);
  if (merc) {
    set(merc, "B4", TITULO_METRICA[datos.config.concepto]);

    if (mapa.mercadoPorCargo) {
      datos.mercadoPorCargo.forEach((c, i) => {
        setFila(merc, PRIMERA_FILA.mercado + i, [
          ["A", c.tituloCargo],
          ["B", c.p90], ["C", c.p75], ["D", c.p50], ["E", c.p25], ["F", c.p10],
          ["G", c.promedio], ["H", c.minimo], ["I", c.maximo],
        ]);
      });
      limpiarHasta(merc, PRIMERA_FILA.mercado + datos.mercadoPorCargo.length, ULTIMA_FILA.mercado,
        ["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
    } else {
      const grados = [...datos.mercadoPorGrado.keys()].sort((a, b) => b - a);
      grados.forEach((grado, i) => {
        const p = datos.mercadoPorGrado.get(grado)!;
        setFila(merc, PRIMERA_FILA.mercado + i, [
          ["A", grado], ["B", p.p90], ["C", p.p75], ["D", p.p50], ["E", p.p25], ["F", p.p10],
        ]);
      });
      limpiarHasta(merc, PRIMERA_FILA.mercado + grados.length, PRIMERA_FILA.mercado + 40,
        ["A", "B", "C", "D", "E", "F"]);
    }
  }

  // ── Simulador de ajuste salarial ──
  // Solo su configuración: las columnas las resuelven las fórmulas de la hoja
  // o las llena el cliente a mano (AC Consulting, 2026-10-14).
  const sim = wb.hoja(HOJAS.simulador);
  if (sim) {
    set(sim, "B5", metrica);
    set(sim, "B6", datos.configSimulador.percentil.toUpperCase());
    set(sim, "B8", datos.configSimulador.variacionGeneral);
    set(sim, "B9", datos.configSimulador.variacionMaxima);
    set(sim, "B10", datos.config.incluirComisiones ? "Sí" : "No");
  }

  // ── Mapeo de cargos ──
  const mapeo = wb.hoja(HOJAS.mapeo);
  if (mapeo && datos.mapeo.length > 0) escribirMapeo(mapeo, datos.mapeo);

  // ── Data de la empresa ──
  // Solo se escriben las ENTRADAS: las columnas de totales llevan las fórmulas
  // de la plantilla y Excel las recalcula al abrir.
  const dataEmpresa = wb.hoja(HOJAS.dataEmpresa);
  if (dataEmpresa) {
    const { diasVacaciones, diasUtilidades, bcv } = datos.parametros;
    const de = mapa.dataEmpresa;

    set(dataEmpresa, "B5", diasVacaciones || null);
    set(dataEmpresa, "B6", diasUtilidades || null);
    set(dataEmpresa, "B7", datos.config.incluirComisiones ? "Sí" : "No");
    set(dataEmpresa, "B8", datos.tcr ? `TCR ${datos.tcr.etiqueta}` : "TCR BCV dólar");
    set(dataEmpresa, "C8", datos.tcr ? datos.tcr.tasa : bcv);
    set(dataEmpresa, `${de.colMetrica}10`, sigla);

    // Un bloque de cinco columnas por concepto que la empresa reportó.
    const { conceptosFijos, conceptosVariables, filas } = datos.dataEmpresa;
    for (let i = 0; i < de.maxFijos; i++) {
      set(dataEmpresa, `${COLS[de.primerFijo + i * 5]}11`, conceptosFijos[i] ?? null);
    }
    for (let i = 0; i < de.maxVariables; i++) {
      set(dataEmpresa, `${COLS[de.primerVariable + i * 5]}11`, conceptosVariables[i] ?? null);
    }

    const hastaCol = COLS.indexOf(de.ultimaCol);
    const columnas = COLS.slice(0, hastaCol + 1);
    limpiarHasta(dataEmpresa, PRIMERA_FILA.dataEmpresa, ULTIMA_FILA.dataEmpresa, columnas);

    filas.forEach((f, i) => {
      const fila = PRIMERA_FILA.dataEmpresa + i;
      setFila(dataEmpresa, fila, [
        ["A", f.ocupanteId], ["B", f.unidadFuncional], ["C", f.reportaA || null], ["D", f.tituloCargo],
        ...(mapa.colGrado ? ([[mapa.colGrado, f.grado]] as Array<[string, string | number | null]>) : []),
        [de.colMetrica, f.metrica],
      ]);

      const escribirBloque = (
        celda: { monto: number | null; cuenta: string | null; pago: string | null; impacto: string | null; frecuencia: string | null },
        desde: number,
      ) => {
        setFila(dataEmpresa, fila, [
          [COLS[desde], celda.monto],
          [COLS[desde + 1], celda.cuenta],
          [COLS[desde + 2], celda.pago],
          [COLS[desde + 3], celda.impacto],
          [COLS[desde + 4], celda.frecuencia],
        ]);
      };
      f.fijos.forEach((celda, idx) => escribirBloque(celda, de.primerFijo + idx * 5));
      f.variables.forEach((celda, idx) => escribirBloque(celda, de.primerVariable + idx * 5));
    });
  }

  return wb.aBuffer();
}
