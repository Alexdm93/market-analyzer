"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, BriefcaseBusiness, Sparkles, TrendingUp } from "lucide-react";
import { legacyMockMarketData as mockMarketData } from "@/data/mockSalaries";
import { projectSalary } from "@/lib/projections";
import { fetchWorkspace, updateWorkspace } from "@/lib/workspace-client";

export default function Home() {
  const [inflation, setInflation] = useState<number>(5);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      try {
        const workspace = await fetchWorkspace();
        if (!ignore) {
          setInflation(workspace.inflation);
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) {
          setWorkspaceLoaded(true);
        }
      }
    }

    void loadWorkspace();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceLoaded) {
      return;
    }

    void updateWorkspace({ inflation }).catch(() => {
      // ignore
    });
  }, [inflation, workspaceLoaded]);

  const averageBase = Math.round(
    mockMarketData.reduce((acc, job) => acc + job.basePercentiles.p50, 0) / mockMarketData.length
  );
  const maxProjected = Math.max(...mockMarketData.map((job) => projectSalary(job.basePercentiles, inflation, 2).p50));

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel overflow-hidden rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_24rem]">
            <div>
              <div className="eyebrow mb-3">Panel principal</div>
              <h1 className="font-display max-w-3xl text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
                Vista salarial con una interfaz más editorial y legible.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                Sigue el comportamiento del mercado, ajusta inflación mensual y revisa el efecto inmediato sobre la mediana salarial proyectada.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="pill">
                  <Sparkles size={14} aria-hidden />
                  Lectura rápida de percentiles
                </div>
                <div className="pill">
                  <TrendingUp size={14} aria-hidden />
                  Simulación a 2 meses
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="metric-tile">
                  <div className="metric-label">Cargos en muestra</div>
                  <div className="metric-value mt-3">{mockMarketData.length}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">P50 base promedio</div>
                  <div className="metric-value mt-3">${averageBase.toLocaleString()}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">P50 máximo proyectado</div>
                  <div className="metric-value mt-3">${maxProjected.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="eyebrow mb-2">Supuesto clave</div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">Inflación mensual</h2>
                </div>
                <div className="rounded-full bg-teal-50 p-3 text-teal-700">
                  <ArrowUpRight size={18} aria-hidden />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Ajusta este valor para recalcular de inmediato las bandas proyectadas del tablero.
              </p>
              <div className="mt-6">
                <label htmlFor="inflation" className="field-label">Inflación mensual estimada (%)</label>
                <input
                  id="inflation"
                  type="number"
                  value={inflation}
                  placeholder="5"
                  title="Inflación mensual estimada en %"
                  onChange={(e) => setInflation(Number(e.target.value))}
                  className="field text-3xl font-semibold"
                />
              </div>
              <div className="mt-5 rounded-[1.25rem] bg-slate-900 p-4 text-white">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <BriefcaseBusiness size={16} aria-hidden />
                  Ajuste aplicado a toda la muestra simulada.
                </div>
                <p className="mt-3 font-display text-3xl font-bold">{inflation}%</p>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-card overflow-hidden rounded-[2rem]">
          <div className="flex flex-col gap-2 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="eyebrow mb-2">Muestra base</div>
              <h2 className="font-display text-2xl font-bold text-slate-900">Proyección salarial por cargo</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              La tabla prioriza comparación inmediata entre el P50 actual y sus dos cortes proyectados.
            </p>
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