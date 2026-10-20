"use client";

/**
 * El informe del Radar en pantalla.
 *
 * Es la misma página que después se baja en PDF, así que se arma a partir de
 * los datos del informe y no de lo que haya en la pantalla que lo pidió: lo
 * que se ve y lo que se descarga salen del mismo sitio.
 *
 * Tres bloques, en el orden de los modelos de AC Consulting: perfil del cargo,
 * composición de la muestra y posicionamiento competitivo.
 */
import type { InformeRadar } from "@/app/api/radar/route";
import { PERCENTILES_RADAR } from "@/lib/radar-mercado";

const PORCENTAJE = new Intl.NumberFormat("es-VE", { style: "percent", maximumFractionDigits: 0 });
const MONTO = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });

/** Los colores de la torta, del más oscuro al más claro. */
const TONOS = ["#1B4965", "#2E6B8F", "#5390B5", "#8FB8D4", "#C3DAE8", "#E4EEF5"];

function Torta({ rebanadas }: { rebanadas: Array<{ nombre: string; porcentaje: number }> }) {
  if (rebanadas.length === 0) return null;

  // Un solo valor no se puede dibujar con arcos: un círculo entero no tiene
  // dos puntos distintos y el trazo sale vacío.
  if (rebanadas.length === 1) {
    return (
      <svg viewBox="0 0 100 100" className="h-44 w-44" role="img" aria-label={`${rebanadas[0].nombre}, 100%`}>
        <circle cx="50" cy="50" r="45" fill={TONOS[0]} />
      </svg>
    );
  }

  // El ángulo de arranque se calcula sumando las rebanadas previas en vez de
  // arrastrar un acumulador: son seis como mucho, y así no se muta nada
  // mientras se dibuja.
  const partes = rebanadas.map((r, i) => {
    const previo = rebanadas.slice(0, i).reduce((suma, x) => suma + x.porcentaje, 0);
    const desde = -Math.PI / 2 + previo * Math.PI * 2;
    const barrido = r.porcentaje * Math.PI * 2;
    const hasta = desde + barrido;
    const x1 = 50 + 45 * Math.cos(desde);
    const y1 = 50 + 45 * Math.sin(desde);
    const x2 = 50 + 45 * Math.cos(hasta);
    const y2 = 50 + 45 * Math.sin(hasta);
    const grande = barrido > Math.PI ? 1 : 0;
    return {
      d: `M 50 50 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 45 45 0 ${grande} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
      color: TONOS[i % TONOS.length],
      ...r,
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-44 w-44 shrink-0" role="img" aria-label="Composición por tamaño de empresa">
        {partes.map((p) => <path key={p.nombre} d={p.d} fill={p.color} stroke="#fff" strokeWidth="1" />)}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {partes.map((p) => (
          <li key={p.nombre} className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="text-slate-700">{p.nombre}</span>
            <span className="font-mono text-xs tabular-nums text-slate-500">{PORCENTAJE.format(p.porcentaje)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InformeRadarVista({ informe }: { informe: InformeRadar }) {
  const { perfil, muestra, posicionamiento } = informe;

  return (
    <article className="space-y-6">
      {/* ── Perfil ──────────────────────────────────────────────────── */}
      <section className="surface-panel rounded-[2rem] p-6 md:p-8">
        <div className="eyebrow mb-3">
          {informe.modo === "cargo" ? "Reporte por cargo" : "Reporte por valoración CAPRI"}
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">{perfil.tituloCargo}</h2>

        <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {informe.modo === "cargo" ? (
            <div className="sm:col-span-2">
              <dt className="eyebrow mb-1">Unidad funcional típica</dt>
              <dd className="text-sm text-slate-700">{perfil.unidadFuncional || "—"}</dd>
            </div>
          ) : (
            <>
              <div>
                <dt className="eyebrow mb-1">Ruta CAPRI</dt>
                <dd className="text-sm text-slate-700">{perfil.rutaCapri || "—"}</dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">Clasificación</dt>
                <dd className="text-sm text-slate-700">{perfil.clasificacion || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="eyebrow mb-1">Grado CAPRI – Rol CAPRI</dt>
                <dd className="text-sm text-slate-700">
                  {perfil.grado ? `${perfil.grado} – ${perfil.rol}` : "—"}
                </dd>
              </div>
            </>
          )}

          {perfil.descripcion && (
            <div className="sm:col-span-2">
              <dt className="eyebrow mb-1">Descripción</dt>
              <dd className="text-sm leading-relaxed text-slate-600">{perfil.descripcion}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ── Muestra ─────────────────────────────────────────────────── */}
      <section className="surface-panel rounded-[2rem] p-6 md:p-8">
        <h3 className="font-display mb-1 text-xl font-bold text-slate-900">Composición de la muestra</h3>
        <p className="mb-6 text-sm text-slate-500">
          {muestra.empresas} {muestra.empresas === 1 ? "empresa aportó" : "empresas aportaron"} data para este{" "}
          {informe.modo === "cargo" ? "cargo" : "grado"}.
        </p>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Por sector económico</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {muestra.sectores.map((s) => (
                  <tr key={s.nombre}>
                    <td className="py-2 pr-4 text-slate-700">{s.nombre}</td>
                    <td className="py-2 text-right font-mono text-xs tabular-nums text-slate-600">
                      {PORCENTAJE.format(s.porcentaje)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="eyebrow mb-3">Por tamaño de empresa</p>
            <Torta rebanadas={muestra.tamanos} />
          </div>
        </div>

        <p className="eyebrow mb-3 mt-8">Composición de la compensación</p>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {muestra.composicion.map((c) => (
                  <th key={c.categoria} className="px-3 py-2.5 text-center font-semibold">{c.categoria}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {muestra.composicion.map((c) => (
                  <td key={c.categoria} className="px-3 py-3 text-center font-mono text-xs tabular-nums text-slate-700">
                    {PORCENTAJE.format(c.porcentaje)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Posicionamiento ─────────────────────────────────────────── */}
      <section className="surface-panel rounded-[2rem] p-6 md:p-8">
        <h3 className="font-display mb-1 text-xl font-bold text-slate-900">Posicionamiento competitivo</h3>
        <p className="mb-6 text-sm text-slate-500">
          {informe.tcr
            ? `Cifras expresadas en moneda dura (TCR ${informe.tcr}).`
            : "Cifras en la moneda en que cada empresa cargó su data."}
        </p>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold" />
                {PERCENTILES_RADAR.map((p) => (
                  <th key={p} className="px-4 py-2.5 text-right font-semibold">{p.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {posicionamiento.map((fila) => (
                <tr key={fila.etiqueta}>
                  <td className="px-4 py-3 text-slate-800">{fila.etiqueta}</td>
                  {PERCENTILES_RADAR.map((p) => (
                    <td key={p} className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                      {fila.valores[p] === null ? "ND" : MONTO.format(fila.valores[p] as number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          {informe.empresa} · {informe.corte.label} · emitido el {informe.emitido}
        </p>
      </section>
    </article>
  );
}
