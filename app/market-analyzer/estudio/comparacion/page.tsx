"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, BarChart3, Download, FileText, Loader2 } from "lucide-react";

import { gradeToNivel } from "@/lib/capri";
import { computeRowTotals } from "@/lib/compensation";
import { posicionEnMercado } from "@/lib/estudio-informes";
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

type Percentiles = { n: number; min: number | null; max: number | null; p10?: number | null; p25: number | null; p50: number | null; p75: number | null; p90?: number | null; promedio: number | null };
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
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [nombreInforme, setNombreInforme] = useState("");
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [comisiones, setComisiones] = useState(false);
  const [bajandoExcel, setBajandoExcel] = useState(false);

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

  /**
   * Congela lo que la pantalla está mostrando. Se mandan los números ya
   * calculados a propósito: un informe es la foto de lo que el cliente vio, así
   * que recalcularlos al guardar sería justamente lo contrario de congelar.
   */
  async function generarInforme() {
    const elegidas = filas.filter((f) => seleccionados.includes(f.cargo.id));
    if (elegidas.length === 0) { setError("Elige al menos un cargo para el informe."); return; }
    if (!nombreInforme.trim()) { setError("Ponle un nombre al informe."); return; }

    setGenerando(true);
    setError("");
    setAviso("");
    try {
      const corte = snapshots.find((x) => x.id === snapshotId);
      const res = await fetch("/api/estudio/informes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(esAdmin && companyId ? { companyId } : {}),
          nombre: nombreInforme.trim(),
          snapshotId,
          snapshotLabel: corte ? `${corte.label} — ${corte.date}` : "",
          modo,
          metrica,
          filas: elegidas.map((f) => ({
            cargoId: f.cargo.id,
            departamento: f.cargo.departamento,
            tituloCargo: f.cargo.tituloCargo,
            hayGrade: f.cargo.hayGrade,
            capriFamily: f.cargo.capriFamily,
            nivel: gradeToNivel(f.cargo.hayGrade ?? undefined, f.cargo.capriFamily ?? undefined),
            equivalencia: f.equivalencia,
            propio: f.propio,
            percentiles: f.percentiles ?? null,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) { setError(data?.message ?? "No se pudo guardar el informe."); return; }
      setAviso(data?.message ?? "Informe guardado.");
      setNombreInforme("");
      setSeleccionados([]);
    } finally {
      setGenerando(false);
    }
  }

  /**
   * El documento completo en Excel. Va acá y no en Informes porque el corte y
   * la métrica ya están elegidos en esta pantalla: pedirlos de nuevo en otra
   * obligaba a elegir lo mismo dos veces.
   */
  async function descargarExcel() {
    if (!snapshotId) return;
    setBajandoExcel(true);
    setError("");
    try {
      const resPct = await fetch(`/api/percentiles-by-grade?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" });
      const pct = (await resPct.json().catch(() => null)) as
        | { grupos?: Array<{ grade: number } & Record<string, Percentiles>>; message?: string } | null;
      if (!resPct.ok) { setError(pct?.message ?? "No se pudieron obtener los percentiles por grado."); return; }

      const mercadoPorGrado = (pct?.grupos ?? []).map((g) => {
        const m = g[metrica];
        return { grade: g.grade, p90: m?.p90 ?? null, p75: m?.p75 ?? null, p50: m?.p50 ?? null, p25: m?.p25 ?? null, p10: m?.p10 ?? null };
      });

      const res = await fetch("/api/estudio/informe-especializado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(esAdmin && companyId ? { companyId } : {}),
          snapshotId,
          config: { concepto: metrica, incluirComisiones: comisiones },
          mercadoPorGrado,
        }),
      });

      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(d?.message ?? `No se pudo generar el informe (error ${res.status}).`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Informe especializado.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el informe.");
    } finally {
      setBajandoExcel(false);
    }
  }

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
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
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
            <div className="flex items-end">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={comisiones} onChange={(e) => setComisiones(e.target.checked)} className="mt-1" />
                <span>Incluir comisiones</span>
              </label>
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
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos los cargos"
                        checked={seleccionados.length > 0 && seleccionados.length === filas.length}
                        ref={(el) => { if (el) el.indeterminate = seleccionados.length > 0 && seleccionados.length < filas.length; }}
                        onChange={(e) => setSeleccionados(e.target.checked ? filas.map((f) => f.cargo.id) : [])}
                      />
                    </th>
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
                    const pos = posicionEnMercado(f.propio, f.percentiles ?? null);
                    return (
                      <tr key={f.cargo.id}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Incluir ${f.cargo.tituloCargo} en el informe`}
                            checked={seleccionados.includes(f.cargo.id)}
                            onChange={() => setSeleccionados((prev) => prev.includes(f.cargo.id) ? prev.filter((x) => x !== f.cargo.id) : [...prev, f.cargo.id])}
                          />
                        </td>
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
                            <td className="px-4 py-2.5"><span className={`pill ${pos.clase}`}>{pos.texto}</span></td>
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

          {snapshotId && cargos.length > 0 && (
            <div className="mt-6 rounded-2xl border border-slate-200 p-5">
              <h3 className="font-display text-base font-bold text-slate-900">Generar un informe</h3>
              <p className="mt-1 text-sm text-slate-600">
                <strong>Guardar</strong> deja el informe dentro de la plataforma, congelado con estos números: si
                después cambia la data, seguirá igual. <strong>Descargar</strong> baja el documento completo en Excel
                —dispersión, equidad interna, competitividad, mapa de calor y simulador— con el estudio y la métrica
                de arriba.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1">
                  <label htmlFor="cmp-nombre" className="field-label">Nombre del informe</label>
                  <input
                    id="cmp-nombre"
                    value={nombreInforme}
                    onChange={(e) => setNombreInforme(e.target.value)}
                    className="field"
                    placeholder="Ej. Posicionamiento gerencial 2026"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void generarInforme()}
                  disabled={generando || seleccionados.length === 0}
                  className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generando ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  Guardar con {seleccionados.length} {seleccionados.length === 1 ? "cargo" : "cargos"}
                </button>
                <button
                  type="button"
                  onClick={() => void descargarExcel()}
                  disabled={bajandoExcel}
                  className="btn btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bajandoExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Descargar el informe completo
                </button>
              </div>
              {aviso && (
                <p className="mt-3 rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
                  {aviso} Lo encuentras en <strong>Informes</strong>.
                </p>
              )}
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
