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
  dataChanged: boolean | null;
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
  const r = 76;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (circumference * pct) / 100;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width="196" height="196" viewBox="0 0 196 196" aria-hidden>
          <circle cx="98" cy="98" r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
          <circle
            cx="98"
            cy="98"
            r={r}
            fill="none"
            stroke="#0f766e"
            strokeWidth="14"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 98 98)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl font-bold text-slate-900">{pct}%</span>
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
              {/* Donut */}
              <div className="surface-card flex flex-col items-center justify-center rounded-[1.5rem] p-8 md:min-w-[240px]">
                {isLoadingDetail ? (
                  <div className="flex h-[196px] w-[196px] items-center justify-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
                  </div>
                ) : (
                  <DonutChart submitted={submitted.length} total={companies.length} />
                )}
              </div>

              {/* Metric cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                {/* Total */}
                <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-slate-200/70 bg-white p-5 shadow-sm text-center">
                  <div className="absolute right-3 top-3 rounded-full bg-slate-100 p-2 text-slate-400">
                    <Users size={13} aria-hidden />
                  </div>
                  <div className="text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-slate-400">Total empresas</div>
                  <div className="mt-2 font-display text-6xl font-bold text-slate-900 leading-none">
                    {isLoadingDetail ? <span className="inline-block h-14 w-12 animate-pulse rounded-lg bg-slate-100" /> : companies.length}
                  </div>
                  <div className="mt-2 text-[0.72rem] text-slate-400">en este corte</div>
                </div>

                {/* Enviadas */}
                <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-5 shadow-sm text-center">
                  <div className="absolute right-3 top-3 rounded-full bg-teal-100 p-2 text-teal-500">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div className="text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-teal-500">Data enviada</div>
                  <div className="mt-2 font-display text-6xl font-bold text-teal-700 leading-none">
                    {isLoadingDetail ? <span className="inline-block h-14 w-12 animate-pulse rounded-lg bg-teal-100" /> : submitted.length}
                  </div>
                  <div className="mt-2 text-[0.72rem] text-teal-400">
                    {isLoadingDetail || companies.length === 0 ? "—" : `${Math.round((submitted.length / companies.length) * 100)}% del total`}
                  </div>
                  {!isLoadingDetail && companies.length > 0 && (
                    <div className="absolute bottom-0 left-0 h-1 bg-teal-100 w-full">
                      <div
                        className="h-1 bg-teal-500 transition-all duration-700"
                        style={{ width: `${Math.round((submitted.length / companies.length) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Pendientes */}
                <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm text-center">
                  <div className="absolute right-3 top-3 rounded-full bg-amber-100 p-2 text-amber-500">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <div className="text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-amber-500">Pendientes</div>
                  <div className="mt-2 font-display text-6xl font-bold text-amber-700 leading-none">
                    {isLoadingDetail ? <span className="inline-block h-14 w-12 animate-pulse rounded-lg bg-amber-100" /> : pending.length}
                  </div>
                  <div className="mt-2 text-[0.72rem] text-amber-400">
                    {isLoadingDetail || companies.length === 0 ? "—" : pending.length === 0 ? "¡Todas enviaron!" : "faltan por enviar"}
                  </div>
                  {!isLoadingDetail && companies.length > 0 && (
                    <div className="absolute bottom-0 left-0 h-1 bg-amber-100 w-full">
                      <div
                        className="h-1 bg-amber-400 transition-all duration-700"
                        style={{ width: `${Math.round((pending.length / companies.length) * 100)}%` }}
                      />
                    </div>
                  )}
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
            {c.submitted && c.dataChanged === false && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700" title="Envió data idéntica al corte anterior">
                Sin cambios
              </span>
            )}
            {c.submitted && c.dataChanged === true && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Modificada
              </span>
            )}
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
