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

export function calcularDistribucion(
  filas: Array<{ fila: ExtendedMarketPosition; tasas: ExchangeRate[]; bcv: number | null }>,
): FilaDistribucion[] {
  const porNivel = new Map<string, { acc: Acumulador; ocupantes: number }>();

  for (const { fila, tasas, bcv } of filas) {
    const nivel = gradeToNivel(fila.hayGrade, fila.capriFamily);
    if (!nivel) continue;

    const actual = porNivel.get(nivel) ?? { acc: acumuladorVacio(), ocupantes: 0 };
    actual.ocupantes++;

    /** Lleva cualquier monto a USD mensualizado. */
    function mensualUSD(
      monto: number | undefined,
      freq: string | undefined,
      cuenta: string | undefined,
      pago: string | undefined,
      tasaId?: string,
    ): number {
      if (!monto) return 0;
      const usd = normalizeToUSD(monto, cuenta, pago, tasaId, tasas, bcv);
      return (usd * freqToAnnual(freq)) / 12;
    }

    actual.acc["Sueldo Base"] += mensualUSD(
      fila.sueldoBasico, fila.sueldoBasicoFreq, fila.sueldoBasicoCuentaMoneda,
      fila.sueldoBasicoMonedaPago, fila.sueldoBasicoTasaId,
    );
    actual.acc["Bono Alimentación"] += mensualUSD(
      fila.bonoAlimentacion, fila.bonoAlimentacionFreq, fila.bonoAlimentacionCuentaMoneda,
      fila.bonoAlimentacionMonedaPago, fila.bonoAlimentacionTasaId,
    );

    // Bono de movilización: no tiene interfaz, pero puede haber data vieja.
    actual.acc[casillaFija(fila.bonoMovilizacionFreq, fila.bonoMovilizacionImpacto)] += mensualUSD(
      fila.bonoMovilizacion, fila.bonoMovilizacionFreq, fila.bonoMovilizacionCuentaMoneda,
      fila.bonoMovilizacionMonedaPago,
    );

    for (const p of fila.additionalFixedPayments ?? []) {
      actual.acc[casillaFija(p.freq, p.impacto)] += mensualUSD(
        p.amount, p.freq, p.accountCurrency, p.paymentCurrency, p.tasaId,
      );
    }

    // Variables: el impacto y la frecuencia no los separan, solo el tipo.
    actual.acc["Variable por desempeño"] += mensualUSD(
      fila.bonoDesempeno, fila.bonoDesempenoFreq, fila.bonoDesempenoCuentaMoneda, fila.bonoDesempenoMonedaPago,
    );
    actual.acc["Variable por comisión"] += mensualUSD(
      fila.comisiones, fila.comisionesFreq, fila.comisionesCuentaMoneda, fila.comisionesMonedaPago,
    );
    // "Otros variables" no dice de qué tipo es; el CEO definió solo dos
    // categorías, así que se cuenta como desempeño.
    actual.acc["Variable por desempeño"] += mensualUSD(
      fila.pagoVariableOtros, fila.pagoVariableOtrosFreq,
      fila.pagoVariableOtrosCuentaMoneda, fila.pagoVariableOtrosMonedaPago,
    );

    for (const p of (fila.additionalVariablePayments ?? []) as CompensationConcept[]) {
      const categoria: Categoria = p.variableType === "commission" ? "Variable por comisión" : "Variable por desempeño";
      actual.acc[categoria] += mensualUSD(p.amount, p.freq, p.accountCurrency, p.paymentCurrency, p.tasaId);
    }

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
