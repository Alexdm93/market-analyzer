"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Building2, ChartBar, ChevronDown, ClipboardCheck, ClipboardList, Database, FileSpreadsheet, FolderDown, GraduationCap, HardDrive, Home, Info, Layers, LayoutDashboard, LifeBuoy, ListChecks, LoaderCircle, LogIn, LogOut, Newspaper, PlayCircle, Radar, ScanSearch, Shield, TrendingUp, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Fragment, useEffect, useState } from "react";

import { getRoleLabel, isAdminRole, isCoordinatorRole } from "@/lib/roles";
import { esRutaPublica } from "@/lib/rutas-publicas";
import { useNavigationTrigger } from "./NavigationProgress";
import { useAnnouncements } from "@/contexts/AnnouncementContext";
import { useWorkspaceNotification } from "@/contexts/WorkspaceNotificationContext";

const BASE = "/market-analyzer";

type MenuItem = { name: string; href: string; icon: LucideIcon; hint: string };
type MenuGroup = { key: string; label: string; items: MenuItem[] };

/** Lo que se usa a diario: siempre visible, sin encabezado. */
const itemsBase: MenuItem[] = [
  { name: "Inicio", href: `${BASE}/inicio`, icon: Newspaper, hint: "Noticias y anuncios" },
  { name: "Dashboard", href: `${BASE}/dashboard`, icon: LayoutDashboard, hint: "Indicadores base" },
  { name: "Empresa", href: `${BASE}/informacion`, icon: Info, hint: "Contexto y contacto" },
  { name: "Data", href: `${BASE}/data`, icon: Database, hint: "Captura por cargo" },
  { name: "Resultados", href: `${BASE}/resultados`, icon: TrendingUp, hint: "Resumen de mercado" },
];

const itemsBaseAdmin: MenuItem[] = [
  { name: "Inicio", href: `${BASE}/inicio`, icon: Newspaper, hint: "Noticias y anuncios" },
  { name: "Dashboard", href: `${BASE}/dashboard`, icon: LayoutDashboard, hint: "Indicadores base" },
  { name: "Data", href: `${BASE}/data`, icon: Database, hint: "Captura por cargo" },
  { name: "Resultados", href: `${BASE}/resultados`, icon: TrendingUp, hint: "Resumen de mercado" },
  { name: "Empresa", href: `${BASE}/informacion`, icon: Info, hint: "Contexto y contacto" },
];

const estudiosItem: MenuItem = { name: "Estudios", href: `${BASE}/estudios`, icon: ChartBar, hint: "Participación por corte" };

/**
 * `/estudio` son dos pantallas distintas según quién entre, así que el nombre
 * del menú también cambia.
 *
 * El admin ve la consola donde procesa y publica un corte — su propio título es
 * "Procesamiento de data de mercado".
 *
 * La empresa ya no la ve: lo que había ahí era posicionamiento por grado, la
 * forma anterior de armar los cortes del Estudio de Competitividad, y tenerla
 * junto al recorrido nuevo confundía.
 */
const procesamientoItem: MenuItem = {
  name: "Procesamiento",
  href: `${BASE}/estudio`,
  icon: BookOpen,
  hint: "Procesar y publicar cortes",
};

const informeGeneralItem: MenuItem = {
  name: "Informe general",
  href: `${BASE}/informe-general`,
  icon: FileSpreadsheet,
  hint: "Tendencias salariales del corte",
};

const especializadoItem: MenuItem = {
  name: "Estudio de Competitividad",
  href: `${BASE}/estudio/cargos`,
  icon: ListChecks,
  hint: "Cargos, comparación e historial",
};

/**
 * Las dos secciones de video van sueltas y separadas entre sí: una es soporte
 * de la plataforma y la otra formación profesional, y mezclarlas confundiría
 * las dos cosas (AC Consulting, 2026-10-27).
 */
const ayudaItem: MenuItem = {
  name: "Centro de Ayuda",
  href: `${BASE}/centro-de-ayuda`,
  icon: LifeBuoy,
  hint: "Tutoriales de la plataforma",
};

const academiaItem: MenuItem = {
  name: "Academia C&B",
  href: `${BASE}/academia`,
  icon: GraduationCap,
  hint: "Formación en Compensación y Beneficios",
};

const bibliotecaItem: MenuItem = {
  name: "Biblioteca",
  href: `${BASE}/biblioteca`,
  icon: FolderDown,
  hint: "Plantillas y documentos para descargar",
};

const radarItem: MenuItem = {
  name: "Radar Salarial",
  href: `${BASE}/radar`,
  icon: Radar,
  hint: "Un cargo o un grado, contra el mercado",
};

const grupoAdmin: MenuGroup = {
  key: "admin",
  label: "Administración",
  items: [
    { name: "Admin", href: `${BASE}/admin`, icon: Shield, hint: "Vista administrativa" },
    { name: "Empresas", href: `${BASE}/empresas`, icon: Building2, hint: "Catálogo disponible" },
    { name: "Aprobaciones", href: `${BASE}/admin/aprobaciones`, icon: ClipboardCheck, hint: "Solicitudes de edición" },
    { name: "Solicitudes de acceso", href: `${BASE}/admin/acceso`, icon: UserPlus, hint: "Quién pidió entrar desde la web" },
    { name: "Importar data", href: `${BASE}/admin/importar`, icon: FileSpreadsheet, hint: "Cargar Excel de las empresas" },
    { name: "Reportes", href: `${BASE}/admin/reportes`, icon: ClipboardList, hint: "Excel para revisar la data" },
    { name: "Valoración", href: `${BASE}/valoracion`, icon: Layers, hint: "CAPRI por cargo" },
    { name: "Respaldos", href: `${BASE}/admin/respaldos`, icon: HardDrive, hint: "Respaldar y restaurar cortes" },
    { name: "Anuncios", href: `${BASE}/admin/anuncios`, icon: Newspaper, hint: "Publicar noticias" },
    { name: "Informe general", href: `${BASE}/admin/informe-general`, icon: FileSpreadsheet, hint: "Habilitar y repartir informes" },
    { name: "Control de calidad", href: `${BASE}/admin/auditoria`, icon: ScanSearch, hint: "Suavizado del mercado" },
    // Acá va solo la configuración. Emitir un Radar es trabajo de todos los
    // días, no una tarea administrativa, así que esa entrada vive fuera del
    // desplegable, debajo del Estudio de Competitividad
    // (AC Consulting, 2026-10-21).
    { name: "Radar: habilitación", href: `${BASE}/admin/radar`, icon: Radar, hint: "Qué empresas, cuánto cupo y de qué corte" },
    { name: "Videotutoriales", href: `${BASE}/admin/recursos`, icon: PlayCircle, hint: "Centro de Ayuda y Academia C&B" },
    { name: "Biblioteca", href: `${BASE}/admin/biblioteca`, icon: FolderDown, hint: "Documentos y quién puede bajarlos" },
  ],
};


export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const isAdmin = isAdminRole(role);
  const isCoordinator = isCoordinatorRole(role);
  const canSeeEstudio = isAdmin || session?.user?.estudioEnabled === true;
  const canSeeInformeGeneral = isAdmin || session?.user?.generalEnabled === true;
  const canSeeRadar = isAdmin || session?.user?.radarEnabled === true;
  const triggerNavigation = useNavigationTrigger();
  const [signingOut, setSigningOut] = useState(false);
  const { hasUnread } = useAnnouncements();
  const { hasUnreadResultados, hasUnreadData } = useWorkspaceNotification();
  const [pendingEditRequests, setPendingEditRequests] = useState(0);
  /** Solicitudes de acceso por revisar, para el punto rojo del menú. */
  const [solicitudesAcceso, setSolicitudesAcceso] = useState(0);
  // Los grupos arrancan cerrados, salvo el que contiene la pantalla en la que
  // estás: así el menú abre corto y aun así se ve dónde estás parado.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;

    async function loadPendingCount() {
      try {
        const res = await fetch("/api/admin/edit-requests?status=PENDING", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { requests?: unknown[] } | null;
        if (!ignore && res.ok) setPendingEditRequests(Array.isArray(payload?.requests) ? payload.requests.length : 0);
      } catch { /* silencioso — no bloquea la navegación */ }
    }

    async function loadAccessRequests() {
      try {
        const res = await fetch("/api/admin/acceso", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as
          { solicitudes?: Array<{ status: string; usuarioCreadoId: string | null }> } | null;
        if (ignore || !res.ok) return;
        // Cuenta lo que pide acción: las pendientes de revisar y las que ya se
        // aceptaron pero siguen sin cuenta creada.
        setSolicitudesAcceso((payload?.solicitudes ?? []).filter(
          (s) => s.status === "PENDING" || (s.status === "APPROVED" && !s.usuarioCreadoId),
        ).length);
      } catch { /* silencioso — no bloquea la navegación */ }
    }

    void loadPendingCount();
    void loadAccessRequests();
    const interval = window.setInterval(() => {
      void loadPendingCount();
      void loadAccessRequests();
    }, 60000);
    return () => { ignore = true; window.clearInterval(interval); };
  }, [isAdmin]);

  // En una pantalla pública no hay menú que mostrar: quien la está viendo no
  // tiene sesión, y en la de solicitar acceso ni siquiera tiene cuenta.
  if (esRutaPublica(pathname)) {
    return null;
  }

  // La empresa con el estudio habilitado ve una sola entrada: el Estudio
  // Especializado. "Posicionamiento" era la forma anterior de armar los
  // cortes y tener las dos confundía (AC Consulting, 2026-10-14).
  const itemsEstudio = canSeeEstudio
    ? (isAdmin ? [procesamientoItem, especializadoItem] : [especializadoItem])
    : [];

  // El admin lo configura desde Administración, así que acá solo aparece para
  // la empresa que lo tiene habilitado.
  const itemsInformeGeneral = !isAdmin && canSeeInformeGeneral ? [informeGeneralItem] : [];
  // El Radar va suelto y detrás del Estudio de Competitividad, igual para el
  // admin que para la empresa: lo que cambia entre uno y otro es lo que la
  // pantalla deja hacer, no dónde está.
  const itemsRadar = canSeeRadar ? [radarItem] : [];

  // El Centro de Ayuda y la Academia los ve todo el mundo: no dependen de que
  // a la empresa le hayan habilitado nada.
  const itemsFormacion = [bibliotecaItem, ayudaItem, academiaItem];

  const itemsPlanos = isAdmin
    ? [...itemsBaseAdmin, ...itemsEstudio, ...itemsRadar, ...itemsFormacion]
    : [...itemsBase, ...itemsInformeGeneral, ...itemsEstudio, ...itemsRadar,
       ...(isCoordinator ? [estudiosItem] : []), ...itemsFormacion];

  const grupos: MenuGroup[] = isAdmin ? [grupoAdmin] : [];

  const renderItem = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={isActive ? undefined : triggerNavigation}
        className={`group flex shrink-0 min-w-0 items-start gap-2.5 overflow-hidden rounded-[1.1rem] border px-2.5 py-2.5 ${
          isActive
            ? "border-[#1B4965]/10 bg-[linear-gradient(135deg,rgba(27,73,101,0.14),rgba(21,58,82,0.06))] text-slate-900 shadow-[0_2px_10px_rgba(27,73,101,0.18)]"
            : "border-transparent bg-white/55 text-slate-600 hover:border-slate-200 hover:bg-white/80"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        <div className={`relative inline-flex shrink-0 rounded-xl p-2 ${isActive ? "bg-[#1B4965] text-white" : "bg-slate-100 text-slate-600 group-hover:bg-[#1B4965] group-hover:text-white"}`}>
          <Icon size={16} aria-hidden />
          {item.href === `${BASE}/inicio` && hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          )}
          {item.href === `${BASE}/resultados` && hasUnreadResultados && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          )}
          {item.href === `${BASE}/data` && hasUnreadData && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          )}
          {item.href === `${BASE}/admin/aprobaciones` && pendingEditRequests > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white ring-2 ring-white">
              {pendingEditRequests > 9 ? "9+" : pendingEditRequests}
            </span>
          )}
          {item.href === `${BASE}/admin/acceso` && solicitudesAcceso > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white ring-2 ring-white">
              {solicitudesAcceso > 9 ? "9+" : solicitudesAcceso}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display break-words text-[0.82rem] font-bold leading-5">{item.name}</div>
          <div className="break-words text-[0.7rem] leading-4 text-slate-500">{item.hint}</div>
        </div>
      </Link>
    );
  };

  return (
    <aside className="app-shell w-full border-b border-white/50 bg-[var(--shell-background)] px-3 py-3 backdrop-blur-xl md:h-screen md:w-[var(--sidebar-width)] md:border-r md:border-b-0 md:px-3 md:py-3 lg:px-4 lg:py-4">
      <div className="surface-panel flex h-auto min-w-0 flex-col overflow-hidden rounded-[1.5rem] p-3 md:h-full md:p-3.5 lg:p-4">
        <div className="mb-4 lg:mb-4 rounded-[1.2rem] bg-[#1B4965] px-3 py-3">
            <div className="mb-2 flex justify-end">
              <span className="rounded-full border border-white/30 bg-white/20 px-1.5 py-0.5 text-[0.55rem] font-bold text-white">v2.0</span>
            </div>
            <Link href="/market-analyzer/inicio" className="flex items-center justify-center gap-1.5" onClick={pathname === "/market-analyzer/inicio" ? undefined : triggerNavigation}>
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
          {itemsPlanos.map(renderItem)}

          {grupos.map((grupo) => {
            const abierto = gruposAbiertos[grupo.key] ?? grupo.items.some((i) => i.href === pathname);
            return (
              <Fragment key={grupo.key}>
                <button
                  type="button"
                  onClick={() => setGruposAbiertos((v) => ({ ...v, [grupo.key]: !abierto }))}
                  aria-expanded={abierto}
                  className="mt-2 flex shrink-0 items-center justify-between gap-2 rounded-[0.9rem] px-2.5 py-1.5 text-left transition hover:bg-white/60"
                >
                  <span className="eyebrow eyebrow-xs truncate">{grupo.label}</span>
                  <ChevronDown
                    size={13}
                    aria-hidden
                    className={`shrink-0 text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`}
                  />
                </button>
                {abierto && grupo.items.map(renderItem)}
              </Fragment>
            );
          })}
        </nav>

        <Link
          href="/"
          className="mt-1 flex shrink-0 items-center justify-center gap-1.5 rounded-[1rem] border border-slate-200/60 bg-white/40 px-3 py-2 text-[0.72rem] font-semibold text-slate-500 transition hover:bg-white/70 hover:text-slate-800"
        >
          <Home size={13} />
          Ir al inicio
        </Link>

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
                onClick={() => { setSigningOut(true); void signOut({ callbackUrl: "/market-analyzer/signin" }); }}
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
                <Link href="/market-analyzer/signin" className="btn btn-primary w-full" style={{background:"#1B4965"}}>
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