"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BookOpen, Building2, RefreshCw } from "lucide-react";
import type { EstudioCompany } from "@/app/api/admin/estudio-especializado/route";

type ConfirmModal = {
  company: EstudioCompany;
  nextEnabled: boolean;
};

export default function EstudioEspecializadoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [companies, setCompanies] = useState<EstudioCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmModal | null>(null);

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
        const json = (await res.json()) as { companies: EstudioCompany[] };
        setCompanies(json.companies);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function confirmToggle() {
    if (!confirm) return;
    const { company, nextEnabled } = confirm;
    setConfirm(null);
    setSaving(company.id);
    try {
      await fetch("/api/admin/estudio-especializado", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, enabled: nextEnabled }),
      });
      setCompanies((prev) =>
        prev.map((c) => c.id === company.id ? { ...c, estudioEnabled: nextEnabled } : c)
      );
    } finally {
      setSaving(null);
    }
  }

  const enabled = companies.filter((c) => c.estudioEnabled).length;
  const disabled = companies.length - enabled;

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
                Habilita o deshabilita el acceso al Estudio Especializado por empresa.
              </p>
            </div>
            <button onClick={() => void load()} disabled={loading} className="btn btn-secondary flex items-center gap-1.5">
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
              <div className="metric-label">Sin acceso</div>
              <div className="metric-value mt-1 text-slate-400">{disabled}</div>
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
                <div key={company.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{company.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                      <span>{company.economicSector}</span>
                      <span>·</span>
                      <span>{company.userCount} {company.userCount === 1 ? "usuario" : "usuarios"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {company.estudioEnabled ? (
                      <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 border border-teal-100">
                        Habilitado
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-400">
                        Sin acceso
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={saving === company.id}
                      onClick={() => setConfirm({ company, nextEnabled: !company.estudioEnabled })}
                      className={`btn text-sm px-4 py-1.5 ${
                        company.estudioEnabled
                          ? "btn-secondary text-red-600 border-red-200 hover:bg-red-50"
                          : "btn-primary"
                      }`}
                    >
                      {saving === company.id ? "Guardando..." : company.estudioEnabled ? "Deshabilitar" : "Habilitar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="surface-card w-full max-w-sm rounded-[2rem] p-6 shadow-2xl">
            <div className="mb-1 flex items-center gap-3">
              <div className={`rounded-full p-2 ${confirm.nextEnabled ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-600"}`}>
                <BookOpen size={16} />
              </div>
              <h2 className="font-display text-base font-bold text-slate-900">
                {confirm.nextEnabled ? "Habilitar Estudio Especializado" : "Deshabilitar Estudio Especializado"}
              </h2>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {confirm.nextEnabled
                ? <>¿Confirmas que deseas dar acceso al Estudio Especializado a <strong>{confirm.company.name}</strong>?</>
                : <>¿Confirmas que deseas retirar el acceso al Estudio Especializado a <strong>{confirm.company.name}</strong>?</>
              }
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button type="button" onClick={() => setConfirm(null)} className="btn btn-secondary">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmToggle()}
                className={`btn ${confirm.nextEnabled ? "btn-primary" : "bg-red-600 text-white hover:bg-red-700"}`}
              >
                {confirm.nextEnabled ? "Sí, habilitar" : "Sí, deshabilitar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
