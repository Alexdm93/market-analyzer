"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Info, LayoutDashboard, LineChart, LogIn, LogOut, UserPlus } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

const menuItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, hint: "Indicadores base" },
  { name: "Data", href: "/data", icon: Database, hint: "Captura por cargo" },
  { name: "Estudio", href: "/estudio", icon: LineChart, hint: "Lectura agregada" },
  { name: "Empresa", href: "/informacion", icon: Info, hint: "Contexto y contacto" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  if (pathname === "/signin" || pathname === "/register") {
    return null;
  }

  return (
    <aside className="app-shell h-screen w-[var(--sidebar-width)] border-r border-white/50 bg-[var(--shell-background)] px-3 py-3 backdrop-blur-xl md:px-4 md:py-4 lg:px-5 lg:py-6">
      <div className="surface-panel flex h-full flex-col rounded-[1.75rem] p-3 md:p-4 lg:p-5">
        <div className="mb-5 flex items-start justify-between gap-3 lg:mb-8">
          <div>
            <div className="eyebrow mb-2">Salary Intelligence</div>
            <h1 className="font-display text-xl font-bold text-slate-900 md:text-2xl">Market Analyzer</h1>
            <p className="mt-2 max-w-52 text-sm leading-6 text-slate-600">
              Carga, consolida y revisa mercado salarial desde una sola vista.
            </p>
          </div>
          <div className="hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 lg:inline-flex">
            v2.0
          </div>
        </div>

        <nav className="flex flex-col gap-2 pb-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group rounded-[1.25rem] border px-3 py-3 ${
                  isActive
                    ? "border-teal-700/10 bg-[linear-gradient(135deg,rgba(15,118,110,0.14),rgba(17,94,89,0.06))] text-slate-900 shadow-[0_16px_36px_rgba(15,118,110,0.16)]"
                    : "border-transparent bg-white/55 text-slate-600 hover:border-slate-200 hover:bg-white/80"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <div className={`mb-3 inline-flex rounded-2xl p-2 ${isActive ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white"}`}>
                  <Icon size={18} aria-hidden />
                </div>
                <div>
                  <div className="font-display text-sm font-bold">{item.name}</div>
                  <div className="text-xs text-slate-500">{item.hint}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[1.5rem] border border-slate-200/70 bg-white/70 p-4">
          {session?.user ? (
            <>
              <div className="eyebrow mb-2">Sesion activa</div>
              <div className="font-display text-lg font-bold text-slate-900">{session.user.name}</div>
              
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
                  : "Crea una cuenta local o entra con tus credenciales."}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/signin" className="btn btn-primary w-full">
                  <LogIn className="h-4 w-4" />
                  Iniciar sesion
                </Link>
                <Link href="/register" className="btn btn-secondary w-full">
                  <UserPlus className="h-4 w-4" />
                  Crear cuenta
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}