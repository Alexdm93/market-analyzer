"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ChartBar, Mail, Phone, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";

type SnapshotSummary = {
  id: string;
  label: string;
  date: string;
  status: string;
  totalCompanies: number;
  submittedCount: number;
};

type CompanyDetail = {
  companyId: string;
  name: string;
  economicSector: string;
  headcount: string;
  submitted: boolean;
  submittedAt: string | null;
  hrName: string;
  hrPosition: string;
  hrEmail: string;
  hrPhone: string;
  hrCell: string;
};

type SnapshotDetail = {
  id: string;
  label: string;
  date: string;
  status: string;
};

type ContactModal = {
  company: CompanyDetail;
} | null;

function DonutChart({ submitted, total }: { submitted: number; total: number }) {
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (circumference * pct) / 100;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden>
          <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="#0f766e"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold text-slate-900">{pct}%</span>
          <span className="text-xs text-slate-500">enviado</span>
        </div>
      </div>
      <div className="flex gap-4 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-teal-700">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
          {submitted} enviadas
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          {total - submitted} pendientes
        </span>
      </div>
    </div>
  );
}

export default function EstudiosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "COORDINATOR" && role !== "ADMIN") {
      router.replace("/");
    }
  }, [role, status, router]);

  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [snapshotDetail, setSnapshotDetail] = useState<SnapshotDetail | null>(null);
  const [companies, setCompanies] = useState<CompanyDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [contactModal, setContactModal] = useState<ContactModal>(null);
  const [activeTab, setActiveTab] = useState<"enviadas" | "pendientes">("enviadas");

  useEffect(() => {
    fetch("/api/coordinator/study", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((payload: { snapshots?: SnapshotSummary[] } | null) => {
        const list = payload?.snapshots ?? [];
        setSnapshots(list);
        if (list.length > 0) {
          setSelectedSnapshotId(list[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSnapshotId) return;
    setIsLoadingDetail(true);
    fetch(`/api/coordinator/study?snapshotId=${encodeURIComponent(selectedSnapshotId)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((payload: { snapshot?: SnapshotDetail; companies?: CompanyDetail[] } | null) => {
        setSnapshotDetail(payload?.snapshot ?? null);
        setCompanies(payload?.companies ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoadingDetail(false));
  }, [selectedSnapshotId]);

  const selectedSummary = useMemo(
    () => snapshots.find((s) => s.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId]
  );

  const submitted = useMemo(() => companies.filter((c) => c.submitted), [companies]);
  const pending = useMemo(() => companies.filter((c) => !c.submitted), [companies]);

  if (status === "loading" || (role !== "COORDINATOR" && role !== "ADMIN")) {
    return null;
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-4">

        {/* Header */}
        <section className="surface-panel rounded-[1.75rem] p-4 md:p-5">
          <div className="eyebrow mb-2">Coordinador</div>
          <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-slate-900 md:text-[1.85rem]">
            Estudios — Participación por corte
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Monitorea cuántas empresas han enviado su data en cada corte activo y contacta a las que aún están pendientes.
          </p>

          {/* Snapshot selector */}
          {!isLoading && snapshots.length > 0 && (
            <div className="mt-4 max-w-xs">
              <label htmlFor="snapshotSelect" className="field-label">Corte</label>
              <select
                id="snapshotSelect"
                value={selectedSnapshotId}
                onChange={(e) => setSelectedSnapshotId(e.target.value)}
                className="field-select"
              >
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {new Date(s.date).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {isLoading ? (
          <section className="surface-card animate-pulse rounded-[1.5rem] p-8 text-center">
            <div className="mx-auto h-6 w-48 rounded-full bg-slate-200" />
          </section>
        ) : snapshots.length === 0 ? (
          <section className="surface-card rounded-[1.5rem] p-8 text-center">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
              <div className="rounded-full bg-slate-100 p-4 text-slate-400">
                <ChartBar size={24} aria-hidden />
              </div>
              <p className="text-sm text-slate-600">No hay cortes disponibles aún.</p>
            </div>
          </section>
        ) : (
          <>
            {/* Chart + summary cards */}
            <section className="grid gap-4 md:grid-cols-[auto_1fr]">
              <div className="surface-card flex flex-col items-center justify-center rounded-[1.5rem] p-6">
                {isLoadingDetail ? (
                  <div className="flex h-40 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
                  </div>
                ) : (
                  <DonutChart submitted={submitted.length} total={companies.length} />
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="metric-tile surface-card rounded-[1.5rem] p-4">
                  <div className="metric-label">Total empresas</div>
                  <div className="metric-value mt-3 font-display text-2xl">{isLoadingDetail ? "—" : companies.length}</div>
                </div>
                <div className="metric-tile surface-card rounded-[1.5rem] p-4">
                  <div className="metric-label flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-teal-500" />
                    Data enviada
                  </div>
                  <div className="metric-value mt-3 font-display text-2xl text-teal-700">{isLoadingDetail ? "—" : submitted.length}</div>
                </div>
                <div className="metric-tile surface-card rounded-[1.5rem] p-4">
                  <div className="metric-label flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-300" />
                    Pendientes
                  </div>
                  <div className="metric-value mt-3 font-display text-2xl text-slate-500">{isLoadingDetail ? "—" : pending.length}</div>
                </div>
              </div>
            </section>

            {/* Company lists */}
            <section className="surface-card rounded-[1.5rem] overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-slate-200 bg-slate-50/80 px-4">
                {(["enviadas", "pendientes"] as const).map((tab) => {
                  const labels = { enviadas: `Enviadas (${submitted.length})`, pendientes: `Pendientes (${pending.length})` };
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-semibold transition-colors ${isActive ? "border-teal-600 bg-white text-teal-700" : "border-transparent bg-transparent text-slate-500 hover:text-slate-800"}`}
                    >
                      {labels[tab]}
                    </button>
                  );
                })}
              </div>

              <div className="p-4">
                {isLoadingDetail ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="animate-pulse h-14 rounded-[1rem] bg-slate-100" />
                    ))}
                  </div>
                ) : (
                  <CompanyList
                    companies={activeTab === "enviadas" ? submitted : pending}
                    showContact={activeTab === "pendientes"}
                    onContact={(c) => setContactModal({ company: c })}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Contact modal */}
      {contactModal && (
        <ContactModal company={contactModal.company} onClose={() => setContactModal(null)} />
      )}
    </main>
  );
}

function CompanyList({
  companies,
  showContact,
  onContact,
}: {
  companies: CompanyDetail[];
  showContact: boolean;
  onContact: (c: CompanyDetail) => void;
}) {
  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-400">
        <Users size={20} aria-hidden />
        <span>No hay empresas en esta categoría.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {companies.map((c) => (
        <div
          key={c.companyId}
          className="flex items-center justify-between gap-3 rounded-[1rem] border border-slate-200/70 bg-white px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold text-slate-900 truncate">{c.name}</div>
            <div className="text-xs text-slate-500 truncate">
              {c.economicSector || "—"}{c.headcount ? ` · ${c.headcount}` : ""}
              {c.submitted && c.submittedAt ? (
                <span className="ml-2 text-teal-600">
                  Enviado {new Date(c.submittedAt).toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {c.submitted ? (
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
                Enviado
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                Pendiente
              </span>
            )}
            {showContact && (c.hrEmail || c.hrPhone || c.hrCell) && (
              <button
                type="button"
                onClick={() => onContact(c)}
                className="btn btn-secondary btn-xs"
              >
                <Mail className="h-3 w-3" />
                Contactar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactModal({ company, onClose }: { company: CompanyDetail; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-[1.75rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between p-5 pb-4">
          <div>
            <div className="eyebrow mb-1">Contacto RRHH</div>
            <h2 className="font-display text-lg font-bold text-slate-900">{company.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-xs">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 px-5 pb-6">
          {company.hrName && (
            <div>
              <div className="field-label">Nombre</div>
              <div className="text-sm font-semibold text-slate-900">{company.hrName}</div>
              {company.hrPosition && <div className="text-xs text-slate-500">{company.hrPosition}</div>}
            </div>
          )}

          {company.hrEmail && (
            <a
              href={`mailto:${company.hrEmail}`}
              className="flex items-center gap-2.5 rounded-[1rem] border border-slate-200 px-4 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-50 transition-colors"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {company.hrEmail}
            </a>
          )}

          {company.hrPhone && (
            <a
              href={`tel:${company.hrPhone}`}
              className="flex items-center gap-2.5 rounded-[1rem] border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden />
              {company.hrPhone} (fijo)
            </a>
          )}

          {company.hrCell && (
            <a
              href={`tel:${company.hrCell}`}
              className="flex items-center gap-2.5 rounded-[1rem] border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden />
              {company.hrCell} (celular)
            </a>
          )}

          {!company.hrEmail && !company.hrPhone && !company.hrCell && (
            <p className="text-sm text-slate-400">No hay información de contacto disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}
