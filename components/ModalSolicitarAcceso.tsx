"use client";

/**
 * El formulario de "Solicitar acceso" como ventana.
 *
 * Se abre encima de donde esté la persona —la portada o la pantalla de
 * ingreso— y no navega a ningún lado, que es como lo pidió el CEO: "un botón
 * y ahí se despliega un formulario" (AC Consulting, 2026-10-21).
 */
import { useEffect } from "react";
import { X } from "lucide-react";

import FormularioAcceso from "@/components/FormularioAcceso";

export default function ModalSolicitarAcceso({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  // Con la ventana abierta, el fondo no se desplaza y Escape la cierra.
  useEffect(() => {
    if (!abierto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    window.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", alTeclear);
    };
  }, [abierto, alCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/50 p-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-solicitar-acceso"
      onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}
    >
      <div className="mx-auto w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-1">Market Analyzer</div>
            <h2 id="titulo-solicitar-acceso" className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Solicitar acceso
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Cuéntanos quién eres y de qué empresa vienes. Revisamos cada solicitud a mano y, si se
              aprueba, te enviamos tus datos de acceso por correo. El acceso no es automático.
            </p>
          </div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6">
          <FormularioAcceso alCerrar={alCerrar} />
        </div>
      </div>
    </div>
  );
}
