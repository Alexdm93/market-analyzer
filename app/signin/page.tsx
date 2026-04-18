"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { signIn, useSession } from "next-auth/react";

export default function SignInPage() {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [router, status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Correo o contrasena incorrectos.");
      setIsSubmitting(false);
      return;
    }

    startTransition(() => {
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(217,119,6,0.14),transparent_28%)]" />
      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-6 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1.15fr)_26rem] lg:gap-8">
        <section className="surface-panel min-w-0 rounded-[2rem] p-6 md:p-8 lg:p-10">
          <div className="eyebrow mb-3">Acceso privado</div>
          <h1 className="font-display max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            Inicia sesion con una cuenta local creada dentro de la plataforma.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            Este flujo ya no depende de Microsoft u otro proveedor externo. Tus credenciales se validan contra usuarios registrados en la aplicacion.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="metric-tile">
              <ShieldCheck className="h-5 w-5 text-teal-700" />
              <div className="mt-4 font-display text-lg font-bold text-slate-900">Sesion propia</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Controlas el alta de usuarios y no dependes de un tenant externo.</p>
            </div>
            <div className="metric-tile">
              <LockKeyhole className="h-5 w-5 text-amber-700" />
              <div className="mt-4 font-display text-lg font-bold text-slate-900">Clave cifrada</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">La contrasena no se almacena en texto plano; se guarda con hash seguro.</p>
            </div>
            <div className="metric-tile">
              <LogIn className="h-5 w-5 text-slate-900" />
              <div className="mt-4 font-display text-lg font-bold text-slate-900">Base para permisos</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Luego puedes filtrar snapshots y datos segun el usuario autenticado.</p>
            </div>
          </div>
        </section>

        <section className="surface-card min-w-0 rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-2">Iniciar sesion</div>
          <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Bienvenido</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Usa el correo y la contrasena que registraste en la plataforma.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="field-label">Correo</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field"
                placeholder="equipo@empresa.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="field-label">Contrasena</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field"
                placeholder="Minimo 8 caracteres"
                autoComplete="current-password"
                required
              />
            </div>

            {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

            <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting || isPending || status === "loading"}>
              {isSubmitting || isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {isSubmitting || isPending ? "Iniciando sesion..." : "Entrar"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}