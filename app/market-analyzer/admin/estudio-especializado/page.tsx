"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BookOpen, Building2, CalendarDays, RefreshCw, X } from "lucide-react";
import type { EstudioCompany, GlobalSnapshot } from "@/app/api/admin/estudio-especializado/route";

type ModalState = {
  company: EstudioCompany;
  selectedIds: Set<string>;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EstudioEspecializadoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [companies, setCompanies] = useState<EstudioCompany[]>([]);
  const [snapshots, setSnapshots] = useState<GlobalSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [status, session, router]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/estudio-especializado");
      if (res.ok) {
        const json = (await res.json()) as { companies: EstudioCompany[]; snapshots: GlobalSnapshot[] };
        setCompanies(json.companies);
        setSnapshots(json.snapshots);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openModal(company: EstudioCompany) {
    setModal({
      company,
      selectedIds: new Set(company.estudioSnapshotIds),
    });
  }

  function toggleSnapshot(snapshotId: string) {
    setModal((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedIds);
      if (next.has(snapshotId)) next.delete(snapshotId);
      else next.add(snapshotId);
      return { ...prev, selectedIds: next };
    });
  }

  async function saveModal() {
    if (!modal) return;
    const { company, selectedIds } = modal;
    const enabled = selectedIds.size > 0;
    setModal(null);
    setSaving(company.id);
    try {
      await fetch("/api/admin/estudio-especializado", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          enabled,
          snapshotIds: Array.from(selectedIds),
        }),
      });
      const snapshotIds = Array.from(selectedIds);
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === company.id ? { ...c, estudioEnabled: enabled, estudioSnapshotIds: snapshotIds } : c
        )
      );
    } finally {
      setSaving(null);
    }
  }

  async function disable(company: EstudioCompany) {
    setSaving(company.id);
    try {
      await fetch("/api/admin/estudio-especializado", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, enabled: false, snapshotIds: [] }),
      });
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === company.id ? { ...c, estudioEnabled: false, estudioSnapshotIds: [] } : c
        )
      );
    } finally {
      setSaving(null);
    }
  }

  const enabled = companies.filter((c) => c.estudioEnabled).length;

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-5">

        {/* Header */}
        <section className="surface-panel overflow-hidden rounded-[1.75rem] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow mb-1.5">Admin · Accesos</div>
              <h1 className="font-display text-[1.2rem] font-bold tracking-tight text-slate-900 md:text-[1.35rem]">
                Estudio Especializado
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Habilita el acceso al Estudio Especializado por empresa y selecciona los cortes disponibles.
              </p>
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} className="btn btn-secondary flex items-center gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Total empresas</div>
              <div className="metric-value mt-1">{companies.length}</div>
            </div>
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Con acceso</div>
              <div className="metric-value mt-1 text-teal-700">{enabled}</div>
            </div>
            <div className="metric-tile py-2.5 w-40 shrink-0">
              <div className="metric-label">Cortes disponibles</div>
              <div className="metric-value mt-1">{snapshots.length}</div>
            </div>
          </div>
        </section>

        {/* Company list */}
        <section className="surface-card overflow-hidden rounded-[2rem]">
          {loading && companies.length === 0 ? (
            <div className="flex flex-col gap-2 p-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-[1rem] bg-slate-100" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 size={32} className="mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Sin empresas registradas</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {companies.map((company) => (
                <div key={company.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{company.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{company.economicSector}</span>
                      <span>·</span>
                      <span>{company.userCount} {company.userCount === 1 ? "usuario" : "usuarios"}</span>
                      {company.estudioEnabled && company.estudioSnapshotIds.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-teal-600 font-medium">
                            {company.estudioSnapshotIds.length} {company.estudioSnapshotIds.length === 1 ? "corte" : "cortes"} habilitados
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {company.estudioEnabled ? (
                      <>
                        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 border border-teal-100">
                          Habilitado
                        </span>
                        <button
                          type="button"
                          disabled={saving === company.id}
                          onClick={() => openModal(company)}
                          className="btn btn-secondary text-sm px-3 py-1.5"
                        >
                          <CalendarDays size={13} />
                          {saving === company.id ? "..." : "Editar cortes"}
                        </button>
                        <button
                          type="button"
                          disabled={saving === company.id}
                          onClick={() => void disable(company)}
                          className="btn btn-secondary text-sm px-3 py-1.5 text-red-600 border-red-200 hover:bg-red-50"
                        >
                          {saving === company.id ? "..." : "Deshabilitar"}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-400">
                          Sin acceso
                        </span>
                        <button
                          type="button"
                          disabled={saving === company.id}
                          onClick={() => openModal(company)}
                          className="btn btn-primary text-sm px-4 py-1.5"
                        >
                          {saving === company.id ? "..." : "Habilitar"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Snapshot selection modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md rounded-[2rem] p-6 shadow-2xl flex flex-col max-h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-teal-50 p-2 text-teal-700">
                  <BookOpen size={16} />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">Cortes del Estudio</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{modal.company.name}</p>
                </div>
              </div>
              <button type="button" onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X size={14} />
              </button>
            </div>

            <p className="mt-3 text-sm text-slate-600 shrink-0">
              Selecciona los cortes que esta empresa podrá ver en la vista de Estudio. Ordenados del más reciente al más antiguo.
            </p>

            {/* Snapshot list */}
            <div className="mt-4 flex-1 overflow-y-auto space-y-1.5 pr-1">
              {snapshots.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No hay cortes disponibles.</p>
              ) : (
                snapshots.map((snap) => {
                  const checked = modal.selectedIds.has(snap.snapshotId);
                  return (
                    <label
                      key={snap.snapshotId}
                      className={`flex items-center gap-3 rounded-[1rem] border px-4 py-3 cursor-pointer transition-colors ${
                        checked
                          ? "border-teal-200 bg-teal-50/60"
                          : "border-slate-200/70 bg-white/70 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSnapshot(snap.snapshotId)}
                        className="h-4 w-4 rounded border-slate-300 accent-teal-600 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${checked ? "text-teal-900" : "text-slate-800"}`}>
                          {snap.label}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{formatDate(snap.date)}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 shrink-0 border-t border-slate-200/60 pt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {modal.selectedIds.size} {modal.selectedIds.size === 1 ? "corte seleccionado" : "cortes seleccionados"}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModal(null)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void saveModal()}
                  disabled={modal.selectedIds.size === 0}
                  className="btn btn-primary"
                >
                  {modal.selectedIds.size === 0 ? "Selecciona al menos uno" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
