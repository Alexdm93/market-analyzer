"use client";
import { Plus, Trash2 } from "lucide-react";

import { FmtMoney } from "@/components/FmtMoney";
import { NumericInput } from "@/components/NumericInput";
import { FREQUENCY_OPTIONS, VARIABLE_BONUS_TYPES } from "@/lib/compensation-options";
import type { ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";

/**
 * Editor de la estructura de compensación de un cargo del Estudio Especializado.
 *
 * Trabaja sobre la MISMA forma de datos que la pantalla de Data
 * (`ExtendedMarketPosition`), para que el cálculo de totales y el resto del
 * sistema no distingan de dónde salió el cargo. Es un editor propio y no el de
 * `data/page.tsx` porque aquel son ~500 líneas de JSX dentro de la ruta que las
 * empresas usan a diario: replicar la forma de los datos es barato, tocar esa
 * ruta no.
 *
 * Igual que en Data, el sueldo básico y el bono de alimentación son siempre
 * mensuales y su impacto en prestaciones está fijo, así que no se piden.
 */

type Props = {
  valor: Partial<ExtendedMarketPosition>;
  tasas: ExchangeRate[];
  onChange: (siguiente: Partial<ExtendedMarketPosition>) => void;
  deshabilitado?: boolean;
};

const MONEDAS: Array<{ value: "USD" | "VES"; label: string }> = [
  { value: "USD", label: "USD" },
  { value: "VES", label: "Bs." },
];


/**
 * La tasa solo aplica cuando la moneda del monto y la de pago son distintas.
 *
 * Va a nivel de módulo y no dentro del editor: definida adentro, React la
 * recrearía en cada render y remontaría el select, que perdería el foco.
 */
function SelectorTasa({
  cuenta, pago, tasaId, onTasa, etiqueta, tasas, deshabilitado,
}: {
  cuenta?: string; pago?: string; tasaId?: string;
  onTasa: (id: string) => void; etiqueta: string;
  tasas: ExchangeRate[]; deshabilitado: boolean;
}) {
  const mismaMoneda = (cuenta || "USD") === (pago || "USD");
  return (
    <select
      aria-label={etiqueta}
      value={mismaMoneda ? "" : (tasaId || "")}
      onChange={(e) => onTasa(e.target.value)}
      disabled={deshabilitado || mismaMoneda}
      className={`field-select text-sm w-full ${mismaMoneda ? "opacity-50" : ""}`}
    >
      {mismaMoneda
        ? <option value="">No aplica</option>
        : <>
            <option value="">Sin tasa (BCV)</option>
            {tasas.map((t) => <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>)}
          </>}
    </select>
  );
}

function FilaMoneda({
  cuenta, pago, onCuenta, onPago, prefijo, deshabilitado,
}: {
  cuenta?: string; pago?: string;
  onCuenta: (v: "USD" | "VES") => void; onPago: (v: "USD" | "VES") => void;
  prefijo: string; deshabilitado: boolean;
}) {
  return (
    <>
      <td className="px-3 py-2">
        <select
          aria-label={`Moneda del monto — ${prefijo}`}
          value={cuenta || "USD"}
          onChange={(e) => onCuenta(e.target.value as "USD" | "VES")}
          disabled={deshabilitado}
          className="field-select text-sm w-full"
        >
          {MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={`Moneda de pago — ${prefijo}`}
          value={pago || "USD"}
          onChange={(e) => onPago(e.target.value as "USD" | "VES")}
          disabled={deshabilitado}
          className="field-select text-sm w-full"
        >
          {MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </td>
    </>
  );
}

export function CompensacionEditor({ valor, tasas, onChange, deshabilitado = false }: Props) {
  function set(patch: Partial<ExtendedMarketPosition>) {
    onChange({ ...valor, ...patch });
  }

  function setConceptos(clave: "additionalFixedPayments" | "additionalVariablePayments", lista: CompensationConcept[]) {
    onChange({ ...valor, [clave]: lista });
  }

  function agregarConcepto(clave: "additionalFixedPayments" | "additionalVariablePayments") {
    const lista = [...(valor[clave] ?? [])];
    lista.push({
      id: `c-${Date.now()}-${lista.length}`,
      concept: "",
      amount: 0,
      freq: "monthly",
      accountCurrency: "USD",
      paymentCurrency: "USD",
      impacto: false,
      tasaId: "",
      ...(clave === "additionalVariablePayments" ? { variableType: "performance" as const } : {}),
    });
    setConceptos(clave, lista);
  }

  function actualizarConcepto(
    clave: "additionalFixedPayments" | "additionalVariablePayments",
    idx: number,
    patch: Partial<CompensationConcept>,
  ) {
    const lista = [...(valor[clave] ?? [])];
    lista[idx] = { ...lista[idx], ...patch };
    setConceptos(clave, lista);
  }

  function quitarConcepto(clave: "additionalFixedPayments" | "additionalVariablePayments", idx: number) {
    setConceptos(clave, (valor[clave] ?? []).filter((_, i) => i !== idx));
  }

  const fijos = valor.additionalFixedPayments ?? [];
  const variables = valor.additionalVariablePayments ?? [];

  return (
    <div className="space-y-5">
      {/* ── Compensación fija ─────────────────────────────────────────── */}
      <div>
        <p className="field-label">Compensación fija</p>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Concepto</th>
                <th className="px-3 py-2 font-semibold">Monto</th>
                <th className="px-3 py-2 font-semibold">Moneda monto</th>
                <th className="px-3 py-2 font-semibold">Moneda pago</th>
                <th className="px-3 py-2 font-semibold">Tasa</th>
                <th className="px-3 py-2 font-semibold">Frecuencia</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-2"><span className="field bg-slate-100 text-sm">Sueldo básico</span></td>
                <td className="px-3 py-2">
                  <NumericInput
                    aria-label="Monto sueldo básico"
                    value={valor.sueldoBasico ?? 0}
                    onChange={(v) => set({ sueldoBasico: v })}
                    disabled={deshabilitado}
                    className="field text-sm w-full"
                  />
                </td>
                <FilaMoneda
                  deshabilitado={deshabilitado}
                  prefijo="sueldo básico"
                  cuenta={valor.sueldoBasicoCuentaMoneda}
                  pago={valor.sueldoBasicoMonedaPago}
                  onCuenta={(v) => set({ sueldoBasicoCuentaMoneda: v })}
                  onPago={(v) => set({ sueldoBasicoMonedaPago: v })}
                />
                <td className="px-3 py-2">
                  <SelectorTasa
                    tasas={tasas}
                    deshabilitado={deshabilitado}
                    etiqueta="Tasa sueldo básico"
                    cuenta={valor.sueldoBasicoCuentaMoneda}
                    pago={valor.sueldoBasicoMonedaPago}
                    tasaId={valor.sueldoBasicoTasaId}
                    onTasa={(id) => set({ sueldoBasicoTasaId: id })}
                  />
                </td>
                <td className="px-3 py-2"><span className="field bg-slate-50 text-sm text-slate-400">Mensual</span></td>
                <td />
              </tr>

              <tr>
                <td className="px-3 py-2"><span className="field bg-slate-100 text-sm">Bono alimentación</span></td>
                <td className="px-3 py-2">
                  <NumericInput
                    aria-label="Monto bono alimentación"
                    value={valor.bonoAlimentacion ?? 0}
                    onChange={(v) => set({ bonoAlimentacion: v })}
                    disabled={deshabilitado}
                    className="field text-sm w-full"
                  />
                </td>
                <FilaMoneda
                  deshabilitado={deshabilitado}
                  prefijo="bono alimentación"
                  cuenta={valor.bonoAlimentacionCuentaMoneda}
                  pago={valor.bonoAlimentacionMonedaPago}
                  onCuenta={(v) => set({ bonoAlimentacionCuentaMoneda: v })}
                  onPago={(v) => set({ bonoAlimentacionMonedaPago: v })}
                />
                <td className="px-3 py-2">
                  <SelectorTasa
                    tasas={tasas}
                    deshabilitado={deshabilitado}
                    etiqueta="Tasa bono alimentación"
                    cuenta={valor.bonoAlimentacionCuentaMoneda}
                    pago={valor.bonoAlimentacionMonedaPago}
                    tasaId={valor.bonoAlimentacionTasaId}
                    onTasa={(id) => set({ bonoAlimentacionTasaId: id })}
                  />
                </td>
                <td className="px-3 py-2"><span className="field bg-slate-50 text-sm text-slate-400">Mensual</span></td>
                <td />
              </tr>

              {fijos.map((c, idx) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <input
                      aria-label="Nombre del concepto fijo"
                      placeholder="Ej. Prima de profesionalización"
                      value={c.concept}
                      onChange={(e) => actualizarConcepto("additionalFixedPayments", idx, { concept: e.target.value })}
                      disabled={deshabilitado}
                      className="field text-sm w-full"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <NumericInput
                      aria-label="Monto del concepto fijo"
                      value={c.amount ?? 0}
                      onChange={(v) => actualizarConcepto("additionalFixedPayments", idx, { amount: v })}
                      disabled={deshabilitado}
                      className="field text-sm w-full"
                    />
                  </td>
                  <FilaMoneda
                  deshabilitado={deshabilitado}
                    prefijo="concepto fijo"
                    cuenta={c.accountCurrency}
                    pago={c.paymentCurrency}
                    onCuenta={(v) => actualizarConcepto("additionalFixedPayments", idx, { accountCurrency: v })}
                    onPago={(v) => actualizarConcepto("additionalFixedPayments", idx, { paymentCurrency: v })}
                  />
                  <td className="px-3 py-2">
                    <SelectorTasa
                    tasas={tasas}
                    deshabilitado={deshabilitado}
                      etiqueta="Tasa del concepto fijo"
                      cuenta={c.accountCurrency}
                      pago={c.paymentCurrency}
                      tasaId={c.tasaId}
                      onTasa={(id) => actualizarConcepto("additionalFixedPayments", idx, { tasaId: id })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label="Frecuencia del concepto fijo"
                      value={c.freq || "monthly"}
                      onChange={(e) => actualizarConcepto("additionalFixedPayments", idx, { freq: e.target.value as PaymentFrequency })}
                      disabled={deshabilitado}
                      className="field-select text-sm w-full"
                    >
                      {/* La plataforma no admite quincenal en los pagos fijos. */}
                      {FREQUENCY_OPTIONS.filter((o) => o.value !== "biweekly").map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-label="Eliminar concepto fijo"
                      onClick={() => quitarConcepto("additionalFixedPayments", idx)}
                      disabled={deshabilitado}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => agregarConcepto("additionalFixedPayments")}
          disabled={deshabilitado}
          className="btn btn-secondary mt-2 text-xs disabled:opacity-40"
        >
          <Plus size={14} /> Agregar concepto fijo
        </button>
      </div>

      {/* ── Compensación variable ─────────────────────────────────────── */}
      <div>
        <p className="field-label">Compensación variable</p>
        {variables.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-500">
            Sin conceptos variables.
          </p>
        )}
        <div className="space-y-3">
          {variables.map((c, idx) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="field-label">Concepto</label>
                  <input
                    aria-label="Nombre del concepto variable"
                    placeholder="Ej. Bono anual por desempeño"
                    value={c.concept}
                    onChange={(e) => actualizarConcepto("additionalVariablePayments", idx, { concept: e.target.value })}
                    disabled={deshabilitado}
                    className="field text-sm w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Tipo</label>
                  <select
                    aria-label="Tipo de variable"
                    value={c.variableType ?? "performance"}
                    onChange={(e) => actualizarConcepto("additionalVariablePayments", idx, { variableType: e.target.value as "performance" | "commission" })}
                    disabled={deshabilitado}
                    className="field-select text-sm w-full"
                  >
                    {VARIABLE_BONUS_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Monto</label>
                  <NumericInput
                    aria-label="Monto del concepto variable"
                    value={c.amount ?? 0}
                    onChange={(v) => actualizarConcepto("additionalVariablePayments", idx, { amount: v })}
                    disabled={deshabilitado}
                    className="field text-sm w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Moneda del monto</label>
                  <select
                    aria-label="Moneda del monto variable"
                    value={c.accountCurrency || "USD"}
                    onChange={(e) => actualizarConcepto("additionalVariablePayments", idx, { accountCurrency: e.target.value as "USD" | "VES" })}
                    disabled={deshabilitado}
                    className="field-select text-sm w-full"
                  >
                    {MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Moneda de pago</label>
                  <select
                    aria-label="Moneda de pago variable"
                    value={c.paymentCurrency || "USD"}
                    onChange={(e) => actualizarConcepto("additionalVariablePayments", idx, { paymentCurrency: e.target.value as "USD" | "VES" })}
                    disabled={deshabilitado}
                    className="field-select text-sm w-full"
                  >
                    {MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Tasa</label>
                  <SelectorTasa
                    tasas={tasas}
                    deshabilitado={deshabilitado}
                    etiqueta="Tasa del concepto variable"
                    cuenta={c.accountCurrency}
                    pago={c.paymentCurrency}
                    tasaId={c.tasaId}
                    onTasa={(id) => actualizarConcepto("additionalVariablePayments", idx, { tasaId: id })}
                  />
                </div>
                <div>
                  <label className="field-label">Frecuencia</label>
                  <select
                    aria-label="Frecuencia del concepto variable"
                    value={c.freq || "monthly"}
                    onChange={(e) => actualizarConcepto("additionalVariablePayments", idx, { freq: e.target.value as PaymentFrequency })}
                    disabled={deshabilitado}
                    className="field-select text-sm w-full"
                  >
                    {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={Boolean(c.impacto)}
                    onChange={(e) => actualizarConcepto("additionalVariablePayments", idx, { impacto: e.target.checked })}
                    disabled={deshabilitado}
                  />
                  Impacta prestaciones
                </label>
                <button
                  type="button"
                  onClick={() => quitarConcepto("additionalVariablePayments", idx)}
                  disabled={deshabilitado}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => agregarConcepto("additionalVariablePayments")}
          disabled={deshabilitado}
          className="btn btn-secondary mt-2 text-xs disabled:opacity-40"
        >
          <Plus size={14} /> Agregar concepto variable
        </button>
      </div>
    </div>
  );
}

/** Resumen de lo que suma el cargo, para mostrar junto al editor. */
export function ResumenCompensacion({ total }: { total: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">Total efectivo mensual (TEM)</p>
      <p className="mt-1 font-display text-lg font-bold text-slate-900"><FmtMoney value={total} /></p>
    </div>
  );
}
