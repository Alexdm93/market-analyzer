"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, Building2, TrendingUp } from "lucide-react";
import { fetchWorkspace } from "@/lib/workspace-client";
import type { Snapshot, CompanyInfo } from "@/lib/workspace";
import { EMPTY_COMPANY_INFO } from "@/lib/workspace";
import { type ExtendedMarketPosition } from "@/types/salary";

const NIVELES = ["Operativo", "Profesional", "Supervisor", "Gerencia Media", "Gerencia Alta", "Ejecutivo"] as const;
type Nivel = (typeof NIVELES)[number];

function computeRowTotal(r: ExtendedMarketPosition) {
  let sum = 0;
  sum += Number(r.sueldoBasico ?? 0);
  sum += Number(r.bonoAlimentacion ?? 0);
  sum += Number(r.bonoMovilizacion ?? 0);
  if (Array.isArray(r.additionalFixedPayments)) {
    sum += r.additionalFixedPayments.reduce((a, b) => a + Number(b.amount ?? 0), 0);
  }
  sum += Number(r.bonoDesempeno ?? 0);
  sum += Number(r.comisiones ?? 0);
  sum += Number(r.pagoVariableOtros ?? 0);
  if (Array.isArray(r.additionalVariablePayments)) {
    sum += r.additionalVariablePayments.reduce((a, b) => a + Number(b.amount ?? 0), 0);
  }
  sum += Number(r.pagoTransporte ?? 0);
  sum += Number(r.viaticos ?? 0);
  sum += Number(r.otrosPagos ?? 0);
  sum += Number(r.aportesSeguridadSocial ?? 0);
  sum += Number(r.prestacionesLegales ?? 0);
  return sum;
}

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
  return `$ ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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

function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load(snapshotId?: string) {
      setLoading(true);
      try {
        const url = snapshotId ? `/api/admin/dashboard?snapshotId=${snapshotId}` : "/api/admin/dashboard";
        const res = await fetch(url);
        if (!ignore && res.ok) {
          const json = (await res.json()) as AdminDashboardData;
          setData(json);
          if (!snapshotId) setSelectedSnapshotId(json.latestSnapshotId);
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
                  <div className="metric-label">Total posiciones</div>
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

// ─── User Dashboard View ──────────────────────────────────────────────────────

function UserDashboard() {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);

  useEffect(() => {
    let ignore = false;
    async function loadWorkspace() {
      try {
        const workspace = await fetchWorkspace();
        if (!ignore) {
          setSnapshots(workspace.snapshots);
          const mostRecentId = Object.values(workspace.snapshots)
            .sort((a, b) => b.date.localeCompare(a.date))
            .at(0)?.id ?? "";
          setSelectedSnapshotId(mostRecentId);
          setCompanyInfo(workspace.companyInfo);
        }
      } catch {
        // ignore
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

  const medianasPorNivel = useMemo(() => {
    const result = {} as Record<Nivel, string>;
    for (const nivel of NIVELES) {
      const totals = rows
        .filter((r) => r.nivelOrganizacional?.trim() === nivel)
        .map(computeRowTotal)
        .filter((v) => v > 0 && Number.isFinite(v));
      result[nivel] = formatMoney(totals.length ? Math.round(percentile(totals, 50)) : 0);
    }
    return result;
  }, [rows]);

  const allTotals = useMemo(
    () => rows.map(computeRowTotal).filter((v) => v > 0 && Number.isFinite(v)),
    [rows]
  );

  const totalPositions = rows.length;
  const nivelesConData = NIVELES.filter((n) => medianasPorNivel[n] !== "ND").length;
  const companyName = companyInfo.companyName || "Sin nombre";

  // suppress unused warning
  void allTotals;

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
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="metric-tile w-44 shrink-0 py-2.5">
                  <div className="metric-label">Total de posiciones</div>
                  <div className="metric-value mt-1">{totalPositions}</div>
                </div>
                <div className="metric-tile w-44 shrink-0 py-2.5">
                  <div className="metric-label">Niveles con data</div>
                  <div className="metric-value mt-1">{nivelesConData}</div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto xl:self-end">
              <table className="min-w-full border-separate border-spacing-y-1.5 text-sm">
                <thead>
                  <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                    {NIVELES.map((nivel) => (
                      <th key={nivel} className="px-4 py-1.5 text-center">{nivel}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white/60 rounded-[1.25rem]">
                    {NIVELES.map((nivel, i) => (
                      <td
                        key={nivel}
                        className={`px-4 py-3 text-center font-display font-semibold ${i === 0 ? "rounded-l-[1.25rem]" : ""} ${i === NIVELES.length - 1 ? "rounded-r-[1.25rem]" : ""} ${medianasPorNivel[nivel] === "ND" ? "text-slate-400" : "text-teal-700"}`}
                      >
                        {medianasPorNivel[nivel]}
                      </td>
                    ))}
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
                  <th className="px-4 py-2 text-right">Compensación Mensual</th>
                  <th className="px-4 py-2 text-right">Compensación Anual</th>
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
                    const monthly = computeRowTotal(r);
                    return (
                      <tr key={r.id} className="overflow-hidden rounded-[1.25rem] bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                        <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">
                          {r.tituloCargo || "—"}
                          {r.departamento && (
                            <div className="text-xs text-slate-400">{r.departamento}</div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">
                          {monthly > 0 ? `$${monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "ND"}
                        </td>
                        <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display font-semibold text-amber-700">
                          {monthly > 0 ? `$${(monthly * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "ND"}
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
