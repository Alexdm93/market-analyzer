"use client";

/**
 * La Biblioteca de Descargas tal como la ve una empresa.
 *
 * Solo lista lo que esa empresa puede bajar: el servidor filtra antes de
 * devolver nada. La descarga va por `/api/biblioteca/descargar`, que vuelve a
 * comprobar el permiso y redirige a un enlace que vence en un minuto.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, FileText, Loader2 } from "lucide-react";

import { etiquetaDeTipo, pesoLegible } from "@/lib/archivos";
import type { DocumentoVisible } from "@/app/api/biblioteca/route";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BibliotecaPage() {
  const [documentos, setDocumentos] = useState<DocumentoVisible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/biblioteca", { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as { documentos?: DocumentoVisible[]; message?: string } | null;
      if (!res.ok || !Array.isArray(d?.documentos)) {
        setError(d?.message ?? "No se pudo cargar la biblioteca.");
        return;
      }
      setDocumentos(d.documentos);
    } catch {
      setError("No se pudo cargar la biblioteca.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Market Analyzer</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Biblioteca.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Plantillas, glosarios y los documentos que AC Consulting preparó para tu empresa.
          </p>
        </section>

        {error && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        ) : documentos.length === 0 ? (
          <section className="surface-panel rounded-[2rem] p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">Todavía no hay documentos disponibles para tu empresa.</p>
          </section>
        ) : (
          <section className="surface-panel overflow-hidden rounded-[2rem]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Documento</th>
                    <th className="px-5 py-3 font-semibold">Tipo</th>
                    <th className="px-5 py-3 text-right font-semibold">Tamaño</th>
                    <th className="px-5 py-3 font-semibold">Publicado</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documentos.map((d) => (
                    <tr key={d.id}>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-800">{d.nombre}</div>
                        {d.descripcion && (
                          <div className="mt-0.5 text-xs leading-5 text-slate-500">{d.descripcion}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{etiquetaDeTipo(d.tipo, d.nombre)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{pesoLegible(d.tamano)}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-600">{fecha(d.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {/* Enlace normal y no fetch: el servidor redirige al
                            enlace firmado y el navegador lo descarga solo. */}
                        <a href={`/api/biblioteca/descargar?id=${encodeURIComponent(d.id)}`}
                          className="btn btn-secondary btn-sm whitespace-nowrap">
                          <Download className="h-4 w-4" /> Descargar
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
