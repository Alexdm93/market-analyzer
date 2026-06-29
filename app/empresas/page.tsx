"use client";

import { useEffect, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { Building2, CalendarDays, CheckCircle2, Download, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { type CompanyCatalogEntry } from "@/lib/company";
import { ANALYST_ROLE, canAccessEmpresas, isAdminRole } from "@/lib/roles";

type Company = CompanyCatalogEntry;

type SnapshotOption = {
  id: string;
  label: string;
  date: string;
};

type SnapshotCompanyActivity = {
  companyId: string;
  companyName: string;
  positionsCount: number;
  lastSavedAt: string | null;
};

function formatSnapshotLabel(snapshot: SnapshotOption) {
  const formattedDate = new Date(snapshot.date).toLocaleDateString("es-VE");
  return snapshot.label.trim() ? `${snapshot.label} · ${formattedDate}` : formattedDate;
}

function formatSavedAt(value: string | null) {
  if (!value) {
    return "Sin guardado registrado";
  }

  const date = new Date(value);

  return `${date.toLocaleDateString("es-VE")} a las ${date.toLocaleTimeString("es-VE", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function EmpresasPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role;
  const isAdmin = isAdminRole(role);
  const isAnalyst = role === ANALYST_ROLE;
  const canReviewCompanies = canAccessEmpresas(role);
  const [sectors, setSectors] = useState<{ name: string; classifications: string[] }[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyEconomicSector, setCompanyEconomicSector] = useState("");
  const [companyClassification, setCompanyClassification] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [snapshotOptions, setSnapshotOptions] = useState<SnapshotOption[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [snapshotCompanies, setSnapshotCompanies] = useState<SnapshotCompanyActivity[]>([]);
  const [isLoadingSnapshotCompanies, setIsLoadingSnapshotCompanies] = useState(true);
  const [snapshotErrorMessage, setSnapshotErrorMessage] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "edit" | "delete">("view");
  const [editName, setEditName] = useState("");
  const [editSector, setEditSector] = useState("");
  const [editClassification, setEditClassification] = useState("");
  const [modalError, setModalError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  function getClassifications(sectorName: string): string[] {
    return sectors.find((s) => s.name === sectorName)?.classifications ?? [];
  }
  const classificationOptions = getClassifications(companyEconomicSector);
  const editClassificationOptions = getClassifications(editSector);

  useEffect(() => {
    async function loadSectors() {
      try {
        const res = await fetch("/api/admin/config", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { sectors?: { name: string; classifications: string[] }[] } | null;
        if (Array.isArray(data?.sectors) && data.sectors.length > 0) setSectors(data.sectors);
      } catch { /* usa lista vacía */ }
    }
    void loadSectors();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

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
  }, [isAdmin]);

  useEffect(() => {
    if (!canReviewCompanies || !isAnalyst) {
      setIsLoadingSnapshotCompanies(false);
      return;
    }

    let ignore = false;

    async function loadSnapshotCompanies(snapshotId?: string) {
      try {
        setSnapshotErrorMessage("");
        setIsLoadingSnapshotCompanies(true);

        const searchParams = new URLSearchParams();

        if (snapshotId) {
          searchParams.set("snapshotId", snapshotId);
        }

        const response = await fetch(`/api/empresas/snapshots${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          snapshots?: SnapshotOption[];
          selectedSnapshotId?: string;
          companies?: SnapshotCompanyActivity[];
          message?: string;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "No fue posible cargar la actividad de empresas por corte.");
        }

        if (!ignore) {
          setSnapshotOptions(Array.isArray(payload?.snapshots) ? payload.snapshots : []);
          setSelectedSnapshotId(typeof payload?.selectedSnapshotId === "string" ? payload.selectedSnapshotId : "");
          setSnapshotCompanies(Array.isArray(payload?.companies) ? payload.companies : []);
        }
      } catch (error) {
        if (!ignore) {
          setSnapshotErrorMessage(error instanceof Error ? error.message : "No fue posible cargar la actividad de empresas por corte.");
          setSnapshotOptions([]);
          setSelectedSnapshotId("");
          setSnapshotCompanies([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingSnapshotCompanies(false);
        }
      }
    }

    void loadSnapshotCompanies();

    return () => {
      ignore = true;
    };
  }, [canReviewCompanies, isAnalyst]);

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

  function openCompany(company: Company) {
    setSelectedCompany(company);
    setModalMode("view");
    setModalError("");
  }

  function openEdit() {
    if (!selectedCompany) return;
    setEditName(selectedCompany.name);
    setEditSector(selectedCompany.economicSector ?? "");
    setEditClassification(selectedCompany.classification ?? "");
    setModalError("");
    setModalMode("edit");
  }

  async function handleEdit() {
    if (!selectedCompany) return;
    setIsSaving(true);
    setModalError("");
    try {
      const res = await fetch(`/api/companies/${selectedCompany.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, economicSector: editSector, classification: editClassification }),
      });
      const payload = (await res.json().catch(() => null)) as { company?: Company; message?: string } | null;
      if (!res.ok) { setModalError(payload?.message ?? "No fue posible guardar los cambios."); return; }
      if (payload?.company) {
        setCompanies((prev) => prev.map((c) => c.id === selectedCompany.id ? { ...c, ...payload.company } : c).sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedCompany((prev) => prev ? { ...prev, ...payload.company } : prev);
      }
      setModalMode("view");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedCompany) return;
    setIsSaving(true);
    setModalError("");
    try {
      const res = await fetch(`/api/companies/${selectedCompany.id}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) { setModalError(payload?.message ?? "No fue posible eliminar la empresa."); return; }
      setCompanies((prev) => prev.filter((c) => c.id !== selectedCompany.id));
      setSelectedCompany(null);
    } finally {
      setIsSaving(false);
    }
  }

  function handleEconomicSectorChange(nextSector: string) {
    setCompanyEconomicSector(nextSector);
    setCompanyClassification((current) => {
      const allowedClassifications = getClassifications(nextSector);
      return allowedClassifications.includes(current) ? current : "";
    });
  }

  async function handleSnapshotChange(snapshotId: string) {
    setSelectedSnapshotId(snapshotId);
    setSnapshotErrorMessage("");
    setIsLoadingSnapshotCompanies(true);

    try {
      const response = await fetch(`/api/empresas/snapshots?snapshotId=${encodeURIComponent(snapshotId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        snapshots?: SnapshotOption[];
        selectedSnapshotId?: string;
        companies?: SnapshotCompanyActivity[];
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible cargar el corte seleccionado.");
      }

      setSnapshotOptions(Array.isArray(payload?.snapshots) ? payload.snapshots : []);
      setSelectedSnapshotId(typeof payload?.selectedSnapshotId === "string" ? payload.selectedSnapshotId : snapshotId);
      setSnapshotCompanies(Array.isArray(payload?.companies) ? payload.companies : []);
    } catch (error) {
      setSnapshotErrorMessage(error instanceof Error ? error.message : "No fue posible cargar el corte seleccionado.");
      setSnapshotCompanies([]);
    } finally {
      setIsLoadingSnapshotCompanies(false);
    }
  }

  if (sessionStatus === "loading") {
    return (
      <main className="page-wrap">
        <div className="surface-card rounded-[2rem] p-6 text-sm text-slate-600 md:p-8">Cargando sesión...</div>
      </main>
    );
  }

  if (!canReviewCompanies) {
    return (
      <main className="page-wrap">
        <div className="surface-card rounded-[2rem] p-6 text-sm text-slate-600 md:p-8">
          Esta vista solo está disponible para administradores y managers.
        </div>
      </main>
    );
  }

  if (isAnalyst) {
    const selectedSnapshot = snapshotOptions.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null;
    const latestSavedAt = snapshotCompanies[0]?.lastSavedAt ?? null;

    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-6">
          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_22rem]">
              <div>
                <div className="eyebrow mb-3">Empresas por corte</div>
                <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Seguimiento de participación.</h1>
                <p className="dashboard-lead mt-3 max-w-3xl text-slate-600">
                  Selecciona un corte para ver qué empresas cargaron cargos y la fecha de su último guardado en ese período.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="metric-tile">
                    <div className="metric-label">Cortes disponibles</div>
                    <div className="metric-value mt-3">{snapshotOptions.length}</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Empresas con data</div>
                    <div className="metric-value mt-3">{snapshotCompanies.length}</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Último guardado</div>
                    <div className="metric-value mt-3 text-xl">{latestSavedAt ? new Date(latestSavedAt).toLocaleDateString("es-VE") : "Sin data"}</div>
                  </div>
                </div>

                {snapshotErrorMessage ? (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {snapshotErrorMessage}
                  </div>
                ) : null}
              </div>

              <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
                <div className="rounded-full bg-amber-50 p-3 text-amber-700 w-fit">
                  <CalendarDays size={18} aria-hidden />
                </div>
                <h2 className="mt-4 font-display text-2xl font-bold text-slate-900">Seleccionar corte</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  El listado inferior cambia según el corte elegido.
                </p>

                <div className="mt-6">
                  <label htmlFor="analystSnapshotSelect" className="field-label">Corte</label>
                  <select
                    id="analystSnapshotSelect"
                    value={selectedSnapshotId}
                    onChange={(event) => void handleSnapshotChange(event.target.value)}
                    className="field-select"
                    disabled={isLoadingSnapshotCompanies || snapshotOptions.length === 0}
                  >
                    {snapshotOptions.length === 0 ? <option value="">No hay cortes disponibles</option> : null}
                    {snapshotOptions.map((snapshot) => (
                      <option key={snapshot.id} value={snapshot.id}>{formatSnapshotLabel(snapshot)}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-5 rounded-[1.5rem] border border-slate-200/70 bg-white/80 p-4 text-sm text-slate-600">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Corte activo</div>
                  <div className="mt-2 font-display text-lg font-bold text-slate-900">
                    {selectedSnapshot ? formatSnapshotLabel(selectedSnapshot) : "Sin corte seleccionado"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="surface-card rounded-[2rem] p-6 md:p-8">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 p-3 text-slate-700">
                <Building2 size={18} aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Empresas que cargaron cargos</h2>
                <p className="mt-1 text-sm text-slate-600">Se muestra la fecha del último guardado detectado en el corte seleccionado.</p>
              </div>
            </div>

            {isLoadingSnapshotCompanies ? (
              <div className="mt-6 text-sm text-slate-600">Cargando actividad de empresas...</div>
            ) : snapshotCompanies.length === 0 ? (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-sm text-slate-500">
                No hay empresas con cargos guardados en este corte.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {snapshotCompanies.map((company) => (
                  <article key={company.companyId} className="metric-tile">
                    <div className="font-display text-lg font-bold text-slate-900">{company.companyName}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="pill">{company.positionsCount} cargos</span>
                      <span className="pill">Corte {selectedSnapshot?.label ?? selectedSnapshotId}</span>
                    </div>
                    <div className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Último guardado</div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">{formatSavedAt(company.lastSavedAt)}</div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const newLast60 = companies.filter((c) => new Date(c.createdAt) >= sixtyDaysAgo).length;

  function exportCompaniesExcel() {
    if (companies.length === 0) return;
    const rows = companies.map((c) => ({
      Empresa: c.name,
      Sector: c.economicSector || "—",
      Clasificación: c.classification || "—",
      Descripción: c.description || "—",
      Localidad: c.locality || "—",
      Headcount: c.headcount || "—",
      "Facturación USD": c.revenueUSD || "—",
      "Contacto RRHH": c.hrName || "—",
      "Correo RRHH": c.hrEmail || "—",
      "Fecha registro": new Date(c.createdAt).toLocaleDateString("es-VE"),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Empresas");
    XLSX.writeFile(wb, "empresas.xlsx");
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            {/* Left: form */}
            <div className="surface-card rounded-[1.5rem] p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-teal-50 p-2.5 text-teal-700">
                  <Building2 size={18} aria-hidden />
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900">Nueva empresa</h2>
              </div>

              <form onSubmit={handleCreateCompany} className="mt-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
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
                    <label htmlFor="companyEconomicSector" className="field-label">Sector económico</label>
                    <select
                      id="companyEconomicSector"
                      value={companyEconomicSector}
                      onChange={(event) => handleEconomicSectorChange(event.target.value)}
                      className="field-select"
                    >
                      <option value="">Seleccionar sector</option>
                      {sectors.map((s) => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="companyDescription" className="field-label">Descripción</label>
                  <textarea
                    id="companyDescription"
                    value={companyDescription}
                    onChange={(event) => setCompanyDescription(event.target.value)}
                    className="field min-h-20 resize-y"
                    placeholder="Descripción general de la empresa"
                  />
                </div>
                <div>
                  <label htmlFor="companyClassification" className="field-label">Clasificación</label>
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

                {statusMessage ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 size={14} aria-hidden />
                    {statusMessage}
                  </div>
                ) : null}
                {errorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                  </div>
                ) : null}
              </form>
            </div>

            {/* Right: summary + export */}
            <div className="flex flex-col gap-4">
              <div>
                <div className="eyebrow mb-1.5">Empresas</div>
                <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Empresas registradas.</h1>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="metric-tile py-3">
                  <div className="metric-label">Total en base de datos</div>
                  <div className="metric-value mt-2">{isLoading ? "—" : companies.length}</div>
                </div>
                <div className="metric-tile py-3">
                  <div className="metric-label">Nuevas (60 días)</div>
                  <div className="metric-value mt-2">{isLoading ? "—" : newLast60}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={exportCompaniesExcel}
                disabled={companies.length === 0 || isLoading}
                className="btn btn-secondary w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                Exportar a Excel
              </button>
            </div>
          </div>
        </section>

        <section className="surface-card rounded-[2rem] p-6 md:p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 p-3 text-slate-700">
                <Building2 size={18} aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Listado de empresas</h2>
              </div>
            </div>
            <div className="relative min-w-[14rem] max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
              <input
                type="search"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Buscar empresa..."
                className="field pl-9 py-2 text-sm"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="mt-6 text-sm text-slate-600">Cargando empresas...</div>
          ) : companies.length === 0 ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-sm text-slate-500">
              No hay empresas registradas todavía.
            </div>
          ) : (() => {
            const filtered = companySearch.trim()
              ? companies.filter((c) =>
                  c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
                  (c.description ?? "").toLowerCase().includes(companySearch.toLowerCase()) ||
                  (c.economicSector ?? "").toLowerCase().includes(companySearch.toLowerCase())
                )
              : companies;
            return filtered.length === 0 ? (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-sm text-slate-500">
                No se encontraron empresas para "{companySearch}".
              </div>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((company) => (
                  <article
                    key={company.id}
                    className="metric-tile cursor-pointer hover:ring-2 hover:ring-slate-300 transition-shadow"
                    onClick={() => openCompany(company)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openCompany(company); }}
                  >
                    <div className="font-display text-lg font-bold text-slate-900 md:text-[1rem]">{company.name}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-600 md:text-[0.82rem] md:leading-5">{company.description || "Sin descripción registrada."}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="pill">{company.economicSector || "Sin sector"}</span>
                      <span className="pill">{company.classification || "Sin clasificación"}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 break-all">{company.id}</div>
                  </article>
                ))}
              </div>
            );
          })()}
        </section>
      </div>

      {selectedCompany && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => { setSelectedCompany(null); setModalMode("view"); setModalError(""); }}
        >
          <div
            className="surface-card relative w-full max-w-lg rounded-[1.75rem] p-6 max-h-[calc(100vh-3rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-display text-2xl font-bold text-slate-900">{selectedCompany.name}</div>
                {selectedCompany.description && modalMode === "view" ? (
                  <p className="mt-1 text-sm text-slate-600">{selectedCompany.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCompany(null); setModalMode("view"); setModalError(""); }}
                className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* View mode */}
            {modalMode === "view" && (
              <>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sector económico</div>
                      <div className="mt-1 font-medium text-slate-900">{selectedCompany.economicSector || "—"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Clasificación</div>
                      <div className="mt-1 font-medium text-slate-900">{selectedCompany.classification || "—"}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Headcount</div>
                      <div className="mt-1 font-medium text-slate-900">{selectedCompany.headcount || "—"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Facturación USD</div>
                      <div className="mt-1 font-medium text-slate-900">{selectedCompany.revenueUSD || "—"}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Localidad</div>
                    <div className="mt-1 font-medium text-slate-900">{selectedCompany.locality || "—"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Contacto RRHH</div>
                    <div className="mt-1 font-medium text-slate-900">{selectedCompany.hrName || "—"}</div>
                    {selectedCompany.hrEmail ? <div className="mt-0.5 text-slate-600">{selectedCompany.hrEmail}</div> : null}
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fecha de registro</div>
                    <div className="mt-1 font-medium text-slate-900">{new Date(selectedCompany.createdAt).toLocaleDateString("es-VE")}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">ID</div>
                    <div className="mt-1 font-mono text-xs text-slate-600 break-all">{selectedCompany.id}</div>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <button type="button" onClick={() => { setModalMode("delete"); setModalError(""); }} className="btn btn-secondary text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setSelectedCompany(null); setModalMode("view"); }} className="btn btn-secondary">Cerrar</button>
                    <button type="button" onClick={openEdit} className="btn btn-primary">
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Edit mode */}
            {modalMode === "edit" && (
              <>
                <div className="mt-5 space-y-3">
                  <div>
                    <label className="field-label">Nombre</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="field w-full" placeholder="Nombre de la empresa" />
                  </div>
                  <div>
                    <label className="field-label">Sector económico</label>
                    <select aria-label="Sector económico" value={editSector} onChange={(e) => { setEditSector(e.target.value); setEditClassification(""); }} className="field-select w-full">
                      <option value="">Seleccionar sector</option>
                      {sectors.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Clasificación</label>
                    <select aria-label="Clasificación" value={editClassification} onChange={(e) => setEditClassification(e.target.value)} className="field-select w-full" disabled={!editSector}>
                      <option value="">Seleccionar clasificación</option>
                      {editClassificationOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                {modalError && <p className="mt-3 text-sm text-red-600">{modalError}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => { setModalMode("view"); setModalError(""); }} className="btn btn-secondary" disabled={isSaving}>Cancelar</button>
                  <button type="button" onClick={() => void handleEdit()} className="btn btn-primary" disabled={isSaving || !editName.trim()}>
                    {isSaving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </>
            )}

            {/* Delete confirmation */}
            {modalMode === "delete" && (
              <>
                <div className="mt-5 rounded-[1.25rem] border border-red-100 bg-red-50/60 px-5 py-4">
                  <p className="text-sm font-semibold text-red-800">¿Eliminar &quot;{selectedCompany.name}&quot;?</p>
                  <p className="mt-1 text-sm text-red-700">Esta acción no se puede deshacer. Solo es posible si la empresa no tiene usuarios activos.</p>
                </div>
                {modalError && <p className="mt-3 text-sm text-red-600">{modalError}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => { setModalMode("view"); setModalError(""); }} className="btn btn-secondary" disabled={isSaving}>Cancelar</button>
                  <button type="button" onClick={() => void handleDelete()} className="btn btn-primary bg-red-600 hover:bg-red-700 border-red-600" disabled={isSaving}>
                    {isSaving ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}