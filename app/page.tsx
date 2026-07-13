"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, ChevronLeft, Menu, X, Target, Eye, Star, Users, ExternalLink, Rocket, BarChart2, Globe, Bell } from "lucide-react";

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
  { icon: Target, label: "Misión",  color: "bg-[#EEF7FF] text-[#1B4965]",    text: "Brindar asesoría técnica especializada de Gestión Humana para el sector público y privado, aplicando mejores prácticas del mercado e innovación en nuestros procesos." },
  { icon: Eye,    label: "Visión",  color: "bg-amber-50 text-amber-700",  text: "Ser reconocidos como una compañía responsable dentro de los primeros lugares del mercado nacional y expandirnos a nivel internacional." },
  { icon: Star,   label: "Valores", color: "bg-indigo-50 text-indigo-700", text: "Responsabilidad, honestidad y humildad ontológica guían cada una de nuestras actuaciones y relaciones con clientes y aliados." },
];

const SLIDES = [
  {
    icon: Rocket,
    badge: "Nuevo",
    badgeColor: "bg-[#CAE9FF] text-[#1B4965]",
    iconColor: "bg-[#1B4965] text-white",
    title: "Market Analyzer v2.0 ya está disponible",
    body: "La plataforma de benchmarking salarial de AC Consulting ya está en línea. Accede, compara curvas de mercado y mide la competitividad de tu organización.",
    cta: "Únete ahora",
    href: "/market-analyzer/signin",
  },
  {
    icon: BarChart2,
    badge: "Próximamente",
    badgeColor: "bg-amber-100 text-amber-700",
    iconColor: "bg-amber-600 text-white",
    title: "Se viene el próximo estudio de mercado",
    body: "El corte Q3 2026 está por abrirse. Participa con los datos de tu organización y obtén acceso exclusivo a los resultados del mercado.",
    cta: "Más información",
    href: "/market-analyzer/signin",
  },
  {
    icon: Bell,
    badge: "Invitación",
    badgeColor: "bg-indigo-100 text-indigo-700",
    iconColor: "bg-indigo-600 text-white",
    title: "Únete a la comunidad de empresas",
    body: "Forma parte de la red de organizaciones que confían en AC Consulting para tomar decisiones de compensación basadas en datos reales del mercado.",
    cta: "Solicitar acceso",
    href: "/market-analyzer/signin",
  },
  {
    icon: Globe,
    badge: "Presencia regional",
    badgeColor: "bg-slate-100 text-slate-600",
    iconColor: "bg-slate-700 text-white",
    title: "Operamos en 5 países",
    body: "Venezuela, Costa Rica, Colombia, Curazao y Ecuador. AC Consulting lleva más de una década apoyando organizaciones en toda la región con proyectos de Capital Humano.",
    cta: "Conocer más",
    href: "#nosotros",
  },
];

function HeroCarousel({ session }: { session: { user?: { name?: string | null; companyName?: string } } | null }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setCurrent((c) => (c + 1) % SLIDES.length), []);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 4500);
    return () => clearInterval(id);
  }, [paused, next]);

  const slide = SLIDES[current];
  const Icon = slide.icon;

  return (
    <div
      className="hidden lg:flex flex-col rounded-[2rem] border border-white/80 bg-white/75 shadow-2xl backdrop-blur-xl ring-1 ring-slate-900/5 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slide content */}
      <div className="flex-1 p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold ${slide.badgeColor}`}>
            {slide.badge}
          </span>
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${slide.iconColor}`}>
            <Icon size={15} />
          </div>
        </div>

        <h3 className="font-display text-base font-black leading-snug text-slate-900">
          {slide.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {slide.body}
        </p>

        <Link
          href={slide.href}
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#1B4965] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#153a52]"
        >
          {slide.cta} <ChevronRight size={13} />
        </Link>
      </div>

      {/* Controls + dots */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? "w-5 bg-[#1B4965]" : "w-1.5 bg-slate-300"
              }`}
              aria-label={`Ir a slide ${i + 1}`}
            />
          ))}
        </div>
        <div className="flex gap-1">
          <button onClick={prev} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
            <ChevronLeft size={15} />
          </button>
          <button onClick={next} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Session mini-card at bottom */}
      {session?.user ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1B4965] text-[11px] font-black text-white uppercase">
                {session.user.name?.charAt(0) ?? "?"}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-slate-900">{session.user.name}</div>
                {session.user.companyName && (
                  <div className="truncate text-[10px] text-slate-400">{session.user.companyName}</div>
                )}
              </div>
            </div>
            <Link href="/market-analyzer/inicio"
              className="shrink-0 ml-3 flex items-center gap-1 rounded-lg bg-[#1B4965] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#153a52]">
              Dashboard <ChevronRight size={11} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">¿Ya tienes cuenta?</span>
            <Link href="/market-analyzer/signin"
              className="shrink-0 flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-700">
              Ingresar <ChevronRight size={11} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-[#ECF0F1] text-[#2C3E50]">

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
                className="hidden md:inline-flex items-center gap-2.5 rounded-xl bg-[#1B4965] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#153a52]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-black uppercase">
                  {session.user.name?.charAt(0) ?? "?"}
                </span>
                <span className="hidden lg:block max-w-[140px] truncate">{session.user.name}</span>
                <ChevronRight size={15} />
              </Link>
            ) : (
              <Link href="/market-analyzer/signin"
                className="hidden md:inline-flex items-center gap-2 rounded-xl bg-[#1B4965] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#153a52]">
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
                className="block border-b border-slate-100 py-3 text-base font-semibold text-slate-700 last:border-0">{l.label}</a>
            ))}
            <Link href={session?.user ? "/market-analyzer/inicio" : "/market-analyzer/signin"}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#1B4965] px-4 py-3 text-sm font-bold text-white"
              onClick={() => setMobileOpen(false)}>
              {session?.user ? "Ir al Dashboard" : "Market Analyzer"} <ChevronRight size={15} />
            </Link>
          </div>
        )}
      </header>

      {/* ── HERO ───────────────────────────────────────────── */}
      <section id="inicio" className="relative flex min-h-screen items-center overflow-hidden pt-[72px]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_10%_30%,rgba(27,73,101,0.13),transparent),radial-gradient(ellipse_60%_50%_at_90%_70%,rgba(95,165,227,0.10),transparent)]" />

        <div className="relative mx-auto w-full max-w-6xl px-6 py-20 md:px-10 md:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_360px] lg:gap-16">

            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#5FA5E3/30] bg-[#EEF7FF] px-4 py-1.5 text-sm font-semibold text-[#1B4965]">
                <span className="h-2 w-2 rounded-full bg-[#EEF7FF]0 shrink-0" />
                Asesoría y Consultoría en Gestión Humana
              </div>

              <h1 className="font-display text-6xl font-black tracking-tight text-slate-900 leading-[1.05] md:text-7xl lg:text-[5rem]">
                Bienvenido a<br />
                <span className="text-[#1B4965]">AC Consulting</span>
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
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#5FA5E3/30] bg-[#EEF7FF] px-7 py-3.5 text-base font-bold text-[#1B4965] transition hover:bg-[#b8dff7]">
                  Market Analyzer <ChevronRight size={16} />
                </Link>
              </div>

              <p className="mt-6 text-sm text-slate-400">
                Venezuela · Costa Rica · Colombia · Curazao · Ecuador
              </p>
            </div>

            <HeroCarousel session={session} />
          </div>
        </div>
      </section>

      {/* ── QUIÉNES SOMOS ──────────────────────────────────── */}
      <section id="nosotros" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#1B4965]">Quiénes somos</div>
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
                <div key={label} className="rounded-2xl border border-slate-100 bg-[#ECF0F1] p-5">
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
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#1B4965]">Por qué elegirnos</div>
          <h2 className="font-display text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
            ¿Qué nos diferencia?
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DIFFERENTIATORS.map((d, i) => (
              <div key={i} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1B4965] text-xs font-black text-white">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="text-sm font-semibold leading-6 text-slate-700">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MARKET ANALYZER CTA ────────────────────────────── */}
      <section className="bg-[#1B4965] py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#CAE9FF]">Herramienta exclusiva</div>
              <h2 className="font-display text-4xl font-black tracking-tight text-white md:text-5xl">
                Market Analyzer
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-[#a8d5f5]">
                La plataforma definitiva de benchmarking salarial. Consulta tabuladores,
                compara curvas de mercado y mide la competitividad de tu organización.
              </p>
            </div>
            <Link href="/market-analyzer/signin"
              className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-black text-[#1B4965] transition hover:bg-[#EEF7FF]">
              Ingresar <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CONTACTO ───────────────────────────────────────── */}
      <section id="contacto" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#1B4965]">Contacto</div>
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
                  { label: "Instagram",   href: "https://www.instagram.com/ac_consulting/" },
                  { label: "LinkedIn",    href: "https://www.linkedin.com/company/corporacion-ac-consulting" },
                  { label: "Twitter / X", href: "https://twitter.com/ACConsulting_" },
                ].map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#5FA5E3/30] hover:text-[#1B4965]">
                    <ExternalLink size={14} /> {label}
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#CAE9FF] bg-[#EEF7FF] p-8">
              <div className="mb-3 flex items-center gap-3">
                <Users size={20} className="text-[#1B4965] shrink-0" />
                <span className="font-display text-base font-bold text-slate-900">¿Necesitas consultoría?</span>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Escríbenos y con gusto evaluamos cómo podemos apoyar a tu organización.
              </p>
              <a href="mailto:marketanalyzer@acconsult.net"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1B4965] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#153a52]">
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
