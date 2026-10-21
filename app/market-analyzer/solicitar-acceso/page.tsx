"use client";

/**
 * "Solicitar acceso": el formulario que llena quien todavía no es cliente.
 *
 * No crea nada —solo deja constancia— y lo dice sin rodeos, para que nadie se
 * quede esperando un correo con una contraseña. El admin la recibe en su
 * bandeja y decide (AC Consulting, 2026-10-21).
 *
 * Pide lo mínimo para que el admin pueda decidir sin escribirle primero: quién
 * es, cómo ubicarlo y de qué empresa viene. Solo nombre, correo y empresa son
 * obligatorios; el resto ayuda pero no traba el envío.
 */
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, LoaderCircle, Send } from "lucide-react";

import { COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR, ECONOMIC_SECTOR_OPTIONS } from "@/lib/company";

const VACIO = {
  nombre: "", correo: "", cargo: "", telefono: "",
  empresa: "", sector: "", clasificacion: "", headcount: "", localidad: "", mensaje: "",
};

export default function SolicitarAccesoPage() {
  const [valores, setValores] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  const clasificaciones = COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[valores.sector] ?? [];
  const puedeEnviar = valores.nombre.trim().length >= 3
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valores.correo.trim())
    && valores.empresa.trim().length >= 2;

  function cambiar(campo: keyof typeof VACIO, valor: string) {
    setValores((prev) => {
      // Cambiar de sector invalida la clasificación elegida: las listas no se
      // solapan entre sectores.
      if (campo === "sector") return { ...prev, sector: valor, clasificacion: "" };
      return { ...prev, [campo]: valor };
    });
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeEnviar || enviando) return;
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      });
      const d = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo enviar la solicitud."); return; }
      setListo(true);
    } catch {
      setError("No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
        <section className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" />
          <h1 className="font-display mt-4 text-2xl font-bold text-slate-900">Solicitud enviada</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            El equipo de AC Consulting va a revisarla. Si se aprueba, te escribimos a{" "}
            <strong className="text-slate-800">{valores.correo.trim()}</strong> con tus datos de acceso.
          </p>
          <Link href="/" className="btn btn-secondary mt-6">
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Volver al inicio
        </Link>

        <section className="surface-panel mt-4 rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Market Analyzer</div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Solicitar acceso.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Cuéntanos quién eres y de qué empresa vienes. Revisamos cada solicitud a mano y, si se
            aprueba, te enviamos tus datos de acceso por correo. El acceso no es automático.
          </p>

          <form onSubmit={enviar} className="mt-6 space-y-5">
            <fieldset className="space-y-4">
              <legend className="field-label">Tus datos</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="nombre">Nombre y apellido *</label>
                  <input id="nombre" className="field" value={valores.nombre} autoComplete="name"
                    onChange={(e) => cambiar("nombre", e.target.value)} required />
                </div>
                <div>
                  <label className="field-label" htmlFor="correo">Correo corporativo *</label>
                  <input id="correo" type="email" className="field" value={valores.correo} autoComplete="email"
                    onChange={(e) => cambiar("correo", e.target.value)} required />
                </div>
                <div>
                  <label className="field-label" htmlFor="cargo">Cargo</label>
                  <input id="cargo" className="field" value={valores.cargo} autoComplete="organization-title"
                    onChange={(e) => cambiar("cargo", e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="telefono">Teléfono</label>
                  <input id="telefono" className="field" value={valores.telefono} autoComplete="tel"
                    onChange={(e) => cambiar("telefono", e.target.value)} />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="field-label">Tu empresa</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="field-label" htmlFor="empresa">Nombre de la empresa *</label>
                  <input id="empresa" className="field" value={valores.empresa} autoComplete="organization"
                    onChange={(e) => cambiar("empresa", e.target.value)} required />
                </div>
                <div>
                  <label className="field-label" htmlFor="sector">Sector económico</label>
                  <select id="sector" className="field-select" value={valores.sector}
                    onChange={(e) => cambiar("sector", e.target.value)}>
                    <option value="">Sin especificar</option>
                    {ECONOMIC_SECTOR_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="clasificacion">Clasificación</label>
                  <select id="clasificacion" className="field-select" value={valores.clasificacion}
                    onChange={(e) => cambiar("clasificacion", e.target.value)}
                    disabled={clasificaciones.length === 0}>
                    <option value="">{clasificaciones.length === 0 ? "Elige primero el sector" : "Sin especificar"}</option>
                    {clasificaciones.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="headcount">Número de empleados</label>
                  <input id="headcount" type="number" min="1" className="field" value={valores.headcount}
                    onChange={(e) => cambiar("headcount", e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="localidad">Ubicación</label>
                  <input id="localidad" className="field" value={valores.localidad} placeholder="Ciudad o estado"
                    onChange={(e) => cambiar("localidad", e.target.value)} />
                </div>
              </div>
            </fieldset>

            <div>
              <label className="field-label" htmlFor="mensaje">¿Qué necesitas del Market Analyzer?</label>
              <textarea id="mensaje" className="field min-h-24" value={valores.mensaje} rows={4}
                onChange={(e) => cambiar("mensaje", e.target.value)} />
            </div>

            {error && (
              <p className="flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={!puedeEnviar || enviando}>
              {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </button>

            <p className="text-center text-xs text-slate-500">
              ¿Ya tienes cuenta?{" "}
              <Link href="/market-analyzer/signin" className="font-semibold text-teal-700 underline">Entrar</Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
