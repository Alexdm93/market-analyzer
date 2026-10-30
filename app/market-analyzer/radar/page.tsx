"use client";

/**
 * Radar Salarial: el reporte suelto de UN cargo o UN grado.
 *
 * Dos caminos que llevan al mismo informe. El de arriba es el normal: elegir
 * la unidad funcional y después el cargo del corte. El de abajo es para
 * cuando el cargo de la empresa no está en el catálogo: se le pone nombre y se
 * valora con CAPRI, y la comparación pasa a ser contra el grado.
 *
 * Antes de dejar generar nada se revisan tres cosas: que el admin lo haya
 * habilitado, que la ficha de la empresa y el contacto de RR.HH. estén
 * completos, y que quede cupo en el trimestre (AC Consulting, 2026-10-20).
 */
import { AlertTriangle, ArrowRight, Download, Layers, Loader2, Radar as RadarIcon, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { CapriWizardModal } from "@/components/CapriWizardModal";
import { ListaCasillas } from "@/components/ListaCasillas";
import { InformeRadarVista } from "@/components/InformeRadarVista";
import { SelectorBuscador } from "@/components/SelectorBuscador";
import { CAPRI_ROLES } from "@/lib/capri";
import { TAMANOS } from "@/lib/filtros-mercado";
import { isAdminRole } from "@/lib/roles";
import { EMPTY_COMPANY_INFO, type CompanyInfo } from "@/lib/workspace";
import { fetchWorkspace } from "@/lib/workspace-client";
import type { ContextoRadar, InformeRadar } from "@/app/api/radar/route";
import type { InformeDelHistorial } from "@/app/api/radar/informes/route";
import type { EstadoCupoRadar } from "@/lib/radar";

type Familia = "IC" | "LO" | "GE" | "EJ";

export default function RadarPage() {
  const { data: session, status } = useSession();
  const esAdmin = isAdminRole(session?.user?.role);

  const [ctx, setCtx] = useState<ContextoRadar | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [unidad, setUnidad] = useState("");
  const [cargo, setCargo] = useState("");
  /**
   * El corte que el admin está mirando. Vacío = el que fijó para la
   * plataforma, que es el único que ve una empresa.
   */
  const [corteAdmin, setCorteAdmin] = useState("");

  /**
   * El recorte del mercado, solo para el admin: los mismos cinco criterios que
   * el grupo de comparación del Estudio de Competitividad
   * (AC Consulting, 2026-10-21).
   */
  const [filtroSectores, setFiltroSectores] = useState<string[]>([]);
  const [filtroClasificaciones, setFiltroClasificaciones] = useState<string[]>([]);
  const [filtroLocalidades, setFiltroLocalidades] = useState<string[]>([]);
  const [filtroTamanos, setFiltroTamanos] = useState<string[]>([]);
  const [filtroEmpresas, setFiltroEmpresas] = useState<string[]>([]);
  const [abrirRecorte, setAbrirRecorte] = useState(false);
  /** Cuántas empresas quedan con el recorte puesto; null mientras se consulta. */
  const [empresasEnGrupo, setEmpresasEnGrupo] = useState<number | null>(null);
  const [tcr, setTcr] = useState(false);
  // Los mismos tres que el resto de la plataforma, no uno fijo
  // (AC Consulting, 2026-10-20).
  const [tcrTipo, setTcrTipo] = useState<"bcv" | "euro" | "libre">("bcv");

  // El camino de valoración: nombre propio + CAPRI.
  const [valorando, setValorando] = useState(false);
  const [nombrePropio, setNombrePropio] = useState("");
  const [capriAbierto, setCapriAbierto] = useState(false);
  const [grado, setGrado] = useState<number | null>(null);
  const [familia, setFamilia] = useState<Familia | null>(null);

  const [informe, setInforme] = useState<InformeRadar | null>(null);
  const [informeId, setInformeId] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [bajando, setBajando] = useState("");
  const [historial, setHistorial] = useState<InformeDelHistorial[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [res, workspace, hist] = await Promise.all([
        fetch(corteAdmin ? `/api/radar?corte=${encodeURIComponent(corteAdmin)}` : "/api/radar", { cache: "no-store" }),
        fetchWorkspace().catch(() => null),
        fetch("/api/radar/informes", { cache: "no-store" }).catch(() => null),
      ]);
      const h = (await hist?.json().catch(() => null)) as { informes?: InformeDelHistorial[] } | null;
      setHistorial(h?.informes ?? []);
      const d = (await res.json().catch(() => null)) as (ContextoRadar & { message?: string }) | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo cargar el Radar."); return; }
      setCtx(d);
      if (workspace) setCompanyInfo(workspace.companyInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el Radar.");
    } finally {
      setCargando(false);
    }
  }, [corteAdmin]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Los filtros como query string, con los nombres que lee el servidor. */
  const consultaFiltros = useMemo(() => {
    const p = new URLSearchParams();
    if (filtroSectores.length > 0) p.set("sectors", filtroSectores.join(","));
    // El parámetro se llama `sizes` de antes; filtra la clasificación.
    if (filtroClasificaciones.length > 0) p.set("sizes", filtroClasificaciones.join(","));
    if (filtroLocalidades.length > 0) p.set("localities", filtroLocalidades.join(","));
    if (filtroTamanos.length > 0) p.set("tamanos", filtroTamanos.join(","));
    if (filtroEmpresas.length > 0) p.set("companies", filtroEmpresas.join(","));
    return p.toString();
  }, [filtroSectores, filtroClasificaciones, filtroLocalidades, filtroTamanos, filtroEmpresas]);

  const descripcionRecorte = useMemo(() => {
    const resumir = (xs: string[], uno: string, varios: string) =>
      xs.length === 1 ? `${uno} ${xs[0]}` : xs.length > 1 ? `${xs.length} ${varios}` : "";
    const partes = [
      resumir(filtroSectores, "Sector", "sectores"),
      resumir(filtroClasificaciones, "Clasificación", "clasificaciones"),
      resumir(filtroLocalidades, "Ubicación", "ubicaciones"),
      resumir(filtroTamanos, "Tamaño", "tamaños"),
      resumir(filtroEmpresas, "Empresa", "empresas"),
    ].filter(Boolean);
    return partes.length > 0 ? partes.join(" · ") : "Todo el corte";
  }, [filtroSectores, filtroClasificaciones, filtroLocalidades, filtroTamanos, filtroEmpresas]);

  /**
   * Cuántas empresas quedan con el recorte.
   *
   * Va en su propia consulta y no en `cargar` a propósito: tocar una casilla
   * no tiene por qué dejar la pantalla entera en blanco mientras se recuenta.
   */
  useEffect(() => {
    if (!esAdmin) { setEmpresasEnGrupo(null); return; }
    let ignorar = false;
    const p = new URLSearchParams(consultaFiltros);
    if (corteAdmin) p.set("corte", corteAdmin);
    void fetch(`/api/radar?${p.toString()}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: ContextoRadar | null) => {
        if (!ignorar) setEmpresasEnGrupo(d?.recorte?.empresasEnGrupo ?? null);
      })
      .catch(() => { if (!ignorar) setEmpresasEnGrupo(null); });
    return () => { ignorar = true; };
  }, [esAdmin, consultaFiltros, corteAdmin]);

  async function generar() {
    setGenerando(true);
    setError("");
    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: valorando ? "grado" : "cargo",
          tituloCargo: valorando ? nombrePropio.trim() : cargo,
          unidad,
          ...(valorando ? { grado, familia } : {}),
          ...(tcr ? { tcr: { tipo: tcrTipo } } : {}),
          ...(corteAdmin ? { corte: corteAdmin } : {}),
          ...(consultaFiltros ? { filtrosGrupo: consultaFiltros } : {}),
        }),
      });
      const d = (await res.json().catch(() => null)) as
        { informe?: InformeRadar; id?: string | null; cupo?: EstadoCupoRadar; message?: string } | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo generar el reporte."); return; }
      setInforme(d?.informe ?? null);
      setInformeId(d?.id ?? null);
      if (d?.cupo && ctx) setCtx({ ...ctx, cupo: d.cupo });
      void refrescarHistorial();
      // El informe queda abajo; sin esto en móvil parecería que no pasó nada.
      requestAnimationFrame(() => {
        document.getElementById("radar-informe")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el reporte.");
    } finally {
      setGenerando(false);
    }
  }

  async function refrescarHistorial() {
    const res = await fetch("/api/radar/informes", { cache: "no-store" }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { informes?: InformeDelHistorial[] } | null;
    setHistorial(d?.informes ?? []);
  }

  /**
   * El PDF se pide por el id del informe guardado. El admin no guarda nada
   * —su vista previa no gasta cupo— así que manda el informe que está viendo.
   */
  async function bajarPdf(id: string | null, datos?: InformeRadar) {
    setBajando(id ?? "vista");
    setError("");
    try {
      const res = await fetch("/api/radar/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { informe: datos }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(d?.message ?? `No se pudo bajar el PDF (error ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Radar Salarial.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo bajar el PDF.");
    } finally {
      setBajando("");
    }
  }

  const cargosDeLaUnidad = useMemo(
    () => ctx?.unidades.find((u) => u.unidad === unidad)?.cargos ?? [],
    [ctx, unidad],
  );
  const elegido = cargosDeLaUnidad.find((c) => c.tituloCargo === cargo);

  // La facturación manda sobre las rutas CAPRI, así que el asistente recibe la
  // de la empresa aunque el workspace todavía no haya cargado.
  const infoParaCapri = useMemo<CompanyInfo>(
    () => ({ ...companyInfo, revenueUSD: ctx?.facturacion || companyInfo.revenueUSD }),
    [companyInfo, ctx?.facturacion],
  );

  if (status === "loading" || cargando) {
    return <main className="page-wrap"><p className="text-sm text-slate-500">Cargando…</p></main>;
  }

  if (!ctx?.habilitado) {
    return (
      <main className="page-wrap">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Radar Salarial</div>
          <h1 className="dashboard-title font-display font-bold text-slate-900">Radar Salarial.</h1>
          <p className="dashboard-lead mt-3 text-slate-600">
            Tu empresa no tiene el Radar Salarial habilitado.
          </p>
        </section>
      </main>
    );
  }

  const sinCorte = !ctx.corte;
  // El admin no gasta cupo: su reporte no se guarda ni cuenta contra el
  // trimestre de la empresa (AC Consulting, 2026-10-20).
  // Las consultas adicionales son el colchón de quien ya agotó el trimestre:
  // mientras le queden, el Radar sigue abierto (AC Consulting, 2026-10-30).
  const creditos = ctx.cupo?.creditos ?? 0;
  const sinCupo = !ctx.ilimitado && (ctx.cupo?.restantes ?? 0) <= 0 && creditos <= 0;
  /** El próximo informe sale de las pagadas, así que trae las cuatro métricas. */
  const gastaraAdicional = !ctx.ilimitado && (ctx.cupo?.restantes ?? 0) <= 0 && creditos > 0;
  const fichaIncompleta = ctx.falta.length > 0;
  const listo = Boolean(
    !sinCorte && !sinCupo && !fichaIncompleta
    && (valorando ? nombrePropio.trim() && grado !== null : cargo),
  );

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Radar Salarial</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Radar Salarial.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            La compensación de mercado de un cargo, en TEM y PCTA. Elige el cargo del estudio o,
            si no está en la lista, nómbralo y clasifícalo con CAPRI.
          </p>
          {ctx.ilimitado && ctx.cortes.length > 0 ? (
            <label className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              Estudio de referencia:
              <select
                value={corteAdmin || ctx.corte?.id || ""}
                onChange={(e) => setCorteAdmin(e.target.value)}
                className="field-select w-auto"
                aria-label="Estudio de referencia"
              >
                {ctx.cortes.map((c) => (
                  <option key={c.id} value={c.id}>{c.label} · {c.date}</option>
                ))}
              </select>
            </label>
          ) : ctx.corte && (
            <p className="mt-4 text-sm text-slate-500">
              Estudio de referencia: <strong className="text-slate-700">{ctx.corte.label}</strong> · {ctx.corte.date}
            </p>
          )}
          {ctx.ilimitado ? (
            <p className="mt-1 text-sm text-slate-500">
              Como administrador no tienes tope: puedes emitir los reportes que quieras, sobre
              cualquier corte publicado y con el recorte de data que quieras. No consumen cupo
              ni quedan en el historial de la empresa, y el reporte sale con las cuatro métricas
              (TEM, TEMz, CIM y PCTA) en vez de las dos del informe de cliente.
            </p>
          ) : ctx.cupo && (
            <>
              <p className="mt-1 text-sm text-slate-500">
                Te {ctx.cupo.restantes === 1 ? "queda" : "quedan"}{" "}
                <strong className="text-slate-700">{ctx.cupo.restantes}</strong> de {ctx.cupo.cupo}{" "}
                {ctx.cupo.cupo === 1 ? "informe" : "informes"} este trimestre. Se reponen el {ctx.cupo.seRepone}.
              </p>
              {creditos > 0 && (
                <p className="mt-1 text-sm text-slate-500">
                  Además {creditos === 1 ? "tienes" : "tienes"}{" "}
                  <strong className="text-slate-700">{creditos}</strong>{" "}
                  {creditos === 1 ? "consulta adicional" : "consultas adicionales"}. No se reponen por
                  trimestre y se usan solo cuando el cupo de arriba llega a cero. El informe que sale de
                  una de ellas trae las cuatro métricas: TEM, TEMz, CIM y PCTA.
                </p>
              )}
            </>
          )}
        </section>

        {error && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {sinCorte && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            El administrador todavía no eligió de qué estudio sale el Radar.
          </p>
        )}

        {ctx.ilimitado && ctx.recorte && (
          <section className="surface-panel rounded-[2rem] p-6">
            <button
              type="button"
              onClick={() => setAbrirRecorte((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span>
                <span className="block text-sm font-semibold text-slate-900">Recorte de la data</span>
                <span className="block text-xs text-slate-500">
                  Contra quién se compara: <strong>{descripcionRecorte}</strong>
                  {empresasEnGrupo !== null && ` · ${empresasEnGrupo} ${empresasEnGrupo === 1 ? "empresa" : "empresas"}`}
                </span>
              </span>
              <span className="text-xs font-semibold text-teal-700">{abrirRecorte ? "Ocultar" : "Cambiar"}</span>
            </button>

            {abrirRecorte && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <ListaCasillas
                    titulo="Sectores económicos"
                    vacio="Todos los del corte"
                    opciones={ctx.recorte.sectores}
                    elegidas={filtroSectores}
                    onToggle={(v) => setFiltroSectores((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    onLimpiar={() => setFiltroSectores([])}
                  />
                  <ListaCasillas
                    titulo="Clasificación (subsector)"
                    vacio="Todas las del corte"
                    opciones={ctx.recorte.clasificaciones}
                    elegidas={filtroClasificaciones}
                    onToggle={(v) => setFiltroClasificaciones((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    onLimpiar={() => setFiltroClasificaciones([])}
                  />
                  <ListaCasillas
                    titulo="Ubicación"
                    vacio="Todas las del corte"
                    opciones={ctx.recorte.localidades}
                    elegidas={filtroLocalidades}
                    onToggle={(v) => setFiltroLocalidades((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    onLimpiar={() => setFiltroLocalidades([])}
                  />
                  <ListaCasillas
                    titulo="Tamaño"
                    vacio="Todos los del corte"
                    opciones={TAMANOS.map((t) => t.valor)}
                    etiquetas={Object.fromEntries(TAMANOS.map((t) => [t.valor, t.etiqueta]))}
                    elegidas={filtroTamanos}
                    onToggle={(v) => setFiltroTamanos((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                    onLimpiar={() => setFiltroTamanos([])}
                  />
                </div>

                <ListaCasillas
                  titulo="Empresas"
                  vacio="Todas las del corte"
                  opciones={ctx.recorte.empresas}
                  elegidas={filtroEmpresas}
                  onToggle={(v) => setFiltroEmpresas((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
                  onLimpiar={() => setFiltroEmpresas([])}
                />

                <p className="text-xs text-slate-500">
                  El recorte no tiene mínimo de empresas: es para revisar, no para entregarle a un
                  cliente. Con pocas empresas los percentiles dejan de ser mercado.
                </p>
              </div>
            )}
          </section>
        )}

        {fichaIncompleta && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Para bajar un Radar falta completar {ctx.falta.join(", ")} en{" "}
              <Link href="/market-analyzer/informacion" className="font-semibold underline">Información de la empresa</Link>.
            </span>
          </p>
        )}

        {sinCupo && !fichaIncompleta && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Ya usaste los {ctx.cupo?.cupo} informes de este trimestre. Se reponen el {ctx.cupo?.seRepone}.
          </p>
        )}

        {gastaraAdicional && !fichaIncompleta && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Agotaste el cupo de este trimestre, así que el próximo informe gastará una de tus{" "}
            {creditos} {creditos === 1 ? "consulta adicional" : "consultas adicionales"} y saldrá con
            las cuatro métricas (TEM, TEMz, CIM y PCTA).
          </p>
        )}

        {/* ── Camino 1: el cargo del estudio ──────────────────────────── */}
        <section className={`surface-panel rounded-[2rem] p-6 md:p-8 ${valorando ? "opacity-50" : ""}`}>
          <div className="mb-5 flex items-center gap-2">
            <Search size={18} className="text-slate-400" />
            <h2 className="font-display text-xl font-bold text-slate-900">Busca el cargo en el estudio</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="radar-unidad" className="field-label">Unidad funcional</label>
              <select
                id="radar-unidad"
                value={unidad}
                onChange={(e) => { setUnidad(e.target.value); setCargo(""); }}
                disabled={valorando || sinCorte}
                className="field-select"
              >
                <option value="">Elige una unidad</option>
                {ctx.unidades.map((u) => (
                  <option key={u.unidad} value={u.unidad}>{u.unidad} ({u.cargos.length})</option>
                ))}
              </select>
            </div>

            <div>
              <span className="field-label">Cargo</span>
              <SelectorBuscador
                aria-label="Cargo del estudio"
                value={cargo}
                onChange={setCargo}
                opciones={cargosDeLaUnidad.map((c) => ({ value: c.tituloCargo, label: c.tituloCargo }))}
                placeholder={unidad ? "Elige el cargo" : "Elige primero la unidad"}
              />
            </div>
          </div>

          {elegido && (
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
              <p className="eyebrow mb-1">Descripción del cargo</p>
              <p className="text-sm leading-relaxed text-slate-600">
                {elegido.descripcion || "Este cargo todavía no tiene descripción cargada."}
              </p>
            </div>
          )}
        </section>

        {/* ── Camino 2: nombrarlo y valorarlo ─────────────────────────── */}
        <section className={`surface-panel rounded-[2rem] p-6 md:p-8 ${valorando ? "" : "opacity-50"}`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-slate-400" />
              <h2 className="font-display text-xl font-bold text-slate-900">¿No está en la lista?</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setValorando((v) => !v);
                setCargo(""); setUnidad("");
                setGrado(null); setFamilia(null); setNombrePropio("");
              }}
              className="btn btn-secondary"
            >
              {valorando ? "Volver a buscar en el estudio" : "Clasificarlo con CAPRI"}
            </button>
          </div>

          <p className="mb-4 max-w-2xl text-sm text-slate-500">
            Ponle el nombre con el que lo llamas en tu empresa y clasifícalo. La comparación pasa a
            ser contra el grado, no contra un cargo del estudio.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="radar-nombre" className="field-label">Nombre del cargo</label>
              <input
                id="radar-nombre"
                value={nombrePropio}
                onChange={(e) => setNombrePropio(e.target.value)}
                disabled={!valorando}
                className="field"
                placeholder="Como lo llamas internamente"
              />
            </div>
            <div>
              <span className="field-label">Valoración CAPRI</span>
              <button
                type="button"
                onClick={() => setCapriAbierto(true)}
                disabled={!valorando}
                className="field flex w-full items-center gap-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed"
              >
                <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                {grado
                  ? <span className="font-semibold text-teal-700">
                      Grado {grado} · {CAPRI_ROLES[grado]?.rol ?? ""}{familia ? ` · ruta ${familia}` : ""}
                    </span>
                  : <span className="text-slate-400">Clasificar con CAPRI</span>}
              </button>
            </div>
          </div>
        </section>

        {/* ── Moneda y emisión ────────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={tcr}
                onChange={(e) => setTcr(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#1B4965]"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Expresar en moneda dura (TCR)</span>
                <span className="block text-xs text-slate-500">
                  Convierte las cifras con el tipo de cambio de referencia en vez de dejarlas en la
                  moneda en que cada empresa cargó su data.
                </span>
              </span>
            </label>

            {tcr && (
              <div>
                <label htmlFor="radar-tcr-tipo" className="field-label">Tipo de cambio</label>
                <select
                  id="radar-tcr-tipo"
                  value={tcrTipo}
                  onChange={(e) => setTcrTipo(e.target.value as "bcv" | "euro" | "libre")}
                  className="field-select"
                >
                  <option value="bcv">BCV — dólar</option>
                  <option value="euro">BCV — euro</option>
                  <option value="libre">Libre</option>
                </select>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <RadarIcon className="h-3.5 w-3.5" />
              {valorando
                ? "El informe compara contra el grado que valoraste."
                : "El informe compara contra el cargo del estudio."}
            </span>
            <button
              type="button"
              onClick={() => void generar()}
              disabled={!listo || generando}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generando ? <Loader2 size={16} className="animate-spin" /> : null}
              Generar reporte <ArrowRight size={16} />
            </button>
          </div>
        </section>

        {informe && (
          <div id="radar-informe" className="scroll-mt-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {informeId
                  ? "Queda guardado en tu historial: puedes volver a bajarlo sin gastar otro informe."
                  : "Vista previa de administrador: no se guarda ni consume cupo."}
              </p>
              <button
                type="button"
                onClick={() => void bajarPdf(informeId, informe)}
                disabled={bajando !== ""}
                className="btn btn-primary disabled:opacity-50"
              >
                {bajando !== "" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Descargar PDF
              </button>
            </div>
            <InformeRadarVista informe={informe} />
          </div>
        )}

        {historial.length > 0 && (
          <section className="surface-panel rounded-[2rem] p-6 md:p-8">
            <h2 className="font-display mb-5 text-xl font-bold text-slate-900">Informes generados</h2>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Cargo</th>
                    <th className="px-4 py-2.5 font-semibold">Tipo</th>
                    <th className="px-4 py-2.5 font-semibold">Estudio</th>
                    <th className="px-4 py-2.5 font-semibold">Fecha</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historial.map((h) => (
                    <tr key={h.id}>
                      <td className="px-4 py-2.5 text-slate-800">{h.titulo}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        {h.modo === "cargo" ? "Por cargo" : "Por valoración"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{h.corte}</td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-slate-500">{h.fecha}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void bajarPdf(h.id)}
                          disabled={bajando !== ""}
                          className="btn btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          {bajando === h.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Volver a bajar uno de estos no consume cupo: el informe guarda sus propias cifras.
            </p>
          </section>
        )}

        {esAdmin && (
          <p className="text-xs text-slate-400">
            El cupo, la habilitación y el corte con el que trabajan las empresas se configuran
            en <Link href="/market-analyzer/admin/radar" className="underline">Administración → Radar: habilitación</Link>.
          </p>
        )}
      </div>

      {capriAbierto && (
        <CapriWizardModal
          companyInfo={infoParaCapri}
          cargoNombre={nombrePropio || "Cargo"}
          existingGrade={grado ?? undefined}
          onSave={(g, f) => { setGrado(g); setFamilia(f as Familia); }}
          onClose={() => setCapriAbierto(false)}
        />
      )}
    </main>
  );
}
