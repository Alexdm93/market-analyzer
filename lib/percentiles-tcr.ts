/**
 * Los percentiles del mercado expresados en TCR.
 *
 * Vive acá y no en la ruta porque lo necesitan dos consumidores: la pantalla
 * de comparación, que lo pide por HTTP, y el informe de cortesía, que lo
 * calcula del lado del servidor mientras arma el Excel. Cuando esto estaba
 * escrito dentro de la ruta, el informe tenía que pedírselo al navegador y
 * cualquier tropiezo de esa llamada dejaba la columna en "ND" sin decir nada.
 *
 * Es una función pura: quien llama trae los workspaces y las tasas globales.
 */
import {
  computeMetricPercentiles,
  computeTCRTotals,
  tasasTcrDeEmpresa,
  type MetricPercentiles,
  type TcrType,
} from "@/lib/compensation";
import { pasaFiltros, type FiltrosMercado } from "@/lib/filtros-mercado";
import { safeParseCompanyInfo, safeParseSnapshots } from "@/lib/workspace";

export type TcrCargoPercentiles = {
  tituloCargo: string;
  n: number;
  sinPasivosMensual: MetricPercentiles;
  conPasivosMensual: MetricPercentiles;
  conPasivosAnual: MetricPercentiles;
  directoMensualizado: MetricPercentiles;
};

export type TcrGradePercentiles = {
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
  cargos: TcrCargoPercentiles[];
  grades: TcrGradePercentiles[];
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

export function calcularPercentilesTcr(params: {
  snapshotId: string;
  tcrType: TcrType;
  filtros: FiltrosMercado;
  workspaces: WorkspaceParaTcr[];
  globales: TasasGlobales;
}): { cargos: TcrCargoPercentiles[]; grades: TcrGradePercentiles[] } {
  const { snapshotId, tcrType, filtros, workspaces, globales } = params;

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

    // Las tasas que esta empresa tenía cuando envió su data. La resolución vive
    // en lib/compensation para que la pantalla del cliente use exactamente la
    // misma y no se comparen contra un mercado calculado con otro cambio.
    const { bcvRate, bcvEurRate, libreRate, tcrRate } = tasasTcrDeEmpresa(
      companyInfo.ratesAtSave,
      globales,
      tcrType,
    );

    const diasVacaciones = Number(companyInfo.minVacationDays) || 0;
    const diasUtilidades = Number(companyInfo.minUtilityDays)  || 0;
    const tasas          = companyInfo.tasas ?? [];

    // Una observación por empresa por cargo/grado — igual que percentiles y
    // percentiles-by-grade — para que una sola empresa con muchos empleados en
    // el mismo cargo no domine el "promedio de mercado".
    const cargosVistos = new Set<string>();
    const gradosVistos = new Set<number>();

    for (const row of snapshot.rows) {
      const totals = computeTCRTotals(row, tasas, bcvRate, bcvEurRate, libreRate, tcrRate, tcrType, diasVacaciones, diasUtilidades);
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
