"use client";

/**
 * El recorrido del Estudio de Competitividad.
 *
 * El trabajo son dos pasos con orden: cargar los ocupantes y contrastarlos con
 * el mercado. El Historial no es un paso — es donde quedan guardados los
 * informes que se generan en el paso 2 — así que va aparte y sin número, para
 * no dar a entender que hay que pasar por ahí para terminar.
 *
 * Dentro de Comparación hay a su vez tres momentos; se muestran acá colgando
 * de ese paso en vez de en una segunda barra. Dos barras de pasos apiladas era
 * lo que hacía que la pantalla no se entendiera (AC Consulting, 2026-10-14).
 */
import { Check, ChevronRight, History } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { useNavigationTrigger } from "./NavigationProgress";

const BASE = "/market-analyzer/estudio";

const PASOS = [
  { href: `${BASE}/cargos`,      nombre: "Mis cargos",  detalle: "Carga tus ocupantes" },
  { href: `${BASE}/comparacion`, nombre: "Comparación", detalle: "Genera y descarga" },
];

const HISTORIAL = { href: `${BASE}/informes`, nombre: "Historial", detalle: "Informes guardados" };

export type SubPaso = { n: number; titulo: string; listo: boolean; alcanzable: boolean };

export function PasosEstudio({
  subPasos, subPasoActivo, onSubPaso,
}: {
  /** Los momentos de la pantalla actual, si los tiene. */
  subPasos?: SubPaso[];
  subPasoActivo?: number;
  onSubPaso?: (n: number) => void;
} = {}) {
  const pathname = usePathname();
  const triggerNavigation = useNavigationTrigger();

  return (
    <nav
      aria-label="Recorrido del Estudio de Competitividad"
      className="surface-panel flex flex-wrap items-center gap-1 rounded-[1.5rem] p-2"
    >
      {PASOS.map((paso, i) => {
        const activo = pathname === paso.href;
        return (
          <Fragment key={paso.href}>
            {i > 0 && <ChevronRight size={15} aria-hidden className="shrink-0 text-slate-300" />}
            <Link
              href={paso.href}
              onClick={activo ? undefined : triggerNavigation}
              aria-current={activo ? "step" : undefined}
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[1.15rem] border px-3 py-2 transition ${
                activo
                  ? "border-[#1B4965]/10 bg-[linear-gradient(135deg,rgba(27,73,101,0.14),rgba(21,58,82,0.06))] text-slate-900 shadow-[0_2px_10px_rgba(27,73,101,0.18)]"
                  : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white/70"
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[0.78rem] font-bold ${
                  activo ? "bg-[#1B4965] text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="font-display block truncate text-[0.85rem] font-bold leading-5">{paso.nombre}</span>
                <span className="block truncate text-[0.7rem] leading-4 text-slate-500">
                  {activo && subPasos?.length ? `Paso ${subPasoActivo ?? 1} de ${subPasos.length}` : paso.detalle}
                </span>
              </span>
            </Link>

            {activo && subPasos?.length ? (
              <span className="flex min-w-0 shrink-0 items-center gap-1">
                {subPasos.map((sp) => (
                  <button
                    key={sp.n}
                    type="button"
                    onClick={() => sp.alcanzable && onSubPaso?.(sp.n)}
                    disabled={!sp.alcanzable}
                    aria-current={subPasoActivo === sp.n ? "step" : undefined}
                    title={sp.titulo}
                    className={`flex items-center gap-1.5 rounded-[1.15rem] px-2.5 py-1.5 text-[0.78rem] font-semibold transition ${
                      subPasoActivo === sp.n
                        ? "bg-white text-slate-900 shadow-[0_1px_6px_rgba(27,73,101,0.14)]"
                        : sp.alcanzable
                        ? "text-slate-500 hover:bg-white/70"
                        : "cursor-not-allowed text-slate-300"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${
                        subPasoActivo === sp.n
                          ? "bg-[#1B4965] text-white"
                          : sp.listo ? "bg-teal-100 text-teal-700" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {sp.listo && subPasoActivo !== sp.n ? <Check size={11} /> : sp.n}
                    </span>
                    <span className="hidden truncate lg:inline">{sp.titulo}</span>
                  </button>
                ))}
              </span>
            ) : null}
          </Fragment>
        );
      })}

      {/* Separado de los pasos: es un destino, no una etapa del trabajo. */}
      <span aria-hidden className="mx-1 hidden h-8 w-px shrink-0 bg-slate-200 sm:block" />

      {(() => {
        const activo = pathname === HISTORIAL.href;
        return (
          <Link
            href={HISTORIAL.href}
            onClick={activo ? undefined : triggerNavigation}
            aria-current={activo ? "page" : undefined}
            className={`flex min-w-0 items-center gap-2.5 rounded-[1.15rem] border px-3 py-2 transition ${
              activo
                ? "border-[#1B4965]/10 bg-[linear-gradient(135deg,rgba(27,73,101,0.14),rgba(21,58,82,0.06))] text-slate-900 shadow-[0_2px_10px_rgba(27,73,101,0.18)]"
                : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white/70"
            }`}
          >
            <span
              aria-hidden
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                activo ? "bg-[#1B4965] text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              <History size={14} />
            </span>
            <span className="min-w-0">
              <span className="font-display block truncate text-[0.85rem] font-bold leading-5">{HISTORIAL.nombre}</span>
              <span className="block truncate text-[0.7rem] leading-4 text-slate-500">{HISTORIAL.detalle}</span>
            </span>
          </Link>
        );
      })()}
    </nav>
  );
}
