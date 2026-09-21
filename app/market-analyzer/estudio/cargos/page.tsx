"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, Check, Download, Layers, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { CapriWizardModal, ROLES as CAPRI_ROLES } from "@/components/CapriWizardModal";
import { CompensacionEditor, ResumenCompensacion } from "@/components/CompensacionEditor";
import { useConfirm } from "@/components/ConfirmDialog";
import { gradeToNivel } from "@/lib/capri";
import { computeRowTotals } from "@/lib/compensation";
import { EMPTY_COMPANY_INFO, type CompanyInfo } from "@/lib/workspace";
import { fetchWorkspace } from "@/lib/workspace-client";
import { isAdminRole } from "@/lib/roles";
import type { ExtendedMarketPosition } from "@/types/salary";

type CargoDTO = {
  id: string;
  ocupanteId: string;
  departamento: string;
  tituloCargo: string;
  descripcion: string;
  reportaA: string;
  hayGrade: number | null;
  capriFamily: string | null;
  data: Partial<ExtendedMarketPosition>;
  origen: string;
  origenSnapshotId: string | null;
  equivalencias: Record<string, { departamento: string; tituloCatalogo: string }>;
  updatedAt: string;
};

type CompanyOption = { id: string; name: string };
type AdminSnapshot = { id: string; label: string; date: string };
type CatalogoCargo = { departamento: string; tituloCargo: string };

type Borrador = {
  id: string | null;
  ocupanteId: string;
  departamento: string;
  tituloCargo: string;
  descripcion: string;
  reportaA: string;
  hayGrade: number | null;
  capriFamily: string | null;
  data: Partial<ExtendedMarketPosition>;
};

const BORRADOR_VACIO: Borrador = {
  id: null, ocupanteId: "", departamento: "", tituloCargo: "", descripcion: "", reportaA: "",
  hayGrade: null, capriFamily: null,
  data: {
    sueldoBasico: 0, sueldoBasicoFreq: "monthly", sueldoBasicoCuentaMoneda: "USD",
    sueldoBasicoMonedaPago: "USD", sueldoBasicoImpacto: true, sueldoBasicoTasaId: "",
    bonoAlimentacion: 0, bonoAlimentacionFreq: "monthly", bonoAlimentacionCuentaMoneda: "USD",
    bonoAlimentacionMonedaPago: "USD", bonoAlimentacionImpacto: false, bonoAlimentacionTasaId: "",
    additionalFixedPayments: [], additionalVariablePayments: [],
  },
};

async function leerRespuesta(res: Response): Promise<{ ok: boolean; data: Record<string, unknown> | null; mensaje: string }> {
  const raw = await res.text();
  let data: Record<string, unknown> | null = null;
  try { data = JSON.parse(raw) as Record<string, unknown>; } catch { data = null; }
  if (res.ok) return { ok: true, data, mensaje: String(data?.message ?? "") };
  return { ok: false, data, mensaje: String(data?.message ?? `Error ${res.status}.`) };
}

export default function MisCargosPage() {
  const { data: session, status } = useSession();
  const esAdmin = isAdminRole(session?.user?.role);
  const [confirm, confirmDialog] = useConfirm();

  const [empresas, setEmpresas] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [cargos, setCargos] = useState<CargoDTO[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);

  const [snapshots, setSnapshots] = useState<AdminSnapshot[]>([]);
  const [snapshotId, setSnapshotId] = useState("");
  const [catalogo, setCatalogo] = useState<CatalogoCargo[]>([]);

  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [capriAbierto, setCapriAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  /** El admin trabaja en nombre de una empresa; la empresa, sobre la suya. */
  const empresaActiva = esAdmin ? companyId : (session?.user?.companyId ?? "");
  const puedeOperar = Boolean(empresaActiva);

  const qs = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    if (esAdmin && companyId) p.set("companyId", companyId);
    return p.toString();
  }, [esAdmin, companyId]);

  const cuerpoBase = useCallback(() => (esAdmin && companyId ? { companyId } : {}), [esAdmin, companyId]);

  useEffect(() => {
    if (!esAdmin) return;
    void fetch("/api/companies", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { companies?: CompanyOption[] } | null) => setEmpresas(d?.companies ?? []))
      .catch(() => setEmpresas([]));
    void fetch("/api/admin/study", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { snapshots?: AdminSnapshot[] } | null) => setSnapshots(d?.snapshots ?? []))
      .catch(() => setSnapshots([]));
  }, [esAdmin]);

  const cargar = useCallback(async () => {
    if (!puedeOperar) { setCargos([]); return; }
    setCargando(true);
    setError("");
    try {
      const [res, workspace] = await Promise.all([
        fetch(`/api/estudio/cargos?${qs()}`, { cache: "no-store" }),
        fetchWorkspace(esAdmin && companyId ? companyId : undefined).catch(() => null),
      ]);
      const { ok, data, mensaje } = await leerRespuesta(res);
      if (!ok) { setError(mensaje); setCargos([]); return; }
      setCargos((data?.cargos as CargoDTO[]) ?? []);
      if (workspace) setCompanyInfo(workspace.companyInfo);
      // Los cortes en los que la empresa participó, para las equivalencias.
      if (!esAdmin && workspace) {
        setSnapshots(Object.values(workspace.snapshots).map((s) => ({ id: s.id, label: s.label, date: s.date })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
    } finally {
      setCargando(false);
    }
  }, [puedeOperar, qs, esAdmin, companyId]);

  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    if (!snapshotId || !puedeOperar) { setCatalogo([]); return; }
    let ignorar = false;
    void fetch(`/api/estudio/equivalencias?${qs({ snapshotId })}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { catalogo?: CatalogoCargo[] } | null) => { if (!ignorar) setCatalogo(d?.catalogo ?? []); })
      .catch(() => { if (!ignorar) setCatalogo([]); });
    return () => { ignorar = true; };
  }, [snapshotId, puedeOperar, qs]);

  const tasas = useMemo(() => (companyInfo.tasas ?? []).filter((t) => !t.isSystem), [companyInfo.tasas]);
  const bcv = useMemo(() => {
    const v = Number((companyInfo.tasas ?? []).find((t) => t.id === "bcv-usd")?.valor);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [companyInfo.tasas]);

  const temDe = useCallback((data: Partial<ExtendedMarketPosition>) => {
    const fila = { id: "x", tituloCargo: "x", ...data } as ExtendedMarketPosition;
    return computeRowTotals(
      fila, tasas, bcv,
      Number(companyInfo.minVacationDays) || 0,
      Number(companyInfo.minUtilityDays) || 0,
    ).totalSinPasivosMensual;
  }, [tasas, bcv, companyInfo.minVacationDays, companyInfo.minUtilityDays]);

  async function guardar() {
    if (!borrador) return;
    if (!borrador.tituloCargo.trim()) { setError("El cargo necesita un nombre."); return; }

    setGuardando(true);
    setError("");
    try {
      const esNuevo = borrador.id === null;
      const res = await fetch("/api/estudio/cargos", {
        method: esNuevo ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cuerpoBase(),
          ...(esNuevo ? {} : { id: borrador.id }),
          ocupanteId: borrador.ocupanteId,
          departamento: borrador.departamento,
          tituloCargo: borrador.tituloCargo,
          descripcion: borrador.descripcion,
          reportaA: borrador.reportaA,
          hayGrade: borrador.hayGrade,
          capriFamily: borrador.capriFamily,
          data: borrador.data,
        }),
      });
      const { ok, mensaje } = await leerRespuesta(res);
      if (!ok) { setError(mensaje); return; }
      setBorrador(null);
      setAviso(mensaje);
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(cargo: CargoDTO) {
    const otros = cargos.filter((c) => c.id !== cargo.id && c.tituloCargo === cargo.tituloCargo).length;
    const cuantas = Object.keys(cargo.equivalencias).length;
    const esElUltimo = otros === 0;
    const ok = await confirm({
      title: `Eliminar "${cargo.tituloCargo}"${cargo.ocupanteId ? ` (${cargo.ocupanteId})` : ""}`,
      message: (
        <span className="space-y-2">
          <span className="block">Se elimina este ocupante y toda su estructura de compensación.</span>
          {otros > 0 && (
            <span className="block">
              Quedan otros {otros} {otros === 1 ? "ocupante" : "ocupantes"} en el mismo cargo, y su homologación no se toca.
            </span>
          )}
          {esElUltimo && cuantas > 0 && (
            <span className="block">
              Era el último ocupante de este cargo, así que también se pierde{cuantas === 1 ? " su homologación" : `n sus ${cuantas} homologaciones`}.
            </span>
          )}
        </span>
      ),
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/estudio/cargos?${qs({ id: cargo.id })}`, { method: "DELETE" });
    const { ok: fue, mensaje } = await leerRespuesta(res);
    if (!fue) { setError(mensaje); return; }
    setAviso(mensaje);
    await cargar();
  }

  async function importarDeCorte() {
    if (!snapshotId) { setError("Elige primero el corte del que importar."); return; }
    setGuardando(true);
    setError("");
    try {
      const previa = await fetch("/api/estudio/cargos/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpoBase(), snapshotId, soloPrevisualizar: true }),
      });
      const { ok, data, mensaje } = await leerRespuesta(previa);
      if (!ok) { setError(mensaje); return; }

      const aImportar = Number(data?.aImportar ?? 0);
      const yaEstan = Number(data?.yaEnLaLista ?? 0);

      if (aImportar === 0) {
        setError(yaEstan > 0 ? "Todos los cargos de ese corte ya están en tu lista." : "Ese corte no tiene cargos para importar.");
        return;
      }

      const confirmado = await confirm({
        title: "Importar cargos del corte",
        message: (
          <span className="space-y-2">
            <span className="block">Se agregan {aImportar} {aImportar === 1 ? "cargo" : "cargos"} a tu lista, con su compensación.</span>
            {yaEstan > 0 && <span className="block">{yaEstan} ya estaban y se omiten.</span>}
            <span className="block">Quedan como copia editable: cambiarlos aquí no toca la data que enviaste a ese corte.</span>
          </span>
        ),
        confirmLabel: "Importar",
      });
      if (!confirmado) return;

      const res = await fetch("/api/estudio/cargos/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpoBase(), snapshotId }),
      });
      const r = await leerRespuesta(res);
      if (!r.ok) { setError(r.mensaje); return; }
      setAviso(r.mensaje);
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function homologar(cargo: CargoDTO, tituloCatalogo: string) {
    const elegido = catalogo.find((c) => c.tituloCargo === tituloCatalogo);
    const res = await fetch("/api/estudio/equivalencias", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...cuerpoBase(),
        tituloCargo: cargo.tituloCargo,
        snapshotId,
        tituloCatalogo,
        departamento: elegido?.departamento ?? "",
      }),
    });
    const { ok, mensaje } = await leerRespuesta(res);
    if (!ok) { setError(mensaje); return; }
    setAviso(mensaje);
    await cargar();
  }

  const porDepartamento = useMemo(() => {
    const mapa = new Map<string, CargoDTO[]>();
    for (const c of cargos) {
      const dept = c.departamento || "Sin departamento";
      const lista = mapa.get(dept);
      if (lista) lista.push(c); else mapa.set(dept, [c]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [cargos]);

  if (status === "loading") {
    return <main className="page-wrap"><p className="text-sm text-slate-500">Cargando…</p></main>;
  }

  if (!esAdmin && !session?.user?.estudioEnabled) {
    return (
      <main className="page-wrap">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <h1 className="dashboard-title font-display font-bold text-slate-900">Mis cargos.</h1>
          <p className="dashboard-lead mt-3 text-slate-600">
            Tu empresa no tiene el Estudio Especializado habilitado.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Estudio Especializado</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Mis cargos.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Tu lista de cargos, con tus propios nombres. Es independiente de la data que reportas al mercado y se
            mantiene de un estudio al siguiente.
          </p>
        </section>

        {/* ── Controles ─────────────────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            {esAdmin && (
              <div>
                <label htmlFor="mc-empresa" className="field-label">Empresa</label>
                <select
                  id="mc-empresa"
                  value={companyId}
                  onChange={(e) => { setCompanyId(e.target.value); setBorrador(null); }}
                  className="field-select"
                >
                  <option value="">Selecciona una empresa</option>
                  {empresas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="mc-corte" className="field-label">Estudio contra el que homologar</label>
              <select
                id="mc-corte"
                value={snapshotId}
                onChange={(e) => setSnapshotId(e.target.value)}
                className="field-select"
                disabled={!puedeOperar}
              >
                <option value="">Ninguno</option>
                {snapshots.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.date}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                La equivalencia se guarda por estudio: cada corte tiene su propio catálogo.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => { setBorrador({ ...BORRADOR_VACIO }); setError(""); }}
              disabled={!puedeOperar || guardando}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} /> Agregar cargo
            </button>
            <button
              type="button"
              onClick={() => void importarDeCorte()}
              disabled={!puedeOperar || !snapshotId || guardando}
              className="btn btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Importar del corte
            </button>
            {cargando && <span className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</span>}
          </div>

          {error && (
            <p className="mt-4 flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          {aviso && !error && (
            <p className="mt-4 flex items-center gap-1.5 rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
              <Check className="h-4 w-4" /> {aviso}
            </p>
          )}
        </section>

        {/* ── Formulario ────────────────────────────────────────────────── */}
        {borrador && (
          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-slate-900">
                {borrador.id === null ? "Cargo nuevo" : `Editando: ${borrador.tituloCargo || "cargo"}`}
              </h2>
              <button type="button" onClick={() => setBorrador(null)} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label htmlFor="mc-ocupante" className="field-label">Ocupante / ID</label>
                <input
                  id="mc-ocupante"
                  value={borrador.ocupanteId}
                  onChange={(e) => setBorrador({ ...borrador, ocupanteId: e.target.value })}
                  className="field"
                  placeholder="Ej. TEALCA-001 (opcional)"
                />
              </div>
              <div>
                <label htmlFor="mc-dept" className="field-label">Unidad funcional</label>
                <input id="mc-dept" value={borrador.departamento} onChange={(e) => setBorrador({ ...borrador, departamento: e.target.value })} className="field" placeholder="Ej. Finanzas" />
              </div>
              <div>
                <label htmlFor="mc-titulo" className="field-label">Nombre del cargo</label>
                <input id="mc-titulo" value={borrador.tituloCargo} onChange={(e) => setBorrador({ ...borrador, tituloCargo: e.target.value })} className="field" placeholder="Como lo llamas internamente" />
              </div>
              <div>
                <span className="field-label">Grado CAPRI</span>
                <button
                  type="button"
                  onClick={() => setCapriAbierto(true)}
                  className="field flex items-center gap-2 text-left text-sm hover:bg-slate-50"
                >
                  <Layers className="h-4 w-4 text-slate-400" />
                  {borrador.hayGrade
                    ? <span className="font-semibold text-teal-700">{borrador.hayGrade} · {CAPRI_ROLES[borrador.hayGrade]?.rol ?? ""}</span>
                    : <span className="text-slate-400">Clasificar con CAPRI</span>}
                </button>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="mc-reporta" className="field-label">Reporta a</label>
                <input
                  id="mc-reporta"
                  value={borrador.reportaA}
                  onChange={(e) => setBorrador({ ...borrador, reportaA: e.target.value })}
                  className="field"
                  placeholder="Cargo al que reporta"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="mc-desc" className="field-label">Descripción (opcional)</label>
                <textarea id="mc-desc" value={borrador.descripcion} onChange={(e) => setBorrador({ ...borrador, descripcion: e.target.value })} className="field-textarea" rows={2} />
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
              <CompensacionEditor
                valor={borrador.data}
                tasas={tasas}
                onChange={(data) => setBorrador({ ...borrador, data })}
                deshabilitado={guardando}
              />
              <div className="lg:w-56"><ResumenCompensacion total={temDe(borrador.data)} /></div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => void guardar()} disabled={guardando} className="btn btn-primary disabled:opacity-50">
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Guardar cargo
              </button>
              <button type="button" onClick={() => setBorrador(null)} disabled={guardando} className="btn btn-secondary disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </section>
        )}

        {/* ── Lista ─────────────────────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <h2 className="mb-5 font-display text-xl font-bold text-slate-900">
            {cargos.length} {cargos.length === 1 ? "ocupante" : "ocupantes"} en la lista
          </h2>

          {!puedeOperar && <p className="text-sm text-slate-500">Elige una empresa para ver su lista.</p>}

          {puedeOperar && cargos.length === 0 && !cargando && (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Todavía no hay cargos. Agrégalos uno por uno, o impórtalos de un corte en el que la empresa haya participado.
            </p>
          )}

          <div className="space-y-6">
            {porDepartamento.map(([dept, lista]) => (
              <div key={dept}>
                <p className="eyebrow mb-2">{dept}</p>
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Cargo</th>
                        <th className="px-4 py-2.5 font-semibold">Ocupante</th>
                        <th className="px-4 py-2.5 font-semibold">Grado</th>
                        <th className="px-4 py-2.5 font-semibold">Nivel</th>
                        <th className="px-4 py-2.5 text-right font-semibold">TEM</th>
                        <th className="px-4 py-2.5 font-semibold">Origen</th>
                        {snapshotId && <th className="px-4 py-2.5 font-semibold">Equivale a</th>}
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lista.map((c) => (
                        <tr key={c.id}>
                          <td className="px-4 py-2.5 text-slate-800">{c.tituloCargo}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{c.ocupanteId || "—"}</td>
                          <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-slate-600">{c.hayGrade ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{gradeToNivel(c.hayGrade ?? undefined, c.capriFamily ?? undefined) || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                            {Math.round(temDe(c.data)).toLocaleString("es-VE")}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`pill ${c.origen === "importado" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
                              {c.origen === "importado" ? "Importado" : "Manual"}
                            </span>
                          </td>
                          {snapshotId && (
                            <td className="px-4 py-2.5">
                              <select
                                aria-label={`Equivalencia de ${c.tituloCargo}`}
                                value={c.equivalencias[snapshotId]?.tituloCatalogo ?? ""}
                                onChange={(e) => void homologar(c, e.target.value)}
                                className="field-select text-xs"
                              >
                                <option value="">Sin equivalencia</option>
                                {catalogo.map((cc) => (
                                  <option key={`${cc.departamento}-${cc.tituloCargo}`} value={cc.tituloCargo}>
                                    {cc.tituloCargo}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                aria-label={`Editar ${c.tituloCargo}`}
                                onClick={() => { setBorrador({ id: c.id, ocupanteId: c.ocupanteId, departamento: c.departamento, tituloCargo: c.tituloCargo, descripcion: c.descripcion, reportaA: c.reportaA, hayGrade: c.hayGrade, capriFamily: c.capriFamily, data: c.data }); setError(""); }}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Eliminar ${c.tituloCargo}`}
                                onClick={() => void borrar(c)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {capriAbierto && borrador && (
        <CapriWizardModal
          mode="simplified"
          companyInfo={companyInfo}
          cargoNombre={borrador.tituloCargo || "Cargo"}
          existingGrade={borrador.hayGrade ?? undefined}
          onSave={(grade, familia) => setBorrador({ ...borrador, hayGrade: grade, capriFamily: familia })}
          onClose={() => setCapriAbierto(false)}
        />
      )}

      {confirmDialog}
    </main>
  );
}
