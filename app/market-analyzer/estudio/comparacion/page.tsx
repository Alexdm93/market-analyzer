"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, BarChart3, Loader2 } from "lucide-react";

import { gradeToNivel } from "@/lib/capri";
import { computeRowTotals } from "@/lib/compensation";
import { isAdminRole } from "@/lib/roles";
import { EMPTY_COMPANY_INFO, type CompanyInfo } from "@/lib/workspace";
import { fetchWorkspace } from "@/lib/workspace-client";
import type { ExtendedMarketPosition } from "@/types/salary";

type Metrica = "sinPasivosMensual" | "directoMensualizado" | "conPasivosMensual" | "conPasivosAnual";

const METRICAS: Array<{ value: Metrica; label: string; sigla: string }> = [
  { value: "sinPasivosMensual",   label: "Total Efectivo Mensual",              sigla: "TEM" },
  { value: "directoMensualizado", label: "Total Efectivo Mensualizado",         sigla: "TEMz" },
  { value: "conPasivosMensual",   label: "Compensación Integral Mensualizada",  sigla: "CIM" },
  { value: "conPasivosAnual",     label: "Paquete de Compensación Total Anual", sigla: "PCTA" },
];

type Percentiles = { n: number; min: number | null; max: number | null; p25: number | null; p50: number | null; p75: number | null; promedio: number | null };
type GrupoCargo = { tituloCargo: string; n: number } & Record<Metrica, Percentiles>;
type GrupoGrado = { grade: number; n: number } & Record<Metrica, Percentiles>;

type CargoDTO = {
  id: string;
  departamento: string;
  tituloCargo: string;
  hayGrade: number | null;
  capriFamily: string | null;
  data: Partial<ExtendedMarketPosition>;
  equivalencias: Record<string, { departamento: string; tituloCatalogo: string }>;
};

type CompanyOption = { id: string; name: string };
type SnapshotOption = { id: string; label: string; date: string };

function norm(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** Dónde cae el cargo del cliente respecto al mercado. */
function posicion(propio: number, p: Percentiles): { texto: string; clase: string } {
  if (!propio || p.p25 === null || p.p50 === null || p.p75 === null) {
    return { texto: "—", clase: "bg-slate-100 text-slate-500" };
  }
  if (propio < p.p25) return { texto: "Bajo P25", clase: "bg-red-50 text-red-700" };
  if (propio < p.p50) return { texto: "P25 – P50", clase: "bg-amber-50 text-amber-700" };
  if (propio < p.p75) return { texto: "P50 – P75", clase: "bg-sky-50 text-sky-700" };
  return { texto: "Sobre P75", clase: "bg-teal-50 text-teal-700" };
}

function money(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "—";
  return Math.round(v).toLocaleString("es-VE");
}

export default function ComparacionPage() {
  const { data: session, status } = useSession();
  const esAdmin = isAdminRole(session?.user?.role);

  const [empresas, setEmpresas] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [snapshots, setSnapshots] = useState<SnapshotOption[]>([]);
  const [snapshotId, setSnapshotId] = useState("");
  const [modo, setModo] = useState<"cargo" | "grado">("cargo");
  const [metrica, setMetrica] = useState<Metrica>("sinPasivosMensual");

  const [cargos, setCargos] = useState<CargoDTO[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [porCargo, setPorCargo] = useState<GrupoCargo[]>([]);
  const [porGrado, setPorGrado] = useState<GrupoGrado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const empresaActiva = esAdmin ? companyId : (session?.user?.companyId ?? "");

  useEffect(() => {
    if (!esAdmin) return;
    void fetch("/api/companies", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { companies?: CompanyOption[] } | null) => setEmpresas(d?.companies ?? []))
      .catch(() => setEmpresas([]));
    void fetch("/api/admin/study", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { snapshots?: SnapshotOption[] } | null) => setSnapshots(d?.snapshots ?? []))
      .catch(() => setSnapshots([]));
  }, [esAdmin]);

  const cargar = useCallback(async () => {
    if (!empresaActiva) { setCargos([]); return; }
    setCargando(true);
    setError("");
    try {
      const params = esAdmin && companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const [resCargos, workspace] = await Promise.all([
        fetch(`/api/estudio/cargos${params}`, { cache: "no-store" }),
        fetchWorkspace(esAdmin && companyId ? companyId : undefined).catch(() => null),
      ]);
      const data = (await resCargos.json().catch(() => null)) as { cargos?: CargoDTO[]; message?: string } | null;
      if (!resCargos.ok) { setError(data?.message ?? "No se pudo cargar la lista."); return; }
      setCargos(data?.cargos ?? []);
      if (workspace) {
        setCompanyInfo(workspace.companyInfo);
        if (!esAdmin) {
          setSnapshots(Object.values(workspace.snapshots).map((s) => ({ id: s.id, label: s.label, date: s.date })));
        }
      }
    } finally {
      setCargando(false);
    }
  }, [empresaActiva, esAdmin, companyId]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Los percentiles salen de las rutas que ya alimentan el estudio de cortesía:
  // así la comparación da exactamente lo mismo que ve la empresa en Resultados.
  useEffect(() => {
    if (!snapshotId) { setPorCargo([]); setPorGrado([]); return; }
    let ignorar = false;
    const sid = encodeURIComponent(snapshotId);

    void fetch(`/api/percentiles?snapshotId=${sid}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { grupos?: GrupoCargo[] } | null) => { if (!ignorar) setPorCargo(d?.grupos ?? []); })
      .catch(() => { if (!ignorar) setPorCargo([]); });

    void fetch(`/api/percentiles-by-grade?snapshotId=${sid}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { grupos?: GrupoGrado[] } | null) => { if (!ignorar) setPorGrado(d?.grupos ?? []); })
      .catch(() => { if (!ignorar) setPorGrado([]); });

    return () => { ignorar = true; };
  }, [snapshotId]);

  const tasas = useMemo(() => (companyInfo.tasas ?? []).filter((t) => !t.isSystem), [companyInfo.tasas]);
  const bcv = useMemo(() => {
    const v = Number((companyInfo.tasas ?? []).find((t) => t.id === "bcv-usd")?.valor);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [companyInfo.tasas]);

  const mercadoPorTitulo = useMemo(() => {
    const m = new Map<string, GrupoCargo>();
    porCargo.forEach((g) => m.set(norm(g.tituloCargo), g));
    return m;
  }, [porCargo]);

  const mercadoPorGrado = useMemo(() => {
    const m = new Map<number, GrupoGrado>();
    porGrado.forEach((g) => m.set(g.grade, g));
    return m;
  }, [porGrado]);

  const filas = useMemo(() => {
    return cargos.map((c) => {
      const fila = { id: c.id, tituloCargo: c.tituloCargo, ...c.data } as ExtendedMarketPosition;
      const totales = computeRowTotals(
        fila, tasas, bcv,
        Number(companyInfo.minVacationDays) || 0,
        Number(companyInfo.minUtilityDays) || 0,
      );
      const propio = totales[
        metrica === "sinPasivosMensual" ? "totalSinPasivosMensual"
        : metrica === "directoMensualizado" ? "totalDirectoMensualizado"
        : metrica === "conPasivosMensual" ? "totalConPasivosMensual"
        : "totalConPasivosAnual"
      ];

      const equivalencia = c.equivalencias[snapshotId]?.tituloCatalogo ?? "";
      const mercado = modo === "cargo"
        ? (equivalencia ? mercadoPorTitulo.get(norm(equivalencia)) : undefined)
        : (c.hayGrade ? mercadoPorGrado.get(c.hayGrade) : undefined);

      return {
        cargo: c,
        propio,
        equivalencia,
        percentiles: mercado ? mercado[metrica] : undefined,
        observaciones: mercado?.n ?? 0,
      };
    });
  }, [cargos, tasas, bcv, companyInfo, metrica, modo, snapshotId, mercadoPorTitulo, mercadoPorGrado]);

  const conComparacion = filas.filter((f) => f.percentiles && f.percentiles.n > 0).length;
  const sigla = METRICAS.find((m) => m.value === metrica)?.sigla ?? "";

  if (status === "loading") {
    return <main className="page-wrap"><p className="text-sm text-slate-500">Cargando…</p></main>;
  }

  if (!esAdmin && !session?.user?.estudioEnabled) {
    return (
      <main className="page-wrap">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <h1 className="dashboard-title font-display font-bold text-slate-900">Comparación.</h1>
          <p className="dashboard-lead mt-3 text-slate-600">Tu empresa no tiene el Estudio Especializado habilitado.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Estudio Especializado</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Comparación.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Tus cargos contra el mercado del estudio, por cargo homologado o por grado.
          </p>
        </section>

        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-4 md:grid-cols-4">
            {esAdmin && (
              <div>
                <label htmlFor="cmp-empresa" className="field-label">Empresa</label>
                <select id="cmp-empresa" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="field-select">
                  <option value="">Selecciona una empresa</option>
                  {empresas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="cmp-corte" className="field-label">Estudio</label>
              <select id="cmp-corte" value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} className="field-select">
                <option value="">Selecciona un estudio</option>
                {snapshots.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.date}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cmp-modo" className="field-label">Comparar</label>
              <select id="cmp-modo" value={modo} onChange={(e) => setModo(e.target.value as "cargo" | "grado")} className="field-select">
                <option value="cargo">Por cargo homologado</option>
                <option value="grado">Por grado CAPRI</option>
              </select>
            </div>
            <div>
              <label htmlFor="cmp-metrica" className="field-label">Métrica</label>
              <select id="cmp-metrica" value={metrica} onChange={(e) => setMetrica(e.target.value as Metrica)} className="field-select">
                {METRICAS.map((m) => <option key={m.value} value={m.value}>{m.sigla} — {m.label}</option>)}
              </select>
            </div>
          </div>

          {cargando && <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</p>}
          {error && <p className="mt-4 flex items-center gap-1.5 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {error}</p>}

          {snapshotId && cargos.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { k: "Cargos en tu lista", v: cargos.length },
                { k: "Con comparación", v: conComparacion },
                { k: "Sin comparación", v: cargos.length - conComparacion },
              ].map((i) => (
                <div key={i.k} className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs text-slate-500">{i.k}</dt>
                  <dd className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900">{i.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-slate-100 p-2 text-slate-700"><BarChart3 size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">Posicionamiento · {sigla}</h2>
          </div>

          {!snapshotId && <p className="text-sm text-slate-500">Elige un estudio para ver la comparación.</p>}

          {snapshotId && cargos.length === 0 && !cargando && (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No hay cargos en la lista. Cárgalos desde <strong>Mis cargos</strong>.
            </p>
          )}

          {snapshotId && cargos.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[54rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Cargo</th>
                    <th className="px-4 py-2.5 font-semibold">{modo === "cargo" ? "Equivale a" : "Grado"}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Tuyo</th>
                    <th className="px-4 py-2.5 text-right font-semibold">P25</th>
                    <th className="px-4 py-2.5 text-right font-semibold">P50</th>
                    <th className="px-4 py-2.5 text-right font-semibold">P75</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Obs.</th>
                    <th className="px-4 py-2.5 font-semibold">Posición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.map((f) => {
                    const hayMercado = Boolean(f.percentiles && f.percentiles.n > 0);
                    const pos = hayMercado ? posicion(f.propio, f.percentiles!) : null;
                    return (
                      <tr key={f.cargo.id}>
                        <td className="px-4 py-2.5">
                          <span className="block text-slate-800">{f.cargo.tituloCargo}</span>
                          {f.cargo.departamento && <span className="block text-xs text-slate-500">{f.cargo.departamento}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">
                          {modo === "cargo"
                            ? (f.equivalencia || <span className="text-amber-700">Sin homologar</span>)
                            : (f.cargo.hayGrade
                                ? `${f.cargo.hayGrade} · ${gradeToNivel(f.cargo.hayGrade, f.cargo.capriFamily ?? undefined)}`
                                : <span className="text-amber-700">Sin grado</span>)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-800">{money(f.propio)}</td>
                        {hayMercado ? (
                          <>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p25)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900">{money(f.percentiles!.p50)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p75)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-500">{f.observaciones}</td>
                            <td className="px-4 py-2.5"><span className={`pill ${pos!.clase}`}>{pos!.texto}</span></td>
                          </>
                        ) : (
                          <td colSpan={5} className="px-4 py-2.5 text-xs text-slate-500">Sin comparación disponible</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Los percentiles salen del mismo cálculo que alimenta Resultados, así que coinciden con lo que ve la empresa.
            Un cargo sin homologar, o homologado contra uno sin data suficiente, se muestra igual con sus propios
            montos y sin columnas de mercado.
          </p>
        </section>
      </div>
    </main>
  );
}
