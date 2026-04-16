"use client";
import { Building2, Contact2, Globe2, Save, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const ECONOMIC_SECTOR_OPTIONS = [
  "Comercio / Retail",
  "Construcción / Ingeniería",
  "Consumo Masivo",
  "Educación",
  "Energía",
  "Entretenimiento",
  "Farmacéutico / Salud",
  "Hotelería / Turismo / Viajes",
  "Industrial / Manufactura",
  "Logística / Transporte",
  "Publicidad / Medios Digitales",
  "Banca / Seguros",
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

type CompanyInfo = {
  companyName: string;
  sector: string;
  dateFilled: string;
  headcount: string;
  revenueUSD: string;
  avgProfitPercent: string;
  hrName: string;
  hrPosition: string;
  hrEmail: string;
  hrPhone: string;
  hrCell: string;
  minVacationDays: string;
  minUtilityDays: string;
  conversionRate: string;
  locality: string;
};

const EMPTY_COMPANY_INFO: CompanyInfo = {
  companyName: "",
  sector: "",
  dateFilled: "",
  headcount: "",
  revenueUSD: "",
  avgProfitPercent: "",
  hrName: "",
  hrPosition: "",
  hrEmail: "",
  hrPhone: "",
  hrCell: "",
  minVacationDays: "",
  minUtilityDays: "",
  conversionRate: "",
  locality: "",
};

export default function Informacion() {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);

  useEffect(() => {
    let nextCompanyInfo: CompanyInfo | null = null;

    try {
      const raw = localStorage.getItem("companyInfo");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          nextCompanyInfo = { ...EMPTY_COMPANY_INFO, ...parsed };
        }
      }
    } catch {
      // ignore
    }

    if (!nextCompanyInfo) return;

    const timeoutId = window.setTimeout(() => {
      setCompanyInfo(nextCompanyInfo as CompanyInfo);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);
  const [notification, setNotification] = useState("");

  function updateCompany<K extends keyof CompanyInfo>(key: K, value: string) {
    setCompanyInfo((prev) => ({ ...prev, [key]: value }));
  }

  function saveCompanyInfo() {
    try {
      localStorage.setItem("companyInfo", JSON.stringify(companyInfo));
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
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_24rem]">
            <div>
              <div className="eyebrow mb-3">Contexto de la muestra</div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Información de la empresa participante.</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                Organiza los datos de contexto corporativo y del contacto de RR. HH. en un formato más limpio, útil para revisión y carga rápida.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="metric-tile">
                  <div className="metric-label">Compañía</div>
                  <div className="metric-value mt-3 text-xl">{companyInfo.companyName || "Sin nombre"}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Sector</div>
                  <div className="metric-value mt-3 text-xl">{companyInfo.sector || "ND"}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Localidad</div>
                  <div className="metric-value mt-3 text-xl">{companyInfo.locality || "ND"}</div>
                </div>
              </div>

              {notification && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                  <Sparkles size={14} aria-hidden />
                  {notification}
                </div>
              )}
            </div>

            <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
              <div className="rounded-full bg-teal-50 p-3 text-teal-700 w-fit">
                <Building2 size={18} aria-hidden />
              </div>
              <h2 className="font-display mt-4 text-2xl font-bold text-slate-900">Resumen de llenado</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Completa primero datos de empresa, luego contacto y finalmente parámetros generales del estudio.
              </p>
              <button onClick={saveCompanyInfo} className="btn btn-primary mt-6 w-full">
                <Save className="h-4 w-4" />
                Guardar información de la empresa
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

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-span-2 xl:col-span-2">
                <label className="field-label">Nombre de la empresa</label>
                <input title="Nombre de la Empresa" aria-label="Nombre de la Empresa" placeholder="Nombre de la empresa" value={companyInfo.companyName} onChange={(e) => updateCompany("companyName", e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">Fecha de llenado</label>
                <input title="Fecha de Llenado" aria-label="Fecha de Llenado" placeholder="DD/MM/AAAA" value={companyInfo.dateFilled} onChange={(e) => updateCompany("dateFilled", e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">Sector económico</label>
                <select title="Sector Económico" aria-label="Sector Económico" value={companyInfo.sector} onChange={(e) => updateCompany("sector", e.target.value)} className="field-select">
                  <option value="">Seleccionar sector económico</option>
                  {ECONOMIC_SECTOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Headcount</label>
                <input title="Headcount" aria-label="Headcount" type="number" placeholder="0" value={companyInfo.headcount} onChange={(e) => updateCompany("headcount", e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">Facturación (USD)</label>
                <select title="Facturación USD" aria-label="Facturación USD" value={companyInfo.revenueUSD} onChange={(e) => updateCompany("revenueUSD", e.target.value)} className="field-select">
                  <option value="">Seleccionar rango de facturación</option>
                  {REVENUE_RANGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Utilidades antes de ISLR (%)</label>
                <input title="% utilidades" aria-label="% utilidades" type="number" placeholder="%" value={companyInfo.avgProfitPercent} onChange={(e) => updateCompany("avgProfitPercent", e.target.value)} className="field" />
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
            <div>
              <label className="field-label">Tasa Bs / USD</label>
              <input title="Tasa conversión" aria-label="Tasa conversión" type="number" placeholder="Tasa" value={companyInfo.conversionRate} onChange={(e) => updateCompany("conversionRate", e.target.value)} className="field" />
            </div>
            <div>
              <label className="field-label">Localidad</label>
              <select title="Localidad" aria-label="Localidad" value={companyInfo.locality} onChange={(e) => updateCompany("locality", e.target.value)} className="field-select">
                <option value="">-- Seleccionar localidad --</option>
                <option value="Capital">Capital</option>
                <option value="Central">Central</option>
                <option value="Centroccidental">Centroccidental</option>
                <option value="Guayana">Guayana</option>
                <option value="Insular">Insular</option>
                <option value="Los Andes">Los Andes</option>
                <option value="Los Llanos">Los Llanos</option>
                <option value="Nororiental">Nororiental</option>
                <option value="Zuliana">Zuliana</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
