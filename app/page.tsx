"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  ChevronRight, ChevronLeft, Menu, X,
  Target, Eye, Star, Users, ExternalLink,
  Rocket, BarChart2, Globe, Bell, LogOut, LogIn,
} from "lucide-react";

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
      className="w-72 shrink-0 rounded-[1.75rem] border border-white bg-white p-6 transition-all duration-500"
      style={{
        transform: active ? "scale(1) translateY(0px)" : "scale(0.88) translateY(12px)",
        opacity: active ? 1 : 0.45,
        boxShadow: active ? "0 24px 60px rgba(27,73,101,0.18)" : "0 4px 16px rgba(27,73,101,0.06)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold ${slide.badgeColor}`}>
          {slide.badge}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: slide.iconBg }}>
          <Icon size={15} />
        </div>
      </div>
      <h3 className="font-display text-sm font-black leading-snug text-[#2C3E50]">{slide.title}</h3>
      <p className="mt-2 text-xs leading-5 text-[#95A5A6]">{slide.body}</p>
      {active && (
        <Link href={slide.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
          style={{ background: slide.iconBg }}>
          {slide.cta} <ChevronRight size={12} />
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
      className="relative flex items-center justify-center gap-3 md:gap-4"
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
        className="absolute left-0 md:-left-6 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md text-[#2C3E50] transition hover:shadow-lg hover:text-[#1B4965]">
        <ChevronLeft size={18} />
      </button>
      <button onClick={next}
        className="absolute right-0 md:-right-6 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md text-[#2C3E50] transition hover:shadow-lg hover:text-[#1B4965]">
        <ChevronRight size={18} />
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
            {status !== "loading" && (
              session?.user ? (
                <div className="hidden md:flex items-center gap-2">
                  <Link href="/market-analyzer/inicio"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1B4965] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#153a52]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-black uppercase">
                      {session.user.name?.charAt(0) ?? "?"}
                    </span>
                    Dashboard <ChevronRight size={14} />
                  </Link>
                  <button onClick={() => { setSigningOut(true); void signOut({ callbackUrl: "/" }); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#ECF0F1] px-3 py-2 text-sm font-semibold text-[#95A5A6] transition hover:border-red-200 hover:text-red-500">
                    <LogOut size={14} />
                  </button>
                </div>
              ) : (
                <Link href="/market-analyzer/signin"
                  className="hidden md:inline-flex items-center gap-2 rounded-xl bg-[#1B4965] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#153a52]">
                  <LogIn size={14} /> Iniciar sesión
                </Link>
              )
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
            {session?.user ? (
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/market-analyzer/inicio"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#1B4965] px-4 py-3 text-sm font-bold text-white"
                  onClick={() => setMobileOpen(false)}>
                  Ir al Dashboard <ChevronRight size={14} />
                </Link>
                <button onClick={() => { setSigningOut(true); void signOut({ callbackUrl: "/" }); }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[#ECF0F1] px-4 py-2.5 text-sm font-semibold text-[#95A5A6]">
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            ) : (
              <Link href="/market-analyzer/signin"
                className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#1B4965] px-4 py-3 text-sm font-bold text-white"
                onClick={() => setMobileOpen(false)}>
                <LogIn size={14} /> Iniciar sesión
              </Link>
            )}
          </div>
        )}
      </header>

      {/* ── HERO ───────────────────────────────────────────── */}
      <section id="inicio" className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-[72px] pb-20 md:px-10">
        {/* Subtle bg gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(27,73,101,0.08),transparent)]" />

        <div className="relative flex w-full max-w-5xl flex-col items-center text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#CAE9FF] bg-[#EEF7FF] px-4 py-1.5 text-sm font-semibold text-[#1B4965]">
            <span className="h-2 w-2 rounded-full bg-[#5FA5E3] shrink-0" />
            Asesoría y Consultoría en Gestión Humana
          </div>

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

          {/* ── AUTH ROW ─── */}
          <div className="mt-16 flex flex-col items-center gap-3">
            {status === "loading" ? (
              <div className="h-10 w-48 animate-pulse rounded-xl bg-[#ECF0F1]" />
            ) : session?.user ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-3 rounded-2xl border border-[#ECF0F1] bg-[#ECF0F1]/60 px-5 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B4965] font-display text-sm font-black text-white uppercase">
                    {session.user.name?.charAt(0) ?? "?"}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-[#2C3E50]">{session.user.name}</div>
                    {session.user.companyName && (
                      <div className="text-xs text-[#95A5A6]">{session.user.companyName}</div>
                    )}
                  </div>
                  <Link href="/market-analyzer/inicio"
                    className="ml-3 inline-flex items-center gap-1.5 rounded-xl bg-[#1B4965] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#153a52]">
                    Ir al Dashboard <ChevronRight size={14} />
                  </Link>
                </div>
                <button
                  onClick={() => { setSigningOut(true); void signOut({ callbackUrl: "/" }); }}
                  disabled={signingOut}
                  className="text-xs text-[#95A5A6] transition hover:text-red-500 flex items-center gap-1">
                  <LogOut size={12} /> {signingOut ? "Cerrando sesión..." : "Cerrar sesión"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Link href="/market-analyzer/signin"
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#1B4965] px-8 py-3.5 text-base font-bold text-white transition hover:bg-[#153a52]">
                  <LogIn size={16} /> Iniciar sesión en Market Analyzer
                </Link>
                <p className="text-xs text-[#95A5A6]">
                  Venezuela · Costa Rica · Colombia · Curazao · Ecuador
                </p>
              </div>
            )}
          </div>
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
