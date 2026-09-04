"use client";
import { useEffect, useState } from "react";
import { Check, ClipboardCheck, Clock, History, Loader2, X } from "lucide-react";

type EditRequestRow = {
  id: string;
  snapshotId: string;
  snapshotLabel: string;
  snapshotDate: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  userName: string;
  userEmail: string;
  companyName: string;
};

const STATUS_BADGE: Record<EditRequestRow["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-teal-50 text-teal-700",
  REJECTED: "bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<EditRequestRow["status"], string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

function formatDateTime(raw: string | null) {
  if (!raw) return "—";
  return new Date(raw).toLocaleString("es-VE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AprobacionesPage() {
  const [requests, setRequests] = useState<EditRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [notification, setNotification] = useState("");

  function notify(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3500);
  }

  async function load(status: "PENDING" | "ALL") {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/edit-requests?status=${status}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { requests?: EditRequestRow[]; message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "No fue posible cargar las solicitudes.");
      setRequests(data?.requests ?? []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Error al cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(showHistory ? "ALL" : "PENDING"); }, [showHistory]);

  async function resolve(id: string, action: "approve" | "reject") {
    setResolvingId(id);
    try {
      const res = await fetch("/api/admin/edit-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "No se pudo procesar la solicitud.");
      notify(action === "approve" ? "Solicitud aprobada — el corte quedó reabierto para el usuario." : "Solicitud rechazada.");
      await load(showHistory ? "ALL" : "PENDING");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Error al procesar la solicitud.");
    } finally {
      setResolvingId(null);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow mb-3">Administración</div>
              <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Aprobaciones.</h1>
              <p className="dashboard-lead mt-3 max-w-2xl text-slate-600">
                Solicitudes de empresas que ya enviaron su corte y necesitan reabrirlo para corregir algo.
              </p>
            </div>
            <button type="button" onClick={() => setShowHistory((v) => !v)} className="btn btn-secondary shrink-0">
              <History className="h-4 w-4" />
              {showHistory ? "Ver solo pendientes" : "Ver historial completo"}
            </button>
          </div>
        </section>

        {notification && (
          <div className="flex items-center gap-2 rounded-[1.5rem] border border-teal-200 bg-teal-50 px-5 py-3 text-sm font-semibold text-teal-700">
            <Check className="h-4 w-4 shrink-0" />
            {notification}
          </div>
        )}

        <section className="surface-card rounded-[2rem] p-6 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando solicitudes...
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-500">
              <ClipboardCheck className="h-8 w-8 text-slate-300" />
              <p className="text-sm">
                {showHistory ? "Aún no hay solicitudes registradas." : "No hay solicitudes pendientes."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {!showHistory && pendingCount > 0 && (
                <p className="text-sm text-slate-500">{pendingCount} solicitud{pendingCount === 1 ? "" : "es"} esperando tu revisión.</p>
              )}
              {requests.map((r) => (
                <div key={r.id} className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-bold text-slate-900">{r.companyName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${STATUS_BADGE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {r.userName} ({r.userEmail}) — corte <span className="font-semibold">{r.snapshotLabel}</span>
                      </p>
                      {r.reason && (
                        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">“{r.reason}”</p>
                      )}
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        Solicitada el {formatDateTime(r.createdAt)}
                        {r.status !== "PENDING" && r.resolvedAt && (
                          <> · {STATUS_LABEL[r.status].toLowerCase()} el {formatDateTime(r.resolvedAt)}{r.resolvedByName ? ` por ${r.resolvedByName}` : ""}</>
                        )}
                      </p>
                    </div>

                    {r.status === "PENDING" && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void resolve(r.id, "reject")}
                          disabled={resolvingId === r.id}
                          className="btn btn-secondary"
                        >
                          <X className="h-4 w-4" />
                          Rechazar
                        </button>
                        <button
                          type="button"
                          onClick={() => void resolve(r.id, "approve")}
                          disabled={resolvingId === r.id}
                          className="btn btn-primary"
                        >
                          {resolvingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Aprobar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
