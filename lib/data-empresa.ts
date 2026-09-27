/**
 * La hoja "Data Empresa" del informe especializado: la nómina del cliente con
 * el desglose de cada elemento de pago.
 *
 * Los bloques de columnas no son fijos. Antes la plantilla tenía una columna
 * por concepto —salud, transporte, fondo de ahorros— y había que meter a la
 * fuerza en esos cajones lo que cada empresa llamara distinto. Ahora se arman
 * a partir de lo que la empresa reportó: un bloque por concepto, con su propio
 * nombre en la cabecera (AC Consulting, 2026-09-27).
 *
 * La plantilla trae cinco bloques fijos y dos variables. Si una empresa usa
 * más, los menos frecuentes se agrupan en el último bloque, porque darle
 * columna propia a cada uno exigiría ensanchar la hoja.
 */
import type { CompensationConcept, ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";
import { FREQUENCY_OPTIONS } from "@/lib/compensation-options";

/** Lo que va en un bloque de cinco columnas de la hoja. */
export type CeldaPago = {
  monto: number | null;
  cuenta: string | null;
  pago: string | null;
  impacto: string | null;
  frecuencia: string | null;
};

export type FilaDataEmpresa = {
  ocupanteId: string;
  unidadFuncional: string;
  reportaA: string;
  tituloCargo: string;
  grado: number | null;
  /** Un valor por cada nombre de `conceptosFijos`, en el mismo orden. */
  fijos: CeldaPago[];
  variables: CeldaPago[];
  /** El total del ocupante según la métrica elegida, y su equivalente en TCR. */
  metrica: number | null;
  metricaTcr: number | null;
};

export type DataEmpresa = {
  conceptosFijos: string[];
  conceptosVariables: string[];
  filas: FilaDataEmpresa[];
};

export const MAX_BLOQUES_FIJOS = 5;
export const MAX_BLOQUES_VARIABLES = 2;

const VACIA: CeldaPago = { monto: null, cuenta: null, pago: null, impacto: null, frecuencia: null };

function moneda(c: "USD" | "VES" | undefined): string | null {
  if (c === "USD") return "Dólares";
  if (c === "VES") return "Bolívares";
  return null;
}

function frecuencia(f: PaymentFrequency | undefined): string | null {
  if (!f) return null;
  return FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? null;
}

function impacto(v: boolean | undefined): string | null {
  return v === undefined ? null : v ? "Con Impacto" : "Sin Impacto";
}

type Pieza = { concepto: string; celda: CeldaPago };

/** Los pagos de un ocupante, cada uno con el nombre que le puso la empresa. */
function piezasDelOcupante(d: Partial<ExtendedMarketPosition>): { fijos: Pieza[]; variables: Pieza[] } {
  const arma = (
    concepto: string,
    monto: number | undefined,
    cuenta: "USD" | "VES" | undefined,
    pago: "USD" | "VES" | undefined,
    imp: boolean | undefined,
    freq: PaymentFrequency | undefined,
  ): Pieza[] => {
    if (!monto) return [];
    return [{
      concepto,
      celda: { monto, cuenta: moneda(cuenta), pago: moneda(pago), impacto: impacto(imp), frecuencia: frecuencia(freq) },
    }];
  };

  const deLista = (lista: CompensationConcept[] | undefined, porDefecto: string): Pieza[] =>
    (lista ?? []).flatMap((c) =>
      arma((c.concept || porDefecto).trim(), c.amount, c.accountCurrency, c.paymentCurrency, c.impacto, c.freq));

  const fijos = [
    ...arma("Sueldo base", d.sueldoBasico, d.sueldoBasicoCuentaMoneda, d.sueldoBasicoMonedaPago, d.sueldoBasicoImpacto, d.sueldoBasicoFreq),
    ...arma("Bono alimentación", d.bonoAlimentacion, d.bonoAlimentacionCuentaMoneda, d.bonoAlimentacionMonedaPago, d.bonoAlimentacionImpacto, d.bonoAlimentacionFreq),
    ...arma("Bono movilización", d.bonoMovilizacion, d.bonoMovilizacionCuentaMoneda, d.bonoMovilizacionMonedaPago, d.bonoMovilizacionImpacto, d.bonoMovilizacionFreq),
    ...deLista(d.additionalFixedPayments, "Otro pago fijo"),
  ];

  const variables = [
    ...arma("Desempeño", d.bonoDesempeno, d.bonoDesempenoCuentaMoneda, d.bonoDesempenoMonedaPago, d.bonoDesempenoImpacto, d.bonoDesempenoFreq),
    ...arma("Comisiones", d.comisiones, d.comisionesCuentaMoneda, d.comisionesMonedaPago, d.comisionesImpacto, d.comisionesFreq),
    ...arma("Otros variables", d.pagoVariableOtros, d.pagoVariableOtrosCuentaMoneda, d.pagoVariableOtrosMonedaPago, d.pagoVariableOtrosImpacto, d.pagoVariableOtrosFreq),
    ...deLista(d.additionalVariablePayments, "Otro pago variable"),
  ];

  return { fijos, variables };
}

/**
 * Qué conceptos merecen bloque propio: los que más ocupantes usan, y los
 * canónicos primero para que el orden no baile entre informes.
 */
function elegirConceptos(porOcupante: Pieza[][], maximo: number, canonicos: string[], sobrante: string): string[] {
  const cuenta = new Map<string, number>();
  for (const piezas of porOcupante) {
    for (const p of new Map(piezas.map((x) => [x.concepto, x])).values()) {
      cuenta.set(p.concepto, (cuenta.get(p.concepto) ?? 0) + 1);
    }
  }
  if (cuenta.size === 0) return [];

  const orden = [...cuenta.keys()].sort((a, b) => {
    const ia = canonicos.indexOf(a), ib = canonicos.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return (cuenta.get(b) ?? 0) - (cuenta.get(a) ?? 0) || a.localeCompare(b, "es");
  });

  if (orden.length <= maximo) return orden;
  return [...orden.slice(0, maximo - 1), sobrante];
}

/** Junta en una sola celda lo que no entró en un bloque propio. */
function agrupar(piezas: Pieza[]): CeldaPago {
  if (piezas.length === 0) return VACIA;
  const igual = <K extends keyof CeldaPago>(k: K) => {
    const v = piezas[0].celda[k];
    return piezas.every((p) => p.celda[k] === v) ? v : null;
  };
  return {
    monto: piezas.reduce((s, p) => s + (p.celda.monto ?? 0), 0) || null,
    cuenta: igual("cuenta"),
    pago: igual("pago"),
    impacto: igual("impacto"),
    frecuencia: igual("frecuencia"),
  };
}

export type OcupanteData = {
  id: string;
  ocupanteId: string;
  departamento: string;
  reportaA: string;
  tituloCargo: string;
  hayGrade: number | null;
  data: Partial<ExtendedMarketPosition>;
};

export function construirDataEmpresa(
  ocupantes: OcupanteData[],
  /** Por id de ocupante: el total según la métrica y su equivalente en TCR. */
  totales: Map<string, { metrica: number | null; tcr: number | null }>,
): DataEmpresa {
  const piezas = ocupantes.map((o) => piezasDelOcupante(o.data));

  const conceptosFijos = elegirConceptos(
    piezas.map((p) => p.fijos), MAX_BLOQUES_FIJOS,
    ["Sueldo base", "Bono alimentación", "Bono movilización"], "Otros pagos fijos",
  );
  const conceptosVariables = elegirConceptos(
    piezas.map((p) => p.variables), MAX_BLOQUES_VARIABLES,
    ["Desempeño", "Comisiones"], "Otros variables",
  );

  const repartir = (lista: Pieza[], conceptos: string[], sobrante: string): CeldaPago[] =>
    conceptos.map((c) => {
      if (c === sobrante && !lista.some((p) => p.concepto === sobrante)) {
        return agrupar(lista.filter((p) => !conceptos.includes(p.concepto)));
      }
      const suyas = lista.filter((p) => p.concepto === c);
      return suyas.length === 1 ? suyas[0].celda : agrupar(suyas);
    });

  const filas = ocupantes.map((o, i): FilaDataEmpresa => {
    const t = totales.get(o.id);
    return {
      ocupanteId: o.ocupanteId || "",
      unidadFuncional: o.departamento,
      reportaA: o.reportaA,
      tituloCargo: o.tituloCargo,
      grado: o.hayGrade,
      fijos: repartir(piezas[i].fijos, conceptosFijos, "Otros pagos fijos"),
      variables: repartir(piezas[i].variables, conceptosVariables, "Otros variables"),
      metrica: t?.metrica ?? null,
      metricaTcr: t?.tcr ?? null,
    };
  });

  return { conceptosFijos, conceptosVariables, filas };
}
