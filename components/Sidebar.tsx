"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Database, Info, LayoutDashboard, LineChart, LogIn, LogOut, Shield } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { canAccessEmpresas, getRoleLabel, isAdminRole } from "@/lib/roles";

const menuItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, hint: "Indicadores base" },
  { name: "Data", href: "/data", icon: Database, hint: "Captura por cargo" },
  { name: "Estudio", href: "/estudio", icon: LineChart, hint: "Lectura agregada" },
  { name: "Empresa", href: "/informacion", icon: Info, hint: "Contexto y contacto" },
];

const adminMenuItems = [
  { name: "Admin", href: "/admin", icon: Shield, hint: "Vista administrativa" },
  { name: "Empresas", href: "/empresas", icon: Building2, hint: "Catálogo disponible" },
];

const analystMenuItems = [
  { name: "Empresas", href: "/empresas", icon: Building2, hint: "Empresas por corte" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const isAdmin = isAdminRole(role);
  const canSeeEmpresas = canAccessEmpresas(role);

  if (pathname === "/signin" || pathname === "/register") {
    return null;
  }

  return (
    <aside className="app-shell w-full border-b border-white/50 bg-[var(--shell-background)] px-3 py-3 backdrop-blur-xl md:h-screen md:w-[var(--sidebar-width)] md:border-r md:border-b-0 md:px-3 md:py-3 lg:px-4 lg:py-4">
      <div className="surface-panel flex h-auto min-w-0 flex-col overflow-hidden rounded-[1.5rem] p-3 md:h-full md:p-3.5 lg:p-4">
        <div className="mb-4 flex items-start justify-between gap-3 lg:mb-6">
          <div className="min-w-0">
            <div className="eyebrow mb-2">Salary Intelligence</div>
            <h1 className="font-display break-words text-xl font-bold text-slate-900 md:text-[1.7rem] md:leading-[1.02]">Market Analyzer</h1>
            <p className="mt-2 max-w-none break-words text-sm leading-6 text-slate-600 md:max-w-48 md:text-[0.82rem] md:leading-5">
              Carga, consolida y revisa mercado salarial desde una sola vista.
            </p>
          </div>
          <div className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.68rem] font-bold text-amber-700 lg:inline-flex">
            v2.0
          </div>
        </div>

        <nav className="grid min-w-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-2 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto md:pr-1">
          {[...menuItems, ...(isAdmin ? adminMenuItems : canSeeEmpresas ? analystMenuItems : [])].map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-w-0 items-start gap-2.5 overflow-hidden rounded-[1.1rem] border px-2.5 py-2.5 ${
                  isActive
                    ? "border-teal-700/10 bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(17,94,89,0.06))] text-slate-900 shadow-[0_16px_36px_rgba(15,118,110,0.16)]"
                    : "border-transparent bg-white/55 text-slate-600 hover:border-slate-200 hover:bg-white/80"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <div className={`inline-flex shrink-0 rounded-xl p-2 ${isActive ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white"}`}>
                  <Icon size={16} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display break-words text-[0.82rem] font-bold leading-5">{item.name}</div>
                  <div className="break-words text-[0.7rem] leading-4 text-slate-500">{item.hint}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 min-w-0 rounded-[1.3rem] border border-slate-200/70 bg-white/70 p-3.5 md:mt-auto">
          {session?.user ? (
            <>
              <div className="eyebrow mb-2">Sesion activa</div>
              <div className="break-words font-display text-base font-bold text-slate-900 md:text-[1rem]">{session.user.name}</div>
              <div className="mt-2 break-words text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{getRoleLabel(role)}</div>
              
              <button
                onClick={() => signOut({ callbackUrl: "/signin" })}
                className="btn btn-secondary mt-4 w-full"
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesion
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