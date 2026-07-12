"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Building2, ChartBar, Database, Info, LayoutDashboard, Layers, LoaderCircle, LogIn, LogOut, Newspaper, Shield, TrendingUp } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

import { getRoleLabel, isAdminRole, isCoordinatorRole } from "@/lib/roles";
import { useNavigationTrigger } from "./NavigationProgress";
import { useAnnouncements } from "@/contexts/AnnouncementContext";
import { useWorkspaceNotification } from "@/contexts/WorkspaceNotificationContext";

const menuItems = [
  { name: "Inicio", href: "/inicio", icon: Newspaper, hint: "Noticias y anuncios" },
  { name: "Dashboard", href: "/", icon: LayoutDashboard, hint: "Indicadores base" },
  { name: "Empresa", href: "/informacion", icon: Info, hint: "Contexto y contacto" },
  { name: "Data", href: "/data", icon: Database, hint: "Captura por cargo" },
  { name: "Resultados", href: "/resultados", icon: TrendingUp, hint: "Resumen de mercado" },
];

const menuItemsAdmin = [
  { name: "Inicio", href: "/inicio", icon: Newspaper, hint: "Noticias y anuncios" },
  { name: "Dashboard", href: "/", icon: LayoutDashboard, hint: "Indicadores base" },
  { name: "Data", href: "/data", icon: Database, hint: "Captura por cargo" },
  { name: "Estudio", href: "/estudio", icon: BookOpen, hint: "Estudio especializado" },
  { name: "Resultados", href: "/resultados", icon: TrendingUp, hint: "Resumen de mercado" },
  { name: "Empresa", href: "/informacion", icon: Info, hint: "Contexto y contacto" },
];

const estudioItem = { name: "Estudio", href: "/estudio", icon: BookOpen, hint: "Estudio especializado" };
const estudiosItem = { name: "Estudios", href: "/estudios", icon: ChartBar, hint: "Participación por corte" };

const adminMenuItems = [
  { name: "Admin", href: "/admin", icon: Shield, hint: "Vista administrativa" },
  { name: "Empresas", href: "/empresas", icon: Building2, hint: "Catálogo disponible" },
  { name: "Anuncios", href: "/admin/anuncios", icon: Newspaper, hint: "Publicar noticias" },
  { name: "Valoración", href: "/valoracion", icon: Layers, hint: "CAPRI por cargo" },
];


export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const isAdmin = isAdminRole(role);
  const isCoordinator = isCoordinatorRole(role);
  const canSeeEstudio = isAdmin || session?.user?.estudioEnabled === true;
  const triggerNavigation = useNavigationTrigger();
  const [signingOut, setSigningOut] = useState(false);
  const { hasUnread } = useAnnouncements();
  const { hasUnreadResultados, hasUnreadData } = useWorkspaceNotification();

  if (pathname === "/signin" || pathname === "/register") {
    return null;
  }

  return (
    <aside className="app-shell w-full border-b border-white/50 bg-[var(--shell-background)] px-3 py-3 backdrop-blur-xl md:h-screen md:w-[var(--sidebar-width)] md:border-r md:border-b-0 md:px-3 md:py-3 lg:px-4 lg:py-4">
      <div className="surface-panel flex h-auto min-w-0 flex-col overflow-hidden rounded-[1.5rem] p-3 md:h-full md:p-3.5 lg:p-4">
        <div className="mb-4 lg:mb-4 rounded-[1.2rem] bg-teal-700 px-3 py-3">
          <div className="mb-2 flex justify-end">
            <span className="rounded-full border border-white/30 bg-white/20 px-1.5 py-0.5 text-[0.55rem] font-bold text-white">v2.0</span>
          </div>
          <Link href="/inicio" className="flex items-center justify-center gap-1.5" onClick={pathname === "/inicio" ? undefined : triggerNavigation}>
            <div className="flex-none shrink-0 leading-none">
              <div className="font-display text-[20px] font-black tracking-tight text-white leading-[1.2]">Market</div>
              <div className="font-display text-[20px] font-black tracking-tight text-white leading-[1.2]">Analyzer</div>
            </div>
            <span className="shrink-0 select-none text-white/40 text-sm leading-none">|</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ac-consulting-logo.svg" alt="AC Consulting" className="shrink-0 flex-none" style={{width: 50, height: 50, filter: "brightness(0) invert(1)"}} />
          </Link>
        </div>

        <nav className="flex min-w-0 min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-1 pr-0.5">
          {[...(isAdmin ? menuItemsAdmin : [...menuItems, ...(canSeeEstudio ? [estudioItem] : []), ...(isCoordinator ? [estudiosItem] : [])]), ...(isAdmin ? adminMenuItems : [])].map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={isActive ? undefined : triggerNavigation}
                className={`group flex shrink-0 min-w-0 items-start gap-2.5 overflow-hidden rounded-[1.1rem] border px-2.5 py-2.5 ${
                  isActive
                    ? "border-teal-700/10 bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(17,94,89,0.06))] text-slate-900 shadow-[0_2px_10px_rgba(15,118,110,0.18)]"
                    : "border-transparent bg-white/55 text-slate-600 hover:border-slate-200 hover:bg-white/80"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <div className={`relative inline-flex shrink-0 rounded-xl p-2 ${isActive ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white"}`}>
                  <Icon size={16} aria-hidden />
                  {item.href === "/inicio" && hasUnread && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                  )}
                  {item.href === "/resultados" && hasUnreadResultados && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                  )}
                  {item.href === "/data" && hasUnreadData && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display break-words text-[0.82rem] font-bold leading-5">{item.name}</div>
                  <div className="break-words text-[0.7rem] leading-4 text-slate-500">{item.hint}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 min-w-0 rounded-[1.1rem] border border-slate-200/70 bg-white/70 p-2.5 md:mt-auto">
          {session?.user ? (
            <>
              <div className="eyebrow mb-1" style={{fontSize: '0.58rem'}}>Sesion activa</div>
              <div className="break-words font-display text-[0.8rem] font-bold text-slate-900">{session.user.name}</div>
              {session.user.companyName && (
                <div className="mt-0.5 break-words text-[0.67rem] leading-4 text-slate-600">{session.user.companyName}</div>
              )}
              <div className="mt-0.5 break-words text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{getRoleLabel(role)}</div>

              <button
                onClick={() => { setSigningOut(true); void signOut({ callbackUrl: "/signin" }); }}
                className="btn btn-secondary mt-2 w-full"
                type="button"
                disabled={signingOut}
              >
                {signingOut
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <LogOut className="h-4 w-4" />}
                {signingOut ? "Cerrando sesión..." : "Cerrar sesion"}
              </button>
            </>
          ) : (
            <>
              <div className="eyebrow mb-2">Acceso</div>
              <p className="text-sm leading-6 text-slate-600 md:text-[0.82rem] md:leading-5">
                {status === "loading"
                  ? "Comprobando sesion..."
                  : "Entra con tus credenciales."}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/signin" className="btn btn-primary w-full">
                  <LogIn className="h-4 w-4" />
                  Iniciar sesion
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}