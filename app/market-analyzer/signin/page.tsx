"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { BarChart2, LoaderCircle, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { signIn, useSession } from "next-auth/react";

type CompanyOption = { id: string; name: string };

export default function SignInPage() {
  const router = useRouter();
  const { status } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(true);
  const [isPending, startTransition] = useTransition();
  const lastLookedUp = useRef("");

  useEffect(() => {
    if (status === "authenticated") router.replace("/market-analyzer/inicio");
  }, [router, status]);

  useEffect(() => {
    fetch("/api/companies", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { bootstrapRequired?: boolean }) => setBootstrapRequired(Boolean(d.bootstrapRequired)))
      .catch(() => {})
      .finally(() => setIsLoadingBootstrap(false));
  }, []);

  function resetCompanies() {
    setCompanies(null);
    setCompanyId("");
    setLookupError("");
    lastLookedUp.current = "";
  }

  async function lookupByEmail(raw: string) {
    const normalized = raw.trim().toLowerCase();
    if (!normalized || normalized === lastLookedUp.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return;

    lastLookedUp.current = normalized;
    setIsLookingUp(true);
    setLookupError("");
    setCompanies(null);
    setCompanyId("");

    try {
      const res = await fetch(`/api/auth/user-companies?email=${encodeURIComponent(normalized)}`, { cache: "no-store" });
      const data = (await res.json()) as { companies?: CompanyOption[] };
      const found = data.companies ?? [];
      setCompanies(found);
      if (found.length === 1) setCompanyId(found[0].id);
      else if (found.length === 0) setLookupError("No se encontró ninguna cuenta con ese correo.");
    } catch {
      setLookupError("Error al verificar el correo. Intenta de nuevo.");
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    if (!companyId) {
      setError("Selecciona una empresa.");
      setIsSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      companyId,
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Correo o contraseña incorrectos.");
      setIsSubmitting(false);
      return;
    }

    startTransition(() => {
      router.replace("/market-analyzer/inicio");
      router.refresh();
    });
  }

  const isBootstrap = !isLoadingBootstrap && bootstrapRequired;
  const companiesReady = companies !== null && companies.length > 0;
  const canSubmit = companiesReady && !!companyId && !!email && !!password && !isSubmitting && !isPending && !isLookingUp;

  return (
    <main className="relative flex min-h-screen w-full flex-col overflow-x-hidden px-4 pt-6 pb-8 sm:px-6 sm:pt-8 md:px-10 md:pt-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(217,119,6,0.14),transparent_28%)]" />
      <div className="relative mx-auto grid flex-1 w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1.15fr)_26rem] lg:gap-8">
        <section className="surface-panel min-w-0 rounded-[2rem] p-6 md:p-8 lg:p-10">
          <div className="eyebrow mb-3">Acceso privado</div>
          <h1 className="font-display max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            Bienvenido a AC Consulting.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            La plataforma definitiva de benchmarking salarial. Ingresa con tus credenciales corporativas para consultar tabuladores, comparar curvas de mercado y medir la competitividad de tu organización.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="metric-tile">
              <ShieldCheck className="h-5 w-5 text-teal-700" />
              <div className="mt-4 font-display text-lg font-bold text-slate-900">Entorno Exclusivo</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Un espacio privado y centralizado para los especialistas de compensación y gestión humana de tu empresa.</p>
            </div>
            <div className="metric-tile">
              <LockKeyhole className="h-5 w-5 text-amber-700" />
              <div className="mt-4 font-display text-lg font-bold text-slate-900">Máxima Confidencialidad</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Protegemos la integridad de tu información. Todos los datos están respaldados por estrictos protocolos de seguridad.</p>
            </div>
            <div className="metric-tile">
              <BarChart2 className="h-5 w-5 text-indigo-700" />
              <div className="mt-4 font-display text-lg font-bold text-slate-900">Análisis Estratégico</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Visualiza reportes dinámicos y compara escenarios.</p>
            </div>
          </div>
        </section>

        <section className="surface-card min-w-0 rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-2">Iniciar sesión</div>
          <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Acceso al Sistema</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {isBootstrap
              ? "La base está vacía. Crea primero el usuario administrador inicial."
              : "Ingresa tu correo corporativo para continuar."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {!isBootstrap && (
              <>
                {/* Correo */}
                <div>
                  <label htmlFor="email" className="field-label">Correo</label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); resetCompanies(); }}
                      onBlur={() => lookupByEmail(email)}
                      className="field pr-9"
                      placeholder="usuario@tuempresa.com"
                      autoComplete="email"
                      required
                    />
                    {isLookingUp && (
                      <LoaderCircle className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                    )}
                  </div>
                  {lookupError && (
                    <p className="mt-1.5 text-xs text-red-600">{lookupError}</p>
                  )}
                </div>

                {/* Selector de empresa — aparece solo si hay resultados */}
                {companiesReady && (
                  <div>
                    <label htmlFor="companyId" className="field-label">Empresa</label>
                    {companies!.length === 1 ? (
                      <div className="field flex items-center gap-2 bg-slate-50 text-slate-700">
                        <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                        {companies![0].name}
                      </div>
                    ) : (
                      <select
                        id="companyId"
                        value={companyId}
                        onChange={(e) => setCompanyId(e.target.value)}
                        className="field-select"
                        required
                      >
                        <option value="">Selecciona una empresa</option>
                        {companies!.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Contraseña */}
                <div>
                  <label htmlFor="password" className="field-label">Contraseña</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field"
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </>
            )}

            {error && (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            )}

            {isBootstrap && (
              <Link href="/market-analyzer/register" className="btn btn-secondary w-full">
                <LogIn className="h-4 w-4" />
                Crear admin inicial
              </Link>
            )}

            {!isBootstrap && (
              <button type="submit" className="btn btn-primary w-full" disabled={!canSubmit}>
                {isSubmitting || isPending
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <LogIn className="h-4 w-4" />}
                {isSubmitting || isPending ? "Iniciando sesión..." : "Entrar a AC Consulting →"}
              </button>
            )}
          </form>

          {!isBootstrap && (
            <p className="mt-6 text-center text-xs leading-5 text-slate-500">
              Si tiene problema para iniciar sesión, olvidó la clave o desea registrarse debe escribir un correo a{" "}
              <a href="mailto:marketanalyzer@acconsult.net" className="font-semibold text-teal-700 hover:underline">
                marketanalyzer@acconsult.net
              </a>
            </p>
          )}
        </section>
      </div>

    </main>
  );
}
