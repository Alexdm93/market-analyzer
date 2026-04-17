"use client";
import { BarChart3, Database, Layers3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExtendedMarketPosition } from "@/types/salary";
import { fetchWorkspace, updateWorkspace } from "@/lib/workspace-client";
import { type Snapshot } from "@/lib/workspace";

type Group = {
  cod: string;
  title: string;
  nivel: string;
  count: number;
  gradoMin: string;
  gradoMed: string;
  gradoMax: string;
  p90: string;
  p75: string;
  p50: string;
  p25: string;
  p10: string;
  promedio: string;
  min: string;
  max: string;
};

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function formatMoney(n: number) {
  return n == null || Number.isNaN(n) ? "ND" : `$ ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function getDisplayLabel(snapshot: Snapshot) {
  const formattedDate = new Date(snapshot.date).toLocaleDateString();
  const rawLabel = (snapshot.label || "").trim();
  if (!rawLabel) return formattedDate;
  if (rawLabel === snapshot.date || rawLabel === formattedDate) return formattedDate;
  return `${rawLabel} — ${formattedDate}`;
}

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

export default function EstudioPage() {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");

  const rows = useMemo<ExtendedMarketPosition[]>(() => {
    if (selectedSnapshotId && snapshots[selectedSnapshotId]) {
      return snapshots[selectedSnapshotId].rows || [];
    }

    return [];
  }, [snapshots, selectedSnapshotId]);

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      try {
        const workspace = await fetchWorkspace();
        if (ignore) {
          return;
        }

        setSnapshots(workspace.snapshots);
        setSelectedSnapshotId(workspace.selectedSnapshotId || Object.keys(workspace.snapshots)[0] || "");
      } catch {
        if (!ignore) {
          setSnapshots({});
          setSelectedSnapshotId("");
        }
      }
    }

    void loadWorkspace();

    return () => {
      ignore = true;
    };
  }, []);

  const map = new Map<string, ExtendedMarketPosition[]>();
  rows.forEach((r) => {
      const key = r.tituloCargo?.trim() || "Sin título";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });

  const groups: Group[] = Array.from(map.entries())
    .map(([title, items], index) => {
      const totals = items.map((it) => Number(computeRowTotal(it) ?? 0)).filter((v) => !Number.isNaN(v));
      const count = items.length;
      const min = totals.length ? Math.min(...totals) : 0;
      const max = totals.length ? Math.max(...totals) : 0;
      const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
      const p90 = Math.round(percentile(totals, 90));
      const p75 = Math.round(percentile(totals, 75));
      const p50 = Math.round(percentile(totals, 50));
      const p25 = Math.round(percentile(totals, 25));
      const p10 = Math.round(percentile(totals, 10));

      const nivelCounts: Record<string, number> = {};
      items.forEach((it) => {
        const n = it.nivelOrganizacional || "—";
        nivelCounts[n] = (nivelCounts[n] || 0) + 1;
      });
      const nivel = Object.entries(nivelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      return {
        cod: `C${String(index + 1).padStart(3, "0")}`,
        title,
        nivel,
        count,
        gradoMin: formatMoney(min),
        gradoMed: formatMoney(p50),
        gradoMax: formatMoney(max),
        p90: formatMoney(p90),
        p75: formatMoney(p75),
        p50: formatMoney(p50),
        p25: formatMoney(p25),
        p10: formatMoney(p10),
        promedio: formatMoney(avg),
        min: formatMoney(min),
        max: formatMoney(max),
      };
    })
    .sort((a, b) => b.count - a.count);

  const router = useRouter();
  const totalObservations = groups.reduce((acc, group) => acc + group.count, 0);
  const medianReference = groups[0]?.p50 ?? "ND";
  const topGroups = groups.slice(0, 6);
  const maxAverage = Math.max(
    ...topGroups.map((group) => Number(group.promedio.replace(/[^0-9.-]+/g, "") || 0)),
    1
  );

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
            <div>
              <div className="eyebrow mb-3">Estudio agregado</div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Lectura consolidada por cargo.</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                Analiza observaciones, percentiles y rangos sobre la data activa sin perder trazabilidad del corte que estás leyendo.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="metric-tile">
                  <div className="metric-label">Cargos agrupados</div>
                  <div className="metric-value mt-3">{groups.length}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Observaciones</div>
                  <div className="metric-value mt-3">{totalObservations}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">P50 de referencia</div>
                  <div className="metric-value mt-3">{medianReference}</div>
                </div>
              </div>
            </div>

            <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-teal-50 p-3 text-teal-700">
                  <Database size={18} aria-hidden />
                </div>
                <div>
                  <div className="eyebrow mb-1">Fuente activa</div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">Corte</h2>
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="estudioSnapshot" className="field-label">Corte de datos</label>
                <select
                  id="estudioSnapshot"
                  value={selectedSnapshotId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedSnapshotId(id);
                    void updateWorkspace({ selectedSnapshotId: id }).catch(() => {
                      // ignore
                    });
                  }}
                  className="field-select"
                >
                  {Object.values(snapshots)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((s) => (
                      <option key={s.id} value={s.id}>{getDisplayLabel(s)}</option>
                    ))}
                </select>
              </div>

              <button
                onClick={() => {
                  router.push("/data");
                }}
                className="btn btn-primary mt-5 w-full"
              >
                Abrir en Suministro de Data
              </button>
            </div>
          </div>
        </section>

        {groups.length === 0 ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
            No hay datos cargados. Ve a Suministro de Data y agrega posiciones para construir el estudio.
          </section>
        ) : (
          <>
            <section className="surface-card rounded-[2rem] p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="eyebrow mb-2">Lectura visual</div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">Promedio salarial por cargo</h2>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  <div className="pill">
                    <Layers3 size={14} aria-hidden />
                    Top {topGroups.length} cargos
                  </div>
                  <div className="pill">
                    <BarChart3 size={14} aria-hidden />
                    Escala relativa por promedio
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                {topGroups.map((group) => {
                  const average = Number(group.promedio.replace(/[^0-9.-]+/g, "") || 0);

                  return (
                    <div key={`${group.cod}-chart`} className="grid gap-2 md:grid-cols-[16rem_minmax(0,1fr)_8rem] md:items-center">
                      <div>
                        <div className="font-display text-sm font-bold text-slate-900">{group.title}</div>
                        <div className="text-xs text-slate-500">{group.count} observaciones</div>
                      </div>
                      <progress
                        className="h-3 w-full overflow-hidden rounded-full [appearance:none] [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:bg-[linear-gradient(90deg,#0f766e,#d97706)] [&::-moz-progress-bar]:bg-[linear-gradient(90deg,#0f766e,#d97706)]"
                        value={average}
                        max={maxAverage}
                      />
                      <div className="text-right font-display text-sm font-semibold text-slate-700">{group.promedio}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="surface-card overflow-hidden rounded-[2rem]">
              <div className="flex flex-col gap-3 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="eyebrow mb-2">Tabla comparativa</div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">Rangos y percentiles</h2>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  <div className="pill">
                    <Layers3 size={14} aria-hidden />
                    Agrupado por título
                  </div>
                  <div className="pill">
                    <BarChart3 size={14} aria-hidden />
                    Ordenado por observaciones
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto px-3 pb-3 md:px-4 md:pb-4">
                <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-4 py-2">COD</th>
                      <th className="px-4 py-2">Cargo</th>
                      <th className="px-4 py-2">Nivel</th>
                      <th className="px-4 py-2 text-center">Obs.</th>
                      <th className="px-4 py-2 text-right">Min</th>
                      <th className="px-4 py-2 text-right">P50</th>
                      <th className="px-4 py-2 text-right">Max</th>
                      <th className="px-4 py-2 text-right">P90</th>
                      <th className="px-4 py-2 text-right">P75</th>
                      <th className="px-4 py-2 text-right">P25</th>
                      <th className="px-4 py-2 text-right">P10</th>
                      <th className="px-4 py-2 text-right">Promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.cod} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                        <td className="rounded-l-[1.25rem] px-4 py-4 text-slate-500">{g.cod}</td>
                        <td className="px-4 py-4 font-medium text-slate-900">{g.title}</td>
                        <td className="px-4 py-4 text-slate-600">{g.nivel}</td>
                        <td className="px-4 py-4 text-center font-semibold text-slate-700">{g.count}</td>
                        <td className="px-4 py-4 text-right font-display text-slate-700">{g.min}</td>
                        <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">{g.p50}</td>
                        <td className="px-4 py-4 text-right font-display text-slate-700">{g.max}</td>
                        <td className="px-4 py-4 text-right font-display text-slate-700">{g.p90}</td>
                        <td className="px-4 py-4 text-right font-display text-slate-700">{g.p75}</td>
                        <td className="px-4 py-4 text-right font-display text-slate-700">{g.p25}</td>
                        <td className="px-4 py-4 text-right font-display text-slate-700">{g.p10}</td>
                        <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display text-amber-700">{g.promedio}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
