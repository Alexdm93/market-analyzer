/**
 * Los percentiles del mercado de un corte, por cargo y por grado.
 *
 * Vive acá y no en una ruta porque lo necesitan consumidores que no hablan
 * HTTP: los informes lo calculan del lado del servidor mientras arman el
 * Excel. Cuando el cálculo en TCR estaba dentro de la ruta, el informe tenía
 * que pedírselo al navegador y cualquier tropiezo de esa llamada dejaba la
 * columna en "ND" sin que nadie se enterara.
 *
 * Hay dos entradas y un solo recorrido. La diferencia entre expresar el
 * mercado en su moneda base o en TCR es cómo se totaliza cada fila, nada más:
 * el resto —una observación por empresa y cargo, los filtros, los mínimos de
 * muestra— tiene que ser idéntico o la misma empresa se compararía contra
 * muestras distintas según la pantalla.
 *
 * Son funciones puras: quien llama trae los workspaces y las tasas globales.
 *
 * `/api/percentiles` hace este mismo recorrido escrito aparte. Es el endpoint
 * del estudio de cortesía y está fuera de alcance por pedido del cliente, así
 * que por ahora conviven; cuando se pueda tocar, debería llamar acá.
 */
import {
  computeMetricPercentiles,
  computeRowTotals,
  computeTCRTotals,
  tasasTcrDeEmpresa,
  type MetricPercentiles,
  type RowTotals,
  type TcrType,
} from "@/lib/compensation";
import { localidadesDe, pasaFiltros, type FiltrosMercado } from "@/lib/filtros-mercado";
import { PERCENTILES, suavizarMatriz, type Diagnostico, type FilaGrado } from "@/lib/suavizado-percentiles";
import { safeParseCompanyInfo, safeParseSnapshots } from "@/lib/workspace";

export type CargoPercentilesMercado = {
  tituloCargo: string;
  n: number;
  sinPasivosMensual: MetricPercentiles;
  conPasivosMensual: MetricPercentiles;
  conPasivosAnual: MetricPercentiles;
  directoMensualizado: MetricPercentiles;
};

export type GradoPercentilesMercado = {
  grade: number;
  n: number;
  sinPasivosMensual: MetricPercentiles;
  conPasivosMensual: MetricPercentiles;
  conPasivosAnual: MetricPercentiles;
  directoMensualizado: MetricPercentiles;
};

export type TcrPercentilesResponse = {
  snapshotId: string;
  bcvRate: number | null;
  tcrType: TcrType;
  tcrRate: number;
  libreRate: number;
  cargos: CargoPercentilesMercado[];
  grades: GradoPercentilesMercado[];
};

/** Lo mínimo del workspace que hace falta para calcular. */
export type WorkspaceParaTcr = {
  snapshotsJson: string;
  companyInfoJson: string;
};

export type TasasGlobales = {
  bcv: number | null;
  bcvEur: number | null;
  binance: number | null;
  libreManual: number | null;
};

type Acumulado = {
  sinPasivosMensual: number[];
  conPasivosMensual: number[];
  conPasivosAnual: number[];
  directoMensualizado: number[];
};

function acumuladoVacio(): Acumulado {
  return { sinPasivosMensual: [], conPasivosMensual: [], conPasivosAnual: [], directoMensualizado: [] };
}

function agregar(a: Acumulado, t: { totalSinPasivosMensual: number; totalConPasivosMensual: number; totalConPasivosAnual: number; totalDirectoMensualizado: number }) {
  a.sinPasivosMensual.push(t.totalSinPasivosMensual);
  a.conPasivosMensual.push(t.totalConPasivosMensual);
  a.conPasivosAnual.push(t.totalConPasivosAnual);
  a.directoMensualizado.push(t.totalDirectoMensualizado);
}

function percentiles(a: Acumulado) {
  return {
    n: a.sinPasivosMensual.length,
    sinPasivosMensual:   computeMetricPercentiles(a.sinPasivosMensual),
    conPasivosMensual:   computeMetricPercentiles(a.conPasivosMensual),
    conPasivosAnual:     computeMetricPercentiles(a.conPasivosAnual),
    directoMensualizado: computeMetricPercentiles(a.directoMensualizado),
  };
}

/** Cómo se totaliza una fila: en moneda base o convertida a TCR. */
type Totalizador = (
  row: Parameters<typeof computeRowTotals>[0],
  companyInfo: ReturnType<typeof safeParseCompanyInfo>,
) => RowTotals;

/**
 * Con qué se puede recortar el mercado de este corte, y cuántas empresas
 * quedaron dentro del recorte.
 *
 * Las listas salen de TODOS los participantes, antes de aplicar filtros: si se
 * recortaran al filtro activo no habría forma de volver atrás. El conteo, en
 * cambio, es de las que pasaron, que es lo que mira el mínimo de doce.
 */
export type GrupoDelMercado = {
  sectores: string[];
  clasificaciones: string[];
  empresas: string[];
  localidades: string[];
  /** Cuántas empresas quedaron dentro del grupo elegido. */
  empresasEnGrupo: number;
};

export type MercadoDelCorte = {
  cargos: CargoPercentilesMercado[];
  /** Ya suavizados: ver `suavizar()` acá abajo. */
  grades: GradoPercentilesMercado[];
  grupo: GrupoDelMercado;
  /** Qué tocó el suavizado, por métrica. Es para la auditoría del admin. */
  suavizado: Record<MetricaMercado, Diagnostico>;
};

/** Las cuatro métricas, con el nombre que usan `computeRowTotals` y las rutas. */
export const METRICAS_MERCADO = [
  "sinPasivosMensual",
  "conPasivosMensual",
  "conPasivosAnual",
  "directoMensualizado",
] as const;
export type MetricaMercado = (typeof METRICAS_MERCADO)[number];

/**
 * La matriz por grado sale con serruchos y huecos, así que se suaviza antes de
 * publicarla. Pasa con las cuatro métricas por separado, porque cada una tiene
 * su propia curva.
 *
 * Los cargos NO se tocan: entre dos cargos distintos no hay un orden que
 * respetar, y AC Consulting lo dejó explícito (2026-10-14).
 */
function suavizar(grades: GradoPercentilesMercado[]): Record<MetricaMercado, Diagnostico> {
  const diagnosticos = {} as Record<MetricaMercado, Diagnostico>;

  for (const metrica of METRICAS_MERCADO) {
    const matriz: FilaGrado[] = grades.map((g) => ({
      grade: g.grade,
      p90: g[metrica].p90, p75: g[metrica].p75, p50: g[metrica].p50,
      p25: g[metrica].p25, p10: g[metrica].p10,
    }));

    const { filas, diagnostico } = suavizarMatriz(matriz);
    diagnosticos[metrica] = diagnostico;

    const porGrado = new Map(filas.map((f) => [f.grade, f]));
    for (const g of grades) {
      const f = porGrado.get(g.grade);
      if (!f) continue;
      for (const p of PERCENTILES) g[metrica][p] = f[p];
    }
  }

  return diagnosticos;
}

function recorrer(params: {
  snapshotId: string;
  filtros: FiltrosMercado;
  workspaces: WorkspaceParaTcr[];
  totalizar: Totalizador;
}): MercadoDelCorte {
  const { snapshotId, filtros, workspaces, totalizar } = params;

  const porCargo = new Map<string, { tituloCargo: string; acc: Acumulado }>();
  const porGrado = new Map<number, Acumulado>();

  const sectores = new Set<string>();
  const clasificaciones = new Set<string>();
  const empresas = new Set<string>();
  const localidades = new Set<string>();
  let empresasEnGrupo = 0;

  for (const workspace of workspaces) {
    const snapshots = safeParseSnapshots(workspace.snapshotsJson);
    const snapshot  = snapshots[snapshotId];
    if (!snapshot?.rows?.length) continue;

    // Una empresa que solo arrastró data de un corte anterior no participó.
    if (!snapshot.rows.some((row) => !row._carried)) continue;

    const companyInfo = safeParseCompanyInfo(workspace.companyInfoJson);

    if (companyInfo.sector) sectores.add(companyInfo.sector);
    if (companyInfo.classification) clasificaciones.add(companyInfo.classification);
    if (companyInfo.companyName) empresas.add(companyInfo.companyName);
    for (const l of localidadesDe(companyInfo)) localidades.add(l);

    if (!pasaFiltros(companyInfo, filtros)) continue;
    empresasEnGrupo += 1;

    // Una observación por empresa por cargo/grado —igual que percentiles y
    // percentiles-by-grade— para que una sola empresa con muchos empleados en
    // el mismo cargo no domine el "promedio de mercado".
    const cargosVistos = new Set<string>();
    const gradosVistos = new Set<number>();

    for (const row of snapshot.rows) {
      const totals = totalizar(row, companyInfo);
      // Una fila sin llenar no es una observación.
      if (totals.totalSinPasivosMensual === 0 && totals.totalDirectoMensualizado === 0) continue;

      const titulo = String(row.tituloCargo ?? "").trim();
      const clave  = titulo.toLowerCase();
      if (clave && !cargosVistos.has(clave)) {
        cargosVistos.add(clave);
        const actual = porCargo.get(clave) ?? { tituloCargo: titulo, acc: acumuladoVacio() };
        agregar(actual.acc, totals);
        porCargo.set(clave, actual);
      }

      const grade = row.hayGrade;
      if (grade && !gradosVistos.has(grade)) {
        gradosVistos.add(grade);
        const actual = porGrado.get(grade) ?? acumuladoVacio();
        agregar(actual, totals);
        porGrado.set(grade, actual);
      }
    }
  }

  const cargos = [...porCargo.values()]
    .map((g) => ({ tituloCargo: g.tituloCargo, ...percentiles(g.acc) }))
    .sort((a, b) => a.tituloCargo.localeCompare(b.tituloCargo, "es"));

  const grades = [...porGrado.entries()]
    .map(([grade, acc]) => ({ grade, ...percentiles(acc) }))
    .sort((a, b) => a.grade - b.grade);

  const ordenar = (xs: Set<string>) => [...xs].sort((a, b) => a.localeCompare(b, "es"));

  return {
    cargos,
    grades,
    suavizado: suavizar(grades),
    grupo: {
      sectores: ordenar(sectores),
      clasificaciones: ordenar(clasificaciones),
      empresas: ordenar(empresas),
      localidades: ordenar(localidades),
      empresasEnGrupo,
    },
  };
}

/** El mercado en la moneda en que cada empresa cargó su data. */
export function calcularPercentilesMercado(params: {
  snapshotId: string;
  filtros: FiltrosMercado;
  workspaces: WorkspaceParaTcr[];
  /** La tasa BCV del sistema, para la empresa que no guardó la suya. */
  bcvGeneral: number | null;
}) {
  return recorrer({
    ...params,
    totalizar: (row, info) => computeRowTotals(
      row,
      info.tasas ?? [],
      // La tasa que la empresa tenía al guardar, no la de hoy.
      info.ratesAtSave?.bcvUsd ?? params.bcvGeneral,
      Number(info.minVacationDays) || 0,
      Number(info.minUtilityDays) || 0,
    ),
  });
}

/** El mismo mercado, convertido al tipo de cambio de referencia elegido. */
export function calcularPercentilesTcr(params: {
  snapshotId: string;
  tcrType: TcrType;
  filtros: FiltrosMercado;
  workspaces: WorkspaceParaTcr[];
  globales: TasasGlobales;
}): MercadoDelCorte {
  return recorrer({
    ...params,
    totalizar: (row, info) => {
      // Las tasas que esta empresa tenía cuando envió su data. La resolución
      // vive en lib/compensation para que la pantalla del cliente use
      // exactamente la misma y no se compare contra un mercado calculado con
      // otro cambio.
      const { bcvRate, bcvEurRate, libreRate, tcrRate } = tasasTcrDeEmpresa(
        info.ratesAtSave,
        params.globales,
        params.tcrType,
      );
      return computeTCRTotals(
        row,
        info.tasas ?? [],
        bcvRate, bcvEurRate, libreRate, tcrRate, params.tcrType,
        Number(info.minVacationDays) || 0,
        Number(info.minUtilityDays) || 0,
      );
    },
  });
}
