"use client";

/**
 * "Solicitar acceso" como pantalla propia.
 *
 * Los dos botones de la plataforma abren el formulario en una ventana, sin
 * navegar; esta pantalla existe para poder mandar el enlace por fuera —un
 * correo, un mensaje— y que caiga directo en el formulario. Es el mismo
 * componente, así que no hay dos formularios que mantener.
 *
 * Está en `lib/rutas-publicas.ts`: sin eso, el guardia de sesión la rebota a
 * la pantalla de ingreso, que es justo lo que no puede hacer con alguien que
 * todavía no tiene cuenta.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import FormularioAcceso from "@/components/FormularioAcceso";

export default function SolicitarAccesoPage() {
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

          <div className="mt-6">
            <FormularioAcceso />
          </div>

          <p className="mt-5 text-center text-xs text-slate-500">
            ¿Ya tienes cuenta?{" "}
            <Link href="/market-analyzer/signin" className="font-semibold text-teal-700 underline">Entrar</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
