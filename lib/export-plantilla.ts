/**
 * Llena la plantilla de carga con la data que la empresa ya tiene en un corte.
 *
 * Es el viaje de vuelta de `lib/import-cargos.ts`: sale el mismo archivo que
 * se sube, para poder bajarlo, corregirlo en Excel y volver a cargarlo.
 *
 * La plantilla solo tiene columnas propias para el sueldo básico y el bono de
 * alimentación; todo lo demás va a la hoja "Otros pagos". Los campos sueltos
 * que traen las filas viejas (movilización, desempeño, comisiones) también se
 * escriben ahí, porque si no se perderían al volver a subir el archivo.
 */
import { CARGOS_HEADERS, ADICIONALES_HEADERS, COL, SUF, TASAS_HEADERS, col } from "@/lib/import-cargos";
import { FREQUENCY_OPTIONS } from "@/lib/compensation-options";
import type { ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";

export type Celda = string | number | null;

export type FilasPlantilla = {
  cargos: Celda[][];
  otros: Celda[][];
  tasas: Celda[][];
};

function norm(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function frecuencia(f: PaymentFrequency | undefined): string {
  return FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? "Mensual";
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function filasDeLaEmpresa(
  catalogo: Array<{ departamento: string; tituloCargo: string }>,
  posiciones: Array<{ title: string; dataJson: string }>,
  tasas: ExchangeRate[],
): FilasPlantilla {
  const nombreTasa = (id: string | undefined): string | null =>
    tasas.find((t) => t.id === id && !t.isSystem)?.nombre ?? null;

  const porTitulo = new Map<string, Partial<ExtendedMarketPosition>>();
  for (const p of posiciones) {
    try {
      porTitulo.set(norm(p.title), JSON.parse(p.dataJson) as Partial<ExtendedMarketPosition>);
    } catch {
      /* una fila ilegible no debe tumbar la descarga */
    }
  }

  const otros: Celda[][] = [];

  const agregarOtro = (
    cargo: string,
    clase: "Fijo" | "Variable",
    concepto: string,
    monto: number,
    freq: PaymentFrequency | undefined,
    cuenta: "USD" | "VES" | undefined,
    pago: "USD" | "VES" | undefined,
    tasaId: string | undefined,
    impacto: boolean | undefined,
    tipoVariable: string | null,
  ) => {
    otros.push(ADICIONALES_HEADERS.map((h) => {
      switch (h) {
        case "Cargo": return cargo;
        case "Clase": return clase;
        case "Concepto": return concepto;
        case "Monto": return monto;
        case "Frecuencia": return frecuencia(freq);
        case "Moneda del monto": return cuenta ?? "VES";
        case "Moneda de pago": return pago ?? cuenta ?? "VES";
        case "Tasa": return nombreTasa(tasaId);
        case "Impacta prestaciones": return impacto ? "Sí" : "No";
        case "Tipo de variable": return tipoVariable;
        default: return null;
      }
    }));
  };

  const cargos: Celda[][] = catalogo.map((c) => {
    const d = porTitulo.get(norm(c.tituloCargo));

    if (d) {
      for (const concepto of d.additionalFixedPayments ?? []) {
        const monto = numero(concepto.amount);
        if (monto === null) continue;
        agregarOtro(c.tituloCargo, "Fijo", concepto.concept || "Concepto", monto, concepto.freq,
          concepto.accountCurrency, concepto.paymentCurrency, concepto.tasaId, concepto.impacto, null);
      }
      for (const concepto of (d.additionalVariablePayments ?? []) as CompensationConcept[]) {
        const monto = numero(concepto.amount);
        if (monto === null) continue;
        agregarOtro(c.tituloCargo, "Variable", concepto.concept || "Concepto", monto, concepto.freq,
          concepto.accountCurrency, concepto.paymentCurrency, concepto.tasaId, concepto.impacto,
          concepto.variableType === "commission" ? "Comisión" : "Desempeño");
      }

      // Los campos sueltos de las filas viejas, para no perderlos al reimportar.
      const sueltos: Array<[string, "Fijo" | "Variable", number | null, PaymentFrequency | undefined,
        "USD" | "VES" | undefined, "USD" | "VES" | undefined, boolean | undefined, string | null]> = [
        ["Bono de movilización", "Fijo", numero(d.bonoMovilizacion), d.bonoMovilizacionFreq,
          d.bonoMovilizacionCuentaMoneda, d.bonoMovilizacionMonedaPago, d.bonoMovilizacionImpacto, null],
        ["Bono por desempeño", "Variable", numero(d.bonoDesempeno), d.bonoDesempenoFreq,
          d.bonoDesempenoCuentaMoneda, d.bonoDesempenoMonedaPago, d.bonoDesempenoImpacto, "Desempeño"],
        ["Comisiones", "Variable", numero(d.comisiones), d.comisionesFreq,
          d.comisionesCuentaMoneda, d.comisionesMonedaPago, d.comisionesImpacto, "Comisión"],
        ["Otro pago variable", "Variable", numero(d.pagoVariableOtros), d.pagoVariableOtrosFreq,
          d.pagoVariableOtrosCuentaMoneda, d.pagoVariableOtrosMonedaPago, d.pagoVariableOtrosImpacto, "Desempeño"],
      ];
      for (const [concepto, clase, monto, freq, cuenta, pago, impacto, tipo] of sueltos) {
        if (monto === null) continue;
        agregarOtro(c.tituloCargo, clase, concepto, monto, freq, cuenta, pago, undefined, impacto, tipo);
      }
    }

    return CARGOS_HEADERS.map((h) => {
      if (h === COL.departamento) return c.departamento;
      if (h === COL.cargo) return c.tituloCargo;
      if (!d) return null;
      if (h === COL.grado) return typeof d.hayGrade === "number" ? d.hayGrade : null;
      if (h === COL.familia) return d.capriFamily ?? null;

      if (h === "Sueldo básico") return numero(d.sueldoBasico);
      if (h === col("Sueldo básico", SUF.cuenta)) return d.sueldoBasicoCuentaMoneda ?? null;
      if (h === col("Sueldo básico", SUF.pago)) return d.sueldoBasicoMonedaPago ?? null;
      if (h === col("Sueldo básico", SUF.tasa)) return nombreTasa(d.sueldoBasicoTasaId);

      if (h === "Bono alimentación") return numero(d.bonoAlimentacion);
      if (h === col("Bono alimentación", SUF.cuenta)) return d.bonoAlimentacionCuentaMoneda ?? null;
      if (h === col("Bono alimentación", SUF.pago)) return d.bonoAlimentacionMonedaPago ?? null;
      if (h === col("Bono alimentación", SUF.tasa)) return nombreTasa(d.bonoAlimentacionTasaId);

      return null;
    });
  });

  const filasTasas: Celda[][] = tasas
    .filter((t) => !t.isSystem)
    .map((t) => TASAS_HEADERS.map((h) => {
      if (h === "Nombre de la tasa") return t.nombre;
      if (h === "Referencia") return t.referencia;
      return numero(t.valor);
    }));

  return { cargos, otros, tasas: filasTasas };
}
