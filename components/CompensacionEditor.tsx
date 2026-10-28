"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { FmtMoney } from "@/components/FmtMoney";
import { NumericInput } from "@/components/NumericInput";
import {
  BCV_EUR_TASA_ID,
  BCV_EUR_TASA_NOMBRE,
  BCV_TASA_ID,
  BCV_TASA_NOMBRE,
} from "@/lib/tasas-sistema";
import { FREQUENCY_OPTIONS, VARIABLE_BONUS_TYPES } from "@/lib/compensation-options";
import type { ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";

/**
 * Editor de la estructura de compensación de un cargo del Estudio de Competitividad.
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
 * Las dos tasas del BCV se ofrecen siempre, con su nombre.
 *
 * Antes la lista decía "Sin tasa (BCV)" y debajo las tasas propias de la
 * empresa, así que no había forma de pedir la del euro ni de saber cuál era
 * la que se estaba aplicando (AC Consulting, 2026-10-20). "Sin tasa" tampoco
 * describía lo que pasaba: cuando las monedas difieren siempre se convierte
 * con alguna.
 */
function opcionesDeTasa(tasas: ExchangeRate[]): ExchangeRate[] {
  const propias = tasas.filter((t) => !t.isSystem);
  const delSistema = tasas.filter((t) => t.isSystem);
  const bcv = delSistema.find((t) => t.id === BCV_TASA_ID)
    ?? { id: BCV_TASA_ID, nombre: BCV_TASA_NOMBRE, referencia: "BCV oficial", valor: "" };
  const euro = delSistema.find((t) => t.id === BCV_EUR_TASA_ID)
    ?? { id: BCV_EUR_TASA_ID, nombre: BCV_EUR_TASA_NOMBRE, referencia: "BCV oficial EUR", valor: "" };
  return [bcv, euro, ...propias];
}

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
  const opciones = opcionesDeTasa(tasas);
  // Lo guardado antes con la tasa vacía significaba "la del BCV", así que se
  // muestra como tal en vez de dejar el desplegable en blanco.
  return (
    <select
      aria-label={etiqueta}
      value={mismaMoneda ? "" : (tasaId || BCV_TASA_ID)}
      onChange={(e) => onTasa(e.target.value)}
      disabled={deshabilitado || mismaMoneda}
      className={`field-select text-sm w-full ${mismaMoneda ? "opacity-50" : ""}`}
    >
      {mismaMoneda
        ? <option value="">No aplica</option>
        : opciones.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>
          ))}
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

/**
 * El monto con su moneda de cuenta dentro del campo, a la derecha.
 *
 * Es lo que hace legible una tabla donde conviven bolívares y dólares: sin el
 * sufijo hay que mirar dos columnas más allá para saber qué significa el
 * número. Copiado de la sección de Data (AC Consulting, 2026-10-28).
 */
function MontoConMoneda({
  etiqueta, valor, moneda, deshabilitado, onChange,
}: {
  etiqueta: string;
  valor: number;
  moneda: string | undefined;
  deshabilitado?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="relative">
      <NumericInput
        aria-label={etiqueta}
        value={valor}
        onChange={onChange}
        disabled={deshabilitado}
        className="field text-sm w-full pr-10"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
        {moneda === "VES" ? "Bs." : "$"}
      </span>
    </div>
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

  /**
   * Fija y variable en pestañas, como en la sección de Data.
   *
   * Lo pidió el CEO (2026-10-28) para que las dos pantallas donde se carga la
   * misma información se completen igual. Antes iban una debajo de la otra y
   * la ficha quedaba larguísima.
   */
  const [pestana, setPestana] = useState<"fija" | "variable">("fija");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200" role="tablist">
        {([["fija", "Comp. Fija", fijos.length], ["variable", "Comp. Variable", variables.length]] as const)
          .map(([clave, etiqueta, cuantos]) => (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={pestana === clave}
              onClick={() => setPestana(clave)}
              className={`-mb-px rounded-t-xl border-b-2 px-4 py-2 text-sm font-semibold transition ${
                pestana === clave
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {etiqueta}
              {cuantos > 0 && (
                <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-slate-600">
                  {cuantos}
                </span>
              )}
            </button>
          ))}
      </div>

      {/* ── Compensación fija ─────────────────────────────────────────── */}
      <div hidden={pestana !== "fija"}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="field-label mb-0">Compensación fija del cargo</p>
          <button
            type="button"
            onClick={() => agregarConcepto("additionalFixedPayments")}
            disabled={deshabilitado}
            className="btn btn-secondary text-xs disabled:opacity-40"
          >
            <Plus size={14} /> Agregar concepto
          </button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Concepto</th>
                <th className="px-3 py-2 font-semibold">Monto</th>
                <th className="px-3 py-2 font-semibold">Mon. Cuenta</th>
                <th className="px-3 py-2 font-semibold">Mon. Pago</th>
                <th className="px-3 py-2 font-semibold">Tasa</th>
                <th className="px-3 py-2 font-semibold">Pasivos</th>
                <th className="px-3 py-2 font-semibold">Frecuencia</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-2"><span className="field block bg-slate-100 text-sm leading-snug">Sueldo básico</span></td>
                <td className="px-3 py-2">
                  <MontoConMoneda
                    etiqueta="Monto sueldo básico"
                    valor={valor.sueldoBasico ?? 0}
                    moneda={valor.sueldoBasicoCuentaMoneda}
                    deshabilitado={deshabilitado}
                    onChange={(v) => set({ sueldoBasico: v })}
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
                <td className="px-3 py-2"><span className="field block bg-slate-50 text-sm leading-snug text-slate-400">Sí</span></td>
                <td className="px-3 py-2"><span className="field block bg-slate-50 text-sm leading-snug text-slate-400">Mensual</span></td>
                <td />
              </tr>

              <tr>
                <td className="px-3 py-2"><span className="field block bg-slate-100 text-sm leading-snug">Bono alimentación</span></td>
                <td className="px-3 py-2">
                  <MontoConMoneda
                    etiqueta="Monto bono alimentación"
                    valor={valor.bonoAlimentacion ?? 0}
                    moneda={valor.bonoAlimentacionCuentaMoneda}
                    deshabilitado={deshabilitado}
                    onChange={(v) => set({ bonoAlimentacion: v })}
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
                <td className="px-3 py-2"><span className="field block bg-slate-50 text-sm leading-snug text-slate-400">No</span></td>
                <td className="px-3 py-2"><span className="field block bg-slate-50 text-sm leading-snug text-slate-400">Mensual</span></td>
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
                    <MontoConMoneda
                      etiqueta="Monto del concepto fijo"
                      valor={c.amount ?? 0}
                      moneda={c.accountCurrency}
                      deshabilitado={deshabilitado}
                      onChange={(v) => actualizarConcepto("additionalFixedPayments", idx, { amount: v })}
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
                    {/* Si el concepto impacta las prestaciones. Faltaba: se
                        creaba siempre en "No" y no había forma de cambiarlo,
                        así que el mismo concepto cargado desde Data y desde
                        acá daba un CIM y un PCTA distintos
                        (AC Consulting, 2026-10-28). */}
                    <select
                      aria-label="Pasivos del concepto fijo"
                      value={c.impacto ? "si" : "no"}
                      onChange={(e) => actualizarConcepto("additionalFixedPayments", idx, { impacto: e.target.value === "si" })}
                      disabled={deshabilitado}
                      className="field-select text-sm w-full"
                    >
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
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
      </div>

      {/* ── Compensación variable ─────────────────────────────────────── */}
      <div hidden={pestana !== "variable"}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="field-label mb-0">Compensación variable del cargo</p>
          <button
            type="button"
            onClick={() => agregarConcepto("additionalVariablePayments")}
            disabled={deshabilitado}
            className="btn btn-secondary text-xs disabled:opacity-40"
          >
            <Plus size={14} /> Agregar concepto
          </button>
        </div>
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
