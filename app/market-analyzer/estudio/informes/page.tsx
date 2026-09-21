"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Download, FileText, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";

import { useConfirm } from "@/components/ConfirmDialog";
import { exportStyledExcel } from "@/lib/excel-export";
import { METRICAS_INFORME, posicionEnMercado, type DatosInforme } from "@/lib/estudio-informes";
import { isAdminRole } from "@/lib/roles";
import { PasosEstudio } from "@/components/PasosEstudio";
import { SelectorBuscador } from "@/components/SelectorBuscador";
import { useEstudioEmpresa } from "@/contexts/EstudioEmpresaContext";

type CompanyOption = { id: string; name: string };

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
  const { companyId, setCompanyId } = useEstudioEmpresa();
  const [informes, setInformes] = useState<InformeResumen[]>([]);
  const [abierto, setAbierto] = useState<InformeCompleto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");


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
  }, [esAdmin]);

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
          <h1 className="dashboard-title font-display font-bold text-slate-900">Historial.</h1>
          <p className="dashboard-lead mt-3 text-slate-600">Tu empresa no tiene el Estudio Especializado habilitado.</p>
        </section>
      </main>
    );
  }

  /**
   * Baja el informe congelado tal como está guardado. No recalcula nada: son
   * los mismos números que muestra la tabla, que es justo el sentido de haberlo
   * congelado. El documento completo sobre la plantilla del cliente se baja
   * desde Comparación, con la data del momento.
   */
  async function descargarCongelado(informe: InformeCompleto) {
    const datos = informe.datos;
    if (!datos) { setError("Este informe no tiene datos que exportar."); return; }

    const metrica = METRICAS_INFORME.find((x) => x.value === datos.metrica);
    await exportStyledExcel(
      [{
        name: "Informe",
        columns: [
          { header: "Unidad funcional", key: "departamento", width: 26 },
          { header: "Cargo", key: "cargo", width: 38 },
          { header: datos.modo === "grado" ? "Grado" : "Equivale a", key: "referencia", width: 30 },
          { header: "Nivel", key: "nivel", width: 18 },
          { header: `Tuyo (${metrica?.sigla ?? ""})`, key: "propio", width: 16, align: "right" },
          { header: "P25", key: "p25", width: 14, align: "right" },
          { header: "P50", key: "p50", width: 14, align: "right" },
          { header: "P75", key: "p75", width: 14, align: "right" },
          { header: "Observaciones", key: "n", width: 14, align: "right" },
          { header: "Posición", key: "posicion", width: 20 },
        ],
        rows: datos.filas.map((f) => {
          const hay = Boolean(f.percentiles && f.percentiles.n > 0);
          return {
            departamento: f.departamento || "—",
            cargo: f.tituloCargo,
            referencia: datos.modo === "grado" ? (f.hayGrade ?? "—") : (f.equivalencia || "—"),
            nivel: f.nivel || "—",
            propio: f.propio || null,
            p25: hay ? f.percentiles!.p25 : null,
            p50: hay ? f.percentiles!.p50 : null,
            p75: hay ? f.percentiles!.p75 : null,
            n: hay ? f.percentiles!.n : null,
            posicion: hay ? posicionEnMercado(f.propio, f.percentiles).texto : "Sin comparación",
          };
        }),
      }],
      `${informe.nombre} — ${informe.snapshotLabel || informe.snapshotId}.xlsx`,
    );
  }

  // ── Vista de un informe ───────────────────────────────────────────────
  if (abierto) {
    const datos = abierto.datos;
    return (
      <main className="page-wrap">
        <div className="flex w-full flex-col gap-6">
          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setAbierto(null)} className="btn btn-secondary text-xs">
                <ArrowLeft size={14} /> Volver al historial
              </button>
              <button type="button" onClick={() => void descargarCongelado(abierto)} className="btn btn-primary text-xs">
                <Download size={14} /> Descargar en Excel
              </button>
            </div>
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
        <PasosEstudio />
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Estudio Especializado</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Historial.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Los informes que guardaste desde Comparación. Cada uno queda congelado con los números del momento en
            que se hizo, así que sigue diciendo lo mismo aunque la data cambie después.
          </p>
        </section>

        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          {esAdmin && (
            <div className="mb-5 max-w-sm">
              <label htmlFor="inf-empresa" className="field-label">Empresa</label>
              <SelectorBuscador
                id="inf-empresa"
                value={companyId}
                onChange={setCompanyId}
                opciones={empresas.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Selecciona una empresa"
              />
            </div>
          )}

          <p className="mb-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            El documento completo en Excel —dispersión, equidad interna, competitividad, mapa de calor y
            simulador— se descarga desde <strong>Comparación</strong>, donde ya eliges el estudio y la métrica.
          </p>

          {cargando && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</p>}
          {error && <p className="flex items-center gap-1.5 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {error}</p>}
          {aviso && !error && <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">{aviso}</p>}

          {empresaActiva && informes.length === 0 && !cargando && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center">
              <p className="text-sm text-slate-500">
                El historial está vacío. Los informes se guardan desde <strong>Comparación</strong>, eligiendo qué cargos incluir.
              </p>
              <Link href="/market-analyzer/estudio/comparacion" className="btn btn-primary mt-4 text-xs">
                Ir a Comparación <ArrowRight size={14} />
              </Link>
            </div>
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
