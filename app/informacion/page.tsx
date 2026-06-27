"use client";
import { Building2, Contact2, Globe2, Layers, Lock, Plus, Save, Sparkles, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { EMPTY_COMPANY_INFO, type CompanyInfo, type CompensationTemplateConcept, type ExchangeRate } from "@/lib/workspace";
import { fetchWorkspace, updateWorkspace } from "@/lib/workspace-client";

const MAX_TASAS = 5;

const REFERENCIA_OPTIONS = [
  "Tasa BCV (Bs./USD)",
  "Tasa BCV (Bs./EUR)",
  "Tasa de Referencia Externa",
] as const;

const LOCALITY_OPTIONS = [
  "Capital",
  "Central",
  "Centroccidental",
  "Guayana",
  "Insular",
  "Los Andes",
  "Los Llanos",
  "Nororiental",
  "Zuliana",
] as const;

const REVENUE_RANGE_OPTIONS = [
  "a. Hasta 500M USD",
  "b. Entre 500M USD hasta 5MM USD",
  "c. Entre 5MM USD hasta 15MM USD",
  "d. Entre 15MM USD hasta 25MM USD",
  "e. Entre 25MM USD hasta 50MM USD",
  "f. Entre 50MM USD hasta 150MM USD",
  "g. Mas de 150MM USD",
] as const;

export default function Informacion() {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      try {
        const workspace = await fetchWorkspace();
        if (!ignore) {
          setCompanyInfo(workspace.companyInfo);
        }
      } catch {
        // ignore
      }
    }

    void loadWorkspace();

    return () => {
      ignore = true;
    };
  }, []);
  const [notification, setNotification] = useState("");

  function updateCompany<K extends keyof CompanyInfo>(key: K, value: string) {
    setCompanyInfo((prev) => ({ ...prev, [key]: value }));
  }

  function toggleLocality(loc: string) {
    const current = (companyInfo.locality || "").split(",").filter(Boolean);
    const next = current.includes(loc)
      ? current.filter((l) => l !== loc)
      : [...current, loc];
    updateCompany("locality", next.join(","));
  }

  const systemTasas = (companyInfo.tasas ?? []).filter((t) => t.isSystem);
  const userTasas = (companyInfo.tasas ?? []).filter((t) => !t.isSystem);

  function setUserTasas(fn: (prev: ExchangeRate[]) => ExchangeRate[]) {
    setCompanyInfo((prev) => ({
      ...prev,
      tasas: [...(prev.tasas ?? []).filter((t) => t.isSystem), ...fn((prev.tasas ?? []).filter((t) => !t.isSystem))],
    }));
  }

  function addTasa() {
    if (userTasas.length >= MAX_TASAS) return;
    const newTasa: ExchangeRate = {
      id: `t-${Date.now()}`,
      nombre: "",
      referencia: REFERENCIA_OPTIONS[0],
      valor: "",
    };
    setUserTasas((prev) => [...prev, newTasa]);
  }

  function updateTasa(idx: number, key: keyof ExchangeRate, value: string) {
    setUserTasas((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }

  function removeTasa(idx: number) {
    setUserTasas((prev) => prev.filter((_, i) => i !== idx));
  }

  const fixedConcepts = companyInfo.compensationTemplate?.fixed ?? [];
  const variableConcepts = companyInfo.compensationTemplate?.variable ?? [];
  const [newFixedConcept, setNewFixedConcept] = useState("");
  const [newVariableConcept, setNewVariableConcept] = useState("");

  function setFixedConcepts(next: CompensationTemplateConcept[]) {
    setCompanyInfo((prev) => ({
      ...prev,
      compensationTemplate: { fixed: next, variable: prev.compensationTemplate?.variable ?? [] },
    }));
  }

  function setVariableConcepts(next: CompensationTemplateConcept[]) {
    setCompanyInfo((prev) => ({
      ...prev,
      compensationTemplate: { fixed: prev.compensationTemplate?.fixed ?? [], variable: next },
    }));
  }

  function addFixedConcept() {
    const name = newFixedConcept.trim();
    if (!name) return;
    setFixedConcepts([...fixedConcepts, { id: `fc-${Date.now()}`, concept: name }]);
    setNewFixedConcept("");
  }

  function addVariableConcept() {
    const name = newVariableConcept.trim();
    if (!name) return;
    setVariableConcepts([...variableConcepts, { id: `vc-${Date.now()}`, concept: name }]);
    setNewVariableConcept("");
  }

  async function saveCompanyInfo() {
    try {
      await updateWorkspace({ companyInfo });
      setNotification("Información guardada correctamente");
      window.setTimeout(() => setNotification(""), 2500);
    } catch (e) {
      console.error(e);
      setNotification("Error al guardar la información");
      window.setTimeout(() => setNotification(""), 2500);
    }
  }

  

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-3">
        <section className="surface-panel rounded-[1.75rem] p-4 md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="flex flex-col justify-center">
              <div className="eyebrow mb-1.5">Contexto de la muestra</div>
              <h1 className="font-display text-[1.25rem] font-bold tracking-tight text-slate-900 md:text-[1.4rem]">Información de la empresa participante.</h1>

              <div className="mt-3 flex flex-wrap gap-2">
                <div className="metric-tile min-w-0 flex-1 py-2.5">
                  <div className="metric-label">Compañía</div>
                  <div className="metric-value mt-1 truncate text-base">{companyInfo.companyName || "Sin nombre"}</div>
                </div>
                <div className="metric-tile min-w-0 flex-1 py-2.5">
                  <div className="metric-label">Sector</div>
                  <div className="metric-value mt-1 truncate text-base">{companyInfo.sector || "ND"}</div>
                </div>
                <div className="metric-tile min-w-0 flex-1 py-2.5">
                  <div className="metric-label">Clasificación</div>
                  <div className="metric-value mt-1 truncate text-base">{companyInfo.classification || "ND"}</div>
                </div>
              </div>

              {notification && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                  <Sparkles size={14} aria-hidden />
                  {notification}
                </div>
              )}
            </div>

            <div className="btn-compact-zone surface-card rounded-[1.25rem] p-3 md:p-3.5">
              <div className="flex items-center gap-2.5">
                <div className="rounded-full bg-teal-50 p-2 text-teal-700">
                  <Building2 size={14} aria-hidden />
                </div>
                <div>
                  <div className="eyebrow-xs eyebrow mb-0.5">Empresa</div>
                  <h2 className="font-display text-base font-bold text-slate-900">Resumen de llenado</h2>
                </div>
              </div>
              <p className="mt-2.5 text-xs leading-5 text-slate-600">
                Completa datos de empresa, contacto y parámetros generales antes de guardar.
              </p>
              <button onClick={() => void saveCompanyInfo()} className="btn btn-primary mt-3 w-full">
                <Save className="h-3.5 w-3.5" />
                Guardar información
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="surface-card rounded-[2rem] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 p-3 text-slate-700">
                <Building2 size={18} aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Datos de empresa</h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div>
                <label className="field-label">Nombre de la empresa</label>
                <input title="Nombre de la Empresa" aria-label="Nombre de la Empresa" value={companyInfo.companyName} className="field" readOnly />
              </div>
              <div>
                <label className="field-label">Sector económico</label>
                <input title="Sector Económico" aria-label="Sector Económico" value={companyInfo.sector} className="field" readOnly />
              </div>
              <div>
                <label className="field-label">Clasificación</label>
                <input title="Clasificación" aria-label="Clasificación" value={companyInfo.classification} className="field" readOnly />
              </div>
              <div className="md:col-span-3">
                <label className="field-label">Descripción de la empresa</label>
                <textarea
                  title="Descripción de la empresa"
                  aria-label="Descripción de la empresa"
                  value={companyInfo.description}
                  className="field min-h-28 resize-y"
                  readOnly
                />
              </div>
              <div>
                <label className="field-label">Headcount</label>
                <input title="Headcount" aria-label="Headcount" type="number" placeholder="0" value={companyInfo.headcount} onChange={(e) => updateCompany("headcount", e.target.value)} className="field" />
              </div>
              <div className="flex flex-col">
                <label className="field-label">Facturación (USD)</label>
                <select title="Facturación USD" aria-label="Facturación USD" value={companyInfo.revenueUSD} onChange={(e) => updateCompany("revenueUSD", e.target.value)} className="field-select flex-1">
                  <option value="">Seleccionar rango</option>
                  {REVENUE_RANGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Utilidades antes de ISLR</label>
                <div className="relative">
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">%</span>
                  <input title="% utilidades" aria-label="% utilidades" type="number" placeholder="0" value={companyInfo.avgProfitPercent || ""} onChange={(e) => updateCompany("avgProfitPercent", e.target.value)} className="field pr-9" />
                </div>
              </div>
            </div>
          </div>

          <div className="surface-card rounded-[2rem] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 p-3 text-slate-700">
                <Contact2 size={18} aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Contacto de RR. HH.</h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="field-label">Nombre y apellido</label>
                <input title="Nombre contacto" aria-label="Nombre contacto" placeholder="Nombre y apellido" value={companyInfo.hrName} onChange={(e) => updateCompany("hrName", e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">Cargo</label>
                <input title="Cargo contacto" aria-label="Cargo contacto" placeholder="Cargo" value={companyInfo.hrPosition} onChange={(e) => updateCompany("hrPosition", e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">Correo electrónico</label>
                <input title="Correo contacto" aria-label="Correo contacto" placeholder="email@empresa.com" value={companyInfo.hrEmail} onChange={(e) => updateCompany("hrEmail", e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">Teléfono directo</label>
                <input title="Teléfono" aria-label="Teléfono" placeholder="Teléfono directo" value={companyInfo.hrPhone} onChange={(e) => updateCompany("hrPhone", e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">Celular</label>
                <input title="Celular" aria-label="Celular" placeholder="Celular" value={companyInfo.hrCell} onChange={(e) => updateCompany("hrCell", e.target.value)} className="field" />
              </div>
            </div>
          </div>
        </section>

        <section className="surface-card rounded-[2rem] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-100 p-3 text-slate-700">
              <Globe2 size={18} aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900">Parámetros generales</h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="field-label">Bono vacacional mínimo</label>
              <input title="Bono vacacional" aria-label="Bono vacacional" type="number" placeholder="0" value={companyInfo.minVacationDays} onChange={(e) => updateCompany("minVacationDays", e.target.value)} className="field" />
            </div>
            <div>
              <label className="field-label">Días mínimos de utilidades</label>
              <input title="Días utilidades" aria-label="Días utilidades" type="number" placeholder="0" value={companyInfo.minUtilityDays} onChange={(e) => updateCompany("minUtilityDays", e.target.value)} className="field" />
            </div>
            <div className="md:col-span-2 xl:col-span-4">
              <label className="field-label">Localidad</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {LOCALITY_OPTIONS.map((loc) => {
                  const isSelected = (companyInfo.locality || "").split(",").filter(Boolean).includes(loc);
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => toggleLocality(loc)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        isSelected
                          ? "border-teal-600 bg-teal-600 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                      }`}
                    >
                      {loc}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="surface-card rounded-[2rem] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 p-3 text-slate-700">
                <TrendingUp size={18} aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Tasas de cambio</h2>
                <p className="mt-0.5 text-sm text-slate-500">Máximo {MAX_TASAS} tasas adicionales. Se usarán en los selectores de cada concepto.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={addTasa}
              disabled={userTasas.length >= MAX_TASAS}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" />
              Agregar tasa
            </button>
          </div>

          <div className="mt-5 space-y-3">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto] gap-3 px-1 md:grid">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">Nombre de la tasa</span>
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">Referencia</span>
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">Valor Bs./USD</span>
              <span />
            </div>

            {/* System tasas — read-only */}
            {systemTasas.map((tasa) => (
              <div key={tasa.id} className="grid items-center gap-3 rounded-[1.1rem] border border-teal-100 bg-teal-50/50 p-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto]">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{tasa.nombre}</div>
                  {tasa.updatedAt && (
                    <div className="mt-0.5 text-xs text-slate-400">
                      Actualizado: {new Date(tasa.updatedAt).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  )}
                </div>
                <span className="text-sm text-slate-600">{tasa.referencia}</span>
                <span className="font-mono text-sm font-semibold text-slate-800">{tasa.valor || "—"}</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-teal-700">
                  <Lock size={11} />
                  Fija
                </span>
              </div>
            ))}

            {/* User tasas — editable */}
            {userTasas.map((tasa, idx) => (
              <div key={tasa.id} className="grid items-center gap-3 rounded-[1.1rem] border border-slate-200/80 bg-slate-50/70 p-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto]">
                <input
                  type="text"
                  placeholder="Nombre de la tasa"
                  value={tasa.nombre}
                  onChange={(e) => updateTasa(idx, "nombre", e.target.value)}
                  className="field"
                  aria-label="Nombre de la tasa"
                />
                <select
                  value={tasa.referencia}
                  onChange={(e) => updateTasa(idx, "referencia", e.target.value)}
                  className="field-select"
                  aria-label="Referencia de la tasa"
                >
                  {REFERENCIA_OPTIONS.map((ref) => (
                    <option key={ref} value={ref}>{ref}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="0.00"
                  value={tasa.valor || ""}
                  onChange={(e) => updateTasa(idx, "valor", e.target.value)}
                  className="field"
                  aria-label="Valor de conversión"
                />
                <button
                  type="button"
                  onClick={() => removeTasa(idx)}
                  className="btn btn-danger btn-xs self-end"
                  aria-label="Eliminar tasa"
                >
                  <Trash2 className="h-3 w-3" />
                  Eliminar
                </button>
              </div>
            ))}

            {userTasas.length === 0 && (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-6 text-center text-sm text-slate-500">
                No hay tasas adicionales. La Tasa BCV $ se actualiza diariamente de forma automática.
              </div>
            )}
          </div>
        </section>

        <section className="surface-card rounded-[2rem] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-teal-50 p-3 text-teal-700">
                <Layers size={18} aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Estructura de compensación</h2>
                <p className="mt-0.5 text-sm text-slate-500">Los conceptos aquí definidos aparecerán al crear un cargo nuevo, sin montos.</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* Compensación Fija */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">Comp. Fija</span>
                <span className="text-xs text-slate-400">{fixedConcepts.length} conceptos</span>
              </div>
              <div className="space-y-2">
                {fixedConcepts.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-[1rem] border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5">
                    <span className="flex-1 text-sm text-slate-800">{c.concept}</span>
                    <button
                      type="button"
                      onClick={() => setFixedConcepts(fixedConcepts.filter((x) => x.id !== c.id))}
                      className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Eliminar ${c.concept}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {fixedConcepts.length === 0 && (
                  <div className="rounded-[1rem] border border-dashed border-slate-300 bg-white/70 px-4 py-4 text-xs text-slate-400">
                    Sin conceptos fijos definidos.
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Ej. Bono de transporte"
                  value={newFixedConcept}
                  onChange={(e) => setNewFixedConcept(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFixedConcept(); } }}
                  className="field flex-1"
                />
                <button type="button" onClick={addFixedConcept} disabled={!newFixedConcept.trim()} className="btn btn-secondary shrink-0">
                  <Plus className="h-4 w-4" />
                  Agregar
                </button>
              </div>
            </div>

            {/* Compensación Variable */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">Comp. Variable</span>
                <span className="text-xs text-slate-400">{variableConcepts.length} conceptos</span>
              </div>
              <div className="space-y-2">
                {variableConcepts.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-[1rem] border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5">
                    <span className="flex-1 text-sm text-slate-800">{c.concept}</span>
                    <button
                      type="button"
                      onClick={() => setVariableConcepts(variableConcepts.filter((x) => x.id !== c.id))}
                      className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Eliminar ${c.concept}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {variableConcepts.length === 0 && (
                  <div className="rounded-[1rem] border border-dashed border-slate-300 bg-white/70 px-4 py-4 text-xs text-slate-400">
                    Sin conceptos variables definidos.
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Ej. Bono de desempeño trimestral"
                  value={newVariableConcept}
                  onChange={(e) => setNewVariableConcept(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariableConcept(); } }}
                  className="field flex-1"
                />
                <button type="button" onClick={addVariableConcept} disabled={!newVariableConcept.trim()} className="btn btn-secondary shrink-0">
                  <Plus className="h-4 w-4" />
                  Agregar
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button type="button" onClick={() => void saveCompanyInfo()} className="btn btn-primary">
            <Save className="h-3.5 w-3.5" />
            Guardar información
          </button>
        </div>
      </div>
    </main>
  );
}
