"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  ChevronRight, ChevronLeft, Menu, X,
  Target, Eye, Star, Users, ExternalLink,
  Rocket, BarChart2, Globe, Bell, LogOut, LogIn,
} from "lucide-react";
// signingOut state kept for navbar logout button

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
  { icon: Eye,    label: "Visión",  color: "bg-amber-50 text-amber-700",      text: "Ser reconocidos como una compañía responsable dentro de los primeros lugares del mercado nacional y expandirnos a nivel internacional." },
  { icon: Star,   label: "Valores", color: "bg-indigo-50 text-indigo-700",    text: "Responsabilidad, honestidad y humildad ontológica guían cada una de nuestras actuaciones y relaciones con clientes y aliados." },
];

const SLIDES = [
  {
    icon: Rocket,
    badge: "Nuevo",
    badgeColor: "bg-[#CAE9FF] text-[#1B4965]",
    iconBg: "#1B4965",
    title: "Market Analyzer v2.0 ya está disponible",
    body: "La plataforma de benchmarking salarial de AC Consulting ya está en línea. Compara curvas de mercado y mide la competitividad de tu organización.",
    cta: "Únete ahora",
    href: "/market-analyzer/signin",
  },
  {
    icon: BarChart2,
    badge: "Próximamente",
    badgeColor: "bg-amber-100 text-amber-700",
    iconBg: "#b45309",
    title: "Se viene el próximo estudio de mercado",
    body: "El corte Q3 2026 está por abrirse. Participa con los datos de tu organización y obtén acceso exclusivo a los resultados del mercado.",
    cta: "Más información",
    href: "/market-analyzer/signin",
  },
  {
    icon: Bell,
    badge: "Invitación",
    badgeColor: "bg-indigo-100 text-indigo-700",
    iconBg: "#4338ca",
    title: "Únete a la comunidad de empresas",
    body: "Forma parte de la red de organizaciones que confían en AC Consulting para tomar decisiones basadas en datos reales del mercado.",
    cta: "Solicitar acceso",
    href: "/market-analyzer/signin",
  },
  {
    icon: Globe,
    badge: "Presencia regional",
    badgeColor: "bg-slate-100 text-slate-600",
    iconBg: "#2C3E50",
    title: "Operamos en 5 países",
    body: "Venezuela, Costa Rica, Colombia, Curazao y Ecuador. AC Consulting apoya organizaciones en toda la región con proyectos de Capital Humano.",
    cta: "Conocer más",
    href: "#nosotros",
  },
];

function SlideCard({ slide, active }: { slide: typeof SLIDES[0]; active: boolean }) {
  const Icon = slide.icon;
  return (
    <div
      className="w-80 shrink-0 rounded-[2rem] border border-white bg-white p-8 transition-all duration-500 md:w-[26rem]"
      style={{
        transform: active ? "scale(1) translateY(0px)" : "scale(0.85) translateY(16px)",
        opacity: active ? 1 : 0.4,
        boxShadow: active ? "0 32px 72px rgba(27,73,101,0.18)" : "0 4px 16px rgba(27,73,101,0.05)",
      }}
    >
      <div className="mb-5 flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold ${slide.badgeColor}`}>
          {slide.badge}
        </span>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: slide.iconBg }}>
          <Icon size={18} />
        </div>
      </div>
      <h3 className="font-display text-lg font-black leading-snug text-[#2C3E50]">{slide.title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#95A5A6]">{slide.body}</p>
      {active && (
        <Link href={slide.href}
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          style={{ background: slide.iconBg }}>
          {slide.cta} <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const next = useCallback(() => setCurrent((c) => (c + 1) % SLIDES.length), []);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [paused, next]);

  const prevIdx = (current - 1 + SLIDES.length) % SLIDES.length;
  const nextIdx = (current + 1) % SLIDES.length;

  return (
    <div
      className="relative flex items-center justify-center gap-4 md:gap-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Prev */}
      <div className="hidden md:block pointer-events-none select-none">
        <SlideCard slide={SLIDES[prevIdx]} active={false} />
      </div>

      {/* Active */}
      <div className="relative z-10">
        <SlideCard slide={SLIDES[current]} active={true} />
      </div>

      {/* Next */}
      <div className="hidden md:block pointer-events-none select-none">
        <SlideCard slide={SLIDES[nextIdx]} active={false} />
      </div>

      {/* Arrows */}
      <button onClick={prev}
        className="absolute -left-5 md:-left-10 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg text-[#2C3E50] transition hover:shadow-xl hover:text-[#1B4965]">
        <ChevronLeft size={20} />
      </button>
      <button onClick={next}
        className="absolute -right-5 md:-right-10 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg text-[#2C3E50] transition hover:shadow-xl hover:text-[#1B4965]">
        <ChevronRight size={20} />
      </button>

      {/* Dots */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{ width: i === current ? 20 : 6, background: i === current ? "#1B4965" : "#95A5A6" }}
            aria-label={`Slide ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session, status } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [nexoUser, setNexoUser] = useState<{ name: string; email?: string } | null>(null);
  const [nexoLoaded, setNexoLoaded] = useState(false);

  useEffect(() => {
    fetch("https://nexohub.acconsult.net/api/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.user?.name) setNexoUser(data.user); })
      .catch(() => null)
      .finally(() => setNexoLoaded(true));
  }, []);

  const sessionsLoading = status === "loading" || !nexoLoaded;
  const hasMA = status === "authenticated";
  const hasNexo = nexoUser !== null;
  const isLoggedIn = hasMA || hasNexo;
  // While loading, show all buttons; once resolved, show only active platforms (or all if none)
  const showMA = sessionsLoading || !isLoggedIn || hasMA;
  const showNexo = sessionsLoading || !isLoggedIn || hasNexo;
  const showTalentium = sessionsLoading || !isLoggedIn;

  return (
    <div className="min-h-screen bg-white text-[#2C3E50]">

      {/* ── NAVBAR ─────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#ECF0F1] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4 md:px-10">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ac-consulting-logo.svg" alt="AC Consulting" style={{ width: 40, height: 40 }} />
            <div className="leading-tight">
              <div className="font-display text-base font-black tracking-tight text-[#2C3E50]">AC Consulting</div>
              <div className="text-xs text-[#95A5A6] tracking-wide">Gestión Humana</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 ml-4 flex-1">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#2C3E50] transition hover:bg-[#ECF0F1]">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Platform group */}
            {(showMA || showNexo || showTalentium) && (
              <div className="hidden md:flex items-center gap-1 rounded-2xl border border-[#1B4965]/12 bg-[#ECF0F1]/70 p-1">
                {showMA && (
                  <Link
                    href={hasMA ? "/market-analyzer/inicio" : "/market-analyzer/signin"}
                    className="inline-flex w-36 items-center justify-between gap-1.5 rounded-xl bg-[#1B4965] px-4 py-2 text-[0.75rem] font-bold text-white transition hover:bg-[#153a52]">
                    Market Analyzer <ChevronRight size={12} className="shrink-0" />
                  </Link>
                )}
                {showNexo && (
                  <Link
                    href={hasNexo ? "https://nexohub.acconsult.net" : "https://nexohub.acconsult.net/signin"}
                    className="inline-flex w-36 items-center justify-between gap-1.5 rounded-xl bg-[#1B4965] px-4 py-2 text-[0.75rem] font-bold text-white transition hover:bg-[#153a52]">
                    NexoHub <ChevronRight size={12} className="shrink-0" />
                  </Link>
                )}
                {showTalentium && (
                  <div className="inline-flex w-36 cursor-not-allowed items-center justify-between gap-1.5 rounded-xl px-4 py-2 text-[0.75rem] font-bold text-[#95A5A6]" title="Próximamente">
                    Talentium
                    <span className="shrink-0 rounded-full bg-[#2C3E50]/10 px-1.5 py-0.5 text-[0.48rem] font-bold uppercase tracking-wide text-[#95A5A6]">Pronto</span>
                  </div>
                )}
              </div>
            )}

            {/* Auth section */}
            {sessionsLoading ? null : (session?.user || nexoUser) ? (
              <div className="hidden md:flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-[#ECF0F1] bg-[#ECF0F1]/60 px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1B4965] text-[10px] font-black text-white uppercase">
                    {(session?.user?.name ?? nexoUser?.name)?.charAt(0) ?? "?"}
                  </span>
                  <span className="max-w-[120px] truncate text-xs font-semibold text-[#2C3E50]">
                    {session?.user?.name ?? nexoUser?.name}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (session?.user) {
                      setSigningOut(true);
                      void signOut({ callbackUrl: "/" });
                    } else {
                      window.location.href = `https://nexohub.acconsult.net/api/signout?callbackUrl=${encodeURIComponent(window.location.origin)}`;
                    }
                  }}
                  className="inline-flex items-center rounded-xl border border-[#ECF0F1] px-2.5 py-2 text-[#95A5A6] transition hover:border-red-200 hover:text-red-500">
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <Link href="/market-analyzer/signin"
                className="hidden md:inline-flex items-center gap-2 rounded-xl bg-[#1B4965] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#153a52] whitespace-nowrap">
                <LogIn size={14} className="shrink-0" /> Iniciar sesión
              </Link>
            )}
            <button className="md:hidden rounded-xl p-2.5 text-[#2C3E50] hover:bg-[#ECF0F1]"
              onClick={() => setMobileOpen((v) => !v)} aria-label="Menú">
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#ECF0F1] bg-white px-6 pb-5 md:hidden">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                className="block border-b border-[#ECF0F1] py-3 text-base font-semibold text-[#2C3E50] last:border-0">{l.label}</a>
            ))}
            <div className="mt-4 text-[0.6rem] font-bold uppercase tracking-widest text-[#95A5A6] mb-1">Plataformas</div>
            {showMA && (
              <Link
                href={hasMA ? "/market-analyzer/inicio" : "/market-analyzer/signin"}
                className="flex items-center justify-between gap-2 rounded-xl bg-[#1B4965] px-4 py-2.5 text-sm font-bold text-white"
                onClick={() => setMobileOpen(false)}>
                Market Analyzer <ChevronRight size={14} />
              </Link>
            )}
            {showNexo && (
              <Link
                href={hasNexo ? "https://nexohub.acconsult.net" : "https://nexohub.acconsult.net/signin"}
                className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-[#1B4965] px-4 py-2.5 text-sm font-bold text-white"
                onClick={() => setMobileOpen(false)}>
                NexoHub <ChevronRight size={14} />
              </Link>
            )}
            {showTalentium && (
              <div className="mt-1 flex items-center justify-between rounded-xl border border-[#ECF0F1] bg-[#F5F7F8] px-4 py-2.5 text-sm font-bold text-[#95A5A6] cursor-not-allowed">
                Talentium <span className="text-[0.55rem] font-bold uppercase tracking-wide bg-[#ECF0F1] px-1.5 py-0.5 rounded-full">Próximamente</span>
              </div>
            )}
            {(session?.user || nexoUser) && (
              <button
                onClick={() => {
                  if (session?.user) {
                    setSigningOut(true);
                    void signOut({ callbackUrl: "/" });
                  } else {
                    window.location.href = `https://nexohub.acconsult.net/api/signout?callbackUrl=${encodeURIComponent(window.location.origin)}`;
                  }
                }}
                className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-[#ECF0F1] px-4 py-2.5 text-sm font-semibold text-[#95A5A6]">
                <LogOut size={14} /> Cerrar sesión
              </button>
            )}
          </div>
        )}
      </header>

      {/* ── HERO ───────────────────────────────────────────── */}
      <section id="inicio" className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-[72px] pb-20 md:px-10">
        {/* Subtle bg gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(27,73,101,0.08),transparent)]" />

        <div className="relative flex w-full max-w-5xl flex-col items-center text-center">
          {/* Heading */}
          <h1 className="font-display text-5xl font-black tracking-tight text-[#2C3E50] md:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>
            Bienvenido a{" "}
            <span style={{ color: "#1B4965" }}>AC Consulting</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-[#95A5A6] md:text-lg">
            Compañía especializada en asesoría, consultoría, desarrollo e implementación
            de proyectos de Capital Humano para sectores públicos, privados y sin fines de lucro.
          </p>

          {/* ── CAROUSEL ─── */}
          <div className="relative mt-12 w-full">
            <HeroCarousel />
          </div>

          <p className="mt-16 text-xs text-[#95A5A6]">
            Venezuela · Costa Rica · Colombia · Curazao · Ecuador
          </p>
        </div>
      </section>

      {/* ── QUIÉNES SOMOS ──────────────────────────────────── */}
      <section id="nosotros" className="bg-[#ECF0F1] py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#1B4965]">Quiénes somos</div>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="font-display text-4xl font-black tracking-tight text-[#2C3E50] md:text-5xl">
                El Capital Humano al centro de todo
              </h2>
              <p className="mt-5 text-base leading-8 text-[#2C3E50]">
                Somos una compañía joven, dinámica e innovadora, especializada en la asesoría, consultoría,
                desarrollo, implementación y puesta en marcha de proyectos relacionados con el corazón de
                las compañías: su <strong className="font-semibold">Capital Humano</strong>.
              </p>
              <p className="mt-4 text-base leading-8 text-[#2C3E50]">
                Disponemos de un equipo multidisciplinario capaz de detectar y entender los requerimientos
                de nuestros clientes, brindando soluciones integrales que optimizan las estructuras
                organizacionales. Creemos en establecer relaciones a largo plazo, aplicando ideas
                innovadoras y las mejores prácticas del mercado.
              </p>
              <p className="mt-4 text-sm font-semibold text-[#95A5A6]">
                Venezuela · Costa Rica · Colombia · Curazao · Ecuador
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {MVV.map(({ icon: Icon, label, text, color }) => (
                <div key={label} className="rounded-2xl border border-white bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className={`rounded-xl p-2.5 shrink-0 ${color}`}><Icon size={18} /></div>
                    <div>
                      <div className="font-display text-sm font-bold uppercase tracking-widest text-[#2C3E50]">{label}</div>
                      <p className="mt-1.5 text-sm leading-6 text-[#95A5A6]">{text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── DIFERENCIADORES ────────────────────────────────── */}
      <section id="portafolio" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#1B4965]">Por qué elegirnos</div>
          <h2 className="font-display text-4xl font-black tracking-tight text-[#2C3E50] md:text-5xl">¿Qué nos diferencia?</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DIFFERENTIATORS.map((d, i) => (
              <div key={i} className="rounded-2xl border border-[#ECF0F1] bg-[#ECF0F1]/50 p-5">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: "#1B4965" }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="text-sm font-semibold leading-6 text-[#2C3E50]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA MARKET ANALYZER ────────────────────────────── */}
      <section style={{ background: "#1B4965" }} className="py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#CAE9FF]">Herramienta exclusiva</div>
              <h2 className="font-display text-4xl font-black tracking-tight text-white md:text-5xl">Market Analyzer</h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-[#CAE9FF]">
                La plataforma definitiva de benchmarking salarial. Consulta tabuladores,
                compara curvas de mercado y mide la competitividad de tu organización.
              </p>
            </div>
            <Link href="/market-analyzer/signin"
              className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-black transition hover:bg-[#EEF7FF]" style={{ color: "#1B4965" }}>
              Ingresar <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CONTACTO ───────────────────────────────────────── */}
      <section id="contacto" className="bg-[#ECF0F1] py-20">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#1B4965]">Contacto</div>
          <div className="grid gap-10 md:grid-cols-2 md:items-start">
            <div>
              <h2 className="font-display text-4xl font-black tracking-tight text-[#2C3E50] md:text-5xl">
                Síguenos y mantente actualizado
              </h2>
              <p className="mt-4 text-base leading-7 text-[#95A5A6]">
                Conéctate con nosotros en redes sociales para conocer novedades, artículos y proyectos de AC Consulting.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {[
                  { label: "Instagram",   href: "https://www.instagram.com/ac_consulting/" },
                  { label: "LinkedIn",    href: "https://www.linkedin.com/company/corporacion-ac-consulting" },
                  { label: "Twitter / X", href: "https://twitter.com/ACConsulting_" },
                ].map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-white bg-white px-4 py-2.5 text-sm font-semibold text-[#2C3E50] transition hover:border-[#5FA5E3] hover:text-[#1B4965] shadow-sm">
                    <ExternalLink size={14} /> {label}
                  </a>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#CAE9FF] bg-[#EEF7FF] p-8">
              <div className="mb-3 flex items-center gap-3">
                <Users size={20} className="shrink-0" style={{ color: "#1B4965" }} />
                <span className="font-display text-base font-bold text-[#2C3E50]">¿Necesitas consultoría?</span>
              </div>
              <p className="text-sm leading-6 text-[#95A5A6]">
                Escríbenos y con gusto evaluamos cómo podemos apoyar a tu organización.
              </p>
              <a href="mailto:marketanalyzer@acconsult.net"
                className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:opacity-90" style={{ background: "#1B4965" }}>
                marketanalyzer@acconsult.net
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-[#ECF0F1] px-6 py-10 md:px-10" style={{ background: "#2C3E50" }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ac-consulting-logo.svg" alt="AC Consulting"
            style={{ width: 30, height: 30, filter: "brightness(0) invert(1)" }} />
          <p className="text-sm text-[#95A5A6]">© 2019 Corporación AC Consulting C.A. — RIF J-40503867-5</p>
          <p className="text-xs" style={{ color: "#5FA5E3" }}>Todos los derechos reservados.</p>
        </div>
      </footer>

    </div>
  );
}
