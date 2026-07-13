"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X, ChevronRight, Users, Target, Eye, Star, Instagram, Linkedin, Twitter } from "lucide-react";

const NAV_LINKS = [
  { label: "Inicio", href: "#inicio" },
  { label: "Quiénes somos", href: "#nosotros" },
  { label: "Portafolio", href: "#portafolio" },
  { label: "Contacto", href: "#contacto" },
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

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-slate-800">

      {/* ── Navbar ───────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5 md:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ac-consulting-logo.svg" alt="AC Consulting" style={{ width: 36, height: 36 }} />
            <div className="leading-none">
              <div className="font-display text-[13px] font-black tracking-tight text-slate-900">AC Consulting</div>
              <div className="text-[10px] text-slate-500 tracking-wide">Gestión Humana</div>
            </div>
          </Link>

          {/* Desktop links */}
          <nav className="hidden md:flex items-center gap-1 ml-4 flex-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-xl px-3.5 py-2 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/market-analyzer/signin"
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-teal-800"
            >
              Market Analyzer
              <ChevronRight size={14} />
            </Link>
            <button
              className="md:hidden rounded-xl p-2 text-slate-600 hover:bg-slate-100"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menú"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="border-t border-slate-100 bg-white px-5 pb-4 md:hidden">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="block py-2.5 text-sm font-semibold text-slate-700"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/market-analyzer/signin"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white"
              onClick={() => setMobileOpen(false)}
            >
              Market Analyzer <ChevronRight size={14} />
            </Link>
          </div>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        id="inicio"
        className="relative flex min-h-screen items-center overflow-hidden pt-20"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(15,118,110,0.12),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(217,119,6,0.10),transparent_50%)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-32">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-xs font-semibold text-teal-700">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Asesoría y Consultoría en Gestión Humana
            </div>
            <h1 className="font-display text-5xl font-black tracking-tight text-slate-900 md:text-6xl lg:text-7xl">
              Bienvenido a<br />
              <span className="text-teal-700">AC Consulting</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600 md:text-xl">
              Compañía especializada en asesoría, consultoría, desarrollo e implementación
              de proyectos de Capital Humano para sectores públicos, privados y sin fines de lucro.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#nosotros"
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-700"
              >
                Conocer más
              </a>
              <Link
                href="/market-analyzer/signin"
                className="inline-flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-6 py-3 text-sm font-bold text-teal-800 transition hover:bg-teal-100"
              >
                Market Analyzer <ChevronRight size={15} />
              </Link>
            </div>
            <p className="mt-5 text-xs text-slate-400">
              Venezuela · Costa Rica · Colombia · Curazao · Ecuador
            </p>
          </div>
        </div>
      </section>

      {/* ── Quiénes somos ────────────────────────────────────── */}
      <section id="nosotros" className="bg-white py-24">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-widest text-teal-700">Quiénes somos</div>
              <h2 className="font-display text-4xl font-black tracking-tight text-slate-900">
                El Capital Humano al centro de todo
              </h2>
              <p className="mt-6 text-base leading-8 text-slate-600">
                Somos una compañía joven, dinámica e innovadora, especializada en la asesoría, consultoría,
                desarrollo, implementación y puesta en marcha de proyectos relacionados con el corazón de
                las compañías: su <strong>Capital Humano</strong>.
              </p>
              <p className="mt-4 text-base leading-8 text-slate-600">
                Disponemos de un equipo multidisciplinario capaz de detectar y entender los requerimientos
                de nuestros clientes, brindando soluciones integrales que optimizan las estructuras organizacionales.
                Creemos en establecer relaciones a largo plazo, aplicando ideas innovadoras y las mejores
                prácticas del mercado.
              </p>
              <p className="mt-4 text-sm font-semibold text-slate-500">
                Experiencia en Venezuela, Costa Rica, Colombia, Curazao y Ecuador.
              </p>
            </div>

            {/* Mission / Vision / Values */}
            <div className="flex flex-col gap-4">
              {[
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
              ].map(({ icon: Icon, label, text, color }) => (
                <div key={label} className="rounded-2xl border border-slate-100 bg-[#f8f7f4] p-5">
                  <div className="flex items-start gap-4">
                    <div className={`rounded-xl p-2.5 ${color}`}>
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

      {/* ── Diferenciadores ───────────────────────────────────── */}
      <section id="portafolio" className="py-24 bg-[#f8f7f4]">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-teal-700">Por qué elegirnos</div>
          <h2 className="font-display text-4xl font-black tracking-tight text-slate-900">¿Qué nos diferencia?</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DIFFERENTIATORS.map((d, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-black text-white">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="text-sm font-semibold leading-6 text-slate-800">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Market Analyzer CTA ──────────────────────────────── */}
      <section className="bg-teal-700 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center md:px-8">
          <div className="mb-3 text-sm font-semibold text-teal-200">Herramienta exclusiva</div>
          <h2 className="font-display text-4xl font-black tracking-tight text-white">
            Market Analyzer
          </h2>
          <p className="mt-4 text-lg leading-8 text-teal-100">
            La plataforma definitiva de benchmarking salarial. Consulta tabuladores,
            compara curvas de mercado y mide la competitividad de tu organización.
          </p>
          <Link
            href="/market-analyzer/signin"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-3.5 text-sm font-black text-teal-800 transition hover:bg-teal-50"
          >
            Ingresar a Market Analyzer <ChevronRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── Contacto & Social ─────────────────────────────────── */}
      <section id="contacto" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-widest text-teal-700">Contacto</div>
              <h2 className="font-display text-3xl font-black tracking-tight text-slate-900">Síguenos y mantente actualizado</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Conéctate con nosotros en redes sociales para conocer novedades, artículos y proyectos de AC Consulting.
              </p>
              <div className="mt-6 flex gap-3">
                <a
                  href="https://www.instagram.com/ac_consulting/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:text-teal-700"
                >
                  <Instagram size={16} /> Instagram
                </a>
                <a
                  href="https://www.linkedin.com/company/corporacion-ac-consulting"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:text-teal-700"
                >
                  <Linkedin size={16} /> LinkedIn
                </a>
                <a
                  href="https://twitter.com/ACConsulting_"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:text-teal-700"
                >
                  <Twitter size={16} /> Twitter
                </a>
              </div>
            </div>
            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-8">
              <div className="mb-2 flex items-center gap-3">
                <Users size={20} className="text-teal-700" />
                <span className="font-display text-base font-bold text-slate-900">¿Necesitas consultoría?</span>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Escríbenos y con gusto evaluamos cómo podemos apoyar a tu organización.
              </p>
              <a
                href="mailto:marketanalyzer@acconsult.net"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800"
              >
                marketanalyzer@acconsult.net
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-slate-900 px-5 py-10 text-center md:px-8">
        <div className="mx-auto max-w-6xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ac-consulting-logo.svg" alt="AC Consulting" style={{ width: 32, height: 32, filter: "brightness(0) invert(1)", margin: "0 auto 12px" }} />
          <p className="text-xs text-slate-400">
            © 2019 Corporación AC Consulting C.A. — RIF J-40503867-5
          </p>
          <p className="mt-1 text-xs text-slate-500">Todos los derechos reservados.</p>
        </div>
      </footer>

    </div>
  );
}
