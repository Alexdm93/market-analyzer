"use client";

/**
 * La galería de videotutoriales.
 *
 * La usan el Centro de Ayuda y la Academia C&B sin cambios: lo único que
 * reciben distinto es la categoría. Si alguna de las dos necesitara algo
 * propio, va por configuración y no por una copia del componente
 * (AC Consulting, 2026-10-27).
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, PlayCircle } from "lucide-react";

import { SECCIONES, idDeYouTube, type CategoriaRecurso, type RecursoFila } from "@/lib/recursos-formacion";

export default function GaleriaRecursos({ categoria }: { categoria: CategoriaRecurso }) {
  const [recursos, setRecursos] = useState<RecursoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const seccion = SECCIONES[categoria];

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`/api/recursos?categoria=${categoria}`, { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as { recursos?: RecursoFila[]; message?: string } | null;
      if (!res.ok || !Array.isArray(d?.recursos)) {
        setError(d?.message ?? "No se pudo cargar la sección.");
        return;
      }
      setRecursos(d.recursos);
    } catch {
      setError("No se pudo cargar la sección.");
    } finally {
      setCargando(false);
    }
  }, [categoria]);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Market Analyzer</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">
            {seccion.titulo}.
          </h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">{seccion.bajada}</p>
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
        ) : recursos.length === 0 ? (
          <section className="surface-panel rounded-[2rem] p-8 text-center">
            <PlayCircle className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">{seccion.vacio}</p>
          </section>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {recursos.map((r) => (
              <Tarjeta key={r.id} recurso={r} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Tarjeta({ recurso }: { recurso: RecursoFila }) {
  const id = idDeYouTube(recurso.videoUrl);

  return (
    <article className="surface-panel flex flex-col overflow-hidden rounded-[1.75rem]">
      <div className="aspect-video w-full bg-slate-900">
        {id ? (
          <iframe
            src={`https://www.youtube.com/embed/${id}`}
            title={recurso.titulo}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="h-full w-full border-0"
          />
        ) : (
          // El servidor no deja guardar una URL que no sea de YouTube, pero si
          // alguna quedó de antes, la tarjeta lo dice en vez de salir en negro.
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            El enlace de este video no es válido.
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h2 className="font-display text-base font-bold leading-snug text-slate-900">{recurso.titulo}</h2>
        {recurso.descripcion && (
          <p className="text-sm leading-6 text-slate-600">{recurso.descripcion}</p>
        )}
      </div>
    </article>
  );
}
