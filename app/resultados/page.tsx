"use client";
import { Database, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ExtendedMarketPosition } from "@/types/salary";
import { fetchWorkspace } from "@/lib/workspace-client";
import { type Snapshot } from "@/lib/workspace";

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
  return sum;
}

type Group = {
  cod: string;
  title: string;
  count: number;
  p50: string;
  promedio: string;
  min: string;
  max: string;
};

export default function ResultadosPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

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
        if (ignore) return;
        setSnapshots(workspace.snapshots);
        const mostRecent = Object.values(workspace.snapshots)
          .sort((a, b) => b.date.localeCompare(a.date))
          .at(0);
        setSelectedSnapshotId(mostRecent?.id ?? workspace.selectedSnapshotId ?? Object.keys(workspace.snapshots)[0] ?? "");
      } catch {
        if (!ignore) { setSnapshots({}); setSelectedSnapshotId(""); }
      }
    }
    void loadWorkspace();
    return () => { ignore = true; };
  }, []);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, ExtendedMarketPosition[]>();
    rows.forEach((r) => {
      const key = r.tituloCargo?.trim() || "Sin título";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries())
      .map(([title, items], index) => {
        const totals = items.map((it) => Number(computeRowTotal(it) ?? 0)).filter((v) => !Number.isNaN(v));
        const count = items.length;
        const min = totals.length ? Math.min(...totals) : 0;
        const max = totals.length ? Math.max(...totals) : 0;
        const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
        const p50 = Math.round(percentile(totals, 50));
        return {
          cod: `C${String(index + 1).padStart(3, "0")}`,
          title,
          count,
          p50: formatMoney(p50),
          promedio: formatMoney(avg),
          min: formatMoney(min),
          max: formatMoney(max),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const totalObservations = groups.reduce((acc, g) => acc + g.count, 0);
  const selectedSnapshot = selectedSnapshotId ? snapshots[selectedSnapshotId] : undefined;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
            <div>
              <div className="eyebrow mb-3">Resultados de mercado</div>
              <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Resumen por cargo.</h1>
              <p className="dashboard-lead mt-3 max-w-3xl text-slate-600">
                Vista consolidada con las métricas principales por cargo del corte activo.
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
                  <div className="metric-label">Corte activo</div>
                  <div className="metric-value mt-3 text-xl">{selectedSnapshot ? getDisplayLabel(selectedSnapshot) : "—"}</div>
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
                <label htmlFor="resultadosSnapshot" className="field-label">Corte de datos</label>
                <select
                  id="resultadosSnapshot"
                  value={selectedSnapshotId}
                  onChange={(e) => setSelectedSnapshotId(e.target.value)}
                  className="field-select"
                >
                  {Object.values(snapshots)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((s) => (
                      <option key={s.id} value={s.id}>{getDisplayLabel(s)}</option>
                    ))}
                </select>
              </div>

              {isAdmin && (
                <div className="mt-3 rounded-[1.1rem] bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  Vista de resultados del usuario (datos del workspace).
                </div>
              )}
            </div>
          </div>
        </section>

        {groups.length === 0 ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
            No hay datos cargados en el corte seleccionado.
          </section>
        ) : (
          <section className="surface-card overflow-hidden rounded-[2rem]">
            <div className="flex flex-col gap-3 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="eyebrow mb-2">Tabla comparativa</div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Métricas por cargo</h2>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <TrendingUp size={14} />
                Ordenado por observaciones
              </div>
            </div>

            <div className="overflow-x-auto px-3 pb-3 md:px-4 md:pb-4">
              <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                <thead>
                  <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                    <th className="px-4 py-2">Cargo</th>
                    <th className="px-4 py-2 text-center">Obs.</th>
                    <th className="px-4 py-2 text-right">P50</th>
                    <th className="px-4 py-2 text-right">Promedio</th>
                    <th className="px-4 py-2 text-right">Min</th>
                    <th className="px-4 py-2 text-right">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.cod} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                      <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">{g.title}</td>
                      <td className="px-4 py-4 text-center font-semibold text-slate-700">{g.count}</td>
                      <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">{g.p50}</td>
                      <td className="px-4 py-4 text-right font-display text-amber-700">{g.promedio}</td>
                      <td className="px-4 py-4 text-right font-display text-slate-600">{g.min}</td>
                      <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display text-slate-600">{g.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
