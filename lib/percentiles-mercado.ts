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
import { pasaFiltros, type FiltrosMercado } from "@/lib/filtros-mercado";
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

function recorrer(params: {
  snapshotId: string;
  filtros: FiltrosMercado;
  workspaces: WorkspaceParaTcr[];
  totalizar: Totalizador;
}): { cargos: CargoPercentilesMercado[]; grades: GradoPercentilesMercado[] } {
  const { snapshotId, filtros, workspaces, totalizar } = params;

  const porCargo = new Map<string, { tituloCargo: string; acc: Acumulado }>();
  const porGrado = new Map<number, Acumulado>();

  for (const workspace of workspaces) {
    const snapshots = safeParseSnapshots(workspace.snapshotsJson);
    const snapshot  = snapshots[snapshotId];
    if (!snapshot?.rows?.length) continue;

    // Una empresa que solo arrastró data de un corte anterior no participó.
    if (!snapshot.rows.some((row) => !row._carried)) continue;

    const companyInfo = safeParseCompanyInfo(workspace.companyInfoJson);
    if (!pasaFiltros(companyInfo, filtros)) continue;

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

  return { cargos, grades };
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
}): { cargos: CargoPercentilesMercado[]; grades: GradoPercentilesMercado[] } {
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
