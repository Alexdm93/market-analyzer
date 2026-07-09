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
      id: "autonomia",
      title: "¿Cuánta libertad tiene para decidir CÓMO hacer su trabajo?",
      options: [
        { value: 8,  title: "Nivel Básico — Instrucciones estrictas y rutinarias",         desc: "El trabajo está detallado paso a paso. No hay margen para alterar el método." },
        { value: 9,  title: "Nivel Operativo — Rutinas estandarizadas",                   desc: "Tareas repetitivas con ligeras variaciones. Sigue reglas claras y acude al supervisor solo ante lo inusual." },
        { value: 11, title: "Nivel Técnico — Prácticas y procedimientos definidos",       desc: "El \"qué\" y el \"cómo\" están en manuales o normas del oficio. Puede organizar su día dentro de esos límites técnicos." },
        { value: 14, title: "Nivel Profesional — Supervisión por objetivos a corto plazo", desc: "Recibe metas claras pero elige los métodos estándar para alcanzarlas. Se evalúa el resultado, no el paso a paso." },
        { value: 17, title: "Nivel Especialista — Dirección general (políticas amplias)",  desc: "Trabaja bajo políticas generales del área. Define sus propios planes de acción y métodos para resolver problemas complejos." },
        { value: 19, title: "Nivel Innovación — Orientación estratégica (autonomía total)", desc: "Solo sujeto a la estrategia del negocio. Crea nuevos enfoques, métodos o servicios donde no existen precedentes." },
      ],
    },
    {
      id: "complejidad",
      title: "¿Qué tipo de esfuerzo mental exige resolver los problemas del cargo?",
      options: [
        { value: 8.5, title: "Memoria y repetición",            desc: "Problemas con solución documentada. Solo hay que recordar o leer qué hacer.",                                                         example: "Ej: cajero detecta billete falso y aplica protocolo." },
        { value: 10.5, title: "Análisis básico y elección",      desc: "Problemas recurrentes con varias causas posibles. Hay que investigar para elegir la mejor solución entre opciones conocidas.",          example: "Ej: técnico identifica falla de máquina entre 3-4 causas típicas." },
        { value: 13,   title: "Análisis técnico especializado",  desc: "Requieren interpretar datos complejos usando teoría profesional o experiencia técnica profunda.",                                       example: "Ej: ingeniero diseña solución a falla recurrente en proceso." },
        { value: 16,   title: "Pensamiento integrador",          desc: "Problemas complejos donde la solución afecta otras áreas. Requiere conectar variables distintas y diseñar soluciones que equilibran intereses.", example: "Ej: rediseño de proceso que toca operaciones, finanzas y calidad." },
        { value: 19,   title: "Pensamiento creativo / Innovación", desc: "Problemas inéditos. No hay libros ni manuales que den la respuesta; hay que conceptualizar y crear algo que no existía.",             example: "Ej: crear nuevo modelo de negocio digital desde cero." },
      ],
    },
    {
      id: "dominio",
      title: "¿Tiempo necesario para dominar el puesto?",
      options: [
        { value: 8,  title: "Menos de 6 meses" },
        { value: 9,  title: "6 meses a 1 año" },
        { value: 10, title: "1 a 2 años" },
        { value: 12, title: "2 a 4 años" },
        { value: 15, title: "4 a 7 años" },
        { value: 19, title: "Más de 7 años" },
      ],
    },
    {
      id: "formacion",
      title: "¿Cuál es el nivel académico mínimo indispensable que la empresa exige para el cargo?",
      options: [
        { value: 8.5, title: "Bachillerato" },
        { value: 11,  title: "Técnico / TSU" },
        { value: 13,  title: "Universitario / Licenciatura / Ingeniería" },
        { value: 15,  title: "Universitario + Especialización / Diplomado" },
        { value: 17,  title: "Maestría" },
        { value: 19,  title: "Doctorado / Alta Especialidad" },
      ],
    },
  ],
  LO: [
    {
      id: "tamanoEquipo",
      title: "¿Cuántas personas le reportan directamente?",
      options: [
        { value: 14, title: "1 a 5 personas" },
        { value: 15, title: "6 a 15 personas" },
        { value: 16, title: "Más de 15 personas" },
      ],
    },
    {
      id: "foco",
      title: "¿Cuál es el enfoque principal de su gestión como supervisor?",
      options: [
        { value: 14, title: "Control de Ejecución (El Día a Día)",        desc: "Su prioridad es que el turno o grupo cumpla la meta de hoy. Asigna tareas, vigila la asistencia, asegura que se sigan las normas básicas y reporta las fallas.", example: "Ej: supervisor de planta verifica turnos y controla metas diarias." },
        { value: 15, title: "Gestión Técnica y Eficiencia (El Proceso)",  desc: "Es el \"experto técnico\" del grupo. Resuelve fallas operativas, entrena al personal en cómo hacer mejor el trabajo y ajusta procesos para ganar eficiencia.", example: "Ej: supervisor rediseña flujo de despacho reduciendo tiempos un 20%." },
        { value: 16, title: "Coordinación Táctica (El Área Completa)",    desc: "Su visión va más allá de un solo turno. Articula el trabajo de varios equipos, planifica recursos a mediano plazo y negocia soluciones con otros departamentos.", example: "Ej: coordinador gestiona plan de contingencia ante caída de producción." },
      ],
    },
  ],
  GE: [
    {
      id: "tipo",
      title: "¿Cuál describe mejor el alcance de la posición gerencial?",
      options: [
        { value: 17,   title: "Liderazgo de Proceso o Sub-área",               desc: "Maneja una fracción específica dentro de un departamento más grande. Visión a corto y mediano plazo. Asegura que un proceso particular funcione adecuadamente." },
        { value: 18,   title: "Liderazgo de un Área o Departamento",           desc: "Es el responsable total de un departamento estándar. Integra varios sub-procesos bajo su mando. Visión anual." },
        { value: 19,   title: "Liderazgo de Área Compleja",                    desc: "Dirige un departamento de alto volumen, alta complejidad técnica o que es vital para la supervivencia y el giro principal del negocio." },
        { value: 20,   title: "Liderazgo Funcional (Múltiples Áreas)",         desc: "Su paraguas de control abarca varios departamentos distintos que persiguen un fin común. Define las políticas y la táctica de toda una función." },
        { value: 21,   title: "Liderazgo de Unidad de Negocio / División / Región", desc: "Dirige una división completa del negocio, una línea de productos independiente o una región geográfica." },
        { value: 22.5, title: "Liderazgo Organizacional Integrado / Dirección General", desc: "Es el máximo nivel de integración operativa de la empresa. Su visión abarca la totalidad de la operación y materializa la estrategia global." },
      ],
    },
    {
      id: "alcance",
      title: "¿Cuál es la magnitud del impacto de sus decisiones?",
      options: [
        { value: 17,   title: "Impacto Operativo Interno",                 desc: "Sus decisiones afectan la velocidad, calidad o eficiencia de su propio equipo o proceso. Los errores se corrigen internamente." },
        { value: 18,   title: "Impacto Interdepartamental",                desc: "Sus decisiones afectan el trabajo de otras áreas generando cuellos de botella o fricción interna, pero no impacta gravemente al cliente final." },
        { value: 19,   title: "Impacto en el Producto / Servicio Final",   desc: "Sus decisiones mueven la aguja del día a día del negocio. Los errores se traducen en pérdida de clientes o ingresos inmediatos." },
        { value: 20,   title: "Impacto en Ganancias y Pérdidas (G&P)",    desc: "Sus decisiones mueven la aguja de la rentabilidad. Afectan los márgenes de ganancia, los costos estructurales o el flujo de caja." },
        { value: 21.5, title: "Impacto Estratégico, Legal o Reputacional", desc: "Sus decisiones comprometen la viabilidad de la empresa. Riesgo de demandas millonarias, pérdida de licencias o crisis de relaciones públicas." },
      ],
    },
    {
      id: "pl",
      title: "¿Nivel de autonomía / libertad de acción?",
      options: [
        { value: 17.5, title: "Autonomía Operativa",       desc: "Actúa dentro de políticas, manuales y procedimientos bien definidos. Cambios estructurales deben ser aprobados por un nivel superior." },
        { value: 18.5, title: "Autonomía de Ejecución",    desc: "Tiene libertad para adaptar procesos dentro de su propia área para cumplir metas operativas específicas, sin alterar la política general del departamento." },
        { value: 19.5, title: "Autonomía Táctica",         desc: "Actúa guiado por los objetivos anuales de su área. Tiene libertad para definir métodos, planes de trabajo y uso del presupuesto de su departamento." },
        { value: 20.5, title: "Autonomía Estratégica",     desc: "Actúa bajo políticas generales del negocio. Tiene libertad para alterar procesos interdepartamentales y tomar decisiones a mediano plazo en múltiples áreas." },
        { value: 21.5, title: "Autonomía Directiva Amplia", desc: "Sujeta únicamente a directrices estratégicas muy amplias. Tiene libertad para redefinir el rumbo y la estructura de una gran división o de la empresa." },
      ],
    },
  ],
  EJ: [
    {
      id: "tipo",
      title: "¿Cuál describe mejor la naturaleza y complejidad de la dirección?",
      options: [
        { value: 23, title: "Dirección Ejecutiva Funcional / Vertical",          desc: "Lidera la estrategia a largo plazo de una función crítica o vertical completa del negocio (ej. toda la cadena de suministro). Integra múltiples áreas complejas.", example: "Ej: VP Operaciones, CFO, Director Comercial Nacional." },
        { value: 24, title: "Dirección Ejecutiva General (Unidad / Entidad)",    desc: "Máximo responsable de las Ganancias y Pérdidas (G&P) y viabilidad de una entidad de negocio completa y autosuficiente.", example: "Ej: CEO de empresa nacional, presidente de filial país." },
        { value: 25, title: "Dirección Ejecutiva Corporativa / Portafolio",      desc: "Lidera un ecosistema de negocios. Su complejidad radica en manejar un portafolio de empresas, múltiples unidades de negocio o una matriz diversa.", example: "Ej: CEO grupo multinacional, presidente regional Latam." },
      ],
    },
    {
      id: "horizonte",
      title: "¿Horizonte temporal de sus decisiones estratégicas?",
      options: [
        { value: 23, title: "3-4 años (Táctico-Estratégico)", desc: "Planificación a mediano plazo, enfocado en el ciclo de vida de productos o servicios actuales." },
        { value: 24, title: "5-7 años (Estratégico)",          desc: "Diseño del futuro del negocio, apertura de nuevos mercados o transformación del modelo de operación." },
        { value: 25, title: "Más de 7 años (Visión y Supervivencia)", desc: "Enfoque absoluto en la sostenibilidad corporativa, fusiones, adquisiciones y viabilidad generacional del grupo." },
      ],
    },
  ],
};

const EQUIPO_OPTS: Partial<Record<Familia, { value: string; title: string }[]>> = {
  LO: [
    { value: "operativo", title: "Personal operativo / auxiliar" },
    { value: "tecnico",   title: "Técnicos no profesionales" },
  ],
  GE: [
    { value: "profesional", title: "Profesionales con título universitario" },
    { value: "gerentes",    title: "Otros gerentes / supervisores" },
  ],
  EJ: [
    { value: "gerentes", title: "Otros gerentes / directores" },
    { value: "mixto",    title: "Equipo mixto de directores y profesionales senior" },
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

  let g = Math.floor(base + aj + 0.5);
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
                (step === "familia" && !familiaReady) ||
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
