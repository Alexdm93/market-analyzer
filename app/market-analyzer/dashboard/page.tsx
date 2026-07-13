"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, Building2, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { fetchWorkspace } from "@/lib/workspace-client";
import type { Snapshot, CompanyInfo } from "@/lib/workspace";
import { EMPTY_COMPANY_INFO } from "@/lib/workspace";
import { type ExtendedMarketPosition } from "@/types/salary";
import { FmtMoney } from "@/components/FmtMoney";
import { HelpTip } from "@/components/HelpTip";
import { computeRowTotals } from "@/lib/compensation";

const NIVELES = ["Operativo", "Profesional", "Supervisor", "Gerencia Media", "Gerencia Alta", "Ejecutivo"] as const;
type Nivel = (typeof NIVELES)[number];


function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function formatMoney(n: number) {
  if (!n || Number.isNaN(n)) return "ND";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ─── Types for admin dashboard ────────────────────────────────────────────────

type AdminDashboardData = {
  activeCompanies60Days: number;
  totalCompanies: number;
  totalPositions: number;
  availableSnapshots: { id: string; label: string; date: string }[];
  latestSnapshotId: string;
  sectorDistribution: { sector: string; count: number; percentage: number }[];
  percentilesByNivel: Record<string, { p25: number; p50: number; p75: number; count: number }>;
  warnings: { companyId: string; companyName: string; missingFields: string[] }[];
};

// ─── Admin Dashboard View ─────────────────────────────────────────────────────

type ParticipationCompany = {
  companyId: string;
  name: string;
  economicSector: string | null;
  submitted: boolean;
  submittedAt: string | null;
  dataChanged: boolean | null;
};

function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<ParticipationCompany[]>([]);

  useEffect(() => {
    let ignore = false;
    async function load(snapshotId?: string) {
      setLoading(true);
      try {
        const url = snapshotId ? `/api/admin/dashboard?snapshotId=${snapshotId}` : "/api/admin/dashboard";
        const [res, studyRes] = await Promise.all([
          fetch(url),
          snapshotId ? fetch(`/api/coordinator/study?snapshotId=${snapshotId}`) : Promise.resolve(null),
        ]);
        if (!ignore && res.ok) {
          const json = (await res.json()) as AdminDashboardData;
          setData(json);
          if (!snapshotId) setSelectedSnapshotId(json.latestSnapshotId);
        }
        if (!ignore && studyRes?.ok) {
          const studyJson = (await studyRes.json()) as { companies: ParticipationCompany[] };
          setCompanies(studyJson.companies ?? []);
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load(selectedSnapshotId || undefined);
    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSnapshotId]);

  if (loading && !data) {
    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-5">
          <section className="surface-panel rounded-[1.75rem] p-4 md:p-5">
            <div className="h-24 animate-pulse rounded-[1rem] bg-slate-200/60" />
          </section>
        </div>
      </main>
    );
  }

  const d = data!;
  const snapshots = d.availableSnapshots;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-5">

        {/* Panel principal */}
        <section className="surface-panel overflow-hidden rounded-[1.75rem] p-4 md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <div className="eyebrow mb-1.5">Vista Salarial — Admin</div>
              <h1 className="font-display text-[1.25rem] font-bold tracking-tight text-slate-900 md:text-[1.4rem]">
                Mercado General
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="metric-tile w-44 shrink-0 py-2.5">
                  <div className="metric-label">Empresas activas (60d)</div>
                  <div className="metric-value mt-1">{d.activeCompanies60Days}</div>
                </div>
                <div className="metric-tile w-44 shrink-0 py-2.5">
                  <div className="metric-label">Total empresas</div>
                  <div className="metric-value mt-1">{d.totalCompanies}</div>
                </div>
                <div className="metric-tile w-44 shrink-0 py-2.5">
                  <div className="metric-label">Cargos Reportados</div>
                  <div className="metric-value mt-1">{d.totalPositions}</div>
                </div>
                <div className="metric-tile w-44 shrink-0 py-2.5">
                  <div className="metric-label">Cortes disponibles</div>
                  <div className="metric-value mt-1">{snapshots.length}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 xl:self-end">
              {snapshots.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="field-label mb-0 whitespace-nowrap">Actualización:</label>
                  <select
                    title="Seleccionar actualización"
                    aria-label="Seleccionar actualización"
                    value={selectedSnapshotId}
                    onChange={(e) => setSelectedSnapshotId(e.target.value)}
                    className="field-select"
                  >
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>{s.label} ({s.date})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-1.5 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                      {NIVELES.map((n) => (
                        <th key={n} className="px-3 py-1.5 text-center">{n}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="rounded-[1.25rem] bg-white/60">
                      {NIVELES.map((n, i) => {
                        const val = d.percentilesByNivel[n]?.p50 ?? 0;
                        return (
                          <td key={n} className={`px-3 py-2.5 text-center font-display font-semibold text-xs ${i === 0 ? "rounded-l-[1.25rem]" : ""} ${i === NIVELES.length - 1 ? "rounded-r-[1.25rem]" : ""} ${val === 0 ? "text-slate-400" : "text-teal-700"}`}>
                            <div className="text-[0.65rem] font-normal text-slate-400">P50</div>
                            {val === 0 ? "ND" : formatMoney(val)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Sectores + Advertencias */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="surface-card rounded-[2rem] p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="rounded-full bg-teal-50 p-2 text-teal-700">
                <Building2 size={14} aria-hidden />
              </div>
              <div>
                <div className="eyebrow-xs eyebrow mb-0">Distribución</div>
                <h2 className="font-display text-base font-bold text-slate-900">Sectores</h2>
              </div>
            </div>
            {d.sectorDistribution.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos de sector.</p>
            ) : (
              <div className="space-y-1.5">
                {d.sectorDistribution.map((s) => (
                  <div key={s.sector} className="flex items-center justify-between gap-3 rounded-[0.85rem] bg-slate-50/80 px-3 py-2">
                    <span className="truncate text-xs font-semibold text-slate-700">{s.sector}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[0.68rem] font-bold text-teal-800">{s.percentage}%</span>
                      <span className="text-xs text-slate-400">{s.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="surface-card rounded-[2rem] p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="rounded-full bg-amber-50 p-2 text-amber-700">
                <AlertTriangle size={14} aria-hidden />
              </div>
              <div>
                <div className="eyebrow-xs eyebrow mb-0">Validación</div>
                <h2 className="font-display text-base font-bold text-slate-900">Advertencias de datos</h2>
              </div>
            </div>
            {d.warnings.length === 0 ? (
              <p className="text-sm text-slate-500">Todas las empresas tienen datos completos.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {d.warnings.map((w) => (
                  <div key={w.companyId} className="rounded-[1rem] border border-amber-100 bg-amber-50/60 px-3 py-2.5">
                    <p className="text-xs font-bold text-slate-800">{w.companyName}</p>
                    <p className="mt-0.5 text-xs text-amber-700">Falta: {w.missingFields.join(", ")}</p>
                  </div>
                ))}
              </div>
            )}
            {d.warnings.length > 0 && (
              <p className="mt-3 text-xs text-slate-400">{d.warnings.length} empresa{d.warnings.length !== 1 ? "s" : ""} con datos incompletos</p>
            )}
          </section>
        </div>

        {/* Participación por corte */}
        {companies.length > 0 && (() => {
          const submitted = companies.filter(c => c.submitted);
          const pending = companies.filter(c => !c.submitted);
          const sinCambios = submitted.filter(c => c.dataChanged === false).length;
          const modificadas = submitted.filter(c => c.dataChanged === true).length;
          return (
            <section className="surface-card overflow-hidden rounded-[2rem]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-teal-50 p-2 text-teal-700">
                    <CheckCircle2 size={14} aria-hidden />
                  </div>
                  <div>
                    <div className="eyebrow mb-0.5">Participación</div>
                    <h2 className="font-display text-base font-bold text-slate-900">Empresas por corte</h2>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-teal-700">{submitted.length} enviadas</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">{pending.length} pendientes</span>
                  {sinCambios > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">{sinCambios} sin cambios</span>}
                  {modificadas > 0 && <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{modificadas} modificadas</span>}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {companies.map((c) => (
                  <div key={c.companyId} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{c.name}</div>
                      {c.economicSector && <div className="truncate text-xs text-slate-400">{c.economicSector}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.submitted && c.dataChanged === false && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.68rem] font-semibold text-amber-700">Sin cambios</span>
                      )}
                      {c.submitted && c.dataChanged === true && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-semibold text-emerald-700">Modificada</span>
                      )}
                      {c.submitted ? (
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[0.68rem] font-semibold text-teal-700">
                          Enviado {c.submittedAt ? new Date(c.submittedAt).toLocaleDateString("es-VE", { day: "2-digit", month: "short" }) : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold text-slate-500">
                          <Clock size={10} /> Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Percentiles por nivel organizacional */}
        <section className="surface-card overflow-hidden rounded-[2rem]">
          <div className="flex items-center gap-2 border-b border-slate-200/70 px-6 py-4">
            <div className="rounded-full bg-teal-50 p-2 text-teal-700">
              <TrendingUp size={14} aria-hidden />
            </div>
            <div>
              <div className="eyebrow mb-0.5">Compensación mensual</div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Percentiles por nivel organizacional
                {selectedSnapshotId && snapshots.find(s => s.id === selectedSnapshotId) && (
                  <span className="ml-2 text-sm font-normal text-slate-500">— {snapshots.find(s => s.id === selectedSnapshotId)?.label}</span>
                )}
              </h2>
            </div>
          </div>
          <div className="overflow-x-auto px-3 pb-3 md:px-4 md:pb-4">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-4 py-2">Nivel organizacional</th>
                  <th className="px-4 py-2 text-center">Posiciones</th>
                  <th className="px-4 py-2 text-right">P25</th>
                  <th className="px-4 py-2 text-right text-teal-700">P50 (Mediana)</th>
                  <th className="px-4 py-2 text-right">P75</th>
                </tr>
              </thead>
              <tbody>
                {NIVELES.map((nivel) => {
                  const p = d.percentilesByNivel[nivel] ?? { p25: 0, p50: 0, p75: 0, count: 0 };
                  const hasData = p.count > 0;
                  return (
                    <tr key={nivel} className="overflow-hidden rounded-[1.25rem] bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                      <td className="rounded-l-[1.25rem] px-4 py-3 font-semibold text-slate-900">{nivel}</td>
                      <td className="px-4 py-3 text-center font-display text-slate-500">{hasData ? p.count : "—"}</td>
                      <td className="px-4 py-3 text-right font-display text-slate-600">{hasData ? formatMoney(p.p25) : "ND"}</td>
                      <td className="px-4 py-3 text-right font-display font-bold text-teal-700">{hasData ? formatMoney(p.p50) : "ND"}</td>
                      <td className="rounded-r-[1.25rem] px-4 py-3 text-right font-display text-slate-600">{hasData ? formatMoney(p.p75) : "ND"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </main>
  );
}

// ─── CAPRI level classification ───────────────────────────────────────────────

function getRowNivel(r: ExtendedMarketPosition): Nivel | null {
  if (!r.hayGrade || !r.capriFamily) return null;
  const g = r.hayGrade;
  if (r.capriFamily === "IC") {
    if (g >= 8  && g <= 12) return "Operativo";
    if (g >= 13 && g <= 19) return "Profesional";
  }
  if (r.capriFamily === "LO") {
    if (g >= 14 && g <= 16) return "Supervisor";
  }
  if (r.capriFamily === "GE") {
    if (g >= 17 && g <= 19) return "Gerencia Media";
    if (g >= 20 && g <= 23) return "Gerencia Alta";
  }
  if (r.capriFamily === "EJ") {
    if (g >= 23 && g <= 25) return "Ejecutivo";
  }
  return null;
}

// ─── User Dashboard View ──────────────────────────────────────────────────────

function UserDashboard() {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function loadWorkspace() {
      try {
        const workspace = await fetchWorkspace();
        if (!ignore) {
          setSnapshots(workspace.snapshots);
          const published = workspace.publishedParticipatedSnapshotIds ?? [];
          setPublishedIds(published);
          // Default to latest published snapshot; fall back to most recent overall
          const allSorted = Object.values(workspace.snapshots).sort((a, b) => b.date.localeCompare(a.date));
          const latestPublished = allSorted.find((s) => published.includes(s.id));
          setSelectedSnapshotId((latestPublished ?? allSorted[0])?.id ?? "");
          setCompanyInfo(workspace.companyInfo);
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadWorkspace();
    return () => { ignore = true; };
  }, []);

  const rows = useMemo<ExtendedMarketPosition[]>(() => {
    if (selectedSnapshotId && snapshots[selectedSnapshotId]) {
      return snapshots[selectedSnapshotId].rows || [];
    }
    return [];
  }, [snapshots, selectedSnapshotId]);

  const tasas = companyInfo.tasas ?? [];
  // For fallback recomputation use the rate captured at save time, not the current live rate.
  const bcvRate = (() => {
    const saved = companyInfo.ratesAtSave?.bcvUsd;
    if (typeof saved === "number" && saved > 0) return saved;
    const v = Number(tasas.find((t) => t.id === "bcv-usd")?.valor);
    return Number.isFinite(v) && v > 0 ? v : null;
  })();
  const diasVacaciones = Number(companyInfo.minVacationDays) || 0;
  const diasUtilidades = Number(companyInfo.minUtilityDays) || 0;

  function rowMonthly(r: ExtendedMarketPosition): number {
    return computeRowTotals(r, tasas, bcvRate, diasVacaciones, diasUtilidades).totalSinPasivosMensual;
  }
  function rowAnnual(r: ExtendedMarketPosition): number {
    return computeRowTotals(r, tasas, bcvRate, diasVacaciones, diasUtilidades).totalConPasivosAnual;
  }

  const medianasPorNivel = useMemo(() => {
    const result = {} as Record<Nivel, { p50: string; count: number }>;
    for (const nivel of NIVELES) {
      const totals = rows
        .filter((r) => getRowNivel(r) === nivel)
        .map(rowMonthly)
        .filter((v) => v > 0 && Number.isFinite(v));
      result[nivel] = {
        p50: formatMoney(totals.length ? Math.round(percentile(totals, 50)) : 0),
        count: totals.length,
      };
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, companyInfo]);

  const totalPositions = rows.length;
  const nivelesConData = NIVELES.filter((n) => medianasPorNivel[n].count > 0).length;
  const companyName = companyInfo.companyName || "Sin nombre";

  // Snapshots available for selector (published ones first, then any remaining)
  const snapshotList = useMemo(() => {
    return Object.values(snapshots)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((s) => ({ ...s, isPublished: publishedIds.includes(s.id) }));
  }, [snapshots, publishedIds]);

  if (loading) {
    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-5">
          <section className="surface-panel rounded-[1.75rem] p-4 md:p-5">
            <div className="h-32 animate-pulse rounded-[1rem] bg-slate-200/60" />
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-5">
        <section className="surface-panel overflow-hidden rounded-[1.75rem] p-4 md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <div className="eyebrow mb-1.5">Panel principal</div>
              <h1 className="font-display text-[1.25rem] font-bold tracking-tight text-slate-900 md:text-[1.4rem]">
                Resumen Empresa
              </h1>
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <div className="metric-tile w-44 shrink-0 py-2.5">
                  <div className="metric-label">Total de posiciones</div>
                  <div className="metric-value mt-1">{totalPositions}</div>
                </div>
                <div className="metric-tile w-44 shrink-0 py-2.5">
                  <div className="metric-label">Niveles con data</div>
                  <div className="metric-value mt-1">{nivelesConData}</div>
                </div>
                {snapshotList.length > 1 && (
                  <div className="flex items-center gap-2 self-center">
                    <label className="field-label mb-0 whitespace-nowrap text-xs">Corte:</label>
                    <select
                      title="Seleccionar corte"
                      aria-label="Seleccionar corte"
                      value={selectedSnapshotId}
                      onChange={(e) => setSelectedSnapshotId(e.target.value)}
                      className="field-select text-xs"
                    >
                      {snapshotList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto xl:self-end">
              <table className="min-w-full border-separate border-spacing-y-1.5 text-sm">
                <thead>
                  <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                    {NIVELES.map((nivel) => (
                      <th key={nivel} className="px-3 py-1.5 text-center">{nivel}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white/60 rounded-[1.25rem]">
                    {NIVELES.map((nivel, i) => {
                      const { p50, count } = medianasPorNivel[nivel];
                      return (
                        <td
                          key={nivel}
                          className={`px-3 py-2.5 text-center font-display ${i === 0 ? "rounded-l-[1.25rem]" : ""} ${i === NIVELES.length - 1 ? "rounded-r-[1.25rem]" : ""}`}
                        >
                          <div className="text-[0.6rem] font-normal text-slate-400">
                            {count > 0 ? `P50 · ${count}` : "P50"}
                          </div>
                          <div className={`font-semibold ${p50 === "ND" ? "text-slate-400" : "text-teal-700"}`}>
                            {p50}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="surface-card overflow-hidden rounded-[2rem]">
          <div className="flex flex-col gap-2 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="eyebrow mb-2">Data</div>
              <h2 className="font-display text-2xl font-bold text-slate-900">
                Información de compensación: {companyName}
              </h2>
            </div>
          </div>
          <div className="overflow-x-auto px-3 pb-3 md:px-4 md:pb-4">
            <table className="min-w-full border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-4 py-2">Cargo</th>
                  <th className="px-4 py-2 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      Total Efectivo Mensual (TEM)
                      <HelpTip
                        title="Total Efectivo Mensual (TEM)"
                        description="Refleja la liquidez real y directa que percibe el colaborador en un mes ordinario. Representa la suma de todas las remuneraciones y conceptos de pago (fijos y variables) que se cobran con una frecuencia estrictamente mensual. No incluye provisiones ni alícuotas de pasivos laborales (utilidades, bono vacacional, prestaciones sociales)."
                      />
                    </span>
                  </th>
                  <th className="px-4 py-2 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      Paquete de Compensación Total Anual (PCTA)
                      <HelpTip
                        title="Paquete de Compensación Total Anual (PCTA)"
                        description="Representa el valor macroeconómico global del paquete del trabajador proyectado a un ejercicio fiscal completo (12 meses). Es la sumatoria anualizada de todos los ingresos regulares, pagos de frecuencia variable y el costo total de los pasivos laborales (utilidades, bono vacacional y prestaciones sociales). El indicador definitivo para comparar competitividad del puesto contra el mercado laboral."
                      />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">
                      Sin cargos registrados para esta actualización.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const monthly = rowMonthly(r);
                    const annual = rowAnnual(r);
                    return (
                      <tr key={r.id} className="overflow-hidden rounded-[1.25rem] bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                        <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">
                          {r.tituloCargo || "—"}
                          {r.departamento && (
                            <div className="text-xs text-slate-400">{r.departamento}</div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">
                          {monthly > 0 ? <FmtMoney value={monthly} prefix="$" /> : "ND"}
                        </td>
                        <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display font-semibold text-amber-700">
                          {annual > 0 ? <FmtMoney value={annual} prefix="$" /> : "ND"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function Home() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  if (status === "loading") {
    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-5">
          <section className="surface-panel rounded-[1.75rem] p-4 md:p-5">
            <div className="h-24 animate-pulse rounded-[1rem] bg-slate-200/60" />
          </section>
        </div>
      </main>
    );
  }

  return isAdmin ? <AdminDashboard /> : <UserDashboard />;
}
