"use client";
import { usePathname } from "next/navigation";

import { esRutaPublica } from "@/lib/rutas-publicas";

export default function ClientFooter() {
  const pathname = usePathname();
  // Las pantallas públicas llevan su propio pie, o ninguno.
  if (esRutaPublica(pathname)) return null;
  return (
    <footer className="px-6 py-10 text-center text-xs leading-6 text-slate-400 md:px-10">
      <p>© 2026 AC Consulting. Todos los derechos reservados.</p>
      <p>Plataforma tecnológica exclusiva, operando en alianza estratégica con la Asociación Venezolana de Gestión Humana (AVGH).</p>
    </footer>
  );
}
