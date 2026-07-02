"use client";
import { ChevronDown, Database, Layers3, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { exportStyledExcel } from "@/lib/excel-export";
import { ExtendedMarketPosition } from "@/types/salary";
import { fetchWorkspace, updateWorkspace } from "@/lib/workspace-client";
import { type Snapshot, type CompanyInfo, type ExchangeRate, EMPTY_COMPANY_INFO } from "@/lib/workspace";
import { resolveRowTotals, PERCENTILE_MIN_N } from "@/lib/compensation";
import { FmtMoney, fmtMoneyStr } from "@/components/FmtMoney";

type AdminStudySnapshot = {
  id: string;
  label: string;
  date: string;
  status: "IN_REVIEW" | "PROCESSED";
  processedAt: string | null;
  published: boolean;
};

type AdminStudyPosition = {
  id: string;
  companyName: string;
  sector: string;
  headcount: string;
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

type PercentilesMetricData = {
  n: number;
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
  availableSectors?: string[];
  availableSizes?: string[];
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
  return fmtMoneyStr(n);
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

const COMPENSATION_METRIC_KEYS = [
  "Sin pasivos — mensual",
  "Total directo mensualizado",
  "Con pasivos — mensual",
  "Con pasivos — anual",
] as const;

const COMPENSATION_METRIC_LABELS: Record<typeof COMPENSATION_METRIC_KEYS[number], string> = {
  "Sin pasivos — mensual": "Total Efectivo Mensual (TEM)",
  "Total directo mensualizado": "Total Efectivo Mensualizado (TEMz)",
  "Con pasivos — mensual": "Compensación Integral Mensualizada (CIM)",
  "Con pasivos — anual": "Paquete de Compensación Total Anual (PCTA)",
};

function MultiCheckboxFilter({
  label,
  options,
  selected,
  onChange,
  placeholder = "Todos",
  labelMap,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  labelMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const getLabel = (v: string) => labelMap?.[v] ?? v;
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? getLabel(selected[0])
        : `${selected.length} seleccionados`;

  return (
    <div ref={ref} className="relative">
      <p className="field-label text-[0.7rem]">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-[1rem] border border-slate-200 bg-white px-3 py-1.5 text-left text-sm hover:border-slate-300 focus:outline-none"
      >
        <span className={selected.length === 0 ? "text-slate-400" : "text-slate-900 font-medium"}>
          {summary}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-[1rem] border border-slate-200 bg-white py-1.5 shadow-lg">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="h-3.5 w-3.5 accent-teal-700"
              />
              <span className="text-slate-700">{getLabel(opt)}</span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">Sin opciones disponibles</p>
          )}
        </div>
      )}
    </div>
  );
}

function resolvePosition(myValue: number, data: PercentilesMetricData): string {
  if (data.p50 === null) return "Sin datos";
  if (myValue >= data.p50) {
    if (data.p75 !== null && myValue >= data.p75) {
      if (data.p90 !== null && myValue >= data.p90) return "Sobre P90";
      return "P75–P90";
    }
    return "P50–P75";
  }
  if (data.p25 !== null && myValue < data.p25) {
    if (data.p10 !== null && myValue < data.p10) return "Bajo P10";
    return "P10–P25";
  }
  return "P25–P50";
}

export default function EstudioPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    if (status === "authenticated" && !isAdmin && !session?.user?.estudioEnabled) {
      router.replace("/resultados");
    }
  }, [status, isAdmin, session, router]);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [adminSnapshots, setAdminSnapshots] = useState<AdminStudySnapshot[]>([]);
  const [adminPositions, setAdminPositions] = useState<AdminStudyPosition[]>([]);
  const [adminStatus, setAdminStatus] = useState<"idle" | "processing" | "done">("idle");
  const [adminMessage, setAdminMessage] = useState("");
  const [selectedAdminCargo, setSelectedAdminCargo] = useState("");
  const [studyView, setStudyView] = useState<"cargo" | "grado">("cargo");
  const [filterSectors, setFilterSectors] = useState<string[]>([]);
  const [filterCompanies, setFilterCompanies] = useState<string[]>([]);
  const [filterSizes, setFilterSizes] = useState<string[]>([]);
  const adminStudyRequestId = useRef(0);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [tasas, setTasas] = useState<ExchangeRate[]>([]);
  const [activeMetric, setActiveMetric] = useState<"sinPasivosMensual" | "conPasivosMensual" | "conPasivosAnual" | "directoMensualizado">("conPasivosMensual");
  const [percentileData, setPercentileData] = useState<PercentilesPayload | null>(null);
  const [percentilesLoading, setPercentilesLoading] = useState(false);
  const [percentilesError, setPercentilesError] = useState<string | null>(null);
  const [publishedParticipatedSnapshotIds, setPublishedParticipatedSnapshotIds] = useState<string[]>([]);
  const [pendingSector, setPendingSector] = useState("");
  const [pendingSize, setPendingSize] = useState("");
  const [appliedSector, setAppliedSector] = useState("");
  const [appliedSize, setAppliedSize] = useState("");
  const [availableUserSectors, setAvailableUserSectors] = useState<string[]>([]);
  const [availableUserSizes, setAvailableUserSizes] = useState<string[]>([]);
  const [adminPublishStatus, setAdminPublishStatus] = useState<"idle" | "working">("idle");
  const [nivelMin, setNivelMin] = useState<Record<string, number>>({});
  const [nivelMax, setNivelMax] = useState<Record<string, number>>({});
  const [rangosDraft, setRangosDraft] = useState<{ min: Record<string, string>; max: Record<string, string> } | null>(null);
  const [rangosModalOpen, setRangosModalOpen] = useState(false);
  const [filterFueraDeRango, setFilterFueraDeRango] = useState(false);

  const rows = useMemo<ExtendedMarketPosition[]>(() => {
    if (selectedSnapshotId && snapshots[selectedSnapshotId]) {
      return snapshots[selectedSnapshotId].rows || [];
    }

    return [];
  }, [snapshots, selectedSnapshotId]);

  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    adminPositions.forEach((p) => { if (p.sector) set.add(p.sector); });
    return Array.from(set).sort();
  }, [adminPositions]);

  const availableCompanies = useMemo(() => {
    const set = new Set<string>();
    adminPositions.forEach((p) => { if (p.companyName) set.add(p.companyName); });
    return Array.from(set).sort();
  }, [adminPositions]);

  const filteredPositions = useMemo(() => {
    return adminPositions.filter((p) => {
      if (filterSectors.length > 0 && !filterSectors.includes(p.sector)) return false;
      if (filterCompanies.length > 0 && !filterCompanies.includes(p.companyName)) return false;
      if (filterSizes.length > 0) {
        const hc = parseInt(p.headcount || "0");
        const sz = !hc ? "" : hc < 50 ? "pequeña" : hc <= 200 ? "mediana" : "grande";
        if (!filterSizes.includes(sz)) return false;
      }
      return true;
    });
  }, [adminPositions, filterSectors, filterCompanies, filterSizes]);

  const adminPositionsByCargo = useMemo(() => {
    const grouped = new Map<string, AdminStudyPosition[]>();

    filteredPositions.forEach((position) => {
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
  }, [filteredPositions]);

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

          const n = numericValues.length;
          const pct = (q: number) => formatMoney(Math.round(percentile(numericValues, q)));
          return {
            concept,
            count: n,
            min: n ? formatMoney(Math.min(...numericValues)) : "—",
            max: n ? formatMoney(Math.max(...numericValues)) : "—",
            average: n >= PERCENTILE_MIN_N.promedio ? formatMoney(average) : "ND",
            p10: n >= PERCENTILE_MIN_N.p10 ? pct(10) : "ND",
            p25: n >= PERCENTILE_MIN_N.p25 ? pct(25) : "ND",
            p50: n >= PERCENTILE_MIN_N.p50 ? pct(50) : "ND",
            p75: n >= PERCENTILE_MIN_N.p75 ? pct(75) : "ND",
            p90: n >= PERCENTILE_MIN_N.p90 ? pct(90) : "ND",
          };
        })
        .sort((left, right) => left.concept.localeCompare(right.concept));

      entries.set(title, conceptMetrics);
    });

    return entries;
  }, [adminPositionsByCargo]);

  const NIVELES_ESTUDIO = ["Operativo", "Profesional", "Supervisor", "Gerencia Media", "Gerencia Alta", "Ejecutivo"] as const;

  const adminPositionsByGrado = useMemo(() => {
    const map = new Map<string, { companies: Set<string>; totals: number[] }>();
    filteredPositions.forEach((p) => {
      const nivel = p.level.trim();
      const normalized = NIVELES_ESTUDIO.find((n) => nivel.toLowerCase().includes(n.toLowerCase())) ?? nivel;
      if (!normalized) return;
      if (!map.has(normalized)) map.set(normalized, { companies: new Set(), totals: [] });
      const entry = map.get(normalized)!;
      entry.companies.add(p.companyName);
      const total = p.conceptValues["Compensación total"] ?? 0;
      if (total > 0) entry.totals.push(Number(total));
    });
    return NIVELES_ESTUDIO.map((nivel) => {
      const entry = map.get(nivel);
      const totals = entry?.totals ?? [];
      return {
        nivel,
        empresas: entry?.companies.size ?? 0,
        obs: totals.length,
        min: totals.length ? formatMoney(Math.min(...totals)) : "—",
        p25: totals.length ? formatMoney(Math.round(percentile(totals, 25))) : "—",
        p50: totals.length ? formatMoney(Math.round(percentile(totals, 50))) : "—",
        p75: totals.length ? formatMoney(Math.round(percentile(totals, 75))) : "—",
        p90: totals.length ? formatMoney(Math.round(percentile(totals, 90))) : "—",
        max: totals.length ? formatMoney(Math.max(...totals)) : "—",
        promedio: totals.length ? formatMoney(Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)) : "—",
      };
    }).filter((g) => g.obs > 0);
  }, [filteredPositions]);

  const adminCompanySummary = useMemo(() => {
    const companiesMap = new Map<string, { sector: string; headcount: string }>();
    filteredPositions.forEach((p) => {
      if (!companiesMap.has(p.companyName)) {
        companiesMap.set(p.companyName, { sector: p.sector, headcount: p.headcount });
      }
    });
    const companies = Array.from(companiesMap.values());
    const total = companies.length;

    const sectorMap = new Map<string, number>();
    companies.forEach((c) => {
      const s = c.sector.trim() || "Sin sector";
      sectorMap.set(s, (sectorMap.get(s) ?? 0) + 1);
    });
    const sectors = Array.from(sectorMap.entries())
      .map(([sector, count]) => ({ sector, count, pct: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);

    let pequeña = 0, mediana = 0, grande = 0, nd = 0;
    companies.forEach((c) => {
      const hc = parseInt(c.headcount || "0");
      if (!hc) nd++;
      else if (hc < 50) pequeña++;
      else if (hc <= 200) mediana++;
      else grande++;
    });

    return { total, sectors, sizes: { pequeña, mediana, grande, nd } };
  }, [filteredPositions]);

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
        setCompanyInfo(workspace.companyInfo ?? EMPTY_COMPANY_INFO);
        setTasas(workspace.companyInfo?.tasas ?? []);
        const eligible = workspace.publishedParticipatedSnapshotIds ?? [];
        setPublishedParticipatedSnapshotIds(eligible);
        // Auto-select: prefer the workspace's saved selection if eligible, otherwise first eligible
        const preferred = workspace.selectedSnapshotId;
        const initial = (preferred && eligible.includes(preferred))
          ? preferred
          : (eligible[0] ?? "");
        setSelectedSnapshotId(initial);
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
    setPendingSector("");
    setPendingSize("");
    setAppliedSector("");
    setAppliedSize("");
    setAvailableUserSectors([]);
    setAvailableUserSizes([]);
  }, [selectedSnapshotId]);

  useEffect(() => {
    if (isAdmin || !selectedSnapshotId) return;
    let ignore = false;
    setPercentilesLoading(true);
    setPercentilesError(null);
    const params = new URLSearchParams({ snapshotId: selectedSnapshotId });
    if (appliedSector) params.set("sectors", appliedSector);
    if (appliedSize)   params.set("sizes",   appliedSize);
    void fetch(`/api/percentiles?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => null) as PercentilesPayload & { message?: string } | null;
        if (!ignore) {
          if (r.ok) {
            setPercentileData(body);
            if (body?.availableSectors?.length) setAvailableUserSectors(body.availableSectors);
            if (body?.availableSizes?.length)   setAvailableUserSizes(body.availableSizes);
          } else {
            setPercentileData(null);
            setPercentilesError(body?.message ?? "No fue posible cargar los datos de mercado.");
          }
        }
      })
      .catch(() => { if (!ignore) { setPercentileData(null); setPercentilesError("Error de conexión."); } })
      .finally(() => { if (!ignore) setPercentilesLoading(false); });
    return () => { ignore = true; };
  }, [isAdmin, selectedSnapshotId, appliedSector, appliedSize]);

  useEffect(() => {
    if (!isAdmin || !selectedSnapshotId) return;
    let ignore = false;
    void fetch(`/api/admin/study/ranges?snapshotId=${encodeURIComponent(selectedSnapshotId)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { nivelMin?: Record<string, number>; nivelMax?: Record<string, number> } | null) => {
        if (!ignore) {
          setNivelMin(data?.nivelMin ?? {});
          setNivelMax(data?.nivelMax ?? {});
        }
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, [isAdmin, selectedSnapshotId]);

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

  async function handleSaveRangos() {
    if (!selectedSnapshotId || !rangosDraft) return;
    const toNumber = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const parsedMin = Object.fromEntries(Object.entries(rangosDraft.min).map(([k, v]) => [k, toNumber(v)]));
    const parsedMax = Object.fromEntries(Object.entries(rangosDraft.max).map(([k, v]) => [k, toNumber(v)]));
    await fetch("/api/admin/study/ranges", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId: selectedSnapshotId, nivelMin: parsedMin, nivelMax: parsedMax }),
    });
    setNivelMin(parsedMin);
    setNivelMax(parsedMax);
    setRangosModalOpen(false);
    setRangosDraft(null);
  }

  async function handleTogglePublish(publish: boolean) {
    if (!selectedSnapshotId) return;
    setAdminPublishStatus("working");
    setAdminMessage("");
    try {
      const response = await fetch("/api/admin/study", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: selectedSnapshotId, publish }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; published?: boolean } | null;
      if (!response.ok) throw new Error(payload?.message ?? "No fue posible actualizar la visibilidad del corte.");
      setAdminSnapshots((current) =>
        current.map((s) => (s.id === selectedSnapshotId ? { ...s, published: payload?.published ?? publish } : s)),
      );
      setAdminMessage(payload?.message ?? (publish ? "Corte publicado." : "Corte despublicado."));
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "No fue posible actualizar la visibilidad del corte.");
    } finally {
      setAdminPublishStatus("idle");
    }
  }

  async function handleRevertToReview() {
    if (!selectedSnapshotId) return;
    setAdminStatus("processing");
    setAdminMessage("");
    try {
      const response = await fetch("/api/admin/study", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: selectedSnapshotId, status: "IN_REVIEW" }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "No fue posible revertir el estado del corte.");
      setAdminSnapshots((current) =>
        current.map((snapshot) =>
          snapshot.id === selectedSnapshotId ? { ...snapshot, status: "IN_REVIEW", processedAt: null } : snapshot
        )
      );
      setAdminStatus("idle");
      setAdminMessage("Corte revertido a revisión.");
    } catch (error) {
      setAdminStatus("idle");
      setAdminMessage(error instanceof Error ? error.message : "No fue posible revertir el estado del corte.");
    }
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
      // Recargar posiciones para reflejar cambios recientes (ej. cargos eliminados desde data)
      await handleAdminSnapshotChange(selectedSnapshotId);
    } catch (error) {
      setAdminStatus("idle");
      setAdminMessage(error instanceof Error ? error.message : "No fue posible procesar el corte.");
    }
  }

  async function exportAdminRawExcel(snapshotLabel: string, cargoTitle: string, positions: AdminStudyPosition[]) {
    if (positions.length === 0) {
      setAdminMessage("No hay data cruda para exportar en el cargo seleccionado.");
      return;
    }
    await exportStyledExcel([{
      name: "Data cruda",
      columns: [
        { header: "Empresa", key: "empresa", width: 32, align: "left"  },
        { header: "Cargo",   key: "cargo",   width: 32, align: "left"  },
        { header: "Nivel",   key: "nivel",   width: 20, align: "left"  },
        { header: "TEM",     key: "tem",     width: 16, align: "right" },
        { header: "TEMz",    key: "temz",    width: 16, align: "right" },
        { header: "PCTA",    key: "pcta",    width: 16, align: "right" },
      ],
      rows: positions.map((p) => ({
        empresa: p.companyName,
        cargo:   p.title,
        nivel:   p.level || "—",
        tem:     Number(p.conceptValues?.["Sin pasivos — mensual"]      ?? 0) || null,
        temz:    Number(p.conceptValues?.["Total directo mensualizado"] ?? 0) || null,
        pcta:    Number(p.conceptValues?.["Con pasivos — anual"]        ?? 0) || null,
      })),
    }], `data-cruda-${sanitizeFileSegment(snapshotLabel)}-${sanitizeFileSegment(cargoTitle)}.xlsx`);
  }

  async function exportAdminProcessedExcel(snapshotLabel: string, cargoTitle: string, positions: AdminStudyPosition[]) {
    const sheetRows = COMPENSATION_METRIC_KEYS.map((key) => {
      const values = positions
        .map((p) => Number(p.conceptValues?.[key] ?? 0))
        .filter((v) => Number.isFinite(v) && v > 0);
      const n = values.length;
      const pct = (q: number) => n > 0 ? Math.round(percentile(values, q)) : null;
      return {
        concepto: COMPENSATION_METRIC_LABELS[key],
        n,
        promedio: n >= PERCENTILE_MIN_N.promedio ? Math.round(values.reduce((a, b) => a + b, 0) / n) : null,
        min:      n ? Math.min(...values) : null,
        p10:      n >= PERCENTILE_MIN_N.p10 ? pct(10) : null,
        p25:      n >= PERCENTILE_MIN_N.p25 ? pct(25) : null,
        p50:      n >= PERCENTILE_MIN_N.p50 ? pct(50) : null,
        p75:      n >= PERCENTILE_MIN_N.p75 ? pct(75) : null,
        p90:      n >= PERCENTILE_MIN_N.p90 ? pct(90) : null,
        max:      n ? Math.max(...values) : null,
      };
    }).filter((r) => r.n > 0);

    if (sheetRows.length === 0) {
      setAdminMessage("No hay percentiles procesados para exportar en el cargo seleccionado.");
      return;
    }
    await exportStyledExcel([{
      name: "Percentiles",
      columns: [
        { header: "Concepto", key: "concepto", width: 46, align: "left"   },
        { header: "N",        key: "n",        width: 8,  align: "center" },
        { header: "Promedio", key: "promedio", width: 14, align: "right"  },
        { header: "Min",      key: "min",      width: 14, align: "right"  },
        { header: "P10",      key: "p10",      width: 14, align: "right"  },
        { header: "P25",      key: "p25",      width: 14, align: "right"  },
        { header: "P50",      key: "p50",      width: 14, align: "right"  },
        { header: "P75",      key: "p75",      width: 14, align: "right"  },
        { header: "P90",      key: "p90",      width: 14, align: "right"  },
        { header: "Max",      key: "max",      width: 14, align: "right"  },
      ],
      rows: sheetRows,
    }], `percentiles-${sanitizeFileSegment(snapshotLabel)}-${sanitizeFileSegment(cargoTitle)}.xlsx`);
  }

  async function exportAdminGradosExcel(snapshotLabel: string, positions: AdminStudyPosition[]) {
    const companyMap = new Map<string, Set<string>>();
    const valMap = new Map<string, number[]>();
    positions.forEach((p) => {
      const nivel = p.level.trim();
      const normalized = NIVELES_ESTUDIO.find((n) => nivel.toLowerCase().includes(n.toLowerCase())) ?? nivel;
      if (!normalized) return;
      if (!companyMap.has(normalized)) { companyMap.set(normalized, new Set()); valMap.set(normalized, []); }
      companyMap.get(normalized)!.add(p.companyName);
      const total = Number(p.conceptValues["Compensación total"] ?? 0);
      if (total > 0) valMap.get(normalized)!.push(total);
    });
    const sheetRows = NIVELES_ESTUDIO.map((nivel) => {
      const totals = valMap.get(nivel) ?? [];
      if (!totals.length) return null;
      return {
        grado:        nivel,
        empresas:     companyMap.get(nivel)?.size ?? 0,
        observaciones:totals.length,
        min:          Math.min(...totals),
        p25:          Math.round(percentile(totals, 25)),
        p50:          Math.round(percentile(totals, 50)),
        p75:          Math.round(percentile(totals, 75)),
        p90:          Math.round(percentile(totals, 90)),
        max:          Math.max(...totals),
        promedio:     Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      };
    }).filter(Boolean);

    if (sheetRows.length === 0) {
      setAdminMessage("No hay data de grados para exportar.");
      return;
    }
    await exportStyledExcel([{
      name: "Por grados",
      columns: [
        { header: "Grado",        key: "grado",         width: 20, align: "left"   },
        { header: "Empresas",     key: "empresas",      width: 12, align: "center" },
        { header: "Obs.",         key: "observaciones", width: 10, align: "center" },
        { header: "Min",          key: "min",           width: 14, align: "right"  },
        { header: "P25",          key: "p25",           width: 14, align: "right"  },
        { header: "P50",          key: "p50",           width: 14, align: "right"  },
        { header: "P75",          key: "p75",           width: 14, align: "right"  },
        { header: "P90",          key: "p90",           width: 14, align: "right"  },
        { header: "Max",          key: "max",           width: 14, align: "right"  },
        { header: "Promedio",     key: "promedio",      width: 14, align: "right"  },
      ],
      rows: sheetRows as Record<string, string | number | null | undefined>[],
    }], `grados-${sanitizeFileSegment(snapshotLabel)}.xlsx`);
  }

  const METRIC_KEY = {
    sinPasivosMensual: "totalSinPasivosMensual",
    conPasivosMensual: "totalConPasivosMensual",
    conPasivosAnual: "totalConPasivosAnual",
    directoMensualizado: "totalDirectoMensualizado",
  } as const;

  const METRIC_LABEL = {
    sinPasivosMensual: "TEM",
    directoMensualizado: "TEMz",
    conPasivosMensual: "CIM",
    conPasivosAnual: "PCTA",
  } as const;

  const userRowTotals = useMemo(() => {
    const bcvRate = (() => {
      const v = Number(tasas.find((t) => t.id === "bcv-usd")?.valor);
      return Number.isFinite(v) && v > 0 ? v : null;
    })();
    const diasVacaciones = Number(companyInfo.minVacationDays) || 0;
    const diasUtilidades = Number(companyInfo.minUtilityDays) || 0;
    return rows.map((row) => ({
      row,
      totals: resolveRowTotals(row, tasas, bcvRate, diasVacaciones, diasUtilidades),
    }));
  }, [rows, tasas, companyInfo]);

  const marketByTitle = useMemo(() => {
    const m = new Map<string, MarketCargoGroup>();
    (percentileData?.grupos ?? []).forEach((g) => m.set(g.tituloCargo.trim().toLowerCase(), g));
    return m;
  }, [percentileData]);

  async function exportUserExcel() {
    const allMetrics = [
      { key: "sinPasivosMensual",  label: "TEM"  },
      { key: "directoMensualizado",label: "TEMz" },
      { key: "conPasivosMensual",  label: "CIM"  },
      { key: "conPasivosAnual",    label: "PCTA" },
    ] as const;

    const sheets = allMetrics.map(({ key, label }) => ({
      name: label,
      columns: [
        { header: "Cargo",              key: "cargo",    width: 40, align: "left"   as const },
        { header: "N",                  key: "n",        width: 8,  align: "center" as const },
        { header: `Mi valor (${label})`,key: "miValor",  width: 16, align: "right"  as const },
        { header: "P10",                key: "p10",      width: 14, align: "right"  as const },
        { header: "P25",                key: "p25",      width: 14, align: "right"  as const },
        { header: "P50",                key: "p50",      width: 14, align: "right"  as const },
        { header: "P75",                key: "p75",      width: 14, align: "right"  as const },
        { header: "P90",                key: "p90",      width: 14, align: "right"  as const },
        { header: "Promedio",           key: "promedio", width: 14, align: "right"  as const },
        { header: "Posición",           key: "posicion", width: 20, align: "left"   as const },
      ],
      rows: userRowTotals.map(({ row, totals }) => {
        const normTitle = (row.tituloCargo ?? "").trim().toLowerCase();
        const mkt = marketByTitle.get(normTitle);
        const mktData = mkt ? mkt[key] : null;
        const myValue = totals[METRIC_KEY[key]];
        const nd = (v: number | null) => v ?? null;
        return {
          cargo:    row.tituloCargo || "Sin título",
          n:        mkt ? mkt.n : null,
          miValor:  myValue || null,
          p10:      mktData ? nd(mktData.p10)      : null,
          p25:      mktData ? nd(mktData.p25)      : null,
          p50:      mktData ? nd(mktData.p50)      : null,
          p75:      mktData ? nd(mktData.p75)      : null,
          p90:      mktData ? nd(mktData.p90)      : null,
          promedio: mktData ? nd(mktData.promedio) : null,
          posicion: mktData ? resolvePosition(myValue, mktData) : "—",
        };
      }),
    }));

    const snapshotLabel = selectedSnapshotId
      ? sanitizeFileSegment(snapshots[selectedSnapshotId]?.label || selectedSnapshotId)
      : "estudio";
    await exportStyledExcel(sheets, `posicionamiento-${snapshotLabel}.xlsx`);
  }

  if (isAdmin) {
    const selectedAdminSnapshot = adminSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null;
    const availableAdminCargos = adminPositionsByCargo.map((entry) => entry.title);
    const activeAdminCargo = adminPositionsByCargo.find((entry) => entry.title === selectedAdminCargo)?.title ?? availableAdminCargos[0] ?? "";
    const activeRawPositions = adminPositionsByCargo.find((entry) => entry.title === activeAdminCargo)?.positions ?? [];
    const activeProcessedMetrics = adminProcessedMetrics.get(activeAdminCargo) ?? [];
    const hasActiveFilters = filterSectors.length > 0 || filterCompanies.length > 0 || filterSizes.length > 0;

    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-6">
          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_26rem]">
              <div>
                <div className="eyebrow mb-3">Salary Survey</div>
                <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Procesamiento de data de mercado.</h1>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="metric-tile">
                    <div className="metric-label">Corte activo</div>
                    <div className="metric-value mt-3 text-xl">{selectedAdminSnapshot ? selectedAdminSnapshot.label : "Sin corte"}</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Posiciones{hasActiveFilters ? " (filtradas)" : ""}</div>
                    <div className="metric-value mt-3">{filteredPositions.length}{hasActiveFilters ? <span className="ml-1 text-sm text-slate-500">/ {adminPositions.length}</span> : null}</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Estado</div>
                    <div className="metric-value mt-3 text-xl">
                      {selectedAdminSnapshot?.published
                        ? "Publicada"
                        : selectedAdminSnapshot?.status === "PROCESSED"
                          ? "Procesada"
                          : "En revisión"}
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-slate-600">
                  {selectedAdminSnapshot?.published
                    ? "Publicada — los participantes pueden ver los resultados."
                    : selectedAdminSnapshot?.processedAt
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
                    <div className="eyebrow mb-1">Control de versiones / cortes</div>
                    <h2 className="font-display text-xl font-bold text-slate-900">Actualización</h2>
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="adminStudySnapshot" className="field-label">Seleccionar corte</label>
                  <select
                    id="adminStudySnapshot"
                    value={selectedSnapshotId}
                    onChange={(event) => {
                      setFilterSectors([]);
                      setFilterCompanies([]);
                      setFilterSizes([]);
                      void handleAdminSnapshotChange(event.target.value);
                    }}
                    className="field-select"
                  >
                    <option value="">Seleccionar</option>
                    {adminSnapshots.map((snapshot) => (
                      <option key={snapshot.id} value={snapshot.id}>{snapshot.label} — {new Date(snapshot.date).toLocaleDateString()}</option>
                    ))}
                  </select>
                </div>

                {adminPositions.length > 0 && (
                  <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3">
                    <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">Segmentar por</p>
                    <MultiCheckboxFilter
                      label="Sector"
                      options={availableSectors}
                      selected={filterSectors}
                      onChange={setFilterSectors}
                      placeholder="Todos"
                    />
                    <MultiCheckboxFilter
                      label="Empresa"
                      options={availableCompanies}
                      selected={filterCompanies}
                      onChange={setFilterCompanies}
                      placeholder="Todas"
                    />
                    <MultiCheckboxFilter
                      label="Tamaño"
                      options={["pequeña", "mediana", "grande"]}
                      labelMap={{ pequeña: "Pequeña (< 50)", mediana: "Mediana (50–200)", grande: "Grande (> 200)" }}
                      selected={filterSizes}
                      onChange={setFilterSizes}
                      placeholder="Todos"
                    />
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={() => { setFilterSectors([]); setFilterCompanies([]); setFilterSizes([]); }}
                        className="text-xs text-teal-700 underline underline-offset-2"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleProcessSnapshot()}
                  className="btn btn-primary mt-4 w-full"
                  disabled={!selectedSnapshotId || adminStatus === "processing"}
                >
                  {adminStatus === "processing" ? "Procesando..." : selectedAdminSnapshot?.status === "PROCESSED" ? "Reprocesar corte" : "Procesar corte"}
                </button>

                {selectedAdminSnapshot?.status === "PROCESSED" && (
                  <button
                    type="button"
                    onClick={() => void handleRevertToReview()}
                    className="mt-2 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                    disabled={adminStatus === "processing"}
                  >
                    Volver a revisión
                  </button>
                )}

                {selectedAdminSnapshot?.status === "PROCESSED" && (
                  <button
                    type="button"
                    onClick={() => void handleTogglePublish(!selectedAdminSnapshot.published)}
                    className={`mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                      selectedAdminSnapshot.published
                        ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                    disabled={adminPublishStatus === "working"}
                  >
                    {adminPublishStatus === "working"
                      ? "Actualizando..."
                      : selectedAdminSnapshot.published
                        ? "Despublicar corte"
                        : "Publicar corte"}
                  </button>
                )}

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
              {/* Company summary */}
              <section className="surface-card rounded-[2rem] p-5 md:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="eyebrow mb-1">Muestra</div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      {adminCompanySummary.total} empresa{adminCompanySummary.total !== 1 ? "s" : ""} seleccionadas
                      {hasActiveFilters && <span className="ml-2 text-sm font-normal text-slate-500">con filtros activos</span>}
                    </h2>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                  {/* Sector breakdown */}
                  <div>
                    <p className="mb-2 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">Por sector</p>
                    <div className="flex flex-wrap gap-1.5">
                      {adminCompanySummary.sectors.map((s) => (
                        <span key={s.sector} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs">
                          <span className="font-semibold text-slate-800">{s.sector}</span>
                          <span className="text-slate-500">{s.count}</span>
                          <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[0.65rem] font-bold text-teal-700">{s.pct}%</span>
                        </span>
                      ))}
                      {adminCompanySummary.sectors.length === 0 && (
                        <span className="text-sm text-slate-400">Sin información de sector</span>
                      )}
                    </div>
                  </div>

                  {/* Size breakdown */}
                  <div>
                    <p className="mb-2 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">Por tamaño</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Pequeña", key: "pequeña" as const, color: "text-teal-700", bg: "bg-teal-50" },
                        { label: "Mediana", key: "mediana" as const, color: "text-indigo-700", bg: "bg-indigo-50" },
                        { label: "Grande", key: "grande" as const, color: "text-amber-700", bg: "bg-amber-50" },
                      ].map(({ label, key, color, bg }) => {
                        const count = adminCompanySummary.sizes[key];
                        const pct = adminCompanySummary.total ? Math.round((count / adminCompanySummary.total) * 100) : 0;
                        return (
                          <div key={key} className={`rounded-[1rem] ${bg} px-3 py-2.5 text-center`}>
                            <div className={`text-[0.65rem] font-bold uppercase tracking-wide ${color}`}>{label}</div>
                            <div className={`mt-0.5 font-display text-xl font-bold ${color}`}>{count}</div>
                            <div className="text-[0.65rem] text-slate-500">{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                    {adminCompanySummary.sizes.nd > 0 && (
                      <p className="mt-1.5 text-[0.65rem] text-slate-400">{adminCompanySummary.sizes.nd} sin headcount registrado</p>
                    )}
                  </div>
                </div>
              </section>

              {/* View toggle */}
              <div className="flex gap-1.5 rounded-[1.25rem] bg-white/80 p-1 shadow-sm ring-1 ring-slate-200/60 self-start">
                <button
                  type="button"
                  onClick={() => setStudyView("cargo")}
                  className={`rounded-[0.9rem] px-4 py-2 text-sm font-semibold transition-colors ${studyView === "cargo" ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Por cargo
                </button>
                <button
                  type="button"
                  onClick={() => setStudyView("grado")}
                  className={`rounded-[0.9rem] px-4 py-2 text-sm font-semibold transition-colors ${studyView === "grado" ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Por grados
                </button>
              </div>

              {studyView === "cargo" ? (
                <>
                  <section className="surface-card overflow-hidden rounded-[2rem]">
                    <div className="flex flex-col gap-3 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="eyebrow mb-2">Data cruda</div>
                        <h2 className="font-display text-2xl font-bold text-slate-900">Cargos cargados por empresa</h2>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => { setRangosDraft({ min: Object.fromEntries(Object.entries(nivelMin).map(([k, v]) => [k, String(v || "")])), max: Object.fromEntries(Object.entries(nivelMax).map(([k, v]) => [k, String(v || "")])) }); setRangosModalOpen(true); }}
                          className="btn btn-secondary btn-xs"
                        >
                          <SlidersHorizontal className="h-3 w-3" />
                          Rangos de referencia
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterFueraDeRango((v) => !v)}
                          className={`btn btn-xs whitespace-nowrap ${filterFueraDeRango ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100" : "btn-secondary"}`}
                        >
                          {filterFueraDeRango ? "Ver todos" : "Solo fuera de rango"}
                        </button>
                        <div className="pill">{selectedAdminSnapshot?.status === "PROCESSED" ? "Procesada" : "En revisión"}</div>
                      </div>
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
                          onClick={() => void exportAdminRawExcel(selectedAdminSnapshot?.label || "corte", activeAdminCargo, activeRawPositions)}
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
                            <th className="px-4 py-2 text-right">TEM</th>
                            <th className="px-4 py-2 text-right">TEMz</th>
                            <th className="px-4 py-2 text-right">PCTA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeRawPositions.filter((position) => {
                            if (!filterFueraDeRango) return true;
                            const val = Number(position.conceptValues?.["Total directo mensualizado"] ?? 0);
                            const nivel = NIVELES_ESTUDIO.find((n) => (position.level || "").toLowerCase().includes(n.toLowerCase())) ?? "";
                            const mn = nivel ? (nivelMin[nivel] ?? 0) : 0;
                            const mx = nivel ? (nivelMax[nivel] ?? 0) : 0;
                            return val > 0 && ((mn > 0 && val < mn) || (mx > 0 && val > mx));
                          }).map((position) => {
                            const temz = Number(position.conceptValues?.["Total directo mensualizado"] ?? 0);
                            const normalizedNivel = NIVELES_ESTUDIO.find((n) => (position.level || "").toLowerCase().includes(n.toLowerCase())) ?? "";
                            const rangeMin = normalizedNivel ? (nivelMin[normalizedNivel] ?? 0) : 0;
                            const rangeMax = normalizedNivel ? (nivelMax[normalizedNivel] ?? 0) : 0;
                            const isOutOfRange = temz > 0 && ((rangeMin > 0 && temz < rangeMin) || (rangeMax > 0 && temz > rangeMax));
                            return (
                              <tr key={position.id} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                                <td className="rounded-l-[1.25rem] px-4 py-4 text-slate-700">{position.companyName}</td>
                                <td className="px-4 py-4 font-medium text-slate-900">{position.title}</td>
                                <td className="px-4 py-4 text-slate-600">{position.level || "—"}</td>
                                <td className="px-4 py-4 text-right font-display text-slate-700">{Number(position.conceptValues?.["Sin pasivos — mensual"] ?? 0) > 0 ? <FmtMoney value={Number(position.conceptValues["Sin pasivos — mensual"])} /> : "—"}</td>
                                <td className={`px-4 py-4 text-right font-display font-semibold ${isOutOfRange ? "text-red-600" : "text-teal-700"}`}>
                                  {temz > 0 ? <FmtMoney value={temz} /> : "—"}
                                  {isOutOfRange && <span className="ml-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-red-500">fuera de rango</span>}
                                </td>
                                <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display text-amber-700">{Number(position.conceptValues?.["Con pasivos — anual"] ?? 0) > 0 ? <FmtMoney value={Number(position.conceptValues["Con pasivos — anual"])} /> : "—"}</td>
                              </tr>
                            );
                          })}
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
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="pill">Procesada</div>
                          <button
                            type="button"
                            onClick={() => void exportAdminProcessedExcel(selectedAdminSnapshot?.label || "corte", activeAdminCargo, activeRawPositions)}
                            className="btn btn-secondary"
                          >
                            Exportar Excel
                          </button>
                        </div>
                      </div>

                      <div className="border-b border-slate-200/70 px-4 py-4 md:px-6">
                        <label htmlFor="adminProcessedCargo" className="field-label">Seleccionar cargo</label>
                        <select
                          id="adminProcessedCargo"
                          value={activeAdminCargo}
                          onChange={(event) => setSelectedAdminCargo(event.target.value)}
                          className="field-select mt-1.5"
                        >
                          {availableAdminCargos.map((cargo) => (
                            <option key={`processed-${cargo}`} value={cargo}>{cargo}</option>
                          ))}
                        </select>
                      </div>

                      {(() => {
                        const metricsMap = new Map(activeProcessedMetrics.map((m) => [m.concept, m]));
                        const rows = COMPENSATION_METRIC_KEYS.map((key) => ({
                          key,
                          label: COMPENSATION_METRIC_LABELS[key],
                          metric: metricsMap.get(key),
                        }));
                        const hasData = rows.some((r) => r.metric);
                        if (!hasData) return null;
                        return (
                          <div className="overflow-x-auto px-3 py-4 md:px-4 md:py-5">
                            <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                              <thead>
                                <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                                  <th className="px-4 py-2">Concepto</th>
                                  <th className="px-4 py-2 text-center">N</th>
                                  <th className="px-4 py-2 text-right">Promedio</th>
                                  <th className="px-4 py-2 text-right">Min</th>
                                  <th className="px-4 py-2 text-right">P10</th>
                                  <th className="px-4 py-2 text-right">P25</th>
                                  <th className="px-4 py-2 text-right text-teal-700">P50</th>
                                  <th className="px-4 py-2 text-right">P75</th>
                                  <th className="px-4 py-2 text-right">P90</th>
                                  <th className="px-4 py-2 text-right">Max</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map(({ key, label, metric }) => (
                                  <tr key={key} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                                    <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">{label}</td>
                                    <td className="px-4 py-4 text-center font-semibold text-slate-600">{metric?.count ?? "—"}</td>
                                    <td className="px-4 py-4 text-right font-display text-amber-700">{metric?.average ?? "—"}</td>
                                    <td className="px-4 py-4 text-right font-display text-slate-600">{metric?.min ?? "—"}</td>
                                    <td className="px-4 py-4 text-right font-display text-slate-700">{metric?.p10 ?? "—"}</td>
                                    <td className="px-4 py-4 text-right font-display text-slate-700">{metric?.p25 ?? "—"}</td>
                                    <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">{metric?.p50 ?? "—"}</td>
                                    <td className="px-4 py-4 text-right font-display text-slate-700">{metric?.p75 ?? "—"}</td>
                                    <td className="px-4 py-4 text-right font-display text-slate-700">{metric?.p90 ?? "—"}</td>
                                    <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display text-slate-600">{metric?.max ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </section>
                  ) : null}
                </>
              ) : (
                <section className="surface-card overflow-hidden rounded-[2rem]">
                  <div className="flex flex-col gap-3 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="eyebrow mb-2">Compensación total mensualizada</div>
                      <h2 className="font-display text-2xl font-bold text-slate-900">Percentiles por grado</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {hasActiveFilters && <div className="pill">Filtrado</div>}
                      <button
                        type="button"
                        onClick={() => void exportAdminGradosExcel(selectedAdminSnapshot?.label || "corte", filteredPositions)}
                        className="btn btn-secondary"
                      >
                        Exportar Excel
                      </button>
                    </div>
                  </div>

                  {adminPositionsByGrado.length === 0 ? (
                    <div className="px-6 py-8 text-sm text-slate-500">No hay posiciones con nivel asignado en el corte actual.</div>
                  ) : (
                    <div className="overflow-x-auto px-3 pb-3 pt-4 md:px-4 md:pb-4">
                      <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                        <thead>
                          <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                            <th className="px-4 py-2">Grado</th>
                            <th className="px-4 py-2 text-center">Empresas</th>
                            <th className="px-4 py-2 text-center">Obs.</th>
                            <th className="px-4 py-2 text-right">Min</th>
                            <th className="px-4 py-2 text-right">P25</th>
                            <th className="px-4 py-2 text-right">P50</th>
                            <th className="px-4 py-2 text-right">P75</th>
                            <th className="px-4 py-2 text-right">P90</th>
                            <th className="px-4 py-2 text-right">Max</th>
                            <th className="px-4 py-2 text-right">Promedio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminPositionsByGrado.map((g) => (
                            <tr key={g.nivel} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                              <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">{g.nivel}</td>
                              <td className="px-4 py-4 text-center text-slate-600">{g.empresas}</td>
                              <td className="px-4 py-4 text-center font-semibold text-slate-700">{g.obs}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-600">{g.min}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{g.p25}</td>
                              <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">{g.p50}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{g.p75}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-700">{g.p90}</td>
                              <td className="px-4 py-4 text-right font-display text-slate-600">{g.max}</td>
                              <td className="rounded-r-[1.25rem] px-4 py-4 text-right font-display text-amber-700">{g.promedio}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      {rangosModalOpen && rangosDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => { setRangosModalOpen(false); setRangosDraft(null); }} />
          <div role="dialog" aria-modal="true" className="surface-card relative z-10 w-full max-w-3xl rounded-[1.75rem] p-6">
            <div className="eyebrow mb-1">Rangos de referencia</div>
            <h3 className="font-display text-xl font-bold text-slate-900">CIM — Compensación Integral Mensualizada — por nivel</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Los cargos cuyo valor quede fuera de estos rangos se marcarán en rojo en la tabla de data cruda.</p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-separate border-spacing-x-2 border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-2 py-0.5">Rango</th>
                    {NIVELES_ESTUDIO.map((n) => (
                      <th key={n} className="px-2 py-0.5 text-center">{n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="rounded-l-[1rem] bg-teal-50 px-3 py-2.5 text-xs font-bold text-teal-700 whitespace-nowrap">Mínimo ($)</td>
                    {NIVELES_ESTUDIO.map((n) => (
                      <td key={n} className="bg-teal-50/60 px-1.5 py-1.5">
                        <input
                          type="number"
                          placeholder="0"
                          value={rangosDraft.min[n] ?? ""}
                          onChange={(e) => setRangosDraft((d) => d ? { ...d, min: { ...d.min, [n]: e.target.value } } : d)}
                          className="field w-full py-1 text-right text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="rounded-l-[1rem] bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-700 whitespace-nowrap">Máximo ($)</td>
                    {NIVELES_ESTUDIO.map((n) => (
                      <td key={n} className="bg-amber-50/60 px-1.5 py-1.5">
                        <input
                          type="number"
                          placeholder="0"
                          value={rangosDraft.max[n] ?? ""}
                          onChange={(e) => setRangosDraft((d) => d ? { ...d, max: { ...d.max, [n]: e.target.value } } : d)}
                          className="field w-full py-1 text-right text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => { setRangosModalOpen(false); setRangosDraft(null); }} className="btn btn-secondary">Cancelar</button>
              <button type="button" onClick={() => void handleSaveRangos()} className="btn btn-primary">Guardar rangos</button>
            </div>
          </div>
        </div>
      )}
      </main>
    );
  }

  const marketCargosCount = userRowTotals.filter(({ row }) =>
    marketByTitle.has((row.tituloCargo ?? "").trim().toLowerCase()),
  ).length;

  const eligibleSnapshots = Object.values(snapshots)
    .filter((s) => publishedParticipatedSnapshotIds.includes(s.id))
    .sort((a, b) => b.date.localeCompare(a.date));

  // No eligible snapshots — user hasn't participated in any published corte
  if (eligibleSnapshots.length === 0) {
    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-6">
          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <div className="eyebrow mb-3">Posicionamiento de mercado</div>
            <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">
              Tu compensación frente al mercado.
            </h1>
            <p className="dashboard-lead mt-3 max-w-3xl text-slate-600">
              Compara cada cargo de tu empresa con los percentiles del estudio de remuneración, calculados a partir de los empleadores participantes.
            </p>
          </section>
          <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
            No tienes acceso a resultados en este momento. Para ver los percentiles de un corte necesitas haber actualizado y enviado tus cargos en ese corte. Una vez que el administrador lo publique, aparecerá aquí.
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
            <div>
              <div className="eyebrow mb-3">Posicionamiento de mercado</div>
              <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">
                Tu compensación frente al mercado.
              </h1>
              <p className="dashboard-lead mt-3 max-w-3xl text-slate-600">
                Compara cada cargo de tu empresa con los percentiles del estudio de remuneración, calculados a partir de los empleadores participantes.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="metric-tile">
                  <div className="metric-label">Cargos propios</div>
                  <div className="metric-value mt-3">{userRowTotals.length}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Con datos de mercado</div>
                  <div className="metric-value mt-3">{marketCargosCount}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Cargos en el corte</div>
                  <div className="metric-value mt-3">{percentileData ? percentileData.grupos.length : "—"}</div>
                </div>
              </div>
            </div>

            <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-teal-50 p-3 text-teal-700">
                  <Database size={18} aria-hidden />
                </div>
                <div>
                  <div className="eyebrow mb-1">Control de versiones / Cortes</div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">Actualización</h2>
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="estudioSnapshot" className="field-label">Seleccionar corte</label>
                <select
                  id="estudioSnapshot"
                  value={selectedSnapshotId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedSnapshotId(id);
                    void updateWorkspace({ selectedSnapshotId: id }).catch(() => {});
                  }}
                  className="field-select"
                >
                  {eligibleSnapshots.map((s) => (
                    <option key={s.id} value={s.id}>{getDisplayLabel(s)}</option>
                  ))}
                </select>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="eyebrow mb-4">Segmentar por</div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label htmlFor="filterSector" className="field-label">Sector</label>
                    <select
                      id="filterSector"
                      value={pendingSector}
                      onChange={(e) => setPendingSector(e.target.value)}
                      className="field-select"
                    >
                      <option value="">Todos</option>
                      {availableUserSectors.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="filterSize" className="field-label">Tamaño</label>
                    <select
                      id="filterSize"
                      value={pendingSize}
                      onChange={(e) => setPendingSize(e.target.value)}
                      className="field-select"
                    >
                      <option value="">Todos</option>
                      {availableUserSizes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={percentilesLoading}
                onClick={() => { setAppliedSector(pendingSector); setAppliedSize(pendingSize); }}
                className="btn btn-primary mt-5 w-full disabled:opacity-60"
              >
                {percentilesLoading ? "Procesando…" : "Procesar corte"}
              </button>
              <button
                type="button"
                onClick={() => void exportUserExcel()}
                className="btn btn-secondary mt-3 w-full"
              >
                Exportar a Excel
              </button>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "sinPasivosMensual", label: "TEM" },
              { key: "directoMensualizado", label: "TEMz" },
              { key: "conPasivosMensual", label: "CIM" },
              { key: "conPasivosAnual", label: "PCTA" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveMetric(key)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                activeMetric === key
                  ? "bg-teal-700 text-white shadow-sm"
                  : "surface-card text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {userRowTotals.length === 0 ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm leading-7 text-slate-600">
            No hay posiciones cargadas en este corte. Ve a{" "}
            <button
              type="button"
              onClick={() => router.push("/data")}
              className="font-semibold text-teal-700 underline underline-offset-2"
            >
              Suministro de Data
            </button>{" "}
            y agrega cargos para ver tu posicionamiento.
          </section>
        ) : percentilesLoading ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm text-slate-500">
            Cargando datos de mercado…
          </section>
        ) : percentilesError ? (
          <section className="surface-card rounded-[2rem] p-8 text-sm text-slate-600">
            {percentilesError}
          </section>
        ) : (
          <section className="surface-card overflow-hidden rounded-[2rem]">
            <div className="flex flex-col gap-3 border-b border-slate-200/70 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="eyebrow mb-2">Tabla comparativa</div>
                <h2 className="font-display text-2xl font-bold text-slate-900">
                  {activeMetric === "sinPasivosMensual" && "TEM — Total Efectivo Mensual (USD)"}
                  {activeMetric === "directoMensualizado" && "TEMz — Total Efectivo Mensualizado (USD)"}
                  {activeMetric === "conPasivosMensual" && "CIM — Compensación Integral Mensualizada (USD)"}
                  {activeMetric === "conPasivosAnual" && "PCTA — Paquete de Compensación Total Anual (USD)"}
                </h2>
              </div>
              <div className="pill">
                <Layers3 size={14} aria-hidden />
                ND = muestra insuficiente
              </div>
            </div>

            <div className="overflow-x-auto px-3 pb-3 md:px-4 md:pb-4">
              <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                <thead>
                  <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                    <th className="px-4 py-2">Cargo</th>
                    <th className="px-4 py-2 text-center">N</th>
                    <th className="px-4 py-2 text-right text-teal-700">Mi valor</th>
                    <th className="px-4 py-2 text-right">P10</th>
                    <th className="px-4 py-2 text-right">P25</th>
                    <th className="px-4 py-2 text-right text-teal-700">P50</th>
                    <th className="px-4 py-2 text-right">P75</th>
                    <th className="px-4 py-2 text-right">P90</th>
                    <th className="px-4 py-2 text-right">Prom.</th>
                    <th className="px-4 py-2">Posición</th>
                  </tr>
                </thead>
                <tbody>
                  {userRowTotals.map(({ row, totals }) => {
                    const normTitle = (row.tituloCargo ?? "").trim().toLowerCase();
                    const mkt = marketByTitle.get(normTitle);
                    const mktData = mkt ? mkt[activeMetric] : null;
                    const myValue = totals[METRIC_KEY[activeMetric]];
                    const position = mktData ? resolvePosition(myValue, mktData) : null;
                    const posColor =
                      position === "Sobre P90" || position === "P75–P90"
                        ? "bg-emerald-50 text-emerald-700"
                        : position === "P50–P75"
                          ? "bg-teal-50 text-teal-700"
                          : position === "P25–P50"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700";
                    const nd = (v: number | null) => (v !== null ? formatMoney(v) : "ND");

                    return (
                      <tr key={row.id} className="bg-white shadow-[0_10px_30px_rgba(24,52,45,0.06)]">
                        <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-slate-900">
                          {row.tituloCargo || "Sin título"}
                        </td>
                        <td className="px-4 py-4 text-center font-semibold text-slate-600">
                          {mkt ? mkt.n : "—"}
                        </td>
                        <td className="px-4 py-4 text-right font-display font-bold text-teal-700">
                          <FmtMoney value={myValue} />
                        </td>
                        <td className="px-4 py-4 text-right font-display text-slate-600">
                          {mktData ? nd(mktData.p10) : "—"}
                        </td>
                        <td className="px-4 py-4 text-right font-display text-slate-600">
                          {mktData ? nd(mktData.p25) : "—"}
                        </td>
                        <td className="px-4 py-4 text-right font-display font-semibold text-teal-700">
                          {mktData ? nd(mktData.p50) : "—"}
                        </td>
                        <td className="px-4 py-4 text-right font-display text-slate-600">
                          {mktData ? nd(mktData.p75) : "—"}
                        </td>
                        <td className="px-4 py-4 text-right font-display text-slate-600">
                          {mktData ? nd(mktData.p90) : "—"}
                        </td>
                        <td className="px-4 py-4 text-right font-display text-amber-700">
                          {mktData ? nd(mktData.promedio) : "—"}
                        </td>
                        <td className="rounded-r-[1.25rem] px-4 py-4">
                          {position === null ? (
                            <span className="text-xs text-slate-300">—</span>
                          ) : position === "Sin datos" ? (
                            <span className="text-xs text-slate-400">Sin datos</span>
                          ) : (
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${posColor}`}>
                              {position}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

    </main>
  );
}
