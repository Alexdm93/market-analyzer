/**
 * La hoja "Data Empresa" del informe especializado: la nómina del cliente con
 * el desglose de cada elemento de pago.
 *
 * La hoja calcula sola sus totales —tiene 2.056 fórmulas— así que aquí solo se
 * arman las ENTRADAS. Las columnas de totales (Z, AA, AB, BA–BJ) son de la
 * plantilla y no se tocan: Excel las recalcula al abrir.
 *
 * La plantilla tiene una columna por concepto y nosotros permitimos una lista
 * libre de conceptos, así que los adicionales se agrupan en los cajones que
 * ella prevé: mensuales con y sin impacto, anualizados con y sin impacto, y
 * los pactados en moneda dura aparte. Dos conceptos se reconocen por su
 * nombre porque la plantilla les reserva columna propia: el bono de salud y el
 * fondo de ahorros.
 */
import { freqToAnnual } from "@/lib/compensation";
import { FREQUENCY_OPTIONS } from "@/lib/compensation-options";
import type { ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";

/** Un importe con sus dos monedas, como los pide la plantilla. */
export type Monto = { monto: number | null; cuenta: string | null; pago: string | null };

export type Variable = Monto & { impacto: string | null; frecuencia: string | null };

export type FilaDataEmpresa = {
  empresa: string;
  ocupanteId: string;
  unidadFuncional: string;
  tituloCargo: string;
  grado: number | null;

  sueldoBasico: Monto;
  bonoAlimentacion: Monto;
  bonoSalud: Monto;
  bonoTransporte: Monto;
  fijosMensualesConImpacto: Monto;
  fijosMensualesSinImpacto: Monto;
  /** Pactados en dólares: la plantilla los quiere ya en dólares, sin moneda. */
  duraMensualConImpacto: number | null;
  duraMensualSinImpacto: number | null;

  otrosAnualesConImpacto: Monto;
  otrosAnualesSinImpacto: Monto;
  fondoAhorros: Monto;
  duraAnualConImpacto: number | null;
  duraAnualSinImpacto: number | null;

  desempeno: Variable;
  comisiones: Variable & { tipo: string | null; detalle: string | null; objetivos: string | null };
};

const VACIO: Monto = { monto: null, cuenta: null, pago: null };

function moneda(c: "USD" | "VES" | undefined): string | null {
  if (c === "USD") return "Dólares";
  if (c === "VES") return "Bolívares";
  return null;
}

function etiquetaFrecuencia(f: PaymentFrequency | undefined): string | null {
  return FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? null;
}

function esMensual(f: PaymentFrequency | undefined): boolean {
  return !f || f === "monthly" || f === "biweekly";
}

function tasaDe(tasaId: string | undefined, tasas: ExchangeRate[], bcv: number | null): number {
  const t = tasas.find((x) => x.id === tasaId);
  const valor = Number(t?.valor);
  if (Number.isFinite(valor) && valor > 0) return valor;
  return bcv && bcv > 0 ? bcv : 0;
}

function normaliza(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Junta varios conceptos en un solo importe.
 *
 * Si todos están pactados en la misma moneda se conserva; si están mezclados
 * se pasa todo a bolívares, que es la moneda base de la hoja. Devuelve el
 * importe ya llevado a la periodicidad que pide la columna.
 */
function agrupar(
  conceptos: Array<{ monto: number; cuenta?: "USD" | "VES"; pago?: "USD" | "VES"; tasaId?: string }>,
  tasas: ExchangeRate[],
  bcv: number | null,
): Monto {
  const vivos = conceptos.filter((c) => Number.isFinite(c.monto) && c.monto !== 0);
  if (vivos.length === 0) return VACIO;

  const cuentas = new Set(vivos.map((c) => c.cuenta ?? "VES"));
  if (cuentas.size === 1) {
    const cuenta = vivos[0].cuenta ?? "VES";
    return {
      monto: vivos.reduce((s, c) => s + c.monto, 0),
      cuenta: moneda(cuenta),
      pago: moneda(vivos[0].pago ?? cuenta),
    };
  }

  const enBolivares = vivos.reduce(
    (s, c) => s + (c.cuenta === "USD" ? c.monto * tasaDe(c.tasaId, tasas, bcv) : c.monto),
    0,
  );
  return { monto: enBolivares, cuenta: "Bolívares", pago: "Bolívares" };
}

function sumaDura(conceptos: Array<{ monto: number }>): number | null {
  const total = conceptos.reduce((s, c) => s + c.monto, 0);
  return total === 0 ? null : total;
}

type Pieza = { monto: number; cuenta?: "USD" | "VES"; pago?: "USD" | "VES"; tasaId?: string };

export function construirDataEmpresa(
  ocupantes: Array<{
    ocupanteId: string;
    departamento: string;
    tituloCargo: string;
    hayGrade: number | null;
    data: Partial<ExtendedMarketPosition>;
  }>,
  empresa: string,
  tasas: ExchangeRate[],
  bcv: number | null,
): FilaDataEmpresa[] {
  return ocupantes.map((o) => {
    const d = o.data;

    const mensualesConImpacto: Pieza[] = [];
    const mensualesSinImpacto: Pieza[] = [];
    const anualesConImpacto: Pieza[] = [];
    const anualesSinImpacto: Pieza[] = [];
    const duraMensualCon: Pieza[] = [];
    const duraMensualSin: Pieza[] = [];
    const duraAnualCon: Pieza[] = [];
    const duraAnualSin: Pieza[] = [];
    const salud: Pieza[] = [];
    const ahorro: Pieza[] = [];

    for (const c of d.additionalFixedPayments ?? []) {
      const monto = Number(c.amount);
      if (!Number.isFinite(monto) || monto === 0) continue;

      const veces = freqToAnnual(c.freq);
      const mensual = esMensual(c.freq);
      const pieza: Pieza = {
        monto: mensual ? (monto * veces) / 12 : monto * veces,
        cuenta: c.accountCurrency,
        pago: c.paymentCurrency,
        tasaId: c.tasaId,
      };

      const nombre = normaliza(c.concept ?? "");
      if (nombre.includes("salud") && mensual) { salud.push(pieza); continue; }
      if (nombre.includes("fondo de ahorro")) { ahorro.push({ ...pieza, monto: monto * veces }); continue; }

      const dura = c.accountCurrency === "USD";
      if (mensual) {
        if (dura) (c.impacto ? duraMensualCon : duraMensualSin).push(pieza);
        else (c.impacto ? mensualesConImpacto : mensualesSinImpacto).push(pieza);
      } else if (dura) {
        (c.impacto ? duraAnualCon : duraAnualSin).push(pieza);
      } else {
        (c.impacto ? anualesConImpacto : anualesSinImpacto).push(pieza);
      }
    }

    // ── Variables ──
    const variables = (tipo: "performance" | "commission"): CompensationConcept[] =>
      (d.additionalVariablePayments ?? []).filter((c) => (c.variableType ?? "performance") === tipo);

    const anualizar = (c: CompensationConcept): Pieza | null => {
      const monto = Number(c.amount);
      if (!Number.isFinite(monto) || monto === 0) return null;
      return {
        monto: monto * freqToAnnual(c.freq),
        cuenta: c.accountCurrency, pago: c.paymentCurrency, tasaId: c.tasaId,
      };
    };

    const piezasDesempeno: Pieza[] = [];
    const frecuenciasDesempeno: Array<PaymentFrequency | undefined> = [];
    let impactoDesempeno = false;

    for (const [monto, freq, cuenta, pago, impacto] of [
      [d.bonoDesempeno, d.bonoDesempenoFreq, d.bonoDesempenoCuentaMoneda, d.bonoDesempenoMonedaPago, d.bonoDesempenoImpacto],
      [d.pagoVariableOtros, d.pagoVariableOtrosFreq, d.pagoVariableOtrosCuentaMoneda, d.pagoVariableOtrosMonedaPago, d.pagoVariableOtrosImpacto],
    ] as Array<[number | undefined, PaymentFrequency | undefined, "USD" | "VES" | undefined, "USD" | "VES" | undefined, boolean | undefined]>) {
      const n = Number(monto);
      if (!Number.isFinite(n) || n === 0) continue;
      piezasDesempeno.push({ monto: n * freqToAnnual(freq), cuenta, pago });
      frecuenciasDesempeno.push(freq);
      if (impacto) impactoDesempeno = true;
    }
    for (const c of variables("performance")) {
      const p = anualizar(c);
      if (!p) continue;
      piezasDesempeno.push(p);
      frecuenciasDesempeno.push(c.freq);
      if (c.impacto) impactoDesempeno = true;
    }

    const piezasComision: Pieza[] = [];
    const frecuenciasComision: Array<PaymentFrequency | undefined> = [];
    let impactoComision = false;
    let tipo: string | null = null, detalle: string | null = null, objetivos: string | null = null;

    if (Number.isFinite(Number(d.comisiones)) && Number(d.comisiones) !== 0) {
      piezasComision.push({
        monto: Number(d.comisiones) * freqToAnnual(d.comisionesFreq),
        cuenta: d.comisionesCuentaMoneda, pago: d.comisionesMonedaPago,
      });
      frecuenciasComision.push(d.comisionesFreq);
      if (d.comisionesImpacto) impactoComision = true;
    }
    for (const c of variables("commission")) {
      const p = anualizar(c);
      if (!p) continue;
      piezasComision.push(p);
      frecuenciasComision.push(c.freq);
      if (c.impacto) impactoComision = true;
      tipo ??= etiqueta(c.commissionType, "tipo");
      detalle ??= etiqueta(c.calculationDetail, "detalle");
      objetivos ??= etiqueta(c.goalsTarget, "objetivos");
    }

    const frecuenciaDe = (fs: Array<PaymentFrequency | undefined>): string | null => {
      if (fs.length === 0) return null;
      const unicas = new Set(fs);
      return unicas.size === 1 ? etiquetaFrecuencia(fs[0]) : "Anual";
    };

    const desempeno = agrupar(piezasDesempeno, tasas, bcv);
    const comision = agrupar(piezasComision, tasas, bcv);

    return {
      empresa,
      ocupanteId: o.ocupanteId,
      unidadFuncional: o.departamento,
      tituloCargo: o.tituloCargo,
      grado: o.hayGrade,

      sueldoBasico: unico(d.sueldoBasico, d.sueldoBasicoCuentaMoneda, d.sueldoBasicoMonedaPago, d.sueldoBasicoFreq),
      bonoAlimentacion: unico(d.bonoAlimentacion, d.bonoAlimentacionCuentaMoneda, d.bonoAlimentacionMonedaPago, d.bonoAlimentacionFreq),
      bonoSalud: agrupar(salud, tasas, bcv),
      bonoTransporte: unico(d.bonoMovilizacion, d.bonoMovilizacionCuentaMoneda, d.bonoMovilizacionMonedaPago, d.bonoMovilizacionFreq),
      fijosMensualesConImpacto: agrupar(mensualesConImpacto, tasas, bcv),
      fijosMensualesSinImpacto: agrupar(mensualesSinImpacto, tasas, bcv),
      duraMensualConImpacto: sumaDura(duraMensualCon),
      duraMensualSinImpacto: sumaDura(duraMensualSin),

      otrosAnualesConImpacto: agrupar(anualesConImpacto, tasas, bcv),
      otrosAnualesSinImpacto: agrupar(anualesSinImpacto, tasas, bcv),
      fondoAhorros: agrupar(ahorro, tasas, bcv),
      duraAnualConImpacto: sumaDura(duraAnualCon),
      duraAnualSinImpacto: sumaDura(duraAnualSin),

      desempeno: {
        ...desempeno,
        impacto: desempeno.monto === null ? null : impactoDesempeno ? "Con Impacto" : "Sin Impacto",
        frecuencia: desempeno.monto === null ? null : frecuenciaDe(frecuenciasDesempeno),
      },
      comisiones: {
        ...comision,
        impacto: comision.monto === null ? null : impactoComision ? "Con Impacto" : "Sin Impacto",
        frecuencia: comision.monto === null ? null : frecuenciaDe(frecuenciasComision),
        tipo, detalle, objetivos,
      },
    };
  });
}

/** Un concepto propio de la plantilla: se lleva a mensual y se deja tal cual. */
function unico(
  monto: number | undefined,
  cuenta: "USD" | "VES" | undefined,
  pago: "USD" | "VES" | undefined,
  freq: PaymentFrequency | undefined,
): Monto {
  const n = Number(monto);
  if (!Number.isFinite(n) || n === 0) return VACIO;
  return {
    monto: (n * freqToAnnual(freq)) / 12,
    cuenta: moneda(cuenta ?? "VES"),
    pago: moneda(pago ?? cuenta ?? "VES"),
  };
}

function etiqueta(valor: string | undefined, cual: "tipo" | "detalle" | "objetivos"): string | null {
  if (!valor) return null;
  const tablas = {
    tipo: { simple: "Simple", tiered: "Escalonada", product: "Por Producto", service: "Servicio", other: "Otro" },
    detalle: { sale_value: "Valor de la venta", profit_margin: "Margen de la ganancia", units_sold: "Unidades vendidas", other: "Otro" },
    objetivos: {
      sales_quota: "Cuotas de ventas monetaria", units_sold: "Numero de unidades vendidas",
      new_clients: "Numero de nuevos clientes", client_retention: "Retencion de clientes",
      profit_margin: "Margen de ganancias", mixed: "Mixto",
    },
  } as const;
  return (tablas[cual] as Record<string, string>)[valor] ?? null;
}
