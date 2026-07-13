"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Activity, ArrowUpDown, Building2, Clock, Download, RefreshCw, Save } from "lucide-react";
import type { CompanyTelemetry } from "@/app/api/admin/telemetry/route";

type SortKey = "companyName" | "lastLoginAt" | "lastDataSavedAt" | "lastExportAt" | "totalPositions";
type SortDir = "asc" | "desc";

function timeAgo(iso: string | null): { label: string; level: "recent" | "old" | "never" } {
  if (!iso) return { label: "Nunca", level: "never" };
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  let label: string;
  if (mins < 2) label = "Hace un momento";
  else if (mins < 60) label = `Hace ${mins} min`;
  else if (hours < 24) label = `Hace ${hours}h`;
  else if (days === 1) label = "Ayer";
  else if (days < 7) label = `Hace ${days} días`;
  else if (days < 30) label = `Hace ${Math.floor(days / 7)} sem`;
  else label = `Hace ${Math.floor(days / 30)} mes${Math.floor(days / 30) !== 1 ? "es" : ""}`;

  const level = days < 7 ? "recent" : "old";
  return { label, level };
}

function Pill({ iso }: { iso: string | null }) {
  const { label, level } = timeAgo(iso);
  const cls =
    level === "recent"
      ? "bg-teal-50 text-teal-700 border border-teal-100"
      : level === "old"
      ? "bg-amber-50 text-amber-700 border border-amber-100"
      : "bg-slate-100 text-slate-400 border border-slate-200";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function sortData(data: CompanyTelemetry[], key: SortKey, dir: SortDir): CompanyTelemetry[] {
  return [...data].sort((a, b) => {
    let av: string | number | null;
    let bv: string | number | null;

    if (key === "companyName") {
      av = a.companyName;
      bv = b.companyName;
    } else if (key === "totalPositions") {
      av = a.totalPositions;
      bv = b.totalPositions;
    } else {
      av = a[key];
      bv = b[key];
    }

    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

export default function TelemetryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<CompanyTelemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("companyName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [status, session, router]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/telemetry");
      if (res.ok) {
        const json = (await res.json()) as { telemetry: CompanyTelemetry[] };
        setData(json.telemetry);
        setLastRefreshed(new Date());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = sortData(data, sortKey, sortDir);

  const totalPositions = data.reduce((s, c) => s + c.totalPositions, 0);
  const activeThisWeek = data.filter(
    (c) => c.lastLoginAt && Date.now() - new Date(c.lastLoginAt).getTime() < 7 * 86_400_000
  ).length;
  const neverLogged = data.filter((c) => !c.lastLoginAt).length;

  function SortBtn({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`flex items-center gap-1 font-extrabold uppercase tracking-[0.13em] text-[0.6rem] transition-colors ${
          active ? "text-teal-700" : "text-slate-400 hover:text-slate-600"
        }`}
      >
        {children}
        <ArrowUpDown size={10} className={active ? "opacity-100" : "opacity-40"} />
      </button>
    );
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-5">

        {/* Header */}
        <section className="surface-panel overflow-hidden rounded-[1.75rem] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow mb-1.5">Admin · Monitoreo</div>
              <h1 className="font-display text-[1.2rem] font-bold tracking-tight text-slate-900 md:text-[1.35rem]">
                Actividad por empresa
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Última sesión, carga de datos y descargas por cada empresa registrada.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastRefreshed && (
                <span className="text-xs text-slate-400">
                  Actualizado {timeAgo(lastRefreshed.toISOString()).label.toLowerCase()}
                </span>
              )}
              <button
                onClick={() => void load()}
                disabled={loading}
                className="btn btn-secondary flex items-center gap-1.5"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                Actualizar
              </button>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Total empresas</div>
              <div className="metric-value mt-1">{data.length}</div>
            </div>
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Activas esta semana</div>
              <div className="metric-value mt-1 text-teal-700">{activeThisWeek}</div>
            </div>
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Sin inicio de sesión</div>
              <div className="metric-value mt-1 text-amber-600">{neverLogged}</div>
            </div>
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Total cargos cargados</div>
              <div className="metric-value mt-1">{totalPositions}</div>
            </div>
          </div>
        </section>

        {/* Table */}
        <section className="surface-card overflow-hidden rounded-[2rem]">
          {loading && data.length === 0 ? (
            <div className="flex flex-col gap-2 p-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-[1rem] bg-slate-100" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 size={32} className="mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Sin empresas registradas aún</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-0 text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-5 py-4 first:rounded-tl-[2rem]">
                      <SortBtn k="companyName">
                        <Building2 size={10} />
                        Empresa
                      </SortBtn>
                    </th>
                    <th className="px-5 py-4">
                      <SortBtn k="lastLoginAt">
                        <Clock size={10} />
                        Último acceso
                      </SortBtn>
                    </th>
                    <th className="px-5 py-4">
                      <SortBtn k="lastDataSavedAt">
                        <Save size={10} />
                        Último guardado
                      </SortBtn>
                    </th>
                    <th className="px-5 py-4">
                      <SortBtn k="lastExportAt">
                        <Download size={10} />
                        Última descarga
                      </SortBtn>
                    </th>
                    <th className="px-5 py-4 last:rounded-tr-[2rem]">
                      <SortBtn k="totalPositions">
                        <Activity size={10} />
                        Cargos
                      </SortBtn>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((company, i) => {
                    const isLast = i === sorted.length - 1;
                    return (
                      <tr
                        key={company.companyId}
                        className={`transition-colors hover:bg-slate-50/70 ${
                          i % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                        } ${isLast ? "last:rounded-b-[2rem]" : ""}`}
                      >
                        {/* Company */}
                        <td className={`px-5 py-3.5 ${isLast ? "rounded-bl-[2rem]" : ""}`}>
                          <div className="font-semibold text-slate-900">{company.companyName}</div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-xs text-slate-400">{company.economicSector}</span>
                            <span className="text-xs text-slate-300">·</span>
                            <span className="text-xs text-slate-400">
                              {company.userCount} {company.userCount === 1 ? "usuario" : "usuarios"}
                            </span>
                          </div>
                        </td>

                        {/* Last login */}
                        <td className="px-5 py-3.5">
                          <Pill iso={company.lastLoginAt} />
                          {company.lastLoginUserName && company.lastLoginAt && (
                            <div className="mt-1 text-xs text-slate-400 truncate max-w-[140px]">
                              {company.lastLoginUserName}
                            </div>
                          )}
                        </td>

                        {/* Last data save */}
                        <td className="px-5 py-3.5">
                          <Pill iso={company.lastDataSavedAt} />
                          {company.totalPositions > 0 && (
                            <div className="mt-1 text-xs text-slate-400">
                              {company.totalPositions} cargo{company.totalPositions !== 1 ? "s" : ""}
                            </div>
                          )}
                        </td>

                        {/* Last export */}
                        <td className="px-5 py-3.5">
                          <Pill iso={company.lastExportAt} />
                        </td>

                        {/* Positions count */}
                        <td className={`px-5 py-3.5 ${isLast ? "rounded-br-[2rem]" : ""}`}>
                          <span
                            className={`font-display text-lg font-bold ${
                              company.totalPositions > 0 ? "text-teal-700" : "text-slate-300"
                            }`}
                          >
                            {company.totalPositions}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
