"use client";

/**
 * Donde el cliente baja el Informe General de Tendencias Salariales.
 *
 * Tres decisiones y un botón: de qué corte, con qué métrica y si lo quiere
 * expresado al tipo de cambio de referencia. Los percentiles no se piden desde
 * acá: los calcula el servidor al armar el Excel.
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { isAdminRole } from "@/lib/roles";
import { SelectorBuscador } from "@/components/SelectorBuscador";

type Corte = { id: string; label: string; date: string };
type InformeBeneficios = { id: string; titulo: string };
type CompanyOption = { id: string; name: string };

const METRICAS = [
  { valor: "sinPasivosMensual", etiqueta: "Total Efectivo Mensual (TEM)", pie: "Lo que se cobra en un mes ordinario, sin alícuotas." },
  { valor: "directoMensualizado", etiqueta: "Total Efectivo Mensualizado (TEMz)", pie: "El efectivo del año llevado a un mes promedio." },
  { valor: "conPasivosMensual", etiqueta: "Compensación Integral Mensualizada (CIM)", pie: "El TEMz más las alícuotas de los pasivos laborales." },
  { valor: "conPasivosAnual", etiqueta: "Paquete de Compensación Total Anual (PCTA)", pie: "El paquete completo proyectado a doce meses." },
] as const;

export default function InformeGeneralPage() {
  const { data: session } = useSession();
  const esAdmin = isAdminRole(session?.user?.role);

  const [empresas, setEmpresas] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [beneficios, setBeneficios] = useState<InformeBeneficios[]>([]);
  const [snapshotId, setSnapshotId] = useState("");
  const [metrica, setMetrica] = useState<string>("conPasivosMensual");
  const [tcrActivo, setTcrActivo] = useState(false);
  const [tcrTipo, setTcrTipo] = useState("bcv");
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!esAdmin) return;
    void fetch("/api/companies", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { companies?: CompanyOption[] } | null) => setEmpresas(d?.companies ?? []))
      .catch(() => setEmpresas([]));
  }, [esAdmin]);

  const cargar = useCallback(async () => {
    const q = esAdmin && companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    const res = await fetch(`/api/estudio/informe-general${q}`, { cache: "no-store" }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { cortes?: Corte[]; beneficios?: InformeBeneficios[] } | null;
    setCortes(d?.cortes ?? []);
    setBeneficios(d?.beneficios ?? []);
    setSnapshotId((prev) => (d?.cortes?.some((c) => c.id === prev) ? prev : d?.cortes?.[0]?.id ?? ""));
  }, [esAdmin, companyId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function descargar() {
    if (!snapshotId) return;
    setBajando(true);
    setError("");
    try {
      const res = await fetch("/api/estudio/informe-general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(esAdmin && companyId ? { companyId } : {}),
          snapshotId,
          metrica,
          tcr: tcrActivo ? { tipo: tcrTipo } : null,
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
      a.download = "Informe General de Tendencias Salariales.xlsx";
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

  const sinCortes = cortes.length === 0;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-5">

        <section className="surface-panel overflow-hidden rounded-[1.75rem] p-4 md:p-5">
          <div className="eyebrow mb-1.5">Informe general</div>
          <h1 className="font-display text-[1.2rem] font-bold tracking-tight text-slate-900 md:text-[1.35rem]">
            Informe General de Tendencias Salariales
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            El mercado completo del corte, cargo por cargo, con los cinco percentiles más promedio, mínimo y máximo.
          </p>

          {esAdmin && (
            <div className="mt-4 max-w-md">
              <label htmlFor="ig-empresa" className="field-label">Empresa</label>
              <SelectorBuscador
                id="ig-empresa"
                value={companyId}
                onChange={setCompanyId}
                opciones={[{ value: "", label: "Sin empresa (genérico)" }, ...empresas.map((e) => ({ value: e.id, label: e.name }))]}
                placeholder="Sin empresa (genérico)"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Como admin ves todos los cortes. La empresa elegida es la que sale en la portada.
              </p>
            </div>
          )}
        </section>

        <section className="surface-card rounded-[2rem] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-100 p-3 text-slate-700"><FileSpreadsheet size={18} aria-hidden /></div>
            <h2 className="font-display text-xl font-bold text-slate-900">Armar el informe</h2>
          </div>

          {sinCortes ? (
            <p className="mt-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-6 text-sm text-slate-500">
              Tu empresa todavía no tiene habilitado ningún corte para el informe general.
            </p>
          ) : (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="ig-corte" className="field-label">Estudio de mercado</label>
                  <SelectorBuscador
                    id="ig-corte"
                    value={snapshotId}
                    onChange={setSnapshotId}
                    opciones={cortes.map((c) => ({ value: c.id, label: `${c.label} (${c.date})` }))}
                    placeholder="Elige el corte"
                  />
                </div>

                <div>
                  <label htmlFor="ig-metrica" className="field-label">Métrica</label>
                  <select
                    id="ig-metrica"
                    value={metrica}
                    onChange={(e) => setMetrica(e.target.value)}
                    className="field-select"
                  >
                    {METRICAS.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {METRICAS.find((m) => m.valor === metrica)?.pie}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <input type="checkbox" checked={tcrActivo} onChange={(e) => setTcrActivo(e.target.checked)} />
                  Expresar las cifras al tipo de cambio de referencia (TCR)
                </label>
                {tcrActivo && (
                  <div className="mt-3 max-w-xs">
                    <label htmlFor="ig-tcr" className="field-label">Tipo de cambio</label>
                    <select id="ig-tcr" value={tcrTipo} onChange={(e) => setTcrTipo(e.target.value)} className="field-select">
                      <option value="bcv">BCV — dólar</option>
                      <option value="euro">BCV — euro</option>
                      <option value="libre">Libre</option>
                    </select>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Se usa la tasa que cada empresa tenía guardada al enviar su data, no la de hoy.
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <p className="mt-4 flex items-center gap-1.5 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4" /> {error}
                </p>
              )}

              <button
                onClick={() => void descargar()}
                disabled={bajando || !snapshotId}
                className="btn btn-primary mt-5 flex items-center gap-1.5"
              >
                {bajando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {bajando ? "Generando…" : "Descargar Excel"}
              </button>

              <p className="mt-3 text-xs text-slate-500">
                Un cargo entra al informe cuando al menos cuatro empresas lo reportaron. Si no alcanza para un
                percentil en particular, esa casilla sale como ND.
              </p>
            </>
          )}
        </section>

        {beneficios.length > 0 && (
          <section className="surface-card rounded-[2rem] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 p-3 text-slate-700"><FileText size={18} aria-hidden /></div>
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">Beneficios no salariales</h2>
                <p className="text-sm text-slate-500">
                  {beneficios.length === 1
                    ? "El informe de prácticas y beneficios que tienes disponible."
                    : "Los informes de prácticas y beneficios que tienes disponibles."}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {beneficios.map((b) => (
                <article key={b.id} className="metric-tile flex flex-col gap-3">
                  <div className="font-display text-base font-bold text-slate-900">{b.titulo}</div>
                  <a
                    href={`/api/estudio/informe-beneficios?id=${encodeURIComponent(b.id)}`}
                    className="btn btn-secondary flex w-fit items-center gap-1.5"
                  >
                    <Download size={14} /> Descargar PDF
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
