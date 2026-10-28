"use client";

/**
 * La Biblioteca de Descargas, del lado del administrador.
 *
 * Subir va en tres pasos y el del medio no pasa por nuestro servidor: se pide
 * un permiso firmado, el navegador le manda el archivo directo a Supabase y
 * después se registra la ficha. Es lo que permite subir un PDF grande sin
 * chocar con el límite de cuerpo de Vercel (AC Consulting, 2026-10-27).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Globe, Loader2, Lock, Trash2, Upload } from "lucide-react";

import { ListaCasillas } from "@/components/ListaCasillas";
import { etiquetaDeTipo, pesoLegible } from "@/lib/archivos";
import type { DocumentoFila } from "@/app/api/admin/biblioteca/route";

type Empresa = { id: string; name: string };

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminBibliotecaPage() {
  const [documentos, setDocumentos] = useState<DocumentoFila[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [listo, setListo] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState("");

  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [publico, setPublico] = useState(false);
  const [asignadas, setAsignadas] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const campoArchivo = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [resDocs, resEmp] = await Promise.all([
        fetch("/api/admin/biblioteca", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);
      const d = (await resDocs.json().catch(() => null)) as
        { documentos?: DocumentoFila[]; almacenListo?: boolean; message?: string } | null;
      if (!resDocs.ok) { setError(d?.message ?? "No se pudo cargar."); return; }
      setDocumentos(d?.documentos ?? []);
      setListo(d?.almacenListo !== false);
      const e = (await resEmp.json().catch(() => null)) as { companies?: Empresa[] } | null;
      setEmpresas(e?.companies ?? []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  function limpiar() {
    setArchivo(null); setNombre(""); setDescripcion("");
    setPublico(false); setAsignadas([]);
    if (campoArchivo.current) campoArchivo.current.value = "";
  }

  async function subir() {
    if (!archivo) return;
    setSubiendo(true);
    setError("");
    setAviso("");
    try {
      // 1. El permiso de subida.
      const resFirma = await fetch("/api/admin/biblioteca?firmar=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreArchivo: archivo.name }),
      });
      const firma = (await resFirma.json().catch(() => null)) as
        { ruta?: string; url?: string; message?: string } | null;
      if (!resFirma.ok || !firma?.ruta || !firma.url) {
        setError(firma?.message ?? "No se pudo preparar la subida."); return;
      }

      // 2. El archivo, directo a Supabase.
      const resArchivo = await fetch(firma.url, {
        method: "PUT",
        headers: { "Content-Type": archivo.type || "application/octet-stream" },
        body: archivo,
      });
      if (!resArchivo.ok) {
        setError(`El almacén rechazó el archivo (${resArchivo.status}).`); return;
      }

      // 3. La ficha, con el control de acceso.
      const resFicha = await fetch("/api/admin/biblioteca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruta: firma.ruta,
          nombre: nombre.trim() || archivo.name,
          descripcion,
          tipo: archivo.type,
          tamano: archivo.size,
          visibilidad: publico ? "publico" : "asignado",
          empresas: asignadas,
        }),
      });
      const ficha = (await resFicha.json().catch(() => null)) as { message?: string } | null;
      if (!resFicha.ok) { setError(ficha?.message ?? "No se pudo registrar el documento."); return; }

      limpiar();
      setAviso("Documento publicado.");
      await cargar();
    } catch {
      setError("No se pudo subir el documento.");
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(d: DocumentoFila) {
    if (!window.confirm(`¿Eliminar «${d.nombre}»? No se puede deshacer.`)) return;
    setTrabajando(d.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/biblioteca?id=${encodeURIComponent(d.id)}`, { method: "DELETE" });
      const r = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) { setError(r?.message ?? "No se pudo eliminar."); return; }
      if (r?.message) setAviso(r.message);
      await cargar();
    } finally {
      setTrabajando("");
    }
  }

  const puedeSubir = Boolean(archivo) && (publico || asignadas.length > 0);
  const nombresPorId = new Map(empresas.map((e) => [e.id, e.name]));

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Administración</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Biblioteca.</h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Los documentos que pueden descargar las empresas. Cada archivo es público —lo ve
            cualquier empresa registrada— o asignado a las que elijas.
          </p>
        </section>

        {!listo && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Falta configurar el almacén: las variables <strong>SUPABASE_URL</strong> y{" "}
            <strong>SUPABASE_SERVICE_ROLE_KEY</strong>. Hasta entonces no se puede subir nada.
          </p>
        )}
        {error && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {aviso && <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800">{aviso}</p>}

        <section className="surface-panel rounded-[2rem] p-6">
          <h2 className="font-display text-base font-bold text-slate-900">Subir un documento</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="bib-archivo">Archivo</label>
              <input id="bib-archivo" ref={campoArchivo} type="file" className="field"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setArchivo(f);
                  if (f && !nombre.trim()) setNombre(f.name.replace(/\.[^.]+$/, ""));
                }} />
              {archivo && (
                <p className="mt-1 text-xs text-slate-500">
                  {etiquetaDeTipo(archivo.type, archivo.name)} · {pesoLegible(archivo.size)}
                </p>
              )}
            </div>
            <div>
              <label className="field-label" htmlFor="bib-nombre">Nombre visible</label>
              <input id="bib-nombre" className="field" value={nombre}
                onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="field-label" htmlFor="bib-desc">Descripción</label>
              <textarea id="bib-desc" className="field min-h-20" rows={2} value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 p-4">
            <p className="field-label mb-2">Quién puede descargarlo</p>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={publico} className="mt-1"
                onChange={(e) => setPublico(e.target.checked)} />
              <span>
                <strong>Público</strong> — cualquier empresa registrada en la plataforma.
                <span className="block text-xs text-slate-500">
                  Para glosarios, plantillas en blanco y material general.
                </span>
              </span>
            </label>

            {!publico && (
              <div className="mt-4">
                <ListaCasillas
                  titulo="Empresas con acceso"
                  vacio="Ninguna elegida todavía"
                  opciones={empresas.map((e) => e.id)}
                  etiquetas={Object.fromEntries(empresas.map((e) => [e.id, e.name]))}
                  elegidas={asignadas}
                  onToggle={(v) => setAsignadas((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])}
                  onLimpiar={() => setAsignadas([])}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Solo los usuarios de estas empresas verán el documento. Si no eliges ninguna, no
                  lo vería nadie, así que no se puede guardar vacío.
                </p>
              </div>
            )}
          </div>

          <button type="button" onClick={() => void subir()} disabled={!puedeSubir || subiendo || !listo}
            className="btn btn-primary btn-sm mt-4">
            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {subiendo ? "Subiendo…" : "Subir y publicar"}
          </button>
        </section>

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        ) : documentos.length === 0 ? (
          <p className="surface-panel rounded-[2rem] p-8 text-center text-sm text-slate-500">
            Todavía no hay documentos.
          </p>
        ) : (
          <section className="space-y-3">
            {documentos.map((d) => (
              <article key={d.id} className="surface-panel rounded-[1.75rem] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-bold text-slate-900">{d.nombre}</h3>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                        d.visibilidad === "publico" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {d.visibilidad === "publico"
                          ? <><Globe className="h-3 w-3" /> Público</>
                          : <><Lock className="h-3 w-3" /> {d.empresas.length} {d.empresas.length === 1 ? "empresa" : "empresas"}</>}
                      </span>
                    </div>
                    {d.descripcion && <p className="mt-1 text-sm leading-6 text-slate-600">{d.descripcion}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {etiquetaDeTipo(d.tipo, d.nombre)} · {pesoLegible(d.tamano)} · {fecha(d.createdAt)}
                      {d.subidoPor && ` · subido por ${d.subidoPor}`}
                    </p>
                    {d.visibilidad !== "publico" && d.empresas.length > 0 && (
                      <p className="mt-1 text-xs text-slate-400">
                        {d.empresas.map((id) => nombresPorId.get(id) ?? id).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`/api/biblioteca/descargar?id=${encodeURIComponent(d.id)}`}
                    className="btn btn-secondary btn-sm">Descargar</a>
                  <button type="button" disabled={trabajando === d.id} onClick={() => void borrar(d)}
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
