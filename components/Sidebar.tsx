"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Database, Info, LayoutDashboard, LineChart, LogIn, LogOut, Shield } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

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

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  if (pathname === "/signin" || pathname === "/register") {
    return null;
  }

  return (
    <aside className="app-shell w-full border-b border-white/50 bg-[var(--shell-background)] px-3 py-3 backdrop-blur-xl md:h-screen md:w-[var(--sidebar-width)] md:border-r md:border-b-0 md:px-4 md:py-4 lg:px-5 lg:py-6">
      <div className="surface-panel flex h-auto min-w-0 flex-col overflow-hidden rounded-[1.75rem] p-3 md:h-full md:p-4 lg:p-5">
        <div className="mb-5 flex items-start justify-between gap-3 lg:mb-8">
          <div className="min-w-0">
            <div className="eyebrow mb-2">Salary Intelligence</div>
            <h1 className="font-display break-words text-xl font-bold text-slate-900 md:text-2xl">Market Analyzer</h1>
            <p className="mt-2 max-w-none break-words text-sm leading-6 text-slate-600 md:max-w-52">
              Carga, consolida y revisa mercado salarial desde una sola vista.
            </p>
          </div>
          <div className="hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 lg:inline-flex">
            v2.0
          </div>
        </div>

        <nav className="grid min-w-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-2 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto md:pr-1">
          {[...menuItems, ...(isAdmin ? adminMenuItems : [])].map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-w-0 items-start gap-3 overflow-hidden rounded-[1.25rem] border px-3 py-3 ${
                  isActive
                    ? "border-teal-700/10 bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(17,94,89,0.06))] text-slate-900 shadow-[0_16px_36px_rgba(15,118,110,0.16)]"
                    : "border-transparent bg-white/55 text-slate-600 hover:border-slate-200 hover:bg-white/80"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <div className={`inline-flex shrink-0 rounded-2xl p-2 ${isActive ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white"}`}>
                  <Icon size={18} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display break-words text-sm font-bold">{item.name}</div>
                  <div className="break-words text-xs text-slate-500">{item.hint}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 min-w-0 rounded-[1.5rem] border border-slate-200/70 bg-white/70 p-4 md:mt-auto">
          {session?.user ? (
            <>
              <div className="eyebrow mb-2">Sesion activa</div>
              <div className="break-words font-display text-lg font-bold text-slate-900">{session.user.name}</div>
              <div className="mt-2 break-words text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{isAdmin ? "Admin" : "Usuario"}</div>
              
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
              <p className="text-sm leading-6 text-slate-600">
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