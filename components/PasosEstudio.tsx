"use client";

/**
 * El recorrido del Estudio de Competitividad, en cuatro pasos planos.
 *
 * Antes eran dos pasos con tres momentos colgando del segundo, y no se
 * entendía dónde estaba uno: la barra decía "paso 2 de 2" mientras la pantalla
 * pedía la tercera decisión. El CEO pidió verlo como un solo recorrido
 * (2026-10-17), que además es la forma en que la gente lo cuenta: primero mis
 * cargos, después qué mido, después contra quién, y al final emito.
 *
 * Los dos primeros pasos viven en pantallas distintas y los tres últimos en la
 * misma, pero eso es un detalle de implementación: el componente no navega, le
 * avisa a la pantalla qué paso se pidió y ella decide si cambia de ruta o de
 * sección.
 *
 * El Historial no es un paso —es donde quedan los informes ya emitidos— así
 * que va aparte y sin número.
 */
import { Check, History } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { useNavigationTrigger } from "./NavigationProgress";

const BASE = "/market-analyzer/estudio";

export const PASOS_ESTUDIO = [
  { n: 1, titulo: "Mis cargos" },
  { n: 2, titulo: "Métrica a medir" },
  { n: 3, titulo: "Filtros de mercado" },
  { n: 4, titulo: "Emisión" },
] as const;

const HISTORIAL = { href: `${BASE}/informes`, nombre: "Historial" };

export function PasosEstudio({
  activo,
  listos = [],
  alcanzables = [],
  onPaso,
}: {
  /** El paso en el que está la pantalla, de 1 a 4. */
  activo: number;
  /** Los que ya quedaron resueltos: se marcan con un visto. */
  listos?: number[];
  /** A cuáles se puede saltar desde acá. El activo siempre lo es. */
  alcanzables?: number[];
  onPaso?: (n: number) => void;
}) {
  const pathname = usePathname();
  const enHistorial = pathname === HISTORIAL.href;

  return (
    <nav
      aria-label="Recorrido del Estudio de Competitividad"
      className="surface-panel flex flex-wrap items-center gap-y-2 rounded-[1.5rem] px-3 py-3"
    >
      {PASOS_ESTUDIO.map((paso, i) => {
        const esActivo = !enHistorial && paso.n === activo;
        const listo = listos.includes(paso.n) && !esActivo;
        const puede = !!onPaso && (esActivo || alcanzables.includes(paso.n));

        return (
          <Fragment key={paso.n}>
            {i > 0 && (
              <span
                aria-hidden
                className={`mx-1 hidden h-px min-w-4 flex-1 sm:block ${listo || esActivo ? "bg-[#1B4965]/25" : "bg-slate-200"}`}
              />
            )}
            <button
              type="button"
              onClick={() => puede && !esActivo && onPaso?.(paso.n)}
              disabled={!puede || esActivo}
              aria-current={esActivo ? "step" : undefined}
              className={`flex min-w-0 items-center gap-2 rounded-[1.15rem] px-2.5 py-1.5 text-left transition ${
                esActivo
                  ? "bg-[linear-gradient(135deg,rgba(27,73,101,0.14),rgba(21,58,82,0.06))] text-slate-900"
                  : puede
                  ? "text-slate-600 hover:bg-white/70"
                  : "cursor-not-allowed text-slate-400"
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[0.78rem] font-bold ${
                  esActivo ? "bg-[#1B4965] text-white"
                    : listo ? "bg-teal-100 text-teal-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {listo ? <Check size={14} /> : paso.n}
              </span>
              <span className="hidden truncate text-[0.7rem] font-bold uppercase tracking-wide md:inline">
                {paso.titulo}
              </span>
            </button>
          </Fragment>
        );
      })}

      {/* Separado de los pasos: es un destino, no una etapa del trabajo. */}
      <span aria-hidden className="mx-2 hidden h-7 w-px shrink-0 bg-slate-200 sm:block" />
      <EnlaceHistorial activo={enHistorial} />
    </nav>
  );
}

function EnlaceHistorial({ activo }: { activo: boolean }) {
  const triggerNavigation = useNavigationTrigger();
  return (
    <Link
      href={HISTORIAL.href}
      onClick={activo ? undefined : triggerNavigation}
      aria-current={activo ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-[1.15rem] px-2.5 py-1.5 transition ${
        activo
          ? "bg-[linear-gradient(135deg,rgba(27,73,101,0.14),rgba(21,58,82,0.06))] text-slate-900"
          : "text-slate-600 hover:bg-white/70"
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
      <span className="hidden text-[0.7rem] font-bold uppercase tracking-wide md:inline">{HISTORIAL.nombre}</span>
    </Link>
  );
}
