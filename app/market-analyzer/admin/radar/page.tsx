"use client";

/**
 * Configuración del Radar Salarial.
 *
 * Arriba lo que vale para todos —de qué corte sale el Radar y cuántos
 * informes se pueden bajar por trimestre— y abajo la lista de empresas, donde
 * se habilita una por una y se le puede dar un cupo propio.
 */
import { AlertTriangle, ArrowLeft, ArrowUpDown, Check, ChevronDown, ChevronUp, Loader2, Radar } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { isAdminRole } from "@/lib/roles";
import type { CorteRadar, EmpresaRadar } from "@/app/api/admin/radar/route";

/** Por cuál columna se ordena la tabla de empresas. */
type ColumnaOrden = "nombre" | "habilitado" | "cupo" | "usados";

/**
 * Una cabecera que ordena al hacerle clic, con la flecha del sentido actual.
 */
function Cabecera({
  por, orden, onOrdenar, alineada, children,
}: {
  por: ColumnaOrden;
  orden: { por: ColumnaOrden; desc: boolean };
  onOrdenar: (por: ColumnaOrden) => void;
  alineada?: "derecha";
  children: React.ReactNode;
}) {
  const activa = orden.por === por;
  const Flecha = !activa ? ArrowUpDown : orden.desc ? ChevronDown : ChevronUp;
  return (
    <th className={`px-4 py-2.5 font-semibold ${alineada === "derecha" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onOrdenar(por)}
        aria-label={`Ordenar por ${String(children)}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-slate-700 ${
          activa ? "text-slate-700" : ""
        }`}
      >
        {children}
        <Flecha className={`h-3 w-3 shrink-0 ${activa ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
}

type Respuesta = {
  trimestre: string;
  corte: string;
  cupoGeneral: number;
  cupoPorDefecto: number;
  cortes: CorteRadar[];
  empresas: EmpresaRadar[];
};

export default function RadarAdmin() {
  const { data: session, status } = useSession();
  const esAdmin = isAdminRole(session?.user?.role);

  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<{ por: ColumnaOrden; desc: boolean }>({ por: "nombre", desc: false });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/admin/radar", { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as (Respuesta & { message?: string }) | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo cargar la configuración."); return; }
      setDatos(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la configuración.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { if (esAdmin) void cargar(); }, [esAdmin, cargar]);

  async function guardar(cuerpo: Record<string, unknown>, etiqueta: string) {
    setGuardando(etiqueta);
    setError("");
    setAviso("");
    try {
      const res = await fetch("/api/admin/radar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const d = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo guardar."); return; }
      setAviso(d?.message ?? "Guardado.");
      await cargar();
    } finally {
      setGuardando("");
    }
  }

  /**
   * La tabla se ordena por cualquiera de sus columnas.
   *
   * Lo que de verdad se viene a mirar acá es quién está usando el Radar, y con
   * ciento y pico de empresas en orden alfabético eso no se ve: hay que ir
   * fila por fila buscando un número distinto de cero. Por eso "Usados" ordena
   * de mayor a menor en el primer clic (AC Consulting, 2026-10-26).
   */
  const empresas = useMemo(() => {
    const filtradas = (datos?.empresas ?? []).filter((e) =>
      e.name.toLowerCase().includes(busqueda.trim().toLowerCase()));

    const signo = orden.desc ? -1 : 1;
    return [...filtradas].sort((a, b) => {
      switch (orden.por) {
        case "usados":
          // Con el mismo número de usos manda el nombre, para que el orden no
          // baile entre recargas.
          return signo * (a.usados - b.usados) || a.name.localeCompare(b.name, "es");
        case "habilitado":
          return signo * (Number(a.habilitado) - Number(b.habilitado)) || a.name.localeCompare(b.name, "es");
        case "cupo": {
          const general = datos?.cupoGeneral ?? 0;
          return signo * ((a.cupo ?? general) - (b.cupo ?? general)) || a.name.localeCompare(b.name, "es");
        }
        default:
          return signo * a.name.localeCompare(b.name, "es");
      }
    });
  }, [datos, busqueda, orden]);

  function ordenarPor(por: ColumnaOrden) {
    // Primer clic en una columna nueva: nombre ascendente, el resto
    // descendente, que es como se quiere ver cada una.
    setOrden((prev) => prev.por === por
      ? { por, desc: !prev.desc }
      : { por, desc: por !== "nombre" });
  }

  if (status === "loading") {
    return <main className="page-wrap"><p className="text-sm text-slate-500">Cargando…</p></main>;
  }
  if (!esAdmin) {
    return (
      <main className="page-wrap">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <h1 className="dashboard-title font-display font-bold text-slate-900">Radar Salarial.</h1>
          <p className="dashboard-lead mt-3 text-slate-600">Esta pantalla es solo para administradores.</p>
        </section>
      </main>
    );
  }


  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <Link href="/market-analyzer/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft size={15} /> Administración
          </Link>
          <div className="eyebrow mb-3">Radar Salarial</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Radar Salarial.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            El reporte suelto de un cargo o de un grado. Acá se decide de qué corte sale, cuántos puede
            bajar cada empresa por trimestre y a quién se le habilita.
          </p>
        </section>

        {error && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {aviso && !error && (
          <p className="flex items-center gap-1.5 rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
            <Check className="h-4 w-4" /> {aviso}
          </p>
        )}

        {/* ── Lo que vale para todos ──────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <h2 className="font-display mb-5 text-xl font-bold text-slate-900">Configuración general</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="radar-corte" className="field-label">Corte del que sale el Radar</label>
              <select
                id="radar-corte"
                value={datos?.corte ?? ""}
                onChange={(e) => void guardar({ corte: e.target.value }, "corte")}
                disabled={!datos || guardando === "corte"}
                className="field-select"
              >
                <option value="">Sin elegir — el Radar no se puede generar</option>
                {(datos?.cortes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.label} — {c.date}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                Solo aparecen los cortes publicados. Cambiarlo afecta a los informes NUEVOS: los ya
                emitidos guardan sus propias cifras y no se mueven.
              </p>
            </div>

            <div>
              <label htmlFor="radar-cupo" className="field-label">
                Informes por trimestre {datos && <span className="font-normal text-slate-400">· trimestre en curso: {datos.trimestre}</span>}
              </label>
              <input
                id="radar-cupo"
                type="number"
                min={0}
                max={100}
                defaultValue={datos?.cupoGeneral ?? 0}
                key={`cupo-${datos?.cupoGeneral}`}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (datos && Number.isFinite(n) && n !== datos.cupoGeneral) void guardar({ cupoGeneral: n }, "cupoGeneral");
                }}
                disabled={!datos || guardando === "cupoGeneral"}
                className="field"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                El tope que vale para toda empresa que no tenga uno propio. Se repone solo al empezar
                el trimestre siguiente.
              </p>
            </div>
          </div>
        </section>

        {/* ── Empresa por empresa ─────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-slate-900">
              Empresas {datos && <span className="font-normal text-slate-400">· {empresas.filter((e) => e.habilitado).length} habilitadas</span>}
            </h2>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar empresa"
              aria-label="Buscar empresa"
              className="field w-56"
            />
          </div>

          {cargando && <p className="flex items-center gap-1.5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>}

          {!cargando && empresas.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              {busqueda ? "Ninguna empresa coincide con la búsqueda." : "No hay empresas cargadas."}
            </p>
          )}

          {empresas.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[38rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <Cabecera por="nombre" orden={orden} onOrdenar={ordenarPor}>Empresa</Cabecera>
                    <Cabecera por="habilitado" orden={orden} onOrdenar={ordenarPor}>Radar</Cabecera>
                    <Cabecera por="cupo" orden={orden} onOrdenar={ordenarPor}>Cupo propio</Cabecera>
                    <Cabecera por="usados" orden={orden} onOrdenar={ordenarPor} alineada="derecha">
                      Usados este trimestre
                    </Cabecera>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {empresas.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5 text-slate-800">{e.name}</td>
                      <td className="px-4 py-2.5">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={e.habilitado}
                            onChange={(ev) => void guardar({ empresa: { id: e.id, habilitado: ev.target.checked } }, e.id)}
                            disabled={guardando === e.id}
                            className="h-4 w-4 accent-[#1B4965]"
                          />
                          <span className={e.habilitado ? "text-teal-700" : "text-slate-500"}>
                            {e.habilitado ? "Habilitado" : "Deshabilitado"}
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          aria-label={`Cupo propio de ${e.name}`}
                          defaultValue={e.cupo ?? ""}
                          key={`${e.id}-${e.cupo ?? "general"}`}
                          placeholder={`General (${datos?.cupoGeneral ?? 0})`}
                          onBlur={(ev) => {
                            const t = ev.target.value.trim();
                            const n = t === "" ? null : Number(t);
                            if (n !== e.cupo) void guardar({ empresa: { id: e.id, cupo: n } }, e.id);
                          }}
                          disabled={guardando === e.id}
                          className="field w-32 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">
                        {e.usados}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500">
            <Radar className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Para bajar un Radar, la empresa además debe tener completa su ficha y el contacto de RR.HH.
          </p>
        </section>
      </div>
    </main>
  );
}
