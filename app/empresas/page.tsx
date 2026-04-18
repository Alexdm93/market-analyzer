"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, CheckCircle2, LoaderCircle, Plus } from "lucide-react";
import {
  COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR,
  ECONOMIC_SECTOR_OPTIONS,
  type CompanyCatalogEntry,
} from "@/lib/company";

type Company = CompanyCatalogEntry;

export default function EmpresasPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyEconomicSector, setCompanyEconomicSector] = useState("");
  const [companyClassification, setCompanyClassification] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const classificationOptions = COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[companyEconomicSector] ?? [];

  useEffect(() => {
    let ignore = false;

    async function loadCompanies() {
      try {
        const response = await fetch("/api/companies", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as { companies?: Company[]; message?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "No fue posible cargar las empresas.");
        }

        if (!ignore) {
          setCompanies(Array.isArray(payload?.companies) ? payload.companies : []);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "No fue posible cargar las empresas.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadCompanies();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleCreateCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    const nextCompanyName = companyName.trim();

    if (nextCompanyName.length < 2) {
      setErrorMessage("La empresa debe tener al menos 2 caracteres.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const response = await fetch("/api/companies", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: nextCompanyName,
            description: companyDescription.trim(),
            economicSector: companyEconomicSector,
            classification: companyClassification.trim(),
          }),
        });

        const payload = (await response.json().catch(() => null)) as { company?: Company; message?: string } | null;

        if (!response.ok) {
          setErrorMessage(payload?.message ?? "No fue posible crear la empresa.");
          return;
        }

        if (payload?.company) {
          const createdCompany = payload.company;
          setCompanies((current) => [...current, createdCompany].sort((a, b) => a.name.localeCompare(b.name)));
        }

        setCompanyName("");
        setCompanyDescription("");
        setCompanyEconomicSector("");
        setCompanyClassification("");
        setStatusMessage("Empresa creada correctamente.");
      })();
    });
  }

  function handleEconomicSectorChange(nextSector: string) {
    setCompanyEconomicSector(nextSector);
    setCompanyClassification((current) => {
      const allowedClassifications = COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[nextSector] ?? [];
      return allowedClassifications.includes(current) ? current : "";
    });
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
            <div>
              <div className="eyebrow mb-3">Catálogo</div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Empresas registradas.</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                Administra las empresas disponibles para que luego puedan seleccionarse en el registro de usuarios.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="metric-tile">
                  <div className="metric-label">Empresas cargadas</div>
                  <div className="metric-value mt-3">{companies.length}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Estado</div>
                  <div className="metric-value mt-3 text-xl">{isLoading ? "Cargando" : "Disponible"}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Registro</div>
                  <div className="metric-value mt-3 text-xl">Selector activo</div>
                </div>
              </div>

              {statusMessage ? (
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 size={14} aria-hidden />
                  {statusMessage}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}
            </div>

            <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
              <div className="rounded-full bg-teal-50 p-3 text-teal-700 w-fit">
                <Building2 size={18} aria-hidden />
              </div>
              <h2 className="font-display mt-4 text-2xl font-bold text-slate-900">Nueva empresa</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Cada usuario nuevo deberá elegir una empresa existente desde el selector del registro.
              </p>

              <form onSubmit={handleCreateCompany} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="companyName" className="field-label">Nombre de la empresa</label>
                  <input
                    id="companyName"
                    type="text"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    className="field"
                    placeholder="Nombre comercial o legal"
                    autoComplete="organization"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="companyDescription" className="field-label">Descripcion</label>
                  <textarea
                    id="companyDescription"
                    value={companyDescription}
                    onChange={(event) => setCompanyDescription(event.target.value)}
                    className="field min-h-28 resize-y"
                    placeholder="Descripcion general de la empresa"
                  />
                </div>
                <div>
                  <label htmlFor="companyEconomicSector" className="field-label">Sector economico</label>
                  <select
                    id="companyEconomicSector"
                    value={companyEconomicSector}
                    onChange={(event) => handleEconomicSectorChange(event.target.value)}
                    className="field-select"
                  >
                    <option value="">Seleccionar sector económico</option>
                    {ECONOMIC_SECTOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="companyClassification" className="field-label">Clasificacion</label>
                  <select
                    id="companyClassification"
                    value={companyClassification}
                    onChange={(event) => setCompanyClassification(event.target.value)}
                    className="field-select"
                    disabled={!companyEconomicSector}
                  >
                    <option value="">{companyEconomicSector ? "Seleccionar clasificación" : "Selecciona primero un sector"}</option>
                    {classificationOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn btn-primary w-full" disabled={isPending}>
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {isPending ? "Creando empresa..." : "Crear empresa"}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="surface-card rounded-[2rem] p-6 md:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-100 p-3 text-slate-700">
              <Building2 size={18} aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900">Listado de empresas</h2>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-6 text-sm text-slate-600">Cargando empresas...</div>
          ) : companies.length === 0 ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-sm text-slate-500">
              No hay empresas registradas todavía.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {companies.map((company) => (
                <article key={company.id} className="metric-tile">
                  <div className="font-display text-lg font-bold text-slate-900">{company.name}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">{company.description || "Sin descripción registrada."}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="pill">{company.economicSector || "Sin sector"}</span>
                    <span className="pill">{company.classification || "Sin clasificación"}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 break-all">{company.id}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}