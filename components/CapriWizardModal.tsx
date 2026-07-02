"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import type { CompanyInfo } from "@/lib/workspace";

// ─── CAPRI data ──────────────────────────────────────────────────────────────

const FACT_RULES: Record<number, { ej: boolean; max: number; label: string }> = {
  1: { ej: false, max: 20, label: "Hasta 500M USD" },
  2: { ej: false, max: 21, label: "500M – 5MM USD" },
  3: { ej: false, max: 22, label: "5MM – 15MM USD" },
  4: { ej: true,  max: 23, label: "15MM – 25MM USD" },
  5: { ej: true,  max: 24, label: "25MM – 50MM USD" },
  6: { ej: true,  max: 24, label: "50MM – 150MM USD" },
  7: { ej: true,  max: 25, label: "más de 150MM USD" },
};

type Familia = "IC" | "LO" | "GE" | "EJ";

type QuestionOpt = { value: number; title: string; desc?: string; example?: string };
type Question    = { id: string; title: string; options: QuestionOpt[] };

const Q: Record<Familia, Question[]> = {
  IC: [
    {
      id: "autonomia", title: "¿Cuánta supervisión recibe?",
      options: [
        { value: 8,    title: "Supervisión constante",   desc: "Revisión varias veces al día" },
        { value: 9,    title: "Supervisión periódica",   desc: "Revisión diaria" },
        { value: 10.5, title: "Por procedimientos",      desc: "Sigue protocolos definidos" },
        { value: 13,   title: "Por resultados",          desc: "Revisión semanal" },
        { value: 16,   title: "Supervisión general",     desc: "Revisión mensual" },
        { value: 19,   title: "Total autonomía",         desc: "Define enfoques y métodos" },
      ],
    },
    {
      id: "complejidad", title: "¿Qué tipo de problemas resuelve habitualmente?",
      options: [
        { value: 8.5,  title: "Problemas conocidos con solución estándar",      desc: "Situaciones con procedimiento documentado. Aplica lo que está escrito.",     example: "Ej: cajero detecta billete falso y aplica protocolo." },
        { value: 10.5, title: "Problemas comunes con análisis básico",           desc: "Situaciones recurrentes con varias soluciones posibles.",                    example: "Ej: técnico identifica falla de máquina entre 3-4 causas típicas." },
        { value: 13,   title: "Problemas técnicos especializados",               desc: "Requieren conocimiento profesional avanzado.",                               example: "Ej: ingeniero diseña solución a falla recurrente." },
        { value: 16,   title: "Problemas complejos con interdependencias",       desc: "Solución impacta varias áreas. Requiere coordinación y trade-offs.",         example: "Ej: rediseño de proceso que toca operaciones, finanzas y calidad." },
        { value: 19,   title: "Problemas estratégicos sin precedente",           desc: "Situaciones nuevas. No hay solución previa; se diseña algo original.",       example: "Ej: crear nuevo modelo de negocio digital." },
      ],
    },
    {
      id: "dominio", title: "¿Tiempo para dominar el puesto?",
      options: [
        { value: 8,  title: "Menos de 6 meses" }, { value: 9,  title: "6 meses a 1 año" },
        { value: 10, title: "1 a 2 años" },        { value: 12, title: "2 a 4 años" },
        { value: 15, title: "4 a 7 años" },        { value: 19, title: "Más de 7 años" },
      ],
    },
    {
      id: "formacion", title: "¿Formación mínima necesaria?",
      options: [
        { value: 8.5,  title: "Educación básica" },
        { value: 11,   title: "Bachillerato técnico" },
        { value: 13,   title: "Título universitario sin experiencia" },
        { value: 14.5, title: "Título + 3-5 años experiencia" },
        { value: 16.5, title: "Título + 5-10 años + especialización" },
        { value: 19,   title: "Posgrado + experiencia experta" },
      ],
    },
  ],
  LO: [
    {
      id: "tamanoEquipo", title: "¿Cuántas personas le reportan directamente?",
      options: [
        { value: 14, title: "1 a 5 personas" }, { value: 15, title: "6 a 15 personas" }, { value: 16, title: "Más de 15 personas" },
      ],
    },
    {
      id: "foco", title: "¿Cuál es la actividad central del supervisor?",
      options: [
        { value: 14, title: "Asegurar la ejecución diaria",     desc: "Que las tareas operativas se cumplan según lo planeado.",        example: "Ej: supervisor de planta verifica turnos y controla metas diarias." },
        { value: 15, title: "Optimizar procesos del equipo",    desc: "Identifica oportunidades de mejora y aplica cambios.",           example: "Ej: supervisor rediseña flujo de despacho reduciendo tiempos 20%." },
        { value: 16, title: "Resolver problemas departamentales", desc: "Lidera equipos grandes, enfrenta problemas que afectan al departamento.", example: "Ej: coordinador gestiona plan de contingencia ante caída de producción." },
      ],
    },
  ],
  GE: [
    {
      id: "tipo", title: "¿Cuál describe mejor el alcance gerencial?",
      options: [
        { value: 17, title: "Gerencia Media Inicial",     desc: "Lidera equipo y diseña soluciones para objetivos del área" },
        { value: 18, title: "Gerencia Media Intermedia",  desc: "Implementa proyectos y cambios importantes" },
        { value: 19, title: "Gerencia Media Avanzada",    desc: "Crea soluciones innovadoras" },
        { value: 20, title: "Gerencia Alta Inicial",      desc: "Dirige empresa pequeña o unidad" },
        { value: 21, title: "Gerencia Alta Intermedia",   desc: "Dirige empresa pequeña-mediana" },
        { value: 22, title: "Gerencia Alta Avanzada",     desc: "Dirige empresa mediana" },
      ],
    },
    {
      id: "alcance", title: "Las decisiones afectan a:",
      options: [
        { value: 17,   title: "Solo su equipo / proyecto" },
        { value: 18,   title: "Todo su departamento" },
        { value: 19,   title: "Varios departamentos" },
        { value: 20,   title: "Unidad de negocio o empresa pequeña" },
        { value: 21.5, title: "Toda una empresa de tamaño medio" },
      ],
    },
    {
      id: "pl", title: "¿Responsabilidad sobre resultados financieros (P&L)?",
      options: [
        { value: 17.5, title: "Sin responsabilidad financiera" },
        { value: 19,   title: "Responsabilidad parcial",            desc: "Sobre componente específico" },
        { value: 20,   title: "Total sobre resultados de unidad pequeña" },
        { value: 21.5, title: "Total sobre resultados de empresa" },
      ],
    },
  ],
  EJ: [
    {
      id: "tipo", title: "¿Cuál describe mejor la naturaleza de la dirección?",
      options: [
        { value: 23, title: "Gerencia Ejecutiva Inicial",   desc: "Dirige gran segmento del negocio en empresa mediana-grande.",      example: "Ej: VP Operaciones, CFO, Director Comercial Nacional." },
        { value: 24, title: "Gerencia Ejecutiva Intermedia", desc: "Dirige empresa grande nacional. Máximo responsable en un país.",   example: "Ej: CEO de empresa nacional, presidente de filial país." },
        { value: 25, title: "Gerencia Ejecutiva Avanzada",  desc: "Dirige corporación o grupo multinacional.",                         example: "Ej: CEO grupo multinacional, presidente regional Latam." },
      ],
    },
    {
      id: "horizonte", title: "¿Horizonte temporal de decisiones?",
      options: [
        { value: 22,   title: "1-2 años (operativo)", desc: "⚠️ Revisar si es realmente ejecutivo" },
        { value: 23,   title: "3-5 años (estratégico)" },
        { value: 24.5, title: "5-10 años (visión)" },
      ],
    },
  ],
};

const ROLES: Record<number, { rol: string; mirrors: string[] }> = {
  8:  { rol: "Trabajo Simple y Rutinario",             mirrors: ["Operario de Limpieza", "Empacador", "Mensajero"] },
  9:  { rol: "Trabajo Semi-Complejo",                  mirrors: ["Operador de Maquinaria", "Recepcionista", "Cajero"] },
  10: { rol: "Trabajo Técnico Variado",                mirrors: ["Técnico Junior", "Asistente Sr"] },
  11: { rol: "Trabajo Técnico Especializado",          mirrors: ["Técnico de Mantenimiento"] },
  12: { rol: "Trabajo Técnico Especializado Superior", mirrors: ["Técnico Senior"] },
  13: { rol: "Trabajo Profesional Básico",             mirrors: ["Ingeniero Junior", "Analista Jr"] },
  14: { rol: "Profesional con Experiencia / Supervisor Inicial",  mirrors: ["Analista", "Supervisor de turno"] },
  15: { rol: "Especialista Técnico Inicial / Supervisor Técnico", mirrors: ["Supervisor de área"] },
  16: { rol: "Especialista Semi Senior / Supervisor Senior",      mirrors: ["Coordinador", "Ingeniero de procesos"] },
  17: { rol: "Especialista Senior / Gerencia Media Inicial",      mirrors: ["Jefe de área"] },
  18: { rol: "Gerencia Media Intermedia",              mirrors: ["Gerente de departamento"] },
  19: { rol: "Gerencia Media Avanzada",                mirrors: ["Gerente Senior"] },
  20: { rol: "Gerencia Alta Inicial",                  mirrors: ["GM startup"] },
  21: { rol: "Gerencia Alta Intermedia",               mirrors: ["GM empresa familiar"] },
  22: { rol: "Gerencia Alta Avanzada",                 mirrors: ["Director Unidad de Negocio"] },
  23: { rol: "Gerencia Ejecutiva Inicial",             mirrors: ["VP Operaciones", "CFO"] },
  24: { rol: "Gerencia Ejecutiva Intermedia",          mirrors: ["CEO empresa nacional"] },
  25: { rol: "Gerencia Ejecutiva Avanzada",            mirrors: ["CEO multinacional"] },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function revenueToIndex(revenueUSD: string): number {
  const letter = revenueUSD.trim().toLowerCase().charAt(0);
  const map: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
  return map[letter] ?? 7;
}

function calcGrade(
  familia: Familia,
  calibracion: Record<string, number>,
  magnitud: { m1: number; m2: number },
  factIdx: number,
): number {
  const c = calibracion;
  let base = 0;
  if (familia === "IC") base = c.autonomia * 0.3 + c.complejidad * 0.3 + c.dominio * 0.2 + c.formacion * 0.2;
  else if (familia === "LO") base = (c.tamanoEquipo + c.foco) / 2;
  else if (familia === "GE") base = (c.tipo + c.alcance + c.pl) / 3;
  else if (familia === "EJ") base = (c.tipo + c.horizonte) / 2;

  const tot = magnitud.m1 + magnitud.m2;
  let aj = 0;
  if (familia === "GE" || familia === "EJ") {
    if (tot <= 2) aj = -1; else if (tot <= 5) aj = 0; else if (tot <= 8) aj = 1; else if (tot <= 11) aj = 2; else aj = 3;
  }

  let g = Math.round(base + aj);
  if (familia === "IC") g = Math.max(8,  Math.min(19, g));
  if (familia === "LO") g = Math.max(14, Math.min(16, g));
  if (familia === "GE") g = Math.max(17, Math.min(22, g));
  if (familia === "EJ") g = Math.max(23, Math.min(25, g));

  const max = FACT_RULES[factIdx]?.max ?? 25;
  return Math.min(g, max);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "familia" | "calibracion" | "magnitud" | "resultado";

interface Props {
  companyInfo: CompanyInfo;
  cargoNombre: string;
  existingGrade?: number;
  onSave: (grade: number) => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CapriWizardModal({ companyInfo, cargoNombre, existingGrade, onSave, onClose }: Props) {
  const factIdx  = revenueToIndex(companyInfo.revenueUSD ?? "");
  const factRule = FACT_RULES[factIdx] ?? FACT_RULES[7];

  const [step,        setStep]        = useState<Step>("familia");
  const [familia,     setFamilia]     = useState<Familia | null>(null);
  const [calibracion, setCalibracion] = useState<Record<string, number>>({});
  const [magnitud,    setMagnitud]    = useState<{ m1: number; m2: number }>({ m1: 0, m2: 0 });

  const hasMagnitud = familia === "GE" || familia === "EJ";
  const questions   = familia ? Q[familia] : [];
  const allAnswered = familia ? questions.every((q) => calibracion[q.id] !== undefined) : false;

  const grade = familia && allAnswered
    ? calcGrade(familia, calibracion, magnitud, factIdx)
    : null;
  const roleInfo = grade !== null ? ROLES[grade] : null;

  function selectFamilia(f: Familia) {
    if (f === "EJ" && !factRule.ej) return;
    setFamilia(f);
    setCalibracion({});
    setMagnitud({ m1: 0, m2: 0 });
  }

  function setAnswer(qId: string, value: number) {
    setCalibracion((prev) => ({ ...prev, [qId]: value }));
  }

  function goNext() {
    if (step === "familia" && familia) setStep("calibracion");
    else if (step === "calibracion" && allAnswered) setStep(hasMagnitud ? "magnitud" : "resultado");
    else if (step === "magnitud") setStep("resultado");
  }

  function goPrev() {
    if (step === "resultado") setStep(hasMagnitud ? "magnitud" : "calibracion");
    else if (step === "magnitud") setStep("calibracion");
    else if (step === "calibracion") setStep("familia");
  }

  const FAMILIA_OPTS: { value: Familia; label: string; sub: string; color: string }[] = [
    { value: "IC", label: "A · Ruta Individual",            sub: "Ejecuta tareas. No tiene personas a su cargo.",                           color: "bg-blue-500" },
    { value: "LO", label: "B · Liderazgo Operativo",        sub: "Lidera equipo operativo o técnico no profesional.",                       color: "bg-amber-500" },
    { value: "GE", label: "C · Ruta Gerencial",             sub: "Lidera equipo de profesionales y/o gestiona área de negocio.",            color: "bg-orange-500" },
    { value: "EJ", label: "D · Ruta Ejecutiva",             sub: "Dirige unidad de negocio, empresa o corporación.",                        color: "bg-red-500" },
  ];

  const presupOptions = [
    { value: 1, label: "Menos de $500K" }, { value: 2, label: "$500K – $5M" },
    { value: 3, label: "$5M – $25M" },     { value: 4, label: "$25M – $100M" },
    { value: 5, label: "$100M – $500M" },  { value: 6, label: "Más de $500M" },
  ];
  const equipoOptions = [
    { value: 1, label: "Menos de 10" }, { value: 2, label: "10 – 30" },
    { value: 3, label: "30 – 100" },    { value: 4, label: "100 – 300" },
    { value: 5, label: "300 – 1000" },  { value: 6, label: "Más de 1000" },
  ];

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
              <p className="text-xs text-teal-300">{stepLabel[step]} · {factRule.label} · {companyInfo.headcount ? `${companyInfo.headcount} colaboradores` : ""}</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-teal-200 hover:bg-teal-800" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-teal-800">
            <div className="h-full rounded-full bg-teal-300 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* STEP: familia */}
          {step === "familia" && (
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
                        <p className="text-xs text-slate-500">{disabled ? `🚫 Bloqueada para facturación menor a 15MM USD.` : opt.sub}</p>
                      </div>
                      {selected && <Check className="ml-auto h-4 w-4 flex-none text-teal-600" />}
                    </div>
                  </button>
                );
              })}
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
                          {opt.desc && <p className="mt-0.5 text-xs text-slate-500">{opt.desc}</p>}
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
              <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-center text-white">
                <p className="text-[0.7rem] font-bold uppercase tracking-widest text-teal-300">Grado HAY</p>
                <p className="mt-1 font-display text-7xl font-black">{grade}</p>
                <p className="mt-1 text-base font-medium">{roleInfo.rol}</p>
              </div>
              {roleInfo.mirrors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Cargos espejo</p>
                  <ul className="space-y-1">
                    {roleInfo.mirrors.map((m) => (
                      <li key={m} className="text-sm text-amber-800">⸰ {m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {existingGrade && existingGrade !== grade && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-sm text-slate-500">
                  Grado actual: <span className="font-bold text-slate-700">{existingGrade}</span> → nuevo: <span className="font-bold text-teal-700">{grade}</span>
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
              onClick={() => { if (grade !== null) { onSave(grade); onClose(); } }}
              className="btn btn-primary flex items-center gap-1.5"
              disabled={grade === null}
            >
              <Check className="h-4 w-4" />
              Guardar grado {grade}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={
                (step === "familia" && !familia) ||
                (step === "calibracion" && !allAnswered) ||
                (step === "magnitud" && magnitud.m2 === 0 && (familia === "GE" || familia === "EJ"))
              }
              className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50"
            >
              {step === "calibracion" && !hasMagnitud ? "Calcular grado" : "Siguiente"}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
