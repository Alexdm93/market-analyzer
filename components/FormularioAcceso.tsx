"use client";

/**
 * El formulario de "Solicitar acceso", sin envoltorio.
 *
 * Vive aparte porque entra por dos puertas —el botón de la portada y el enlace
 * de la pantalla de ingreso— y las dos lo abren como ventana. Que el formulario
 * no sea una pantalla propia no es un detalle estético: una pantalla debajo de
 * /market-analyzer hereda el menú, el pie y el guardia de sesión, y ese guardia
 * manda a la pantalla de ingreso a quien no tiene cuenta, que es justo lo que
 * esta pantalla no puede hacer (AC Consulting, 2026-10-22).
 *
 * Pide lo mínimo para que el admin pueda decidir sin escribir primero: quién
 * es, cómo ubicarlo y de qué empresa viene. Solo nombre, correo y empresa son
 * obligatorios.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, Send } from "lucide-react";

import { CANALES_ACCESO } from "@/lib/solicitud-acceso";
import type { SectorConClasificaciones } from "@/lib/sectores";

const VACIO = {
  nombre: "", correo: "", cargo: "", telefono: "",
  empresa: "", sector: "", clasificacion: "", headcount: "", localidad: "",
  actividad: "", comoSeEntero: "",
};

export default function FormularioAcceso({ alCerrar }: { alCerrar?: () => void }) {
  const [valores, setValores] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  /** El correo ya tenía una solicitud: en qué quedó. */
  const [yaEstaba, setYaEstaba] = useState("");

  /**
   * Los sectores salen del catálogo que mantiene el admin, no de una lista
   * fija en el código: si no, alguien pide acceso declarando un sector que la
   * plataforma ya no reconoce y después no calza con nada
   * (AC Consulting, 2026-10-27).
   */
  const [sectores, setSectores] = useState<SectorConClasificaciones[]>([]);

  useEffect(() => {
    let ignorar = false;
    void fetch("/api/sectores", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { sectores?: SectorConClasificaciones[] } | null) => {
        if (!ignorar && Array.isArray(d?.sectores)) setSectores(d.sectores);
      })
      .catch(() => { /* sin catálogo, los dos selectores quedan vacíos */ });
    return () => { ignorar = true; };
  }, []);

  const clasificaciones = sectores.find((s) => s.name === valores.sector)?.classifications ?? [];
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
    setYaEstaba("");
    try {
      const res = await fetch("/api/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      });
      const d = (await res.json().catch(() => null)) as { message?: string; estado?: string } | null;
      if (!res.ok) {
        // Que ya exista una solicitud de ese correo no es un error de quien la
        // manda: se le dice en qué quedó, sin pintarlo de rojo.
        if (res.status === 409) { setYaEstaba(d?.message ?? ""); return; }
        setError(d?.message ?? "No se pudo enviar la solicitud.");
        return;
      }
      setListo(true);
    } catch {
      setError("No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (yaEstaba) {
    return (
      <div className="py-6 text-center">
        <Info className="mx-auto h-12 w-12 text-slate-400" />
        <h2 className="font-display mt-4 text-2xl font-bold text-slate-900">Ya tenemos tu solicitud</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{yaEstaba}</p>
        {alCerrar && (
          <button type="button" onClick={alCerrar} className="btn btn-secondary mt-6">Cerrar</button>
        )}
      </div>
    );
  }

  if (listo) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" />
        <h2 className="font-display mt-4 text-2xl font-bold text-slate-900">Solicitud enviada</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          El equipo de AC Consulting va a revisarla. Si se aprueba, te escribimos a{" "}
          <strong className="text-slate-800">{valores.correo.trim()}</strong> con tus datos de acceso.
        </p>
        {alCerrar && (
          <button type="button" onClick={alCerrar} className="btn btn-secondary mt-6">Cerrar</button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="field-label">Tus datos</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="acc-nombre">Nombre y apellido *</label>
            <input id="acc-nombre" className="field" value={valores.nombre} autoComplete="name"
              onChange={(e) => cambiar("nombre", e.target.value)} required />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-correo">Correo corporativo *</label>
            <input id="acc-correo" type="email" className="field" value={valores.correo} autoComplete="email"
              onChange={(e) => cambiar("correo", e.target.value)} required />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-cargo">Cargo</label>
            <input id="acc-cargo" className="field" value={valores.cargo} autoComplete="organization-title"
              onChange={(e) => cambiar("cargo", e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-telefono">Teléfono</label>
            <input id="acc-telefono" className="field" value={valores.telefono} autoComplete="tel"
              onChange={(e) => cambiar("telefono", e.target.value)} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="field-label">Tu empresa</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="field-label" htmlFor="acc-empresa">Nombre de la empresa *</label>
            <input id="acc-empresa" className="field" value={valores.empresa} autoComplete="organization"
              onChange={(e) => cambiar("empresa", e.target.value)} required />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-sector">Sector económico</label>
            <select id="acc-sector" className="field-select" value={valores.sector}
              onChange={(e) => cambiar("sector", e.target.value)}>
              <option value="">Sin especificar</option>
              {sectores.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="acc-clasificacion">Clasificación</label>
            <select id="acc-clasificacion" className="field-select" value={valores.clasificacion}
              onChange={(e) => cambiar("clasificacion", e.target.value)}
              disabled={clasificaciones.length === 0}>
              <option value="">{clasificaciones.length === 0 ? "Elige primero el sector" : "Sin especificar"}</option>
              {clasificaciones.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="acc-headcount">Número de empleados</label>
            <input id="acc-headcount" type="number" min="1" className="field" value={valores.headcount}
              onChange={(e) => cambiar("headcount", e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-localidad">Ubicación</label>
            <input id="acc-localidad" className="field" value={valores.localidad} placeholder="Ciudad o estado"
              onChange={(e) => cambiar("localidad", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="field-label" htmlFor="acc-actividad">¿A qué se dedica la empresa?</label>
            <textarea id="acc-actividad" className="field min-h-20" value={valores.actividad} rows={3}
              placeholder="En una o dos líneas: a qué se dedica."
              onChange={(e) => cambiar("actividad", e.target.value)} />
          </div>
        </div>
      </fieldset>

      <div>
        <label className="field-label" htmlFor="acc-canal">¿Cómo te enteraste de nosotros?</label>
        <select id="acc-canal" className="field-select" value={valores.comoSeEntero}
          onChange={(e) => cambiar("comoSeEntero", e.target.value)}>
          <option value="">Sin especificar</option>
          {CANALES_ACCESO.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
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
    </form>
  );
}
