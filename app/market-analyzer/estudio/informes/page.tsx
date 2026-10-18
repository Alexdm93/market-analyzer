"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Download, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { METRICAS_INFORME, posicionEnMercado, type DatosInforme } from "@/lib/estudio-informes";
import { isAdminRole } from "@/lib/roles";
import { useNavigationTrigger } from "@/components/NavigationProgress";
import { PasosEstudio } from "@/components/PasosEstudio";
import { SelectorBuscador } from "@/components/SelectorBuscador";
import { useEstudio } from "@/contexts/EstudioContext";

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

  const router = useRouter();
  const triggerNavigation = useNavigationTrigger();
  const [empresas, setEmpresas] = useState<CompanyOption[]>([]);
  const { companyId, setCompanyId } = useEstudio();
  const [informes, setInformes] = useState<InformeResumen[]>([]);
  const [abierto, setAbierto] = useState<InformeCompleto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso] = useState("");
  const [bajando, setBajando] = useState(false);


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
          <p className="dashboard-lead mt-3 text-slate-600">Tu empresa no tiene el Estudio de Competitividad habilitado.</p>
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
  /**
   * Vuelve a emitir el informe completo con los criterios guardados.
   *
   * No consume cupo: es la misma configuración que ya se contó cuando se
   * generó, y el servidor la reconoce por su huella.
   */
  async function descargarInformeCompleto(informe: InformeCompleto) {
    const criterios = informe.datos?.criterios;
    if (!criterios?.snapshotId) {
      setError("Este informe es anterior a que se guardaran los criterios, así que no se puede volver a emitir. "
        + "Genera uno nuevo desde Comparación.");
      return;
    }

    setBajando(true);
    setError("");
    try {
      const res = await fetch("/api/estudio/informe-competitividad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(esAdmin && companyId ? { companyId } : {}),
          snapshotId: criterios.snapshotId,
          modo: informe.datos?.modo,
          config: {
            concepto: informe.datos?.metrica,
            incluirComisiones: criterios.comisiones,
          },
          grados: criterios.grados.length > 0 ? criterios.grados : undefined,
          tcr: criterios.tcr ? { tipo: criterios.tcr } : null,
          grupoComparacion: criterios.grupoComparacion,
          filtrosGrupo: criterios.filtrosGrupo,
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
      a.download = `${informe.nombre}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el informe.");
    } finally {
      setBajando(false);
    }
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
              <button
                type="button"
                onClick={() => void descargarInformeCompleto(abierto)}
                disabled={bajando || !abierto.datos?.criterios?.snapshotId}
                title={abierto.datos?.criterios?.snapshotId
                  ? undefined
                  : "Este informe es anterior a que se guardaran los criterios"}
                className="btn btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bajando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Descargar el Informe
              </button>
            </div>
            <div className="eyebrow mb-3">Informe congelado</div>
            <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">{abierto.nombre}</h1>
            <p className="dashboard-lead mt-3 text-slate-600">
              {abierto.snapshotLabel || abierto.snapshotId} · generado el {fecha(abierto.createdAt)}
              {abierto.generadoPor ? ` por ${abierto.generadoPor}` : ""}
            </p>
            {error && (
              <p className="mt-4 flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            {!abierto.datos?.criterios?.snapshotId && (
              <p className="mt-4 flex items-start gap-1.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Este informe se generó antes del 14 de octubre de 2026, cuando la plataforma todavía no guardaba
                los criterios de comparación. Sin ellos no se puede reconstruir el documento completo sin inventar
                la configuración, así que hay que generar uno nuevo desde Comparación. Los informes posteriores sí
                se vuelven a emitir desde aquí.
              </p>
            )}

            {/* Lo que no se guardó se dice que no se guardó. Mostrar los
                valores por defecto como si fueran los del informe sería
                inventarle una configuración que nunca tuvo. */}
            <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(() => {
                const c = datos?.criterios;
                const sinRegistrar = "Sin registrar";
                return [
                  { k: "Comparado por", v: datos?.modo === "grado" ? "Grado CAPRI" : "Cargo homologado" },
                  { k: "Métrica", v: sigla },
                  { k: "Tipo de cambio", v: !c ? sinRegistrar : c.tcr ? `TCR ${c.tcr}` : "Moneda base" },
                  { k: "Comisiones", v: !c ? sinRegistrar : c.comisiones ? "Incluidas" : "Excluidas" },
                  { k: "Grupo de comparación", v: !c ? sinRegistrar : c.grupoComparacion || "Mercado general" },
                  { k: "Grados analizados", v: !c ? sinRegistrar : c.grados.length > 0 ? c.grados.join(", ") : "Todos" },
                ];
              })().map((i) => (
                <div key={i.k} className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs text-slate-500">{i.k}</dt>
                  <dd className={`mt-1 text-sm font-semibold ${i.v === "Sin registrar" ? "text-slate-400" : "text-slate-900"}`}>
                    {i.v}
                  </dd>
                </div>
              ))}
            </dl>
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
                      <th className="px-4 py-2.5 text-right font-semibold">P90</th>
                      <th className="px-4 py-2.5 text-right font-semibold">P75</th>
                      <th className="px-4 py-2.5 text-right font-semibold">P50</th>
                      <th className="px-4 py-2.5 text-right font-semibold">P25</th>
                      <th className="px-4 py-2.5 text-right font-semibold">P10</th>
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
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p90)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p75)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900">{money(f.percentiles!.p50)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p25)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(f.percentiles!.p10)}</td>
                              <td className="px-4 py-2.5"><span className={`pill ${pos.clase}`}>{pos.texto}</span></td>
                            </>
                          ) : (
                            <td colSpan={6} className="px-4 py-2.5 text-xs text-slate-500">Sin comparación disponible</td>
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
        </main>
    );
  }

  // ── Lista de informes ─────────────────────────────────────────────────
  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <PasosEstudio
          activo={0}
          alcanzables={[1, 2]}
          onPaso={(n) => {
            triggerNavigation();
            router.push(n === 1 ? "/market-analyzer/estudio/cargos" : "/market-analyzer/estudio/comparacion");
          }}
        />
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Estudio de Competitividad</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Historial.</h1>
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
    </main>
  );
}
