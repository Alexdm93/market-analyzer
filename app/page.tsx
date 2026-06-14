"use client";
import { useEffect, useMemo, useState } from "react";
import { legacyMockMarketData as mockMarketData } from "@/data/mockSalaries";
import { projectSalary } from "@/lib/projections";
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

export default function Home() {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [inflation, setInflation] = useState<number>(5);

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      try {
        const workspace = await fetchWorkspace();
        if (!ignore) {
          setSnapshots(workspace.snapshots);
          setSelectedSnapshotId(workspace.selectedSnapshotId || Object.keys(workspace.snapshots)[0] || "");
          setCompanyInfo(workspace.companyInfo);
          setInflation(workspace.inflation);
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
  const globalP50 = allTotals.length ? Math.round(percentile(allTotals, 50)) : 0;
  const nivelesConData = NIVELES.filter((n) => medianasPorNivel[n] !== "ND").length;
  const companyName = companyInfo.companyName || "Sin nombre";

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-5">
        <section className="surface-panel overflow-hidden rounded-[1.75rem] p-5 md:p-6">
          <div>
            <div className="eyebrow mb-3">Panel principal</div>
            <h1 className="dashboard-title font-display max-w-3xl font-bold tracking-tight text-slate-900">
              Resumen Empresa
            </h1>
            <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
              Sigue el comportamiento salarial por nivel organizacional basado en el corte activo de tu empresa.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="metric-tile">
                <div className="metric-label">Total de posiciones</div>
                <div className="metric-value mt-3">{totalPositions}</div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">Mediana global</div>
                <div className="metric-value mt-3">{formatMoney(globalP50)}</div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">Niveles con data</div>
                <div className="metric-value mt-3">{nivelesConData}</div>
              </div>
            </div>

            <div className="mt-8">
              <div className="eyebrow mb-3">Información de compensación</div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                      {NIVELES.map((nivel) => (
                        <th key={nivel} className="px-4 py-2 text-center">{nivel}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white/60 rounded-[1.25rem]">
                      {NIVELES.map((nivel, i) => (
                        <td
                          key={nivel}
                          className={`px-4 py-4 text-center font-display font-semibold ${i === 0 ? "rounded-l-[1.25rem]" : ""} ${i === NIVELES.length - 1 ? "rounded-r-[1.25rem]" : ""} ${medianasPorNivel[nivel] === "ND" ? "text-slate-400" : "text-teal-700"}`}
                        >
                          {medianasPorNivel[nivel]}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
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
                  <th className="px-4 py-2 text-right">P50 Base</th>
                  <th className="px-4 py-2 text-right">Mes 1</th>
                  <th className="px-4 py-2 text-right">Mes 2</th>
                </tr>
              </thead>
              <tbody>
                {mockMarketData.map((job) => (
                  <tr key={job.id} className="overflow-hidden rounded-[1.25rem] bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                    <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">{job.jobTitle}</td>
                    <td className="px-4 py-4 text-right font-display text-slate-700">${job.basePercentiles.p50}</td>
                    <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">
                      ${projectSalary(job.basePercentiles, inflation, 1).p50}
                    </td>
                    <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display font-semibold text-amber-700">
                      ${projectSalary(job.basePercentiles, inflation, 2).p50}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
