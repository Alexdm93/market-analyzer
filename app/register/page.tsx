"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, ShieldPlus, UserPlus } from "lucide-react";
import { signIn, useSession } from "next-auth/react";

export default function RegisterPage() {
  const router = useRouter();
  const { status } = useSession();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      setIsSubmitting(false);
      return;
    }

    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ companyName, name, email, password }),
    });

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;

    if (!response.ok) {
      setError(payload?.message ?? "No fue posible crear la cuenta.");
      setIsSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("La cuenta fue creada, pero no se pudo iniciar sesion automaticamente.");
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(15,118,110,0.14),transparent_30%)]" />
      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-6 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[24rem_minmax(0,1.1fr)] lg:gap-8">
        <section className="surface-card min-w-0 rounded-[2rem] p-6 md:p-8 lg:order-2">
          <div className="eyebrow mb-2">Registro</div>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Crear cuenta</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Esta cuenta sera la base para asociar datos y permisos por usuario.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="companyName" className="field-label">Empresa</label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="field"
                placeholder="Nombre de la empresa"
                autoComplete="organization"
                required
              />
            </div>
            <div>
              <label htmlFor="name" className="field-label">Nombre</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="field"
                placeholder="Nombre del usuario"
                autoComplete="name"
                required
              />
            </div>
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
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="field-label">Confirmar contrasena</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="field"
                placeholder="Repite la contrasena"
                autoComplete="new-password"
                required
              />
            </div>

            {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

            <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting || isPending || status === "loading"}>
              {isSubmitting || isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {isSubmitting || isPending ? "Registrando cuenta..." : "Crear cuenta"}
            </button>
          </form>

          <p className="mt-5 text-sm text-slate-600">
            Ya tienes cuenta?{" "}
            <Link href="/signin" className="font-bold text-teal-700 hover:text-teal-800">
              Entrar
            </Link>
          </p>
        </section>

        <section className="surface-panel min-w-0 rounded-[2rem] p-6 md:p-8 lg:order-1 lg:p-10">
          <div className="eyebrow mb-3">Usuarios internos</div>
          <h2 className="font-display max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            Registro local para empezar sin proveedor externo.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            Esta primera version deja listo el alta de usuarios con correo y contrasena propios. Luego puedes sumar roles, aprobacion manual y recuperacion de clave.
          </p>
          <div className="mt-8 space-y-4">
            <div className="metric-tile flex items-start gap-4">
              <ShieldPlus className="mt-1 h-5 w-5 text-teal-700" />
              <div>
                <div className="font-display text-lg font-bold text-slate-900">Sin dependencia externa</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">No necesitas cuenta Microsoft ni configurar consentimientos del tenant para arrancar.</p>
              </div>
            </div>
            <div className="metric-tile flex items-start gap-4">
              <CheckCircle2 className="mt-1 h-5 w-5 text-amber-700" />
              <div>
                <div className="font-display text-lg font-bold text-slate-900">Preparado para datos por usuario</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">Una vez autenticado, podremos enlazar snapshots, preferencias y permisos a ese usuario.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}