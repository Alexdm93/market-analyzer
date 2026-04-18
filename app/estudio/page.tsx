"use client";
import { BarChart3, Database, Layers3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as XLSX from "xlsx";
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

type AdminStudySnapshot = {
  id: string;
  label: string;
  date: string;
  status: "IN_REVIEW" | "PROCESSED";
  processedAt: string | null;
};

type AdminStudyPosition = {
  id: string;
  companyName: string;
  title: string;
  level: string;
  classification: string;
  description: string;
  baseSalary: string;
  totalCompensation: string;
  conceptValues: Record<string, number>;
};

type AdminProcessedMetric = {
  count: number;
  min: string;
  p10: string;
  p25: string;
  p50: string;
  p75: string;
  p90: string;
  max: string;
  average: string;
};

type AdminConceptMetric = AdminProcessedMetric & {
  concept: string;
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

function sanitizeFileSegment(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toLowerCase() || "reporte";
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
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [adminSnapshots, setAdminSnapshots] = useState<AdminStudySnapshot[]>([]);
  const [adminPositions, setAdminPositions] = useState<AdminStudyPosition[]>([]);
  const [adminStatus, setAdminStatus] = useState<"idle" | "processing" | "done">("idle");
  const [adminMessage, setAdminMessage] = useState("");
  const [selectedAdminCargo, setSelectedAdminCargo] = useState("");
  const adminStudyRequestId = useRef(0);

  const rows = useMemo<ExtendedMarketPosition[]>(() => {
    if (selectedSnapshotId && snapshots[selectedSnapshotId]) {
      return snapshots[selectedSnapshotId].rows || [];
    }

    return [];
  }, [snapshots, selectedSnapshotId]);

  const adminPositionsByCargo = useMemo(() => {
    const grouped = new Map<string, AdminStudyPosition[]>();

    adminPositions.forEach((position) => {
      const key = position.title.trim() || "Sin título";
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)?.push(position);
    });

    return Array.from(grouped.entries())
      .map(([title, positions]) => ({
        title,
        positions: positions.slice().sort((left, right) => left.companyName.localeCompare(right.companyName)),
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [adminPositions]);

  const adminProcessedMetrics = useMemo(() => {
    const entries = new Map<string, AdminConceptMetric[]>();

    adminPositionsByCargo.forEach(({ title, positions }) => {
      const conceptMap = new Map<string, number[]>();

      positions.forEach((position) => {
        Object.entries(position.conceptValues ?? {}).forEach(([concept, amount]) => {
          const values = conceptMap.get(concept) ?? [];
          values.push(Number(amount ?? 0));
          conceptMap.set(concept, values);
        });
      });

      const conceptMetrics = Array.from(conceptMap.entries())
        .map(([concept, values]) => {
          const numericValues = values.filter((value) => Number.isFinite(value));
          const average = numericValues.length ? Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) : 0;

          return {
            concept,
            count: numericValues.length,
            min: formatMoney(numericValues.length ? Math.min(...numericValues) : 0),
            max: formatMoney(numericValues.length ? Math.max(...numericValues) : 0),
            average: formatMoney(average),
            p10: formatMoney(Math.round(percentile(numericValues, 10))),
            p25: formatMoney(Math.round(percentile(numericValues, 25))),
            p50: formatMoney(Math.round(percentile(numericValues, 50))),
            p75: formatMoney(Math.round(percentile(numericValues, 75))),
            p90: formatMoney(Math.round(percentile(numericValues, 90))),
          };
        })
        .sort((left, right) => left.concept.localeCompare(right.concept));

      entries.set(title, conceptMetrics);
    });

    return entries;
  }, [adminPositionsByCargo]);

  useEffect(() => {
    if (isAdmin) {
      return;
    }

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
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let ignore = false;

    async function loadAdminStudy(snapshotId?: string) {
      const requestId = ++adminStudyRequestId.current;

      try {
        const searchParams = new URLSearchParams();

        if (snapshotId) {
          searchParams.set("snapshotId", snapshotId);
        }

        const response = await fetch(`/api/admin/study${searchParams.size ? `?${searchParams.toString()}` : ""}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          snapshots?: AdminStudySnapshot[];
          positions?: AdminStudyPosition[];
          message?: string;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "No fue posible cargar el estudio administrativo.");
        }

        if (ignore || requestId !== adminStudyRequestId.current) {
          return;
        }

        const nextSnapshots = Array.isArray(payload?.snapshots) ? payload.snapshots : [];
        const nextSelectedSnapshotId = snapshotId || "";

        setAdminSnapshots(nextSnapshots);
        setSelectedSnapshotId(nextSelectedSnapshotId);
        const nextPositions = Array.isArray(payload?.positions) ? payload.positions : [];
        setAdminPositions(nextPositions);
        const firstCargo = nextPositions[0]?.title?.trim() || "";
        setSelectedAdminCargo(firstCargo);
      } catch (error) {
        if (!ignore && requestId === adminStudyRequestId.current) {
          setAdminMessage(error instanceof Error ? error.message : "No fue posible cargar el estudio administrativo.");
          setAdminSnapshots([]);
          setAdminPositions([]);
          setSelectedSnapshotId("");
          setSelectedAdminCargo("");
        }
      }
    }

    void loadAdminStudy();

    return () => {
      ignore = true;
    };
  }, [isAdmin]);

  async function handleAdminSnapshotChange(snapshotId: string) {
    const requestId = ++adminStudyRequestId.current;
    setSelectedSnapshotId(snapshotId);
    setAdminMessage("");

    if (!snapshotId) {
      setAdminPositions([]);
      setSelectedAdminCargo("");
      return;
    }

    const response = await fetch(`/api/admin/study?snapshotId=${encodeURIComponent(snapshotId)}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as {
      snapshots?: AdminStudySnapshot[];
      positions?: AdminStudyPosition[];
      message?: string;
    } | null;

    if (!response.ok) {
      if (requestId !== adminStudyRequestId.current) {
        return;
      }
      setAdminMessage(payload?.message ?? "No fue posible cargar el corte seleccionado.");
      return;
    }

    if (requestId !== adminStudyRequestId.current) {
      return;
    }

    setAdminSnapshots(Array.isArray(payload?.snapshots) ? payload.snapshots : []);
    const nextPositions = Array.isArray(payload?.positions) ? payload.positions : [];
    setAdminPositions(nextPositions);
    const firstCargo = nextPositions[0]?.title?.trim() || "";
    setSelectedAdminCargo(firstCargo);
  }

  async function handleProcessSnapshot() {
    if (!selectedSnapshotId) {
      return;
    }

    setAdminStatus("processing");
    setAdminMessage("");

    try {
      const response = await fetch("/api/admin/study", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snapshotId: selectedSnapshotId,
          status: "PROCESSED",
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; status?: "IN_REVIEW" | "PROCESSED"; processedAt?: string | null } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible procesar el corte.");
      }

      setAdminSnapshots((current) =>
        current.map((snapshot) => (
          snapshot.id === selectedSnapshotId
            ? { ...snapshot, status: "PROCESSED", processedAt: payload?.processedAt ?? new Date().toISOString() }
            : snapshot
        ))
      );
      setAdminStatus("done");
      setAdminMessage(payload?.message ?? "Corte procesado correctamente.");
    } catch (error) {
      setAdminStatus("idle");
      setAdminMessage(error instanceof Error ? error.message : "No fue posible procesar el corte.");
    }
  }

  function exportAdminRawExcel(snapshotLabel: string, cargoTitle: string, positions: AdminStudyPosition[]) {
    if (positions.length === 0) {
      setAdminMessage("No hay data cruda para exportar en el cargo seleccionado.");
      return;
    }

    const sheetRows = positions.map((position) => ({
      Empresa: position.companyName,
      Cargo: position.title,
      Nivel: position.level || "—",
      Clasificacion: position.classification || "—",
      Descripcion: position.description || "—",
      Base: position.baseSalary,
      Total: position.totalCompensation,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data cruda");
    XLSX.writeFile(
      workbook,
      `data-cruda-${sanitizeFileSegment(snapshotLabel)}-${sanitizeFileSegment(cargoTitle)}.xlsx`
    );
  }

  function exportAdminProcessedExcel(snapshotLabel: string, cargoTitle: string, metrics: AdminConceptMetric[]) {
    if (metrics.length === 0) {
      setAdminMessage("No hay percentiles procesados para exportar en el cargo seleccionado.");
      return;
    }

    const sheetRows = metrics.map((metric) => ({
      Concepto: metric.concept,
      Min: metric.min,
      Max: metric.max,
      Promedio: metric.average,
      P10: metric.p10,
      P25: metric.p25,
      P50: metric.p50,
      P75: metric.p75,
      P90: metric.p90,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Percentiles");
    XLSX.writeFile(
      workbook,
      `percentiles-${sanitizeFileSegment(snapshotLabel)}-${sanitizeFileSegment(cargoTitle)}.xlsx`
    );
  }

  if (isAdmin) {
    const selectedAdminSnapshot = adminSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null;
    const availableAdminCargos = adminPositionsByCargo.map((entry) => entry.title);
    const activeAdminCargo = adminPositionsByCargo.find((entry) => entry.title === selectedAdminCargo)?.title ?? availableAdminCargos[0] ?? "";
    const activeRawPositions = adminPositionsByCargo.find((entry) => entry.title === activeAdminCargo)?.positions ?? [];
    const activeProcessedMetrics = adminProcessedMetrics.get(activeAdminCargo) ?? [];

    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-6">
          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
              <div>
                <div className="eyebrow mb-3">Estudio administrativo</div>
                <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Revisión de cargos por corte.</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                  Selecciona un corte global, revisa todos los cargos consolidados y marca el corte como procesado cuando termine la revisión.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="metric-tile">
                    <div className="metric-label">Corte activo</div>
                    <div className="metric-value mt-3 text-xl">{selectedAdminSnapshot ? selectedAdminSnapshot.label : "Sin corte"}</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Cargos</div>
                    <div className="metric-value mt-3">{adminPositions.length}</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Estado</div>
                    <div className="metric-value mt-3 text-xl">{selectedAdminSnapshot?.status === "PROCESSED" ? "Procesada" : "En revisión"}</div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-slate-600">
                  {selectedAdminSnapshot?.processedAt
                    ? `Procesada el ${new Date(selectedAdminSnapshot.processedAt).toLocaleDateString("es-VE")} a las ${new Date(selectedAdminSnapshot.processedAt).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })}`
                    : "Aún no se ha procesado este corte."}
                </div>
              </div>

              <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-teal-50 p-3 text-teal-700">
                    <Database size={18} aria-hidden />
                  </div>
                  <div>
                    <div className="eyebrow mb-1">Control</div>
                    <h2 className="font-display text-2xl font-bold text-slate-900">Corte</h2>
                  </div>
                </div>

                <div className="mt-5">
                  <label htmlFor="adminStudySnapshot" className="field-label">Seleccionar corte</label>
                  <select
                    id="adminStudySnapshot"
                    value={selectedSnapshotId}
                    onChange={(event) => void handleAdminSnapshotChange(event.target.value)}
                    className="field-select"
                  >
                    <option value="">Seleccionar</option>
                    {adminSnapshots.map((snapshot) => (
                      <option key={snapshot.id} value={snapshot.id}>{snapshot.label} — {new Date(snapshot.date).toLocaleDateString()}</option>
                    ))}
                  </select>
                </div>

                <button onClick={() => void handleProcessSnapshot()} className="btn btn-primary mt-5 w-full" disabled={!selectedSnapshotId || selectedAdminSnapshot?.status === "PROCESSED" || adminStatus === "processing"}>
                  {adminStatus === "processing" ? "Procesando..." : "Procesar"}
                </button>

                {adminMessage ? <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{adminMessage}</div> : null}
              </div>
            </div>
          </section>

          {adminPositions.length === 0 ? (
            <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
              Selecciona un corte para revisar sus cargos consolidados.
            </section>
          ) : (
            <>
              <section className="surface-card overflow-hidden rounded-[2rem]">
                <div className="flex flex-col gap-3 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="eyebrow mb-2">Data cruda</div>
                    <h2 className="font-display text-2xl font-bold text-slate-900">Cargos cargados por empresa</h2>
                  </div>
                  <div className="pill">{selectedAdminSnapshot?.status === "PROCESSED" ? "Procesada" : "En revisión"}</div>
                </div>

                <div className="border-b border-slate-200/70 px-4 py-4 md:px-6">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem] md:items-end">
                    <div>
                      <label htmlFor="adminRawCargo" className="field-label">Seleccionar cargo</label>
                      <select
                        id="adminRawCargo"
                        value={activeAdminCargo}
                        onChange={(event) => setSelectedAdminCargo(event.target.value)}
                        className="field-select"
                      >
                        {availableAdminCargos.map((cargo) => (
                          <option key={cargo} value={cargo}>{cargo}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => exportAdminRawExcel(selectedAdminSnapshot?.label || "corte", activeAdminCargo, activeRawPositions)}
                      className="btn btn-secondary"
                    >
                      Exportar Excel
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto px-3 pb-3 pt-4 md:px-4 md:pb-4">
                  <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                        <th className="px-4 py-2">Empresa</th>
                        <th className="px-4 py-2">Cargo</th>
                        <th className="px-4 py-2">Nivel</th>
                        <th className="px-4 py-2">Clasificación</th>
                        <th className="px-4 py-2">Descripción</th>
                        <th className="px-4 py-2 text-right">Base</th>
                        <th className="px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRawPositions.map((position) => (
                        <tr key={position.id} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                          <td className="rounded-l-[1.25rem] px-4 py-4 text-slate-700">{position.companyName}</td>
                          <td className="px-4 py-4 font-medium text-slate-900">{position.title}</td>
                          <td className="px-4 py-4 text-slate-600">{position.level || "—"}</td>
                          <td className="px-4 py-4 text-slate-600">{position.classification || "—"}</td>
                          <td className="px-4 py-4 text-slate-600">{position.description || "—"}</td>
                          <td className="px-4 py-4 text-right font-display text-slate-700">{position.baseSalary}</td>
                          <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display text-amber-700">{position.totalCompensation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {selectedAdminSnapshot?.status === "PROCESSED" ? (
                <section className="surface-card overflow-hidden rounded-[2rem]">
                  <div className="flex flex-col gap-3 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="eyebrow mb-2">Resultado procesado</div>
                      <h2 className="font-display text-2xl font-bold text-slate-900">Percentiles por cargo</h2>
                    </div>
                    <div className="pill">Procesada</div>
                  </div>

                  <div className="border-b border-slate-200/70 px-4 py-4 md:px-6">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem] md:items-end">
                      <div>
                        <label htmlFor="adminProcessedCargo" className="field-label">Seleccionar cargo</label>
                        <select
                          id="adminProcessedCargo"
                          value={activeAdminCargo}
                          onChange={(event) => setSelectedAdminCargo(event.target.value)}
                          className="field-select"
                        >
                          {availableAdminCargos.map((cargo) => (
                            <option key={`processed-${cargo}`} value={cargo}>{cargo}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => exportAdminProcessedExcel(selectedAdminSnapshot?.label || "corte", activeAdminCargo, activeProcessedMetrics)}
                        className="btn btn-secondary"
                      >
                        Exportar Excel
                      </button>
                    </div>
                  </div>

                  {activeProcessedMetrics.length > 0 ? (
                    <div className="overflow-x-auto px-3 py-4 md:px-4 md:py-5">
                      <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                        <thead>
                          <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                            <th className="px-4 py-2">Concepto</th>
                            <th className="px-4 py-2 text-right">Min</th>
                            <th className="px-4 py-2 text-right">Max</th>
                            <th className="px-4 py-2 text-right">Promedio</th>
                            <th className="px-4 py-2 text-right">P10</th>
                            <th className="px-4 py-2 text-right">P25</th>
                            <th className="px-4 py-2 text-right">P50</th>
                            <th className="px-4 py-2 text-right">P75</th>
                            <th className="px-4 py-2 text-right">P90</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeProcessedMetrics.map((metric) => (
                            <tr key={metric.concept} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                              <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">{metric.concept}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{metric.min}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{metric.max}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{metric.average}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{metric.p10}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{metric.p25}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{metric.p50}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{metric.p75}</td>
                              <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display text-amber-700">{metric.p90}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>
    );
  }

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
