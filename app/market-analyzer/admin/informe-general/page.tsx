"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, Download, FileText, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import type {
  CorteDisponible,
  EmpresaInformeGeneral,
  InformeBeneficiosFicha,
} from "@/app/api/admin/informe-general/route";
import { useConfirm } from "@/components/ConfirmDialog";

type ModalCortes = { empresa: EmpresaInformeGeneral; elegidos: Set<string> };

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

function peso(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function InformeGeneralAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [confirmar, dialogo] = useConfirm();

  const [empresas, setEmpresas] = useState<EmpresaInformeGeneral[]>([]);
  const [cortes, setCortes] = useState<CorteDisponible[]>([]);
  const [informes, setInformes] = useState<InformeBeneficiosFicha[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalCortes | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [tituloNuevo, setTituloNuevo] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") router.replace("/");
  }, [status, session, router]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/informe-general", { cache: "no-store" });
      if (!res.ok) { setError("No se pudo cargar la configuración."); return; }
      const d = (await res.json()) as {
        empresas: EmpresaInformeGeneral[]; cortes: CorteDisponible[]; informes: InformeBeneficiosFicha[];
      };
      setEmpresas(d.empresas);
      setCortes(d.cortes);
      setInformes(d.informes);
      setError("");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardarEmpresa(companyId: string, cambios: Record<string, unknown>) {
    setGuardando(companyId);
    try {
      const res = await fetch("/api/admin/informe-general", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...cambios }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(d?.message ?? "No se pudo guardar.");
        return;
      }
      await cargar();
    } finally {
      setGuardando("");
    }
  }

  async function subirInforme(file: File) {
    if (file.type !== "application/pdf") { setError("El informe de beneficios tiene que ser un PDF."); return; }
    setSubiendo(true);
    setError("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(String(lector.result));
        lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
        lector.readAsDataURL(file);
      });
      const res = await fetch("/api/admin/informes-beneficios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: tituloNuevo.trim() || file.name.replace(/\.pdf$/i, ""),
          nombreArchivo: file.name,
          archivo: base64,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(d?.message ?? "No se pudo subir el informe.");
        return;
      }
      setTituloNuevo("");
      if (archivoRef.current) archivoRef.current.value = "";
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el informe.");
    } finally {
      setSubiendo(false);
    }
  }

  async function renombrarInforme(informe: InformeBeneficiosFicha) {
    const titulo = window.prompt("Nombre del informe", informe.titulo)?.trim();
    if (!titulo || titulo === informe.titulo) return;
    await fetch("/api/admin/informes-beneficios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: informe.id, titulo }),
    });
    await cargar();
  }

  async function borrarInforme(informe: InformeBeneficiosFicha) {
    const usan = empresas.filter((e) => e.beneficiosInformeId === informe.id).length;
    const ok = await confirmar({
      title: `Eliminar «${informe.titulo}»`,
      message: usan > 0
        ? `${usan} ${usan === 1 ? "empresa lo tiene" : "empresas lo tienen"} autorizado y ${usan === 1 ? "quedará" : "quedarán"} sin informe de beneficios.`
        : "No lo tiene autorizado ninguna empresa.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    await fetch(`/api/admin/informes-beneficios?id=${encodeURIComponent(informe.id)}`, { method: "DELETE" });
    await cargar();
  }

  const visibles = empresas.filter((e) =>
    !busqueda.trim() || e.name.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );
  const habilitadas = empresas.filter((e) => e.generalEnabled).length;
  const conBeneficios = empresas.filter((e) => e.beneficiosInformeId).length;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-5">

        <section className="surface-panel overflow-hidden rounded-[1.75rem] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow mb-1.5">Admin · Informe general</div>
              <h1 className="font-display text-[1.2rem] font-bold tracking-tight text-slate-900 md:text-[1.35rem]">
                Informe General de Tendencias Salariales
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Qué empresas pueden descargarlo, de qué cortes, y con cuál informe de beneficios no salariales.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a href="/market-analyzer/informe-general" className="btn btn-secondary flex items-center gap-1.5">
                <Download size={13} /> Generar uno
              </a>
              <button onClick={() => void cargar()} disabled={cargando} className="btn btn-secondary flex items-center gap-1.5">
                <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />
                Actualizar
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Total empresas</div>
              <div className="metric-value mt-1">{empresas.length}</div>
            </div>
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Con el informe</div>
              <div className="metric-value mt-1 text-teal-700">{habilitadas}</div>
            </div>
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Con beneficios</div>
              <div className="metric-value mt-1 text-teal-700">{conBeneficios}</div>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        </section>

        {/* ── Catálogo de PDF ─────────────────────────────────────── */}
        <section className="surface-card rounded-[2rem] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-100 p-3 text-slate-700"><FileText size={18} aria-hidden /></div>
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">Informes de beneficios no salariales</h2>
              <p className="text-sm text-slate-500">
                Los PDF que arma AC Consulting. No dependen del corte: a cada empresa se le autoriza uno.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <label htmlFor="ib-titulo" className="field-label">Nombre del informe</label>
              <input
                id="ib-titulo"
                value={tituloNuevo}
                onChange={(e) => setTituloNuevo(e.target.value)}
                placeholder="Beneficios — Mercado general, septiembre 2026"
                className="field"
              />
            </div>
            <input
              ref={archivoRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirInforme(f); }}
            />
            <button
              type="button"
              onClick={() => archivoRef.current?.click()}
              disabled={subiendo}
              className="btn btn-primary flex items-center gap-1.5"
            >
              {subiendo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {subiendo ? "Subiendo…" : "Subir PDF"}
            </button>
          </div>

          {informes.length === 0 ? (
            <p className="mt-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-6 text-sm text-slate-500">
              Todavía no hay ningún informe de beneficios cargado.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {informes.map((i) => (
                <article key={i.id} className="metric-tile">
                  <div className="font-display text-base font-bold text-slate-900">{i.titulo}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {peso(i.bytes)} · subido el {fecha(i.createdAt)}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {empresas.filter((e) => e.beneficiosInformeId === i.id).length} empresas autorizadas
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`/api/estudio/informe-beneficios?id=${encodeURIComponent(i.id)}`}
                      className="btn btn-secondary btn-xs flex items-center gap-1"
                    >
                      <Download size={12} /> Ver
                    </a>
                    <button onClick={() => void renombrarInforme(i)} className="btn btn-secondary btn-xs flex items-center gap-1">
                      <Pencil size={12} /> Renombrar
                    </button>
                    <button onClick={() => void borrarInforme(i)} className="btn btn-secondary btn-xs flex items-center gap-1 text-red-700">
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ── Empresas ────────────────────────────────────────────── */}
        <section className="surface-card overflow-hidden rounded-[2rem]">
          <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 p-3 text-slate-700"><Building2 size={18} aria-hidden /></div>
              <h2 className="font-display text-xl font-bold text-slate-900">Empresas</h2>
            </div>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar empresa…"
              className="field max-w-xs py-2 text-sm"
            />
          </div>

          {cargando && empresas.length === 0 ? (
            <div className="flex flex-col gap-2 p-6 pt-0">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-[1rem] bg-slate-100" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[0.6rem] font-extrabold uppercase tracking-[0.13em] text-slate-400">
                    <th className="px-5 py-3">Empresa</th>
                    <th className="px-5 py-3">Cortes habilitados</th>
                    <th className="px-5 py-3">Informe de beneficios</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e, i) => (
                    <tr key={e.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{e.name}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{e.economicSector}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => setModal({ empresa: e, elegidos: new Set(e.generalSnapshotIds) })}
                          className="btn btn-secondary btn-xs flex items-center gap-1.5"
                          disabled={guardando === e.id}
                        >
                          <CalendarDays size={12} />
                          {e.generalEnabled && e.generalSnapshotIds.length > 0
                            ? `${e.generalSnapshotIds.length} ${e.generalSnapshotIds.length === 1 ? "corte" : "cortes"}`
                            : "Sin habilitar"}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          value={e.beneficiosInformeId ?? ""}
                          onChange={(ev) => void guardarEmpresa(e.id, { beneficiosInformeId: ev.target.value || null })}
                          disabled={guardando === e.id || informes.length === 0}
                          aria-label={`Informe de beneficios de ${e.name}`}
                          className="field-select max-w-xs py-1.5 text-sm"
                        >
                          <option value="">Ninguno</option>
                          {informes.map((i) => <option key={i.id} value={i.id}>{i.titulo}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {visibles.length === 0 && (
                    <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-500">Ninguna empresa coincide.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="surface-card relative w-full max-w-lg rounded-[1.75rem] p-6 max-h-[calc(100vh-3rem)] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-display text-xl font-bold text-slate-900">{modal.empresa.name}</div>
                <p className="mt-1 text-sm text-slate-500">
                  De qué cortes puede descargar el informe general. Sin ningún corte marcado, no lo tiene habilitado.
                </p>
              </div>
              <button onClick={() => setModal(null)} aria-label="Cerrar" className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-1.5">
              {cortes.map((c) => (
                <label key={c.snapshotId} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={modal.elegidos.has(c.snapshotId)}
                    onChange={() => setModal((p) => {
                      if (!p) return p;
                      const next = new Set(p.elegidos);
                      if (next.has(c.snapshotId)) next.delete(c.snapshotId); else next.add(c.snapshotId);
                      return { ...p, elegidos: next };
                    })}
                  />
                  <span className="font-medium">{c.label}</span>
                  <span className="text-xs text-slate-400">{fecha(c.date)}</span>
                </label>
              ))}
              {cortes.length === 0 && <p className="text-sm text-slate-500">No hay cortes todavía.</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="btn btn-secondary">Cancelar</button>
              <button
                onClick={() => {
                  const { empresa, elegidos } = modal;
                  setModal(null);
                  void guardarEmpresa(empresa.id, { enabled: elegidos.size > 0, snapshotIds: [...elegidos] });
                }}
                className="btn btn-primary flex items-center gap-1.5"
              >
                <Plus size={14} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogo}
    </main>
  );
}
