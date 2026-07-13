"use client";
import { usePathname } from "next/navigation";

export default function ClientFooter() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/market-analyzer/signin") || pathname.startsWith("/market-analyzer/register")) return null;
  return (
    <footer className="px-6 py-10 text-center text-xs leading-6 text-slate-400 md:px-10">
      <p>© 2026 AC Consulting. Todos los derechos reservados.</p>
      <p>Plataforma tecnológica exclusiva, operando en alianza estratégica con la Asociación Venezolana de Gestión Humana (AVGH).</p>
    </footer>
  );
}
