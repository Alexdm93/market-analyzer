/**
 * La estructura de compensación de la empresa, aplicada a un cargo nuevo.
 *
 * La empresa define una sola vez, en Información de la empresa, con qué
 * elementos de pago trabaja: las monedas del sueldo básico y del bono de
 * alimentación, qué pagos fijos adicionales tiene y qué variables. Un cargo
 * nuevo tiene que nacer con esa estructura puesta y en cero, no en blanco:
 * si no, quien carga veinte cargos repite veinte veces la misma lista de
 * conceptos a mano.
 *
 * Vivía dentro de la pantalla de Data y la de Cargos del Estudio no la tenía.
 * Está aquí para que las dos armen el cargo igual y no se separen con el
 * tiempo (AC Consulting, 2026-11-20).
 */
import type { CompensationTemplate } from "@/lib/workspace";
import type { ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";

/** Un id corto y único dentro del mismo cargo. */
function idDePago(prefijo: string, posicion: number): string {
  return `${prefijo}-${Date.now()}-${posicion}-${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Lo que hay que ponerle a un cargo recién creado para que traiga la
 * estructura de la empresa. Devuelve solo lo que la plantilla define: lo que
 * no esté se deja como venga en el cargo vacío.
 */
export function camposDesdePlantilla(
  plantilla: CompensationTemplate | undefined,
): Partial<ExtendedMarketPosition> {
  if (!plantilla) return {};

  const campos: Partial<ExtendedMarketPosition> = {};

  // Los dos del sistema no se listan como adicionales: son columnas propias
  // del cargo, y de la plantilla solo se heredan sus monedas y su tasa.
  const sueldo = plantilla.fixed.find((c) => c.locked && c.id === "sys-sueldo-basico");
  if (sueldo) {
    campos.sueldoBasicoCuentaMoneda = sueldo.accountCurrency ?? "USD";
    campos.sueldoBasicoMonedaPago = sueldo.paymentCurrency ?? "USD";
    if (sueldo.tasaId) campos.sueldoBasicoTasaId = sueldo.tasaId;
  }

  const bono = plantilla.fixed.find((c) => c.locked && c.id === "sys-bono-alimentacion");
  if (bono) {
    campos.bonoAlimentacionCuentaMoneda = bono.accountCurrency ?? "USD";
    campos.bonoAlimentacionMonedaPago = bono.paymentCurrency ?? "USD";
    if (bono.tasaId) campos.bonoAlimentacionTasaId = bono.tasaId;
  }

  if (plantilla.fixed.length > 0) {
    campos.additionalFixedPayments = plantilla.fixed
      .filter((c) => !c.locked)
      .map((c, i) => ({
        id: idDePago("af", i),
        concept: c.concept,
        amount: 0,
        freq: (c.freq ?? "monthly") as PaymentFrequency,
        accountCurrency: c.accountCurrency ?? "USD",
        paymentCurrency: c.paymentCurrency ?? "USD",
        impacto: c.impacto ?? false,
        tasaId: c.tasaId ?? "",
      }));
  }

  if (plantilla.variable.length > 0) {
    campos.additionalVariablePayments = plantilla.variable.map((c, i) => ({
      id: idDePago("av", i),
      concept: c.concept,
      amount: 0,
      freq: (c.freq ?? "monthly") as PaymentFrequency,
      accountCurrency: c.accountCurrency ?? "USD",
      paymentCurrency: c.paymentCurrency ?? "USD",
      impacto: c.impacto ?? false,
      tasaId: c.tasaId ?? "",
      variableType: c.variableType,
      commissionType: c.commissionType as "simple" | "tiered" | "product" | "service" | "other" | undefined,
      calculationDetail: c.calculationDetail as "sale_value" | "profit_margin" | "units_sold" | "other" | undefined,
      goalsTarget: c.goalsTarget as "sales_quota" | "units_sold" | "new_clients" | "client_retention" | "profit_margin" | "mixed" | undefined,
    }));
  }

  return campos;
}
