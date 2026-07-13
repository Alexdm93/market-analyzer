"use client";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, Menu, X, Target, Eye, Star, Users, ExternalLink, Sparkles } from "lucide-react";

const NAV_LINKS = [
  { label: "Inicio",        href: "#inicio" },
  { label: "Quiénes somos", href: "#nosotros" },
  { label: "Portafolio",    href: "#portafolio" },
  { label: "Contacto",      href: "#contacto" },
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
  { icon: Target, label: "Misión",  color: "bg-teal-50 text-teal-700",   text: "Brindar asesoría técnica especializada de Gestión Humana para el sector público y privado, aplicando mejores prácticas del mercado e innovación en nuestros procesos." },
  { icon: Eye,    label: "Visión",  color: "bg-amber-50 text-amber-700", text: "Ser reconocidos como una compañía responsable dentro de los primeros lugares del mercado nacional y expandirnos a nivel internacional." },
  { icon: Star,   label: "Valores", color: "bg-indigo-50 text-indigo-700", text: "Responsabilidad, honestidad y humildad ontológica guían cada una de nuestras actuaciones y relaciones con clientes y aliados." },
];

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-slate-800">

      {/* ── NAVBAR ─────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4 md:px-10">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ac-consulting-logo.svg" alt="AC Consulting" style={{ width: 42, height: 42 }} />
            <div className="leading-tight">
              <div className="font-display text-base font-black tracking-tight text-slate-900">AC Consulting</div>
              <div className="text-xs text-slate-500 tracking-wide">Gestión Humana</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-4 flex-1">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {session?.user ? (
              <Link href="/market-analyzer/inicio"
                className="hidden md:inline-flex items-center gap-2.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-black uppercase">
                  {session.user.name?.charAt(0) ?? "?"}
                </span>
                <span className="hidden lg:block max-w-[140px] truncate">{session.user.name}</span>
                <ChevronRight size={15} />
              </Link>
            ) : (
              <Link href="/market-analyzer/signin"
                className="hidden md:inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800">
                Market Analyzer <ChevronRight size={15} />
              </Link>
            )}
            <button className="md:hidden rounded-xl p-2.5 text-slate-600 hover:bg-slate-100"
              onClick={() => setMobileOpen((v) => !v)} aria-label="Menú">
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-100 bg-white px-6 pb-5 md:hidden">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                className="block py-3 text-base font-semibold text-slate-700 border-b border-slate-100 last:border-0">{l.label}</a>
            ))}
            <Link href={session?.user ? "/market-analyzer/inicio" : "/market-analyzer/signin"}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white"
              onClick={() => setMobileOpen(false)}>
              {session?.user ? "Ir al Dashboard" : "Market Analyzer"} <ChevronRight size={15} />
            </Link>
          </div>
        )}
      </header>

      {/* ── HERO ───────────────────────────────────────────── */}
      <section id="inicio" className="relative flex min-h-screen items-center overflow-hidden pt-[72px]">
        {/* Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_10%_30%,rgba(15,118,110,0.13),transparent),radial-gradient(ellipse_60%_50%_at_90%_70%,rgba(217,119,6,0.09),transparent)]" />

        <div className="relative mx-auto w-full max-w-6xl px-6 py-20 md:px-10 md:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_360px] lg:gap-16">

            {/* Left: Text */}
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-sm font-semibold text-teal-700">
                <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                Asesoría y Consultoría en Gestión Humana
              </div>

              <h1 className="font-display text-6xl font-black tracking-tight text-slate-900 leading-[1.05] md:text-7xl lg:text-[5rem]">
                Bienvenido a<br />
                <span className="text-teal-700">AC Consulting</span>
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">
                Compañía especializada en asesoría, consultoría, desarrollo e implementación
                de proyectos de Capital Humano para sectores públicos, privados y sin fines de lucro.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#nosotros"
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-7 py-3.5 text-base font-bold text-white transition hover:bg-slate-700">
                  Conocer más
                </a>
                <Link href="/market-analyzer/signin"
                  className="inline-flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-7 py-3.5 text-base font-bold text-teal-800 transition hover:bg-teal-100">
                  Market Analyzer <ChevronRight size={16} />
                </Link>
              </div>

              <p className="mt-6 text-sm text-slate-400">
                Venezuela · Costa Rica · Colombia · Curazao · Ecuador
              </p>
            </div>

            {/* Right: Session card */}
            <div className="hidden lg:block">
              <div className="rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-2xl backdrop-blur-xl ring-1 ring-slate-900/5">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-teal-700">
                  {session?.user ? "Sesión activa" : "Acceso a la plataforma"}
                </div>

                {session?.user ? (
                  <>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 font-display text-base font-black text-white uppercase">
                        {session.user.name?.charAt(0) ?? "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold text-slate-900">{session.user.name}</div>
                        {session.user.companyName && (
                          <div className="truncate text-xs text-slate-500">{session.user.companyName}</div>
                        )}
                      </div>
                    </div>
                    <Link href="/market-analyzer/inicio"
                      className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-800">
                      Ir al Dashboard <ChevronRight size={14} />
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Accede a la plataforma de benchmarking salarial de AC Consulting.
                    </p>
                    <Link href="/market-analyzer/signin"
                      className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-800">
                      Ingresar a Market Analyzer <ChevronRight size={14} />
                    </Link>
                  </>
                )}

                <div className="mt-4 rounded-xl border border-slate-100 bg-[#f8f7f4] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-teal-600" />
                    <span className="text-xs font-semibold text-slate-700">Market Analyzer v2.0</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Benchmarking salarial · Tabuladores · Curvas de mercado
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── QUIÉNES SOMOS ──────────────────────────────────── */}
      <section id="nosotros" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-teal-700">Quiénes somos</div>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="font-display text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
                El Capital Humano al centro de todo
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600">
                Somos una compañía joven, dinámica e innovadora, especializada en la asesoría, consultoría,
                desarrollo, implementación y puesta en marcha de proyectos relacionados con el corazón de
                las compañías: su <strong className="font-semibold text-slate-800">Capital Humano</strong>.
              </p>
              <p className="mt-4 text-base leading-8 text-slate-600">
                Disponemos de un equipo multidisciplinario capaz de detectar y entender los requerimientos
                de nuestros clientes, brindando soluciones integrales que optimizan las estructuras
                organizacionales. Creemos en establecer relaciones a largo plazo, aplicando ideas
                innovadoras y las mejores prácticas del mercado.
              </p>
              <p className="mt-4 text-sm font-semibold text-slate-400">
                Venezuela · Costa Rica · Colombia · Curazao · Ecuador
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {MVV.map(({ icon: Icon, label, text, color }) => (
                <div key={label} className="rounded-2xl border border-slate-100 bg-[#f8f7f4] p-5">
                  <div className="flex items-start gap-4">
                    <div className={`rounded-xl p-2.5 shrink-0 ${color}`}>
                      <Icon size={18} aria-hidden />
                    </div>
                    <div>
                      <div className="font-display text-sm font-bold uppercase tracking-widest text-slate-900">{label}</div>
                      <p className="mt-1.5 text-sm leading-6 text-slate-600">{text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── DIFERENCIADORES ────────────────────────────────── */}
      <section id="portafolio" className="py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-teal-700">Por qué elegirnos</div>
          <h2 className="font-display text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
            ¿Qué nos diferencia?
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DIFFERENTIATORS.map((d, i) => (
              <div key={i} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-black text-white">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="text-sm font-semibold leading-6 text-slate-700">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MARKET ANALYZER CTA ────────────────────────────── */}
      <section className="bg-teal-700 py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-teal-200">Herramienta exclusiva</div>
              <h2 className="font-display text-4xl font-black tracking-tight text-white md:text-5xl">
                Market Analyzer
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-teal-100">
                La plataforma definitiva de benchmarking salarial. Consulta tabuladores,
                compara curvas de mercado y mide la competitividad de tu organización.
              </p>
            </div>
            <Link href="/market-analyzer/signin"
              className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-black text-teal-800 transition hover:bg-teal-50">
              Ingresar <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CONTACTO ───────────────────────────────────────── */}
      <section id="contacto" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-teal-700">Contacto</div>
          <div className="grid gap-10 md:grid-cols-2 md:items-start">
            <div>
              <h2 className="font-display text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
                Síguenos y mantente actualizado
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Conéctate con nosotros en redes sociales para conocer novedades, artículos y proyectos de AC Consulting.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {[
                  { label: "Instagram",  href: "https://www.instagram.com/ac_consulting/" },
                  { label: "LinkedIn",   href: "https://www.linkedin.com/company/corporacion-ac-consulting" },
                  { label: "Twitter / X", href: "https://twitter.com/ACConsulting_" },
                ].map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:text-teal-700">
                    <ExternalLink size={14} /> {label}
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-8">
              <div className="mb-3 flex items-center gap-3">
                <Users size={20} className="text-teal-700 shrink-0" />
                <span className="font-display text-base font-bold text-slate-900">¿Necesitas consultoría?</span>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Escríbenos y con gusto evaluamos cómo podemos apoyar a tu organización.
              </p>
              <a href="mailto:marketanalyzer@acconsult.net"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800">
                marketanalyzer@acconsult.net
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-slate-900 px-6 py-10 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ac-consulting-logo.svg" alt="AC Consulting"
            style={{ width: 32, height: 32, filter: "brightness(0) invert(1)" }} />
          <p className="text-sm text-slate-400">© 2019 Corporación AC Consulting C.A. — RIF J-40503867-5</p>
          <p className="text-xs text-slate-500">Todos los derechos reservados.</p>
        </div>
      </footer>

    </div>
  );
}
