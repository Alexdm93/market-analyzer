"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import type { CompanyInfo } from "@/lib/workspace";
import {
  EQUIPO_OPTS,
  EQUIPO_TOTAL_OPTS,
  FACT_RULES,
  PRESUP_OPTS,
  Q,
  calcGrade,
  revenueToIndex,
  type Familia,
} from "@/lib/capri-evaluacion";

// El componente usa ROLES internamente y además lo reexporta, porque
// app/market-analyzer/data/page.tsx lo importa desde aquí.
import { CAPRI_ROLES as ROLES } from "@/lib/capri";
export { ROLES };

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "familia" | "calibracion" | "magnitud" | "resultado";

interface Props {
  companyInfo: CompanyInfo;
  cargoNombre: string;
  existingGrade?: number;
  onSave: (grade: number, familia: Familia) => void;
  onClose: () => void;
  /** "simplified" oculta el número de grado y muestra solo el nivel organizacional */
  mode?: "full" | "simplified";
  showMirrors?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CapriWizardModal({ companyInfo, cargoNombre, onSave, onClose, mode = "full", showMirrors = false }: Props) {
  const simplified = mode === "simplified";
  const factIdx  = revenueToIndex(companyInfo.revenueUSD ?? "");
  const factRule = FACT_RULES[factIdx] ?? FACT_RULES[7];

  const [step,        setStep]        = useState<Step>("familia");
  const [familia,     setFamilia]     = useState<Familia | null>(null);
  const [equipoTipo,  setEquipoTipo]  = useState<string | null>(null);
  const [calibracion, setCalibracion] = useState<Record<string, number>>({});
  const [magnitud,    setMagnitud]    = useState<{ m1: number; m2: number }>({ m1: 0, m2: 0 });

  const hasMagnitud  = familia === "GE" || familia === "EJ";
  const needsEquipo  = familia === "LO" || familia === "GE" || familia === "EJ";
  const questions    = familia ? Q[familia] : [];
  const allAnswered  = familia ? questions.every((q) => calibracion[q.id] !== undefined) : false;
  const familiaReady = !!familia && (!needsEquipo || !!equipoTipo);

  const grade = familia && allAnswered
    ? calcGrade(familia, calibracion, magnitud, factIdx)
    : null;
  const roleInfo = grade !== null ? ROLES[grade] : null;

  function selectFamilia(f: Familia) {
    if (f === "EJ" && !factRule.ej) return;
    setFamilia(f);
    setEquipoTipo(null);
    setCalibracion({});
    setMagnitud({ m1: 0, m2: 0 });
  }

  function setAnswer(qId: string, value: number) {
    setCalibracion((prev) => ({ ...prev, [qId]: value }));
  }

  function goNext() {
    if (step === "familia" && familiaReady) setStep("calibracion");
    else if (step === "calibracion" && allAnswered) setStep(hasMagnitud ? "magnitud" : "resultado");
    else if (step === "magnitud") setStep("resultado");
  }

  function goPrev() {
    if (step === "resultado") setStep(hasMagnitud ? "magnitud" : "calibracion");
    else if (step === "magnitud") setStep("calibracion");
    else if (step === "calibracion") setStep("familia");
  }

  const FAMILIA_OPTS: { value: Familia; label: string; sub: string; color: string }[] = [
    { value: "IC", label: "A · Ruta Individual",                    sub: "Contribuidor individual. Sin personal bajo su cargo.",                           color: "bg-blue-500" },
    { value: "LO", label: "B · Ruta Liderazgo Operativo",           sub: "Lidera equipo operativo o técnico no profesional.",                             color: "bg-amber-500" },
    { value: "GE", label: "C · Ruta Liderazgo Táctico y Estratégico", sub: "Lidera equipo de profesionales y/o gestiona área de negocio.",               color: "bg-orange-500" },
    { value: "EJ", label: "D · Ruta Ejecutiva / Alta Dirección",    sub: "Dirige unidad de negocio, empresa o corporación.",                              color: "bg-red-500" },
  ];

  const presupOptions = PRESUP_OPTS;
  const equipoOptions = EQUIPO_TOTAL_OPTS;

  const stepLabel = { familia: "Etapa 1 · Familia", calibracion: "Etapa 2 · Calibración", magnitud: "Etapa 3 · Magnitud", resultado: "Resultado" };
  const totalSteps = hasMagnitud ? 4 : 3;
  const stepNum    = { familia: 1, calibracion: 2, magnitud: 3, resultado: totalSteps }[step];
  const progress   = (stepNum / totalSteps) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex-none bg-gradient-to-r from-teal-700 to-teal-900 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-teal-200">CAPRI 2.0 · Clasificación de cargo</p>
              <h2 className="mt-0.5 text-lg font-bold text-white">{cargoNombre}</h2>
              <p className="text-xs text-teal-300">{stepLabel[step]} · {factRule.label}{companyInfo.headcount ? ` · ${companyInfo.headcount} colaboradores` : ""}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-teal-200 hover:bg-teal-800" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-teal-800">
            <div
              className="h-full rounded-full bg-teal-300 transition-all duration-300"
              // eslint-disable-next-line react/forbid-dom-props
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* STEP: familia */}
          {step === "familia" && (
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-700">¿Cuál afirmación describe MEJOR el cargo?</p>
                {FAMILIA_OPTS.map((opt) => {
                  const disabled = opt.value === "EJ" && !factRule.ej;
                  const selected = familia === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectFamilia(opt.value)}
                      className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-all ${
                        disabled ? "cursor-not-allowed opacity-40" :
                        selected ? "border-teal-600 bg-teal-50 shadow-sm" : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-3 w-3 flex-none rounded-full ${opt.color}`} />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                          <p className="text-xs text-slate-500">{disabled ? "🚫 Bloqueada para facturación menor a 15MM USD." : opt.sub}</p>
                        </div>
                        {selected && <Check className="ml-auto h-4 w-4 flex-none text-teal-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Sub-pregunta: tipo de equipo */}
              {familia && needsEquipo && EQUIPO_OPTS[familia] && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-700">Tu equipo está compuesto principalmente por:</p>
                  <div className="space-y-2">
                    {EQUIPO_OPTS[familia]!.map((opt) => {
                      const sel = equipoTipo === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEquipoTipo(opt.value)}
                          className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-all ${
                            sel ? "border-teal-600 bg-teal-50 shadow-sm" : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-800">{opt.title}</p>
                            {sel && <Check className="h-4 w-4 flex-none text-teal-600" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP: calibracion */}
          {step === "calibracion" && (
            <div className="space-y-6">
              {questions.map((q, qi) => (
                <div key={q.id}>
                  <p className="mb-2 text-sm font-semibold text-slate-700">{qi + 1}. {q.title}</p>
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const selected = calibracion[q.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAnswer(q.id, opt.value)}
                          className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-all ${
                            selected ? "border-teal-600 bg-teal-50 shadow-sm" : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/50"
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-800">{opt.title}</p>
                          {opt.desc    && <p className="mt-0.5 text-xs text-slate-500">{opt.desc}</p>}
                          {opt.example && <p className="mt-1 border-t border-dashed border-slate-200 pt-1 text-[0.7rem] italic text-slate-400">{opt.example}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* STEP: magnitud */}
          {step === "magnitud" && (
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Presupuesto anual gestionado (USD)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(familia === "GE"
                    ? [{ value: 0, label: "No gestiona presupuesto" }, ...presupOptions]
                    : presupOptions
                  ).map((opt) => {
                    const sel = magnitud.m1 === opt.value;
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => setMagnitud((m) => ({ ...m, m1: opt.value }))}
                        className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${sel ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Tamaño total del equipo (directo + indirecto)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {equipoOptions.map((opt) => {
                    const sel = magnitud.m2 === opt.value;
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => setMagnitud((m) => ({ ...m, m2: opt.value }))}
                        className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${sel ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP: resultado */}
          {step === "resultado" && grade !== null && roleInfo && (
            <div className="space-y-4">
              {simplified ? (
                <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-center text-white">
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest text-teal-300">Nivel organizacional</p>
                  <p className="mt-3 text-xl font-bold leading-snug">{roleInfo.rol}</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-center text-white">
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest text-teal-300">Grado HAY</p>
                  <p className="mt-1 font-display text-7xl font-black">{grade}</p>
                  <p className="mt-1 text-base font-medium">{roleInfo.rol}</p>
                </div>
              )}
              {showMirrors && roleInfo.mirrors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Cargos espejo</p>
                  <ul className="space-y-1">
                    {roleInfo.mirrors.map((m) => (
                      <li key={m} className="text-sm text-amber-800">⸰ {m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-none border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-between gap-3">
          <button
            type="button"
            onClick={step === "familia" ? onClose : goPrev}
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === "familia" ? "Cancelar" : "Anterior"}
          </button>

          {step === "resultado" ? (
            <button
              type="button"
              onClick={() => { if (grade !== null && familia) { onSave(grade, familia); onClose(); } }}
              className="btn btn-primary flex items-center gap-1.5"
              disabled={grade === null}
            >
              <Check className="h-4 w-4" />
              {simplified ? "Guardar clasificación" : `Guardar grado ${grade}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={
                (step === "familia" && !familiaReady) ||
                (step === "calibracion" && !allAnswered) ||
                (step === "magnitud" && magnitud.m2 === 0 && (familia === "GE" || familia === "EJ"))
              }
              className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50"
            >
              {step === "calibracion" && !hasMagnitud ? (simplified ? "Clasificar" : "Calcular grado") : "Siguiente"}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
