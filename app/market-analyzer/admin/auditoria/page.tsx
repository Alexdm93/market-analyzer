"use client";

/**
 * Control de calidad del mercado.
 *
 * Cada informe del Estudio de Competitividad deja la foto de su matriz: la cruda
 * que llegó del corte y la suavizada que vio el cliente. Acá se buscan y se
 * baja el Excel de control, que las enfrenta y muestra qué tocó el algoritmo.
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw, ScanSearch } from "lucide-react";

import type { AuditoriaFila } from "@/app/api/admin/auditoria-suavizado/route";
import { SelectorBuscador } from "@/components/SelectorBuscador";

type AdminSnapshot = { id: string; label: string; date: string };

const NOMBRE_METRICA: Record<string, string> = {
  sinPasivosMensual: "TEM",
  directoMensualizado: "TEMz",
  conPasivosMensual: "CIM",
  conPasivosAnual: "PCTA",
};

function cuando(iso: string) {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function AuditoriaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [filas, setFilas] = useState<AuditoriaFila[]>([]);
  const [snapshots, setSnapshots] = useState<AdminSnapshot[]>([]);
  const [cargando, setCargando] = useState(true);

  const [empresa, setEmpresa] = useState("");
  const [snapshotId, setSnapshotId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") router.replace("/");
  }, [status, session, router]);

  useEffect(() => {
    void fetch("/api/admin/study", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { snapshots?: AdminSnapshot[] } | null) => setSnapshots(d?.snapshots ?? []))
      .catch(() => setSnapshots([]));
  }, []);

  const buscar = useCallback(async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams();
      if (empresa.trim()) p.set("empresa", empresa.trim());
      if (snapshotId) p.set("snapshotId", snapshotId);
      if (desde) p.set("desde", desde);
      if (hasta) p.set("hasta", hasta);

      const res = await fetch(`/api/admin/auditoria-suavizado?${p.toString()}`, { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as { auditorias?: AuditoriaFila[] } | null;
      setFilas(d?.auditorias ?? []);
    } finally {
      setCargando(false);
    }
  }, [empresa, snapshotId, desde, hasta]);

  useEffect(() => { void buscar(); }, [buscar]);

  const conAjustesRaros = filas.filter((f) => f.resumen.sinSuavizar > 0).length;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-5">

        <section className="surface-panel overflow-hidden rounded-[1.75rem] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow mb-1.5">Admin · Control de calidad</div>
              <h1 className="font-display text-[1.2rem] font-bold tracking-tight text-slate-900 md:text-[1.35rem]">
                Suavizado de mercado
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Qué matriz recibió cada cliente y qué le hizo el algoritmo. El cliente solo ve el resultado final.
              </p>
            </div>
            <button onClick={() => void buscar()} disabled={cargando} className="btn btn-secondary flex items-center gap-1.5">
              <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="metric-tile py-2.5 w-44 shrink-0">
              <div className="metric-label">Informes auditados</div>
              <div className="metric-value mt-1">{filas.length}</div>
            </div>
            <div className="metric-tile py-2.5 w-44 shrink-0">
              <div className="metric-label">Con percentiles sin suavizar</div>
              <div className={`metric-value mt-1 ${conAjustesRaros > 0 ? "text-amber-600" : ""}`}>{conAjustesRaros}</div>
            </div>
          </div>
        </section>

        <section className="surface-card rounded-[2rem] p-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label htmlFor="aud-empresa" className="field-label">Cliente</label>
              <input
                id="aud-empresa"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                placeholder="Nombre de la empresa"
                className="field"
              />
            </div>
            <div>
              <label htmlFor="aud-corte" className="field-label">Estudio</label>
              <SelectorBuscador
                id="aud-corte"
                value={snapshotId}
                onChange={setSnapshotId}
                opciones={[{ value: "", label: "Todos" }, ...snapshots.map((s) => ({ value: s.id, label: `${s.label} (${s.date})` }))]}
                placeholder="Todos"
              />
            </div>
            <div>
              <label htmlFor="aud-desde" className="field-label">Desde</label>
              <input id="aud-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="field" />
            </div>
            <div>
              <label htmlFor="aud-hasta" className="field-label">Hasta</label>
              <input id="aud-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="field" />
            </div>
          </div>
        </section>

        <section className="surface-card overflow-hidden rounded-[2rem]">
          {cargando && filas.length === 0 ? (
            <div className="flex flex-col gap-2 p-6">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-[1rem] bg-slate-100" />)}
            </div>
          ) : filas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScanSearch size={32} className="mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Ningún informe coincide con la búsqueda</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[0.6rem] font-extrabold uppercase tracking-[0.13em] text-slate-400">
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-5 py-3">Estudio</th>
                    <th className="px-5 py-3">Grupo</th>
                    <th className="px-5 py-3">Qué se ajustó</th>
                    <th className="px-5 py-3">Generado</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={f.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{f.empresa}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{NOMBRE_METRICA[f.metrica] ?? f.metrica}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{f.corte}</td>
                      <td className="px-5 py-3.5 text-slate-600">{f.grupoComparacion}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <span className="tabular-nums">{f.resumen.suavizadas}</span> suavizadas ·{" "}
                        <span className="tabular-nums">{f.resumen.imputadas}</span> imputadas ·{" "}
                        <span className="tabular-nums">{f.resumen.reordenadas}</span> reordenadas
                        {f.resumen.sinSuavizar > 0 && (
                          <div className="mt-1 font-semibold text-amber-700">
                            {f.resumen.sinSuavizar} percentiles sin suavizar
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        {cuando(f.createdAt)}
                        {f.generadoPor && <div className="mt-0.5 text-slate-400">{f.generadoPor}</div>}
                      </td>
                      <td className="px-5 py-3.5">
                        <a
                          href={`/api/admin/auditoria-suavizado?id=${encodeURIComponent(f.id)}`}
                          className="btn btn-secondary btn-xs flex w-fit items-center gap-1.5"
                        >
                          <Download size={12} /> Excel de control
                        </a>
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
