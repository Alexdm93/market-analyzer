"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Download, FileSpreadsheet, Loader2, Search } from "lucide-react";

type AdminSnapshot = { id: string; label: string; date: string; published?: boolean };
type CompanyOption = { id: string; name: string; economicSector?: string; classification?: string; headcount?: string };

type GrupoMetrica = { n: number; min: number | null; max: number | null; p50: number | null; promedio: number | null };

type Conteo = {
  corte: string;
  empresas: number;
  enviadas: number;
  cargos: number;
  detalle: Array<{ nombre: string; sector: string; subsector: string; cargos: number; enviado: boolean }>;
};

function norm(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

export default function ReportesPage() {
  const [snapshots, setSnapshots] = useState<AdminSnapshot[]>([]);
  const [empresas, setEmpresas] = useState<CompanyOption[]>([]);

  const [snapshotId, setSnapshotId] = useState("");
  const [sector, setSector] = useState("");
  const [subsector, setSubsector] = useState("");
  const [headcountMin, setHeadcountMin] = useState("");
  const [headcountMax, setHeadcountMax] = useState("");
  const [soloEnviados, setSoloEnviados] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);

  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [generandoCortesia, setGenerandoCortesia] = useState(false);
  const [empresaCortesia, setEmpresaCortesia] = useState("");

  useEffect(() => {
    void fetch("/api/admin/study", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { snapshots?: AdminSnapshot[] } | null) => setSnapshots(d?.snapshots ?? []))
      .catch(() => setSnapshots([]));

    void fetch("/api/companies", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { companies?: CompanyOption[] } | null) => setEmpresas(d?.companies ?? []))
      .catch(() => setEmpresas([]));
  }, []);

  const sectores = useMemo(
    () => [...new Set(empresas.map((e) => e.economicSector).filter((s): s is string => Boolean(s)))].sort((a, b) => a.localeCompare(b, "es")),
    [empresas],
  );

  const subsectores = useMemo(() => {
    const base = sector ? empresas.filter((e) => e.economicSector === sector) : empresas;
    return [...new Set(base.map((e) => e.classification).filter((s): s is string => Boolean(s)))].sort((a, b) => a.localeCompare(b, "es"));
  }, [empresas, sector]);

  const empresasVisibles = useMemo(() => {
    const q = norm(busqueda);
    return empresas
      .filter((e) => (!sector || e.economicSector === sector))
      .filter((e) => (!subsector || e.classification === subsector))
      .filter((e) => (!q || norm(e.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [empresas, sector, subsector, busqueda]);

  const parametros = useCallback(() => {
    const p = new URLSearchParams({ snapshotId });
    if (sector) p.set("sectores", sector);
    if (subsector) p.set("subsectores", subsector);
    if (seleccionadas.length > 0) p.set("empresas", seleccionadas.join(","));
    if (headcountMin.trim()) p.set("headcountMin", headcountMin.trim());
    if (headcountMax.trim()) p.set("headcountMax", headcountMax.trim());
    if (soloEnviados) p.set("soloEnviados", "1");
    return p;
  }, [snapshotId, sector, subsector, seleccionadas, headcountMin, headcountMax, soloEnviados]);

  // Cambiar cualquier filtro invalida el conteo anterior.
  const filtrosKey = parametros().toString();
  useEffect(() => { setConteo(null); setError(""); }, [filtrosKey]);

  async function verAlcance() {
    if (!snapshotId) return;
    setCargando(true);
    setError("");
    try {
      const p = parametros();
      p.set("tipo", "conteo");
      const res = await fetch(`/api/admin/reportes?${p.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as (Conteo & { message?: string }) | null;
      if (!res.ok || !data) {
        setError(data?.message ?? `No se pudo calcular el alcance (error ${res.status}).`);
        return;
      }
      setConteo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular el alcance.");
    } finally {
      setCargando(false);
    }
  }

  /**
   * El informe de cortesía se arma rellenando la plantilla del cliente. Los
   * percentiles salen de /api/percentiles —la misma ruta que alimenta
   * Resultados— y se le pasan al servidor ya calculados, para que el informe y
   * la pantalla no puedan decir cosas distintas.
   */
  async function generarCortesia() {
    if (!snapshotId) return;
    setGenerandoCortesia(true);
    setError("");
    try {
      const resPct = await fetch(`/api/percentiles?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" });
      const pct = (await resPct.json().catch(() => null)) as { grupos?: Array<Record<string, GrupoMetrica>> ; message?: string } | null;
      if (!resPct.ok || !pct?.grupos) {
        setError((pct as { message?: string } | null)?.message ?? "No se pudieron obtener los percentiles del corte.");
        return;
      }

      // El CEO pidió las cuatro métricas, no una: TEM, TEMz, CIM y PCTA.
      type GrupoPct = {
        tituloCargo: string; n: number;
        sinPasivosMensual: GrupoMetrica; directoMensualizado: GrupoMetrica;
        conPasivosMensual: GrupoMetrica; conPasivosAnual: GrupoMetrica;
      };
      const stat = (m: GrupoMetrica | undefined) => ({
        p50: m?.p50 ?? null, promedio: m?.promedio ?? null,
        min: m?.min ?? null, max: m?.max ?? null,
      });
      const cargos = (pct.grupos as unknown as GrupoPct[]).map((g) => ({
        tituloCargo: g.tituloCargo,
        n: g.n,
        tem:  stat(g.sinPasivosMensual),
        temz: stat(g.directoMensualizado),
        cim:  stat(g.conPasivosMensual),
        pcta: stat(g.conPasivosAnual),
      }));

      const res = await fetch("/api/estudio/informe-cortesia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, companyId: empresaCortesia || undefined, cargos }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? `No se pudo generar el informe (error ${res.status}).`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Informe de cortesia - ${conteo?.corte ?? snapshotId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el informe.");
    } finally {
      setGenerandoCortesia(false);
    }
  }

  function urlReporte(tipo: "empresas" | "grados") {
    const p = parametros();
    p.set("tipo", tipo);
    return `/api/admin/reportes?${p.toString()}`;
  }

  const listo = Boolean(snapshotId) && (conteo?.empresas ?? 0) > 0;

  function alternar(id: string) {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Administración</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Reportes de revisión.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Dos Excel para revisar la data de un corte antes de publicarlo. Solo leen: no modifican nada.
          </p>
        </section>

        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-slate-100 p-2 text-slate-700"><Search size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">Qué entra en el reporte</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="rep-corte" className="field-label">Corte</label>
              <select id="rep-corte" value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} className="field-select">
                <option value="">Selecciona un corte</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>{s.label} — {s.date}{s.published ? " · publicado" : ""}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rep-sector" className="field-label">Sector</label>
              <select
                id="rep-sector"
                value={sector}
                onChange={(e) => { setSector(e.target.value); setSubsector(""); setSeleccionadas([]); }}
                className="field-select"
              >
                <option value="">Todos</option>
                {sectores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="rep-subsector" className="field-label">Subsector</label>
              <select
                id="rep-subsector"
                value={subsector}
                onChange={(e) => { setSubsector(e.target.value); setSeleccionadas([]); }}
                className="field-select"
              >
                <option value="">Todos</option>
                {subsectores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="rep-hc-min" className="field-label">Tamaño — headcount desde</label>
              <input id="rep-hc-min" type="number" min="0" value={headcountMin} onChange={(e) => setHeadcountMin(e.target.value)} className="field" placeholder="sin mínimo" />
            </div>

            <div>
              <label htmlFor="rep-hc-max" className="field-label">Tamaño — headcount hasta</label>
              <input id="rep-hc-max" type="number" min="0" value={headcountMax} onChange={(e) => setHeadcountMax(e.target.value)} className="field" placeholder="sin máximo" />
            </div>

            <div className="flex items-end">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={soloEnviados} onChange={(e) => setSoloEnviados(e.target.checked)} className="mt-1" />
                <span>Solo las empresas que ya <strong>enviaron</strong> el corte</span>
              </label>
            </div>
          </div>

          {/* Empresas puntuales */}
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="field-label mb-0">Empresas</span>
              <span className="text-xs text-slate-500">
                {seleccionadas.length === 0
                  ? "Todas las que cumplan los filtros de arriba"
                  : `${seleccionadas.length} ${seleccionadas.length === 1 ? "empresa elegida" : "empresas elegidas"}`}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre…"
                aria-label="Buscar empresa por nombre"
                className="field max-w-xs"
              />
              <button type="button" onClick={() => setSeleccionadas(empresasVisibles.map((e) => e.id))} className="btn btn-secondary text-xs">
                Elegir las {empresasVisibles.length} visibles
              </button>
              {seleccionadas.length > 0 && (
                <button type="button" onClick={() => setSeleccionadas([])} className="btn btn-secondary text-xs">
                  Quitar selección
                </button>
              )}
            </div>

            <div className="mt-3 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 p-3">
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {empresasVisibles.map((e) => (
                  <label key={e.id} className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={seleccionadas.includes(e.id)} onChange={() => alternar(e.id)} className="mt-1" />
                    <span className="truncate" title={e.name}>{e.name}</span>
                  </label>
                ))}
                {empresasVisibles.length === 0 && (
                  <p className="text-xs text-slate-500">Ninguna empresa cumple con esos filtros.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void verAlcance()} disabled={!snapshotId || cargando} className="btn btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
              {cargando ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />} Ver qué entra
            </button>
            {error && <span className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {error}</span>}
          </div>

          {conteo && (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: "Empresas", v: conteo.empresas },
                  { k: "Ya enviaron", v: conteo.enviadas },
                  { k: "Cargos", v: conteo.cargos },
                  { k: "Hojas del reporte 1", v: conteo.empresas + 1 },
                ].map((item) => (
                  <div key={item.k} className="rounded-2xl bg-slate-50 p-4">
                    <dt className="text-xs text-slate-500">{item.k}</dt>
                    <dd className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900">{item.v}</dd>
                  </div>
                ))}
              </dl>

              {conteo.empresas > 0 && (
                <div className="mt-4 max-h-64 overflow-y-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Empresa</th>
                        <th className="px-4 py-2.5 font-semibold">Sector</th>
                        <th className="px-4 py-2.5 font-semibold">Subsector</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Cargos</th>
                        <th className="px-4 py-2.5 font-semibold">Enviado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {conteo.detalle.map((d) => (
                        <tr key={d.nombre}>
                          <td className="px-4 py-2 text-slate-800">{d.nombre}</td>
                          <td className="px-4 py-2 text-slate-600">{d.sector || "—"}</td>
                          <td className="px-4 py-2 text-slate-600">{d.subsector || "—"}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-slate-700">{d.cargos}</td>
                          <td className="px-4 py-2">
                            <span className={`pill ${d.enviado ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
                              {d.enviado ? "Sí" : "No"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Descargas ─────────────────────────────────────────────────── */}
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-full bg-slate-100 p-2 text-slate-700"><FileSpreadsheet size={16} /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">Los dos reportes</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-display text-base font-bold text-slate-900">1 · Por empresa</h3>
              <p className="mt-1.5 text-sm text-slate-600">
                Una hoja por empresa, con su ficha arriba —sector, subsector, tamaño, días de bono vacacional y de
                utilidades, dónde opera y sus tasas— y debajo una fila por cada elemento de pago de cada cargo, con
                su moneda, frecuencia e impacto en pasivos.
              </p>
              {listo ? (
                <a href={urlReporte("empresas")} className="btn btn-primary mt-4 w-full justify-center">
                  <Download size={16} /> Descargar
                </a>
              ) : (
                <span className="btn btn-primary mt-4 w-full cursor-not-allowed justify-center opacity-50">
                  <Download size={16} /> Descargar
                </span>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-display text-base font-bold text-slate-900">2 · General por grados</h3>
              <p className="mt-1.5 text-sm text-slate-600">
                Una sola hoja con todos los cargos reportados, ordenados por grado: qué empresa lo reportó, su grado,
                familia y nivel CAPRI, y los cuatro montos (TEM, TEMz, CIM y PCTA). Viene con filtros de Excel puestos.
              </p>
              {listo ? (
                <a href={urlReporte("grados")} className="btn btn-primary mt-4 w-full justify-center">
                  <Download size={16} /> Descargar
                </a>
              ) : (
                <span className="btn btn-primary mt-4 w-full cursor-not-allowed justify-center opacity-50">
                  <Download size={16} /> Descargar
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 p-5">
            <h3 className="font-display text-base font-bold text-slate-900">3 · Informe de cortesía</h3>
            <p className="mt-1.5 text-sm text-slate-600">
              El documento que recibe toda empresa que participó y envió su data. Se arma rellenando la plantilla
              del estudio: conserva portada, agradecimiento, páginas institucionales y diseño. Se completan la
              portada, las empresas participantes, la distribución de compensación por nivel y la tabla de Market
              Analyzer con las cuatro métricas (TEM, TEMz, CIM y PCTA).
            </p>
            <div className="mt-3">
              <label htmlFor="rep-cortesia-empresa" className="field-label">Empresa de la portada</label>
              <select
                id="rep-cortesia-empresa"
                value={empresaCortesia}
                onChange={(e) => setEmpresaCortesia(e.target.value)}
                className="field-select"
              >
                <option value="">Sin empresa (documento genérico)</option>
                {empresas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                El contenido es el mismo para todas; esto solo pone su nombre en la portada. Cada empresa también
                puede descargarlo sola desde Resultados una vez publicado el corte.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void generarCortesia()}
              disabled={!snapshotId || generandoCortesia}
              className="btn btn-primary mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generandoCortesia ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Generar y descargar
            </button>
            <p className="mt-2 text-xs text-slate-500">
              No depende de los filtros de arriba: el informe es del corte completo, con todas las empresas que
              enviaron.
            </p>
          </div>

          {!listo && (
            <p className="mt-4 text-xs text-slate-500">
              Elige un corte y dale a <strong>Ver qué entra</strong> para habilitar las descargas.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
