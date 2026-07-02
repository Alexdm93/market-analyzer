"use client";
import * as XLSX from "xlsx";
import { Database, FileSpreadsheet, Loader2, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ExtendedMarketPosition } from "@/types/salary";
import { fetchWorkspace } from "@/lib/workspace-client";
import { type Snapshot } from "@/lib/workspace";
import { useWorkspaceNotification } from "@/contexts/WorkspaceNotificationContext";

function formatMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n === 0) return "ND";
  return `$ ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function getDisplayLabel(snapshot: Snapshot) {
  const formattedDate = new Date(snapshot.date).toLocaleDateString();
  const rawLabel = (snapshot.label || "").trim();
  if (!rawLabel) return formattedDate;
  if (rawLabel === snapshot.date || rawLabel === formattedDate) return formattedDate;
  return `${rawLabel} — ${formattedDate}`;
}

type PercentilesMetricData = {
  n: number;
  min: number | null;
  max: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  promedio: number | null;
};

type MarketCargoGroup = {
  tituloCargo: string;
  n: number;
  sinPasivosMensual: PercentilesMetricData;
  conPasivosMensual: PercentilesMetricData;
  conPasivosAnual: PercentilesMetricData;
  directoMensualizado: PercentilesMetricData;
};

type PercentilesPayload = {
  snapshotId: string;
  bcvRate: number | null;
  grupos: MarketCargoGroup[];
};

type Group = {
  tituloCargo: string;
  count: number;
  cim_p50Raw: number;
  cim_promedioRaw: number;
  cim_minRaw: number;
  cim_maxRaw: number;
  cim_p50: string;
  cim_promedio: string;
  cim_min: string;
  cim_max: string;
  pcta_p50Raw: number;
  pcta_promedioRaw: number;
  pcta_minRaw: number;
  pcta_maxRaw: number;
  pcta_p50: string;
  pcta_promedio: string;
  pcta_min: string;
  pcta_max: string;
};

export default function ResultadosPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const { markRouteSeen } = useWorkspaceNotification();

  useEffect(() => { markRouteSeen("resultados"); }, [markRouteSeen]);

  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [percentileData, setPercentileData] = useState<PercentilesPayload | null>(null);
  const [percentilesLoading, setPercentilesLoading] = useState(false);

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
        const published = workspace.publishedParticipatedSnapshotIds ?? [];
        setPublishedIds(published);
        const eligible = isAdmin ? Object.keys(workspace.snapshots) : published;
        const preferred = workspace.selectedSnapshotId;
        const initial = (preferred && eligible.includes(preferred))
          ? preferred
          : (eligible.sort((a, b) => b.localeCompare(a))[0] ?? "");
        setSelectedSnapshotId(initial);
      } catch {
        if (!ignore) { setSnapshots({}); setSelectedSnapshotId(""); }
      }
    }
    void loadWorkspace();
    return () => { ignore = true; };
  }, [isAdmin]);

  const isPublished = publishedIds.includes(selectedSnapshotId);

  useEffect(() => {
    if (!selectedSnapshotId || (!isAdmin && !isPublished)) {
      setPercentileData(null);
      return;
    }
    let ignore = false;
    setPercentilesLoading(true);
    setPercentileData(null);
    void fetch(`/api/percentiles?snapshotId=${encodeURIComponent(selectedSnapshotId)}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() as Promise<PercentilesPayload> : null)
      .then((data) => { if (!ignore) setPercentileData(data); })
      .catch(() => { if (!ignore) setPercentileData(null); })
      .finally(() => { if (!ignore) setPercentilesLoading(false); });
    return () => { ignore = true; };
  }, [selectedSnapshotId, isAdmin, isPublished]);

  const availableSnapshots = useMemo(() => {
    return Object.values(snapshots)
      .filter((s) => isAdmin || publishedIds.includes(s.id))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [snapshots, publishedIds, isAdmin]);

  const groups = useMemo<Group[]>(() => {
    if (!selectedSnapshotId || (!isAdmin && !isPublished) || !percentileData) return [];

    const myTitleKeys = new Set<string>();
    rows.forEach((r) => {
      const t = (r.tituloCargo ?? "").trim().toLowerCase();
      if (t) myTitleKeys.add(t);
    });

    const showAll = isAdmin && myTitleKeys.size === 0;

    return percentileData.grupos
      .filter((g) => showAll || myTitleKeys.has(g.tituloCargo.trim().toLowerCase()))
      .map((g) => {
        const cim = g.conPasivosMensual;
        const pcta = g.conPasivosAnual;
        return {
          tituloCargo: g.tituloCargo,
          count: pcta.n,
          cim_p50Raw: cim.p50 ?? 0,
          cim_promedioRaw: cim.promedio ?? 0,
          cim_minRaw: cim.min ?? 0,
          cim_maxRaw: cim.max ?? 0,
          cim_p50: formatMoney(cim.p50),
          cim_promedio: formatMoney(cim.promedio),
          cim_min: formatMoney(cim.min),
          cim_max: formatMoney(cim.max),
          pcta_p50Raw: pcta.p50 ?? 0,
          pcta_promedioRaw: pcta.promedio ?? 0,
          pcta_minRaw: pcta.min ?? 0,
          pcta_maxRaw: pcta.max ?? 0,
          pcta_p50: formatMoney(pcta.p50),
          pcta_promedio: formatMoney(pcta.promedio),
          pcta_min: formatMoney(pcta.min),
          pcta_max: formatMoney(pcta.max),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [rows, percentileData, selectedSnapshotId, isAdmin, isPublished]);

  function exportExcel() {
    const selectedSnapshot = selectedSnapshotId ? snapshots[selectedSnapshotId] : undefined;
    const label = selectedSnapshot ? getDisplayLabel(selectedSnapshot) : selectedSnapshotId;
    const safeLabel = label.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    const sheetRows = groups.map((g) => ({
      Cargo: g.tituloCargo,
      Observaciones: g.count || null,
      "CIM — P50": g.cim_p50Raw || null,
      "CIM — Promedio": g.cim_promedioRaw || null,
      "CIM — Mínimo": g.cim_minRaw || null,
      "CIM — Máximo": g.cim_maxRaw || null,
      "PCTA — P50": g.pcta_p50Raw || null,
      "PCTA — Promedio": g.pcta_promedioRaw || null,
      "PCTA — Mínimo": g.pcta_minRaw || null,
      "PCTA — Máximo": g.pcta_maxRaw || null,
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    worksheet["!cols"] = [
      { wch: 36 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
    XLSX.writeFile(workbook, `resultados-${safeLabel}.xlsx`);
  }

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
                  {availableSnapshots.map((s) => (
                    <option key={s.id} value={s.id}>{getDisplayLabel(s)}</option>
                  ))}
                </select>
              </div>

              {groups.length > 0 && (
                <button
                  type="button"
                  onClick={exportExcel}
                  className="btn btn-secondary mt-4 w-full"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar a Excel
                </button>
              )}

              {isAdmin && (
                <div className="mt-3 rounded-[1.1rem] bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  Vista de resultados del usuario (datos del workspace).
                </div>
              )}
            </div>
          </div>
        </section>

        {availableSnapshots.length === 0 ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
            No hay cortes publicados disponibles aún.
          </section>
        ) : !isAdmin && !isPublished ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
            Este corte aún no ha sido publicado por el administrador.
          </section>
        ) : percentilesLoading ? (
          <section className="surface-card flex items-center gap-3 rounded-[2rem] p-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando resultados de mercado...
          </section>
        ) : groups.length === 0 ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
            No hay datos cargados en el corte seleccionado.
          </section>
        ) : (
          <section className="surface-card overflow-hidden rounded-[2rem]">
            <div className="flex flex-col gap-3 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="eyebrow mb-2">Tabla comparativa — PCTA</div>
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
                    <th className="px-4 py-2 text-right text-teal-600">CIM P50</th>
                    <th className="px-4 py-2 text-right text-teal-600">CIM Prom.</th>
                    <th className="px-4 py-2 text-right text-teal-600">CIM Min</th>
                    <th className="px-4 py-2 text-right text-teal-600">CIM Max</th>
                    <th className="px-4 py-2 text-right text-amber-600">PCTA P50</th>
                    <th className="px-4 py-2 text-right text-amber-600">PCTA Prom.</th>
                    <th className="px-4 py-2 text-right text-amber-600">PCTA Min</th>
                    <th className="px-4 py-2 text-right text-amber-600">PCTA Max</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.tituloCargo} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                      <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">{g.tituloCargo}</td>
                      <td className="px-4 py-4 text-center font-semibold text-slate-700">{g.count}</td>
                      <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">{g.cim_p50}</td>
                      <td className="px-4 py-4 text-right font-display text-teal-600">{g.cim_promedio}</td>
                      <td className="px-4 py-4 text-right font-display text-slate-500">{g.cim_min}</td>
                      <td className="px-4 py-4 text-right font-display text-slate-500">{g.cim_max}</td>
                      <td className="px-4 py-4 text-right font-display font-semibold text-amber-700">{g.pcta_p50}</td>
                      <td className="px-4 py-4 text-right font-display text-amber-600">{g.pcta_promedio}</td>
                      <td className="px-4 py-4 text-right font-display text-slate-500">{g.pcta_min}</td>
                      <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display text-slate-500">{g.pcta_max}</td>
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
