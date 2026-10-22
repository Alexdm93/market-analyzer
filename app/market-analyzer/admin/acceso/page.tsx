"use client";

/**
 * La bandeja de solicitudes de acceso.
 *
 * Tres estados y dos pasos: una solicitud llega pendiente, el admin la acepta
 * o la deniega, y a las aceptadas les crea la cuenta cuando quiere. Esa
 * separación es a propósito —se puede aceptar hoy y crear mañana, cuando la
 * empresa esté dada de alta— así que la bandeja marca aparte las aprobadas a
 * las que todavía les falta usuario (AC Consulting, 2026-10-21).
 *
 * Las credenciales se entregan a mano: el sistema no manda correos. Por eso,
 * apenas se crea la cuenta, la pantalla muestra correo y clave con un botón
 * para copiarlas y mandárselas al cliente por donde ya se le escribe.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Building2, Check, ClipboardCheck, Copy, Clock, Loader2, Mail,
  RotateCcw, UserPlus, X,
} from "lucide-react";

import UserRegistrationForm, { type UserRegistrationValues } from "@/components/UserRegistrationForm";
import type { SolicitudAccesoFila } from "@/app/api/admin/acceso/route";

const BADGE: Record<SolicitudAccesoFila["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-teal-50 text-teal-700",
  REJECTED: "bg-red-50 text-red-700",
};

const ETIQUETA: Record<SolicitudAccesoFila["status"], string> = {
  PENDING: "Pendiente",
  APPROVED: "Aceptada",
  REJECTED: "Denegada",
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BandejaAccesoPage() {
  const [solicitudes, setSolicitudes] = useState<SolicitudAccesoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState("");

  /** La solicitud a la que se le está creando la cuenta. */
  const [creando, setCreando] = useState<SolicitudAccesoFila | null>(null);
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  const [errorAlta, setErrorAlta] = useState("");
  /** Las credenciales recién creadas, para copiarlas una vez. */
  const [credenciales, setCredenciales] = useState<{ correo: string; clave: string; empresa: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [creandoEmpresa, setCreandoEmpresa] = useState(false);
  const [pestana, setPestana] = useState<SolicitudAccesoFila["status"]>("PENDING");

  const cargar = useCallback(async (): Promise<SolicitudAccesoFila[]> => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/admin/acceso", { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as { solicitudes?: SolicitudAccesoFila[]; message?: string } | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo cargar la bandeja."); return []; }
      const filas = d?.solicitudes ?? [];
      setSolicitudes(filas);
      return filas;
    } catch {
      setError("No se pudo cargar la bandeja.");
      return [];
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function resolver(id: string, accion: "aceptar" | "denegar" | "reabrir", motivo?: string) {
    setTrabajando(id);
    setError("");
    setAviso("");
    try {
      const res = await fetch("/api/admin/acceso", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, accion, motivo }),
      });
      const d = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) { setError(d?.message ?? "No se pudo actualizar la solicitud."); return; }
      const frescas = await cargar();
      // Aceptar y crear la cuenta son dos pasos, pero lo normal es hacerlos
      // seguidos: al aceptar se abre el alta sola, con la solicitud ya
      // recargada para que traiga el cruce con el catálogo de empresas
      // (AC Consulting, 2026-10-22).
      if (accion === "aceptar") {
        const recien = frescas.find((x) => x.id === id);
        if (recien) { setErrorAlta(""); setCreando(recien); setPestana("APPROVED"); }
      }
    } finally {
      setTrabajando("");
    }
  }

  /**
   * Da de alta la empresa de la solicitud sin salir del modal.
   *
   * Sin esto había que irse a Empresas, crearla y volver; y mientras tanto el
   * selector mostraba otra empresa cualquiera, con el riesgo de crear al
   * usuario en la que no era.
   */
  async function crearEmpresa() {
    if (!creando) return;
    setCreandoEmpresa(true);
    setErrorAlta("");
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: creando.empresa,
          description: "",
          economicSector: creando.sector,
          classification: creando.clasificacion,
        }),
      });
      const d = (await res.json().catch(() => null)) as
        { company?: { id: string; name: string }; message?: string } | null;
      if (!res.ok || !d?.company) {
        setErrorAlta(d?.message ?? "No se pudo crear la empresa.");
        return;
      }
      // El formulario lee su valor inicial una sola vez, así que se reabre con
      // la empresa recién creada ya elegida.
      setCreando({ ...creando, empresaDelCatalogo: d.company });
    } catch {
      setErrorAlta("No se pudo crear la empresa.");
    } finally {
      setCreandoEmpresa(false);
    }
  }

  async function denegar(s: SolicitudAccesoFila) {
    const motivo = window.prompt(`¿Por qué se deniega la solicitud de ${s.nombre}? (queda como nota interna)`) ?? "";
    await resolver(s.id, "denegar", motivo);
  }

  async function crearUsuario(values: UserRegistrationValues) {
    if (!creando) return;
    setCreandoUsuario(true);
    setErrorAlta("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          companyId: values.companyId,
          companyName: values.companyName,
          companyDescription: values.companyDescription,
          companyEconomicSector: values.companyEconomicSector,
          companyClassification: values.companyClassification,
          password: values.password,
          role: values.role,
        }),
      });
      const d = (await res.json().catch(() => null)) as
        { user?: { id?: string }; message?: string } | null;
      if (!res.ok) { setErrorAlta(d?.message ?? "No fue posible crear la cuenta."); return; }

      // La solicitud deja de contar como "falta crear el usuario". Si esto
      // fallara, la cuenta ya existe igual: se avisa pero no se deshace nada.
      const marcada = await fetch("/api/admin/acceso", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: creando.id, accion: "usuario-creado", usuarioId: d?.user?.id ?? "" }),
      }).catch(() => null);

      setCredenciales({ correo: values.email.trim(), clave: values.password, empresa: creando.empresa });
      setCreando(null);
      setCopiado(false);
      if (!marcada?.ok) {
        setAviso("La cuenta quedó creada, pero no se pudo marcar la solicitud. Refresca la bandeja.");
      }
      await cargar();
    } catch {
      setErrorAlta("No fue posible crear la cuenta.");
    } finally {
      setCreandoUsuario(false);
    }
  }

  async function copiarCredenciales() {
    if (!credenciales) return;
    const texto = `Market Analyzer — acceso\nEmpresa: ${credenciales.empresa}\nUsuario: ${credenciales.correo}\nContraseña: ${credenciales.clave}\nhttps://www.acconsult.net/market-analyzer/signin`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setAviso("El navegador no dejó copiar. Selecciona el texto a mano.");
    }
  }

  const pendientes = solicitudes.filter((s) => s.status === "PENDING");
  const aprobadas = solicitudes.filter((s) => s.status === "APPROVED");
  const rechazadas = solicitudes.filter((s) => s.status === "REJECTED");
  const sinUsuario = aprobadas.filter((s) => !s.usuarioCreadoId);

  const PESTANAS = [
    { clave: "PENDING" as const, etiqueta: "Pendientes", filas: pendientes },
    { clave: "APPROVED" as const, etiqueta: "Aprobadas", filas: aprobadas },
    { clave: "REJECTED" as const, etiqueta: "Rechazadas", filas: rechazadas },
  ];
  const visibles = PESTANAS.find((p) => p.clave === pestana)?.filas ?? [];

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow mb-3">Administración</div>
          <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">
            Solicitudes de acceso.
          </h1>
          <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
            Lo que llega del formulario público. Aceptar una solicitud no crea la cuenta: la
            creas tú después, y las credenciales se las envías por donde ya le escribes al cliente,
            porque el sistema no manda correos.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
              {pendientes.length} {pendientes.length === 1 ? "pendiente" : "pendientes"}
            </span>
            {sinUsuario.length > 0 && (
              <span className="rounded-full bg-teal-50 px-3 py-1 font-semibold text-teal-700">
                {sinUsuario.length} {sinUsuario.length === 1 ? "aceptada sin cuenta" : "aceptadas sin cuenta"}
              </span>
            )}
          </div>
        </section>

        {error && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {aviso && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {aviso}
          </p>
        )}

        {credenciales && (
          <section className="rounded-[2rem] border border-teal-200 bg-teal-50 p-6">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Cuenta creada para {credenciales.empresa}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Cópialas y mándaselas. También quedan visibles en Admin → Usuarios y roles.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-white px-4 py-3 text-sm text-slate-800">
{`Usuario: ${credenciales.correo}
Contraseña: ${credenciales.clave}`}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void copiarCredenciales()} className="btn btn-primary btn-sm">
                    <Copy className="h-4 w-4" /> {copiado ? "Copiado" : "Copiar credenciales"}
                  </button>
                  <button type="button" onClick={() => setCredenciales(null)} className="btn btn-secondary btn-sm">
                    Listo
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando solicitudes…
          </p>
        ) : solicitudes.length === 0 ? (
          <section className="surface-panel rounded-[2rem] p-8 text-center">
            <Mail className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">Todavía no llegó ninguna solicitud.</p>
          </section>
        ) : (
          <>
            {/* Nada se borra: una solicitud resuelta se queda con quién la
                resolvió y cuándo, para poder volver sobre ella. */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Estado de las solicitudes">
              {PESTANAS.map((p) => (
                <button
                  key={p.clave}
                  type="button"
                  role="tab"
                  aria-selected={pestana === p.clave}
                  onClick={() => setPestana(p.clave)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    pestana === p.clave
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {p.etiqueta}
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold ${
                    pestana === p.clave ? "bg-white/20" : "bg-slate-100 text-slate-600"
                  }`}>
                    {p.filas.length}
                  </span>
                </button>
              ))}
            </div>

            <section className="space-y-3">
              {visibles.length === 0 ? (
                <p className="surface-panel rounded-[2rem] p-8 text-center text-sm text-slate-500">
                  Nada en esta pestaña.
                </p>
              ) : visibles.map((s) => (
                <Tarjeta
                  key={s.id} s={s} trabajando={trabajando === s.id}
                  onAceptar={() => void resolver(s.id, "aceptar")}
                  onDenegar={() => void denegar(s)}
                  onCrear={() => { setErrorAlta(""); setCreando(s); }}
                  onReabrir={() => void resolver(s.id, "reabrir")}
                />
              ))}
            </section>
          </>
        )}
      </div>

      {creando && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow mb-0.5">Alta controlada</div>
                <h2 className="font-display text-2xl font-bold text-slate-900 md:text-[1.35rem]">Crear usuario</h2>
                <p className="mt-1 text-sm text-slate-600">
                  De la solicitud de <strong>{creando.nombre}</strong> · {creando.empresa}
                </p>
              </div>
              <button type="button" onClick={() => setCreando(null)} aria-label="Cerrar"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!creando.empresaDelCatalogo && (
              <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="flex items-start gap-1.5">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    «{creando.empresa}» no está en el catálogo, así que abajo no hay ninguna empresa
                    elegida. Créala de una vez o elige a mano la que corresponda.
                  </span>
                </p>
                <button type="button" onClick={() => void crearEmpresa()} disabled={creandoEmpresa}
                  className="btn btn-secondary btn-sm mt-3">
                  {creandoEmpresa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                  {creandoEmpresa ? "Creando…" : `Crear «${creando.empresa}»`}
                </button>
              </div>
            )}

            <div className="mt-5">
              <UserRegistrationForm
                key={creando.empresaDelCatalogo?.id ?? "sin-empresa"}
                allowRoleSelection
                forceExistingCompanySelector
                isSubmitting={creandoUsuario}
                externalError={errorAlta}
                submitLabel="Crear usuario"
                submittingLabel="Creando usuario…"
                valoresIniciales={{
                  name: creando.nombre,
                  email: creando.correo,
                  companyId: creando.empresaDelCatalogo?.id ?? "",
                }}
                onSubmit={crearUsuario}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Tarjeta({
  s, trabajando, onAceptar, onDenegar, onCrear, onReabrir,
}: {
  s: SolicitudAccesoFila;
  trabajando: boolean;
  onAceptar: () => void;
  onDenegar: () => void;
  onCrear: () => void;
  onReabrir: () => void;
}) {
  const faltaCuenta = s.status === "APPROVED" && !s.usuarioCreadoId;

  return (
    <article className="surface-panel rounded-[2rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-slate-900">{s.nombre}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${BADGE[s.status]}`}>
              {ETIQUETA[s.status]}
            </span>
            {faltaCuenta && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-bold text-slate-600">
                Falta crear la cuenta
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {s.correo}{s.cargo && ` · ${s.cargo}`}{s.telefono && ` · ${s.telefono}`}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            <strong className="text-slate-800">{s.empresa}</strong>
            {s.sector && ` · ${s.sector}`}
            {s.clasificacion && ` · ${s.clasificacion}`}
            {s.headcount && ` · ${s.headcount} empleados`}
            {s.localidad && ` · ${s.localidad}`}
          </p>
        </div>
        <span className="flex items-center gap-1 whitespace-nowrap text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" /> {fecha(s.createdAt)}
        </span>
      </div>

      {s.mensaje && (
        <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">{s.mensaje}</p>
      )}

      {s.yaTieneCuentaEn.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Ese correo ya tiene cuenta en {s.yaTieneCuentaEn.join(", ")}. Puede ser la misma persona
          pidiendo acceso para otra empresa, o un duplicado.
        </p>
      )}

      {s.status === "REJECTED" && s.motivoRechazo && (
        <p className="mt-3 text-xs text-slate-500">Motivo: {s.motivoRechazo}</p>
      )}
      {s.resueltoPor && (
        <p className="mt-2 text-xs text-slate-400">
          {ETIQUETA[s.status]} por {s.resueltoPor}{s.resueltoEn && ` el ${fecha(s.resueltoEn)}`}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {s.status === "PENDING" && (
          <>
            <button type="button" onClick={onAceptar} disabled={trabajando} className="btn btn-primary btn-sm">
              {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aceptar
            </button>
            <button type="button" onClick={onDenegar} disabled={trabajando} className="btn btn-secondary btn-sm">
              <X className="h-4 w-4" /> Denegar
            </button>
          </>
        )}
        {faltaCuenta && (
          <button type="button" onClick={onCrear} className="btn btn-primary btn-sm">
            <UserPlus className="h-4 w-4" /> Crear usuario
          </button>
        )}
        {s.status !== "PENDING" && (
          <button type="button" onClick={onReabrir} disabled={trabajando} className="btn btn-secondary btn-sm">
            <RotateCcw className="h-4 w-4" /> Volver a pendiente
          </button>
        )}
      </div>
    </article>
  );
}
