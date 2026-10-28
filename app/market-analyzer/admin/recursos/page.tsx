"use client";

/**
 * El panel de los videotutoriales: Centro de Ayuda y Academia C&B.
 *
 * Una sola pantalla con las dos secciones en pestañas, porque es el mismo
 * trabajo: pegar un enlace de YouTube, ponerle título y publicarlo. Lo que
 * está sin publicar queda guardado pero no se le muestra a nadie.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2, X } from "lucide-react";

import {
  CATEGORIAS_RECURSO, SECCIONES, idDeYouTube,
  type CategoriaRecurso, type RecursoFila,
} from "@/lib/recursos-formacion";

const VACIO = { titulo: "", descripcion: "", videoUrl: "" };

export default function AdminRecursosPage() {
  const [recursos, setRecursos] = useState<RecursoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [categoria, setCategoria] = useState<CategoriaRecurso>("ayuda");
  const [nuevo, setNuevo] = useState(VACIO);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/recursos", { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as { recursos?: RecursoFila[]; message?: string } | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo cargar."); return; }
      setRecursos(d?.recursos ?? []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function llamar(metodo: "POST" | "PATCH", cuerpo: Record<string, unknown>, marca: string) {
    setTrabajando(marca);
    setError("");
    setAviso("");
    try {
      const res = await fetch("/api/admin/recursos", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const d = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo guardar."); return false; }
      await cargar();
      return true;
    } finally {
      setTrabajando("");
    }
  }

  async function crear() {
    setCreando(true);
    const ok = await llamar("POST", { ...nuevo, categoria, publicado: false }, "nuevo");
    setCreando(false);
    if (ok) { setNuevo(VACIO); setAviso("Tutorial agregado. Publícalo cuando esté listo."); }
  }

  async function borrar(r: RecursoFila) {
    if (!window.confirm(`¿Eliminar «${r.titulo}»? No se puede deshacer.`)) return;
    setTrabajando(r.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/recursos?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(d?.message ?? "No se pudo eliminar."); return;
      }
      await cargar();
    } finally {
      setTrabajando("");
    }
  }

  const delaSeccion = recursos.filter((r) => r.categoria === categoria);
  const urlValida = idDeYouTube(nuevo.videoUrl) !== null;
  const puedeCrear = nuevo.titulo.trim().length >= 3 && urlValida;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Administración</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">
            Videotutoriales.
          </h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Los videos del Centro de Ayuda y de la Academia C&amp;B. Son enlaces de YouTube: no se
            sube nada a la plataforma. Lo que no esté publicado queda guardado y no lo ve nadie.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist">
            {CATEGORIAS_RECURSO.map((c) => (
              <button
                key={c} type="button" role="tab" aria-selected={categoria === c}
                onClick={() => setCategoria(c)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  categoria === c ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {SECCIONES[c].titulo}
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold ${
                  categoria === c ? "bg-white/20" : "bg-slate-100 text-slate-600"
                }`}>
                  {recursos.filter((r) => r.categoria === c).length}
                </span>
              </button>
            ))}
          </div>
        </section>

        {error && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {aviso && (
          <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">{aviso}</p>
        )}

        <section className="surface-panel rounded-[2rem] p-6">
          <h2 className="font-display text-base font-bold text-slate-900">
            Agregar a {SECCIONES[categoria].titulo}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="rec-titulo">Título</label>
              <input id="rec-titulo" className="field" value={nuevo.titulo}
                onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor="rec-url">Enlace de YouTube</label>
              <input id="rec-url" className="field" value={nuevo.videoUrl}
                placeholder="https://www.youtube.com/watch?v=..."
                onChange={(e) => setNuevo({ ...nuevo, videoUrl: e.target.value })} />
              {nuevo.videoUrl && !urlValida && (
                <p className="mt-1 text-xs text-red-600">Ese enlace no es de YouTube.</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="field-label" htmlFor="rec-desc">Descripción</label>
              <textarea id="rec-desc" className="field min-h-20" rows={2} value={nuevo.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
            </div>
          </div>
          <button type="button" onClick={() => void crear()} disabled={!puedeCrear || creando}
            className="btn btn-primary btn-sm mt-4">
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creando ? "Agregando…" : "Agregar"}
          </button>
        </section>

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        ) : delaSeccion.length === 0 ? (
          <p className="surface-panel rounded-[2rem] p-8 text-center text-sm text-slate-500">
            Nada en esta sección todavía.
          </p>
        ) : (
          <section className="space-y-3">
            {delaSeccion.map((r, i) => (
              <article key={r.id} className="surface-panel rounded-[1.75rem] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-bold text-slate-900">{r.titulo}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                        r.publicado ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {r.publicado ? "Publicado" : "Borrador"}
                      </span>
                    </div>
                    {r.descripcion && <p className="mt-1 text-sm leading-6 text-slate-600">{r.descripcion}</p>}
                    <p className="mt-1 break-all text-xs text-slate-400">{r.videoUrl}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={trabajando === r.id}
                    onClick={() => void llamar("PATCH", { id: r.id, publicado: !r.publicado }, r.id)}
                    className="btn btn-secondary btn-sm">
                    {r.publicado ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    {r.publicado ? "Despublicar" : "Publicar"}
                  </button>
                  <button type="button" disabled={trabajando === r.id || i === 0}
                    onClick={() => void llamar("PATCH", { id: r.id, mover: "arriba" }, r.id)}
                    className="btn btn-secondary btn-sm" aria-label="Subir">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={trabajando === r.id || i === delaSeccion.length - 1}
                    onClick={() => void llamar("PATCH", { id: r.id, mover: "abajo" }, r.id)}
                    className="btn btn-secondary btn-sm" aria-label="Bajar">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={trabajando === r.id} onClick={() => void borrar(r)}
                    className="btn btn-secondary btn-sm text-red-600">
                    <Trash2 className="h-4 w-4" /> Eliminar
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
