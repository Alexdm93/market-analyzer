/**
 * Distribución de la compensación total por elemento de pago, para el informe
 * de cortesía.
 *
 * Las ocho categorías las definió el CEO (2026-09-20) y reemplazan a las de la
 * plantilla original, que dependían de cómo cada empresa nombrara sus
 * conceptos ("Fondo de Ahorros", "Otros pagos adicionales") y por eso no eran
 * calculables. Estas sí salen de la estructura de los datos.
 *
 * Todo se lleva a USD mensualizado antes de sumar, con la misma conversión que
 * usa el resto del sistema, para que los porcentajes sean comparables entre
 * empresas que pagan en monedas distintas.
 */
import { gradeToNivel } from "@/lib/capri";
import { freqToAnnual, normalizeToUSD } from "@/lib/compensation";
import type { ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition } from "@/types/salary";

export const CATEGORIAS = [
  "Sueldo Base",
  "Bono Alimentación",
  "Otros pagos mensuales con impacto",
  "Otros pagos mensuales sin impacto",
  "Otros pagos otra frecuencia con impacto",
  "Otros pagos otra frecuencia sin impacto",
  "Variable por desempeño",
  "Variable por comisión",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/** Los seis niveles del CAPRI, que es lo que el CEO decidió mantener. */
export const NIVELES = ["Operativo", "Profesional", "Supervisor", "Gerencia Media", "Gerencia Alta", "Ejecutivo"] as const;

export type FilaDistribucion = {
  nivel: string;
  /** Participación de cada categoría sobre el total del nivel, de 0 a 1. */
  porcentajes: Record<Categoria, number>;
  ocupantes: number;
};

type Acumulador = Record<Categoria, number>;

function acumuladorVacio(): Acumulador {
  return Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Acumulador;
}

/** Un pago fijo adicional cae en una de cuatro casillas: frecuencia × impacto. */
function casillaFija(freq: string | undefined, impacto: boolean | undefined): Categoria {
  const mensual = (freq ?? "monthly") === "monthly";
  if (mensual) return impacto ? "Otros pagos mensuales con impacto" : "Otros pagos mensuales sin impacto";
  return impacto ? "Otros pagos otra frecuencia con impacto" : "Otros pagos otra frecuencia sin impacto";
}

/** Una porción de la compensación de un cargo, ya en USD mensualizado. */
export type Pieza = {
  categoria: Categoria;
  montoUSD: number;
  /** Cómo los lee el cálculo canónico, no como vienen crudos. */
  cuenta: "USD" | "VES";
  pago: "USD" | "VES";
};

/**
 * Desarma un cargo en sus porciones. Lo usan tanto la distribución por nivel
 * del informe de cortesía como el resumen de la muestra de los reportes de
 * revisión, para que no puedan dar números distintos.
 */
export function piezasDe(
  fila: ExtendedMarketPosition,
  tasas: ExchangeRate[],
  bcv: number | null,
): Pieza[] {
  const piezas: Pieza[] = [];

  // Los valores por defecto son los de `normalizeToUSD`: una cuenta sin moneda
  // se trata como dólares y un pago sin moneda, como bolívares.
  const agregar = (
    categoria: Categoria,
    monto: number | undefined,
    freq: string | undefined,
    cuenta: string | undefined,
    pago: string | undefined,
    tasaId?: string,
  ) => {
    if (!monto) return;
    const usd = normalizeToUSD(monto, cuenta, pago, tasaId, tasas, bcv);
    const mensual = (usd * freqToAnnual(freq)) / 12;
    if (!mensual) return;
    piezas.push({
      categoria,
      montoUSD: mensual,
      cuenta: cuenta === "VES" ? "VES" : "USD",
      pago: !pago || pago === "VES" ? "VES" : "USD",
    });
  };

  agregar("Sueldo Base", fila.sueldoBasico, fila.sueldoBasicoFreq,
    fila.sueldoBasicoCuentaMoneda, fila.sueldoBasicoMonedaPago, fila.sueldoBasicoTasaId);
  agregar("Bono Alimentación", fila.bonoAlimentacion, fila.bonoAlimentacionFreq,
    fila.bonoAlimentacionCuentaMoneda, fila.bonoAlimentacionMonedaPago, fila.bonoAlimentacionTasaId);

  // Bono de movilización: no tiene interfaz, pero puede haber data vieja.
  agregar(casillaFija(fila.bonoMovilizacionFreq, fila.bonoMovilizacionImpacto),
    fila.bonoMovilizacion, fila.bonoMovilizacionFreq,
    fila.bonoMovilizacionCuentaMoneda, fila.bonoMovilizacionMonedaPago);

  for (const p of fila.additionalFixedPayments ?? []) {
    agregar(casillaFija(p.freq, p.impacto), p.amount, p.freq, p.accountCurrency, p.paymentCurrency, p.tasaId);
  }

  // Variables: el impacto y la frecuencia no los separan, solo el tipo.
  agregar("Variable por desempeño", fila.bonoDesempeno, fila.bonoDesempenoFreq,
    fila.bonoDesempenoCuentaMoneda, fila.bonoDesempenoMonedaPago);
  agregar("Variable por comisión", fila.comisiones, fila.comisionesFreq,
    fila.comisionesCuentaMoneda, fila.comisionesMonedaPago);
  // "Otros variables" no dice de qué tipo es; el CEO definió solo dos
  // categorías, así que se cuenta como desempeño.
  agregar("Variable por desempeño", fila.pagoVariableOtros, fila.pagoVariableOtrosFreq,
    fila.pagoVariableOtrosCuentaMoneda, fila.pagoVariableOtrosMonedaPago);

  for (const p of (fila.additionalVariablePayments ?? []) as CompensationConcept[]) {
    const categoria: Categoria = p.variableType === "commission" ? "Variable por comisión" : "Variable por desempeño";
    agregar(categoria, p.amount, p.freq, p.accountCurrency, p.paymentCurrency, p.tasaId);
  }

  return piezas;
}

export function calcularDistribucion(
  filas: Array<{ fila: ExtendedMarketPosition; tasas: ExchangeRate[]; bcv: number | null }>,
): FilaDistribucion[] {
  const porNivel = new Map<string, { acc: Acumulador; ocupantes: number }>();

  for (const { fila, tasas, bcv } of filas) {
    const nivel = gradeToNivel(fila.hayGrade, fila.capriFamily);
    if (!nivel) continue;

    const actual = porNivel.get(nivel) ?? { acc: acumuladorVacio(), ocupantes: 0 };
    actual.ocupantes++;
    for (const pieza of piezasDe(fila, tasas, bcv)) actual.acc[pieza.categoria] += pieza.montoUSD;
    porNivel.set(nivel, actual);
  }

  return NIVELES.map((nivel) => {
    const datos = porNivel.get(nivel);
    const porcentajes = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<Categoria, number>;

    if (datos) {
      const total = CATEGORIAS.reduce((s, c) => s + datos.acc[c], 0);
      if (total > 0) {
        for (const c of CATEGORIAS) porcentajes[c] = datos.acc[c] / total;
      }
    }

    return { nivel, porcentajes, ocupantes: datos?.ocupantes ?? 0 };
  });
}

// ── Resumen de una muestra completa ─────────────────────────────────────────

export type FilaResumen = {
  categoria: Categoria;
  montoUSD: number;
  /** Participación de la categoría en el total de la muestra, de 0 a 1. */
  participacion: number;
  /** Reparto DENTRO de la categoría, de 0 a 1. */
  cuentaUSD: number;
  cuentaVES: number;
  pagoUSD: number;
  pagoVES: number;
};

export type ResumenMuestra = { ocupantes: number; totalUSD: number; filas: FilaResumen[] };

/**
 * La misma apertura por categoría, pero de toda la selección junta y con el
 * reparto por moneda de cuenta y de pago dentro de cada una.
 */
export function calcularResumenMuestra(
  entradas: Array<{ fila: ExtendedMarketPosition; tasas: ExchangeRate[]; bcv: number | null }>,
): ResumenMuestra {
  const acc = new Map<Categoria, { total: number; cuentaUSD: number; pagoUSD: number }>(
    CATEGORIAS.map((c) => [c, { total: 0, cuentaUSD: 0, pagoUSD: 0 }]),
  );

  let ocupantes = 0;
  for (const { fila, tasas, bcv } of entradas) {
    ocupantes++;
    for (const pieza of piezasDe(fila, tasas, bcv)) {
      const a = acc.get(pieza.categoria)!;
      a.total += pieza.montoUSD;
      if (pieza.cuenta === "USD") a.cuentaUSD += pieza.montoUSD;
      if (pieza.pago === "USD") a.pagoUSD += pieza.montoUSD;
    }
  }

  const totalUSD = CATEGORIAS.reduce((s, c) => s + acc.get(c)!.total, 0);

  const filas = CATEGORIAS.map((categoria): FilaResumen => {
    const a = acc.get(categoria)!;
    const parteUSD = a.total > 0 ? a.cuentaUSD / a.total : 0;
    const pagoUSD = a.total > 0 ? a.pagoUSD / a.total : 0;
    return {
      categoria,
      montoUSD: a.total,
      participacion: totalUSD > 0 ? a.total / totalUSD : 0,
      cuentaUSD: parteUSD,
      cuentaVES: a.total > 0 ? 1 - parteUSD : 0,
      pagoUSD,
      pagoVES: a.total > 0 ? 1 - pagoUSD : 0,
    };
  });

  return { ocupantes, totalUSD, filas };
}
