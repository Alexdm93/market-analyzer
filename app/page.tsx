"use client";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronRight, Menu, X,
  Target, Eye, Star, Users,
  ExternalLink, Sparkles,
} from "lucide-react";

const NAV_LINKS = [
  { label: "Inicio",       href: "#inicio" },
  { label: "Quiénes somos", href: "#nosotros" },
  { label: "Portafolio",   href: "#portafolio" },
  { label: "Contacto",     href: "#contacto" },
];

const DIFFERENTIATORS = [
  "Creatividad e innovación en cada proyecto",
  "Personal altamente capacitado y multidisciplinario",
  "Amplia experiencia en el sector público y privado",
  "Flexibilidad y adaptabilidad a cada cliente",
  "Pro-actividad y orientación a resultados",
  "Diseño de proyectos según necesidades de la organización",
  'Ejecución "llave en mano" bajo metodología PMI',
];

const MVV = [
  {
    icon: Target,
    label: "Misión",
    text: "Brindar asesoría técnica especializada de Gestión Humana para el sector público y privado, aplicando mejores prácticas del mercado e innovación en nuestros procesos.",
    color: "bg-teal-50 text-teal-700",
  },
  {
    icon: Eye,
    label: "Visión",
    text: "Ser reconocidos como una compañía responsable dentro de los primeros lugares del mercado nacional y expandirnos a nivel internacional.",
    color: "bg-amber-50 text-amber-700",
  },
  {
    icon: Star,
    label: "Valores",
    text: "Responsabilidad, honestidad y humildad ontológica guían cada una de nuestras actuaciones y relaciones con clientes y aliados.",
    color: "bg-indigo-50 text-indigo-700",
  },
];

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-slate-800">

      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ac-consulting-logo.svg" alt="AC Consulting" style={{ width: 34, height: 34 }} />
            <div className="leading-tight">
              <div className="font-display text-[13px] font-black tracking-tight text-slate-900">AC Consulting</div>
              <div className="text-[10px] text-slate-500 tracking-wide">Gestión Humana</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 ml-3 flex-1">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}
                className="rounded-xl px-3 py-2 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {session?.user ? (
              <Link href="/market-analyzer/inicio"
                className="hidden md:inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-1.5 text-[13px] font-bold text-white transition hover:bg-teal-800">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-black uppercase">
                  {session.user.name?.charAt(0) ?? "?"}
                </span>
                <span className="hidden lg:block max-w-[120px] truncate">{session.user.name}</span>
                <ChevronRight size={14} />
              </Link>
            ) : (
              <Link href="/market-analyzer/signin"
                className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-teal-800">
                Market Analyzer <ChevronRight size={14} />
              </Link>
            )}
            <button
              className="md:hidden rounded-xl p-2 text-slate-600 hover:bg-slate-100"
              onClick={() => setMobileOpen((v) => !v)} aria-label="Menú">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-100 bg-white px-4 pb-4 md:hidden">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                className="block py-2.5 text-sm font-semibold text-slate-700">{l.label}</a>
            ))}
            <Link href={session?.user ? "/market-analyzer/inicio" : "/market-analyzer/signin"}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white"
              onClick={() => setMobileOpen(false)}>
              {session?.user ? "Ir al Dashboard" : "Market Analyzer"} <ChevronRight size={14} />
            </Link>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section id="inicio" className="relative flex min-h-screen items-center overflow-hidden pt-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(15,118,110,0.12),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(217,119,6,0.10),transparent_50%)]" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                Asesoría y Consultoría en Gestión Humana
              </div>
              <h1 className="font-display text-4xl font-black tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
                Bienvenido a<br />
                <span className="text-teal-700">AC Consulting</span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 md:text-lg">
                Compañía especializada en asesoría, consultoría, desarrollo e implementación
                de proyectos de Capital Humano para sectores públicos, privados y sin fines de lucro.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#nosotros"
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700">
                  Conocer más
                </a>
                <Link href="/market-analyzer/signin"
                  className="inline-flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-2.5 text-sm font-bold text-teal-800 transition hover:bg-teal-100">
                  Market Analyzer <ChevronRight size={15} />
                </Link>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Venezuela · Costa Rica · Colombia · Curazao · Ecuador
              </p>
            </div>

            {/* Hero card */}
            <div className="hidden lg:block w-72 shrink-0">
              <div className="rounded-[2rem] border border-white/60 bg-white/70 p-5 shadow-xl backdrop-blur-xl">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-teal-700">Sesión activa</div>
                {session?.user ? (
                  <>
                    <div className="mb-1 font-display text-sm font-bold text-slate-900">{session.user.name}</div>
                    {session.user.companyName && (
                      <div className="mb-3 text-xs text-slate-500">{session.user.companyName}</div>
                    )}
                    <Link href="/market-analyzer/inicio"
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800">
                      Ir al Dashboard <ChevronRight size={12} />
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mb-3 text-xs leading-5 text-slate-500">
                      Accede a la plataforma de benchmarking salarial de AC Consulting.
                    </p>
                    <Link href="/market-analyzer/signin"
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800">
                      Ingresar <ChevronRight size={12} />
                    </Link>
                  </>
                )}
                <div className="mt-4 rounded-xl border border-slate-100 bg-[#f8f7f4] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-teal-600" />
                    <span className="text-[11px] font-semibold text-slate-700">Market Analyzer v2.0</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">
                    Benchmarking salarial · Tabuladores · Curvas de mercado
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quiénes somos ──────────────────────────────────── */}
      <section id="nosotros" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-teal-700">Quiénes somos</div>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="font-display text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
                El Capital Humano al centro de todo
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Somos una compañía joven, dinámica e innovadora, especializada en la asesoría, consultoría,
                desarrollo, implementación y puesta en marcha de proyectos relacionados con el corazón de
                las compañías: su <strong className="font-semibold text-slate-800">Capital Humano</strong>.
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Disponemos de un equipo multidisciplinario capaz de detectar y entender los requerimientos
                de nuestros clientes, brindando soluciones integrales que optimizan las estructuras organizacionales.
                Creemos en establecer relaciones a largo plazo, aplicando ideas innovadoras y las mejores
                prácticas del mercado.
              </p>
              <p className="mt-3 text-xs font-semibold text-slate-400">
                Venezuela · Costa Rica · Colombia · Curazao · Ecuador
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {MVV.map(({ icon: Icon, label, text, color }) => (
                <div key={label} className="rounded-2xl border border-slate-100 bg-[#f8f7f4] p-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-xl p-2 ${color} shrink-0`}>
                      <Icon size={16} aria-hidden />
                    </div>
                    <div>
                      <div className="font-display text-xs font-bold uppercase tracking-widest text-slate-900">{label}</div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Diferenciadores ────────────────────────────────── */}
      <section id="portafolio" className="py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-teal-700">Por qué elegirnos</div>
          <h2 className="font-display text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
            ¿Qué nos diferencia?
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {DIFFERENTIATORS.map((d, i) => (
              <div key={i} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-[11px] font-black text-white">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="text-xs font-semibold leading-5 text-slate-700">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Market Analyzer CTA ────────────────────────────── */}
      <section className="bg-teal-700 py-14">
        <div className="mx-auto max-w-4xl px-4 md:px-8">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-2 text-xs font-semibold text-teal-200 uppercase tracking-widest">Herramienta exclusiva</div>
              <h2 className="font-display text-3xl font-black tracking-tight text-white md:text-4xl">
                Market Analyzer
              </h2>
              <p className="mt-3 text-sm leading-6 text-teal-100">
                La plataforma definitiva de benchmarking salarial. Consulta tabuladores,
                compara curvas de mercado y mide la competitividad de tu organización.
              </p>
            </div>
            <Link href="/market-analyzer/signin"
              className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-black text-teal-800 transition hover:bg-teal-50">
              Ingresar <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contacto ───────────────────────────────────────── */}
      <section id="contacto" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-teal-700">Contacto</div>
          <div className="grid gap-8 md:grid-cols-2 md:items-start">
            <div>
              <h2 className="font-display text-3xl font-black tracking-tight text-slate-900">
                Síguenos y mantente actualizado
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Conéctate con nosotros en redes sociales para conocer novedades, artículos y proyectos.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { label: "Instagram", href: "https://www.instagram.com/ac_consulting/" },
                  { label: "LinkedIn",  href: "https://www.linkedin.com/company/corporacion-ac-consulting" },
                  { label: "Twitter / X", href: "https://twitter.com/ACConsulting_" },
                ].map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-200 hover:text-teal-700">
                    <ExternalLink size={13} /> {label}
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-6">
              <div className="mb-2 flex items-center gap-2">
                <Users size={18} className="text-teal-700" />
                <span className="font-display text-sm font-bold text-slate-900">¿Necesitas consultoría?</span>
              </div>
              <p className="text-xs leading-5 text-slate-600">
                Escríbenos y con gusto evaluamos cómo podemos apoyar a tu organización.
              </p>
              <a href="mailto:marketanalyzer@acconsult.net"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800">
                marketanalyzer@acconsult.net
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-slate-900 px-4 py-8 text-center md:px-8">
        <div className="mx-auto max-w-6xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ac-consulting-logo.svg" alt="AC Consulting"
            style={{ width: 28, height: 28, filter: "brightness(0) invert(1)", margin: "0 auto 10px" }} />
          <p className="text-xs text-slate-400">© 2019 Corporación AC Consulting C.A. — RIF J-40503867-5</p>
          <p className="mt-0.5 text-xs text-slate-500">Todos los derechos reservados.</p>
        </div>
      </footer>

    </div>
  );
}
