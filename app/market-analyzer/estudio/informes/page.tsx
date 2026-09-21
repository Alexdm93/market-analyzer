"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, ArrowLeft, Download, FileText, Loader2, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ConfirmDialog";
import { CONCEPTOS, type Concepto } from "@/lib/analisis-especializado";
import { METRICAS_INFORME, posicionEnMercado, type DatosInforme } from "@/lib/estudio-informes";
import { isAdminRole } from "@/lib/roles";

type CompanyOption = { id: string; name: string };
type SnapshotOption = { id: string; label: string; date: string };
type MetricaGrado = { p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null };

type InformeResumen = {
  id: string; nombre: string; snapshotId: string; snapshotLabel: string;
  generadoPor: string; createdAt: string; cargos: number;
  modo: "cargo" | "grado"; metrica: string;
};

type InformeCompleto = {
  id: string; nombre: string; snapshotId: string; snapshotLabel: string;
  generadoPor: string; createdAt: string; datos: DatosInforme | null;
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function money(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "—";
  return Math.round(v).toLocaleString("es-VE");
}

export default function InformesPage() {
  const { data: session, status } = useSession();
  const esAdmin = isAdminRole(session?.user?.role);
  const [confirm, confirmDialog] = useConfirm();

  const [empresas, setEmpresas] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [informes, setInformes] = useState<InformeResumen[]>([]);
  const [abierto, setAbierto] = useState<InformeCompleto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [snapshots, setSnapshots] = useState<SnapshotOption[]>([]);
  const [snapshotId, setSnapshotId] = useState("");
  const [concepto, setConcepto] = useState<Concepto>("conPasivosAnual");
  const [comisiones, setComisiones] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  const empresaActiva = esAdmin ? companyId : (session?.user?.companyId ?? "");

  const qs = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    if (esAdmin && companyId) p.set("companyId", companyId);
    return p.toString();
  }, [esAdmin, companyId]);

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

  /**
   * El informe completo se arma rellenando la plantilla del cliente. Los
   * percentiles por grado salen de /api/percentiles-by-grade, la ruta canónica,
   * y se le pasan ya calculados al servidor.
   */
  async function descargarExcel() {
    if (!snapshotId) { setError("Elige el estudio."); return; }
    setGenerandoExcel(true);
    setError("");
    try {
      const resPct = await fetch(`/api/percentiles-by-grade?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" });
      const pct = (await resPct.json().catch(() => null)) as
        | { grupos?: Array<{ grade: number } & Record<string, MetricaGrado>>; message?: string }
        | null;
      if (!resPct.ok) { setError(pct?.message ?? "No se pudieron obtener los percentiles por grado."); return; }

      const mercadoPorGrado = (pct?.grupos ?? []).map((g) => {
        const m = g[concepto];
        return { grade: g.grade, p90: m?.p90 ?? null, p75: m?.p75 ?? null, p50: m?.p50 ?? null, p25: m?.p25 ?? null, p10: m?.p10 ?? null };
      });

      const res = await fetch("/api/estudio/informe-especializado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(esAdmin && companyId ? { companyId } : {}),
          snapshotId,
          config: { concepto, incluirComisiones: comisiones },
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
      setGenerandoExcel(false);
    }
  }

  const cargar = useCallback(async () => {
    if (!empresaActiva) { setInformes([]); return; }
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`/api/estudio/informes?${qs()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { informes?: InformeResumen[]; message?: string } | null;
      if (!res.ok) { setError(data?.message ?? "No se pudieron cargar los informes."); return; }
      setInformes(data?.informes ?? []);
    } finally {
      setCargando(false);
    }
  }, [empresaActiva, qs]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function abrir(id: string) {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`/api/estudio/informes?${qs({ id })}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { informe?: InformeCompleto; message?: string } | null;
      if (!res.ok || !data?.informe) { setError(data?.message ?? "No se pudo abrir el informe."); return; }
      setAbierto(data.informe);
    } finally {
      setCargando(false);
    }
  }

  async function borrar(informe: InformeResumen) {
    const ok = await confirm({
      title: `Eliminar "${informe.nombre}"`,
      message: "El informe se elimina definitivamente. Los cargos y sus datos no se tocan: solo se borra este documento.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/estudio/informes?${qs({ id: informe.id })}`, { method: "DELETE" });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) { setError(data?.message ?? "No se pudo eliminar."); return; }
    setAviso(data?.message ?? "Informe eliminado.");
    if (abierto?.id === informe.id) setAbierto(null);
    await cargar();
  }

  const sigla = useMemo(() => {
    const m = METRICAS_INFORME.find((x) => x.value === abierto?.datos?.metrica);
    return m?.sigla ?? "";
  }, [abierto]);

  if (status === "loading") {
    return <main className="page-wrap"><p className="text-sm text-slate-500">Cargando…</p></main>;
  }

  if (!esAdmin && !session?.user?.estudioEnabled) {
    return (
      <main className="page-wrap">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <h1 className="dashboard-title font-display font-bold text-slate-900">Informes.</h1>
          <p className="dashboard-lead mt-3 text-slate-600">Tu empresa no tiene el Estudio Especializado habilitado.</p>
        </section>
      </main>
    );
  }

  // ── Vista de un informe ───────────────────────────────────────────────
  if (abierto) {
    const datos = abierto.datos;
    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-6">
          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <button type="button" onClick={() => setAbierto(null)} className="btn btn-secondary mb-4 text-xs">
              <ArrowLeft size={14} /> Volver a los informes
            </button>
            <div className="eyebrow mb-3">Informe congelado</div>
            <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">{abierto.nombre}</h1>
            <p className="dashboard-lead mt-3 text-slate-600">
              {abierto.snapshotLabel || abierto.snapshotId} · generado el {fecha(abierto.createdAt)}
              {abierto.generadoPor ? ` por ${abierto.generadoPor}` : ""}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Los números son los del momento en que se generó. Si la data cambió después, este informe sigue igual:
              para verla al día hay que generar uno nuevo.
            </p>
          </section>

          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <h2 className="mb-5 font-display text-xl font-bold text-slate-900">
              {datos?.filas.length ?? 0} cargos · {sigla} · {datos?.modo === "grado" ? "por grado" : "por cargo homologado"}
            </h2>

            {!datos && <p className="text-sm text-red-700">No se pudieron leer los datos de este informe.</p>}

            {datos && (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[52rem] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Cargo</th>
                      <th className="px-4 py-2.5 font-semibold">{datos.modo === "grado" ? "Grado" : "Equivale a"}</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Tuyo</th>
                      <th className="px-4 py-2.5 text-right font-semibold">P25</th>
                      <th className="px-4 py-2.5 text-right font-semibold">P50</th>
                      <th className="px-4 py-2.5 text-right font-semibold">P75</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Obs.</th>
                      <th className="px-4 py-2.5 font-semibold">Posición</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {datos.filas.map((f, i) => {
                      const hay = Boolean(f.percentiles && f.percentiles.n > 0);
                      const pos = posicionEnMercado(f.propio, f.percentiles);
                      return (
                        <tr key={`${f.cargoId}-${i}`}>
                          <td className="px-4 py-2.5">
                            <span className="block text-slate-800">{f.tituloCargo}</span>
                            {f.departamento && <span className="block text-xs text-slate-500">{f.departamento}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">
                            {datos.modo === "grado"
                              ? (f.hayGrade ? `${f.hayGrade} · ${f.nivel}` : "—")
                              : (f.equivalencia || "—")}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-800">{money(f.propio)}</td>
                          {hay ? (
                            <>
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p25)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900">{money(f.percentiles!.p50)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p75)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-500">{f.percentiles!.n}</td>
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
          </section>
        </div>
        {confirmDialog}
      </main>
    );
  }

  // ── Lista de informes ─────────────────────────────────────────────────
  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Estudio Especializado</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Informes.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Los informes del Estudio Especializado. Los que generas por tu cuenta quedan congelados con los números
            del momento en que se hicieron.
          </p>
        </section>

        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          {esAdmin && (
            <div className="mb-5 max-w-sm">
              <label htmlFor="inf-empresa" className="field-label">Empresa</label>
              <select id="inf-empresa" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="field-select">
                <option value="">Selecciona una empresa</option>
                {empresas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {empresaActiva && (
            <div className="mb-6 rounded-2xl border border-slate-200 p-5">
              <h2 className="font-display text-base font-bold text-slate-900">Informe del Estudio Especializado</h2>
              <p className="mt-1.5 text-sm text-slate-600">
                El documento completo: dispersión, equidad interna, competitividad, mapa de calor, simulador de ajuste
                y los anexos de data. Se arma sobre la plantilla del estudio, con los cargos de esta empresa.
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                El <strong>informe de cortesía</strong> —el que recibe toda empresa que participó en un corte— no se
                descarga aquí sino desde <strong>Resultados</strong>.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <label htmlFor="inf-corte" className="field-label">Estudio</label>
                  <select id="inf-corte" value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} className="field-select">
                    <option value="">Selecciona un estudio</option>
                    {snapshots.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.date}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="inf-concepto" className="field-label">Concepto</label>
                  <select id="inf-concepto" value={concepto} onChange={(e) => setConcepto(e.target.value as Concepto)} className="field-select">
                    {CONCEPTOS.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={comisiones} onChange={(e) => setComisiones(e.target.checked)} className="mt-1" />
                    <span>Incluir comisiones</span>
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void descargarExcel()}
                disabled={!snapshotId || generandoExcel}
                className="btn btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generandoExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Generar y descargar
              </button>
            </div>
          )}

          {cargando && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</p>}
          {error && <p className="flex items-center gap-1.5 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {error}</p>}
          {aviso && !error && <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">{aviso}</p>}

          {empresaActiva && informes.length === 0 && !cargando && (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Todavía no hay informes. Se generan desde <strong>Comparación</strong>, eligiendo qué cargos incluir.
            </p>
          )}

          {informes.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Informe</th>
                    <th className="px-4 py-2.5 font-semibold">Estudio</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Cargos</th>
                    <th className="px-4 py-2.5 font-semibold">Generado</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {informes.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-2.5">
                        <button type="button" onClick={() => void abrir(i.id)} className="text-left font-semibold text-teal-700 hover:underline">
                          {i.nombre}
                        </button>
                        <span className="block text-xs text-slate-500">
                          {METRICAS_INFORME.find((m) => m.value === i.metrica)?.sigla ?? ""} · {i.modo === "grado" ? "por grado" : "por cargo"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{i.snapshotLabel || i.snapshotId}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">{i.cargos}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        {fecha(i.createdAt)}
                        {i.generadoPor && <span className="block text-slate-400">{i.generadoPor}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => void abrir(i.id)} aria-label={`Ver ${i.nombre}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                            <FileText size={14} />
                          </button>
                          <button type="button" onClick={() => void borrar(i)} aria-label={`Eliminar ${i.nombre}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {confirmDialog}
    </main>
  );
}
