import type { ExtendedMarketPosition } from "@/types/salary";
import type { ExchangeRate } from "@/lib/workspace";

export function freqToAnnual(freq?: string): number {
  switch (freq) {
    case "biweekly": return 24;
    case "monthly": return 12;
    case "bimonthly": return 6;
    case "quarterly": return 4;
    case "semiannual": return 2;
    case "annual": return 1;
    default: return 12;
  }
}

/**
 * Converts an amount to USD:
 * - cuentaMoneda=USD → no conversion
 * - cuentaMoneda=VES, pagoMoneda=VES → divide by BCV rate
 * - cuentaMoneda=VES, pagoMoneda≠VES → divide by tasaId rate, falls back to BCV
 */
export function normalizeToUSD(
  amount: number,
  cuentaMoneda: string | undefined,
  pagoMoneda: string | undefined,
  tasaId: string | undefined,
  tasas: ExchangeRate[],
  bcvRate: number | null,
): number {
  if (!amount) return 0;
  if (!cuentaMoneda || cuentaMoneda !== "VES") return amount;

  const paidInVES = !pagoMoneda || pagoMoneda === "VES";
  let rate: number | null;

  if (paidInVES) {
    rate = bcvRate;
  } else {
    const tasa = tasaId ? tasas.find((t) => t.id === tasaId) : undefined;
    const tasaValor = tasa ? Number(tasa.valor) : null;
    rate = tasaValor && tasaValor > 0 ? tasaValor : bcvRate;
  }

  if (!rate || rate <= 0) return 0;
  return amount / rate;
}

export function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export const PERCENTILE_MIN_N = {
  p10: 12,
  p25: 8,
  p50: 4,
  p75: 8,
  p90: 12,
  promedio: 4,
} as const;

export type MetricPercentiles = {
  n: number;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  promedio: number | null;
};

export function computeMetricPercentiles(values: number[]): MetricPercentiles {
  const n = values.length;
  return {
    n,
    p10: n >= PERCENTILE_MIN_N.p10 ? Math.round(pct(values, 10)) : null,
    p25: n >= PERCENTILE_MIN_N.p25 ? Math.round(pct(values, 25)) : null,
    p50: n >= PERCENTILE_MIN_N.p50 ? Math.round(pct(values, 50)) : null,
    p75: n >= PERCENTILE_MIN_N.p75 ? Math.round(pct(values, 75)) : null,
    p90: n >= PERCENTILE_MIN_N.p90 ? Math.round(pct(values, 90)) : null,
    promedio: n >= PERCENTILE_MIN_N.promedio ? Math.round(values.reduce((s, v) => s + v, 0) / n) : null,
  };
}

export type RowTotals = {
  /** All direct payments annualized ÷ 12 (no pasivos) */
  totalSinPasivosMensual: number;
  /** All direct payments + calculated pasivos annualized ÷ 12 */
  totalConPasivosMensual: number;
  /** All direct payments + calculated pasivos annualized */
  totalConPasivosAnual: number;
};

/**
 * Computes the three compensation totals for a row.
 *
 * Pasivos are calculated (not stored) from concepts with impacto=true:
 *   ST           = annual sum of impacto=true concepts
 *   BonoVac      = ST × (diasVacaciones / 360)
 *   Utilidades   = (ST + BonoVac) × (diasUtilidades / 360)
 *   Prestaciones = (ST + BonoVac + Utilidades) × (60 / 360)
 */
export function computeRowTotals(
  row: ExtendedMarketPosition,
  tasas: ExchangeRate[],
  bcvRate: number | null,
  diasVacaciones: number,
  diasUtilidades: number,
): RowTotals {
  function annualUSD(
    amount: number | undefined,
    freq: string | undefined,
    cuentaMoneda: string | undefined,
    pagoMoneda: string | undefined,
    tasaId?: string,
  ): number {
    return (
      normalizeToUSD(amount ?? 0, cuentaMoneda, pagoMoneda, tasaId, tasas, bcvRate) *
      freqToAnnual(freq)
    );
  }

  let directAnual = 0;
  let stAnual = 0; // sum of impacto=true concepts, used to compute pasivos

  function add(
    amount: number | undefined,
    freq: string | undefined,
    cuentaMoneda: string | undefined,
    pagoMoneda: string | undefined,
    impacto: boolean | undefined,
    tasaId?: string,
  ) {
    const v = annualUSD(amount, freq, cuentaMoneda, pagoMoneda, tasaId);
    directAnual += v;
    if (impacto) stAnual += v;
  }

  // Fixed
  add(row.sueldoBasico, row.sueldoBasicoFreq, row.sueldoBasicoCuentaMoneda, row.sueldoBasicoMonedaPago, row.sueldoBasicoImpacto, row.sueldoBasicoTasaId);
  add(row.bonoAlimentacion, row.bonoAlimentacionFreq, row.bonoAlimentacionCuentaMoneda, row.bonoAlimentacionMonedaPago, row.bonoAlimentacionImpacto, row.bonoAlimentacionTasaId);
  add(row.bonoMovilizacion, row.bonoMovilizacionFreq, row.bonoMovilizacionCuentaMoneda, row.bonoMovilizacionMonedaPago, row.bonoMovilizacionImpacto);
  for (const p of row.additionalFixedPayments ?? []) {
    add(p.amount, p.freq, p.accountCurrency, p.paymentCurrency, p.impacto, p.tasaId);
  }

  // Variable
  add(row.bonoDesempeno, row.bonoDesempenoFreq, row.bonoDesempenoCuentaMoneda, row.bonoDesempenoMonedaPago, row.bonoDesempenoImpacto);
  add(row.comisiones, row.comisionesFreq, row.comisionesCuentaMoneda, row.comisionesMonedaPago, row.comisionesImpacto);
  add(row.pagoVariableOtros, row.pagoVariableOtrosFreq, row.pagoVariableOtrosCuentaMoneda, row.pagoVariableOtrosMonedaPago, row.pagoVariableOtrosImpacto);
  for (const p of row.additionalVariablePayments ?? []) {
    add(p.amount, p.freq, p.accountCurrency, p.paymentCurrency, p.impacto, p.tasaId);
  }

  // Calculated pasivos
  const bonoVacacional = stAnual * (diasVacaciones / 360);
  const utilidades = (stAnual + bonoVacacional) * (diasUtilidades / 360);
  const prestaciones = (stAnual + bonoVacacional + utilidades) * (60 / 360);
  const pasivosAnual = bonoVacacional + utilidades + prestaciones;

  const conPasivosAnual = directAnual + pasivosAnual;

  return {
    totalSinPasivosMensual: Math.round(directAnual / 12),
    totalConPasivosMensual: Math.round(conPasivosAnual / 12),
    totalConPasivosAnual: Math.round(conPasivosAnual),
  };
}
