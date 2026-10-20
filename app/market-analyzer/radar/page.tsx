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
import { AlertTriangle, ArrowRight, Layers, Radar as RadarIcon, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { CapriWizardModal } from "@/components/CapriWizardModal";
import { SelectorBuscador } from "@/components/SelectorBuscador";
import { CAPRI_ROLES } from "@/lib/capri";
import { isAdminRole } from "@/lib/roles";
import { EMPTY_COMPANY_INFO, type CompanyInfo } from "@/lib/workspace";
import { fetchWorkspace } from "@/lib/workspace-client";
import type { ContextoRadar } from "@/app/api/radar/route";

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
  const [tcr, setTcr] = useState(false);

  // El camino de valoración: nombre propio + CAPRI.
  const [valorando, setValorando] = useState(false);
  const [nombrePropio, setNombrePropio] = useState("");
  const [capriAbierto, setCapriAbierto] = useState(false);
  const [grado, setGrado] = useState<number | null>(null);
  const [familia, setFamilia] = useState<Familia | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [res, workspace] = await Promise.all([
        fetch("/api/radar", { cache: "no-store" }),
        fetchWorkspace().catch(() => null),
      ]);
      const d = (await res.json().catch(() => null)) as (ContextoRadar & { message?: string }) | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo cargar el Radar."); return; }
      setCtx(d);
      if (workspace) setCompanyInfo(workspace.companyInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el Radar.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

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
  const sinCupo = (ctx.cupo?.restantes ?? 0) <= 0;
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
          {ctx.corte && (
            <p className="mt-4 text-sm text-slate-500">
              Estudio de referencia: <strong className="text-slate-700">{ctx.corte.label}</strong> · {ctx.corte.date}
            </p>
          )}
          {ctx.cupo && (
            <p className="mt-1 text-sm text-slate-500">
              Te {ctx.cupo.restantes === 1 ? "queda" : "quedan"}{" "}
              <strong className="text-slate-700">{ctx.cupo.restantes}</strong> de {ctx.cupo.cupo}{" "}
              {ctx.cupo.cupo === 1 ? "informe" : "informes"} este trimestre. Se reponen el {ctx.cupo.seRepone}.
            </p>
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

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <RadarIcon className="h-3.5 w-3.5" />
              {valorando
                ? "El informe compara contra el grado que valoraste."
                : "El informe compara contra el cargo del estudio."}
            </span>
            <button
              type="button"
              disabled={!listo}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Generar reporte <ArrowRight size={16} />
            </button>
          </div>
        </section>

        {esAdmin && (
          <p className="text-xs text-slate-400">
            Estás viendo la pantalla como la ve una empresa. El cupo y la habilitación se configuran
            en <Link href="/market-analyzer/admin/radar" className="underline">Administración → Radar Salarial</Link>.
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
