"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Layers, Search, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { CapriWizardModal, ROLES } from "@/components/CapriWizardModal";
import type { CargoEntry } from "@/app/api/admin/config/route";
import type { ValoracionEntry, ValoracionMap } from "@/app/api/admin/valoracion/route";
import { EMPTY_COMPANY_INFO, type CompanyInfo } from "@/lib/workspace";

export default function ValoracionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [cargos, setCargos] = useState<CargoEntry[]>([]);
  const [valoraciones, setValoraciones] = useState<ValoracionMap>({});
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "clasificado" | "pendiente">("all");

  const [wizard, setWizard] = useState<{ cargoNombre: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/signin"); return; }
    if (status === "authenticated" && session.user.role !== "ADMIN") { router.replace("/"); return; }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/admin/config", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/valoracion", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/workspace", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([cfg, val, ws]) => {
      setCargos((cfg as { cargos?: CargoEntry[] }).cargos ?? []);
      setValoraciones((val as { valoraciones?: ValoracionMap }).valoraciones ?? {});
      const wsData = ws as { companyInfo?: CompanyInfo };
      if (wsData.companyInfo) setCompanyInfo({ ...EMPTY_COMPANY_INFO, ...wsData.companyInfo });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [status]);

  const departments = useMemo(() => cargos.map((c) => c.departamento), [cargos]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return cargos.flatMap((dept) =>
      dept.cargos
        .filter((c) => {
          if (filterDept && dept.departamento !== filterDept) return false;
          if (filterStatus === "clasificado" && !valoraciones[c]) return false;
          if (filterStatus === "pendiente" && valoraciones[c]) return false;
          if (term && !c.toLowerCase().includes(term) && !dept.departamento.toLowerCase().includes(term)) return false;
          return true;
        })
        .map((c) => ({ cargo: c, departamento: dept.departamento }))
    );
  }, [cargos, valoraciones, search, filterDept, filterStatus]);

  const totalCargos = useMemo(() => cargos.reduce((s, d) => s + d.cargos.length, 0), [cargos]);
  const totalClasificados = useMemo(() => Object.keys(valoraciones).length, [valoraciones]);

  async function handleSave(cargoNombre: string, grade: number, familia: string) {
    const rol = ROLES[grade]?.rol ?? "";
    const entry: ValoracionEntry = { grade, familia, rol, updatedAt: new Date().toISOString().split("T")[0] };
    setSaving(true);
    try {
      const res = await fetch("/api/admin/valoracion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cargoName: cargoNombre, entry }),
      });
      const data = (await res.json()) as { valoraciones?: ValoracionMap };
      if (data.valoraciones) setValoraciones(data.valoraciones);
      setNotification(`Clasificación guardada para "${cargoNombre}"`);
      setTimeout(() => setNotification(""), 3000);
    } catch {
      setNotification("Error al guardar. Intenta de nuevo.");
      setTimeout(() => setNotification(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cargoNombre: string) {
    const res = await fetch("/api/admin/valoracion", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cargoName: cargoNombre }),
    });
    const data = (await res.json()) as { valoraciones?: ValoracionMap };
    if (data.valoraciones) setValoraciones(data.valoraciones);
  }

  if (loading || status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8 md:py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="eyebrow mb-2">Administración</div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Valoración de Cargos</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Clasifica cada cargo global con la metodología CAPRI para definir su nivel organizacional de referencia.
        </p>

        {/* Progress bar */}
        <div className="mt-5 flex items-center gap-4">
          <div className="flex-1 overflow-hidden rounded-full bg-slate-200 h-2">
            <div
              className="h-full rounded-full bg-teal-600 transition-all duration-500"
              style={{ width: totalCargos ? `${(totalClasificados / totalCargos) * 100}%` : "0%" }}
            />
          </div>
          <span className="shrink-0 text-sm font-semibold text-slate-700">
            {totalClasificados} / {totalCargos} clasificados
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field pl-9 w-full text-sm"
          />
        </div>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="field-select text-sm min-w-44">
          <option value="">Todos los departamentos</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden text-sm">
          {(["all", "clasificado", "pendiente"] as const).map((s) => {
            const labels = { all: "Todos", clasificado: "Clasificados", pendiente: "Pendientes" };
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-2 font-medium transition-colors ${filterStatus === s ? "bg-teal-700 text-white" : "text-slate-500 hover:text-slate-800"}`}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cargo list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-400">
          {cargos.length === 0
            ? "No hay cargos globales configurados. Ve al panel de Admin para agregarlos."
            : "No hay cargos que coincidan con los filtros."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ cargo, departamento }) => {
            const val = valoraciones[cargo];
            return (
              <div
                key={`${departamento}-${cargo}`}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:gap-4"
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {val
                    ? <CheckCircle2 className="h-5 w-5 text-teal-600" />
                    : <Circle className="h-5 w-5 text-slate-300" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{cargo}</p>
                  <p className="text-xs text-slate-500">{departamento}</p>
                  {val && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
                        Grado {val.grade}
                      </span>
                      <span className="text-xs text-slate-600">{val.rol}</span>
                      <span className="text-xs text-slate-400">· {val.updatedAt}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-2">
                  {val && (
                    <button
                      type="button"
                      onClick={() => handleDelete(cargo)}
                      className="btn btn-danger btn-xs"
                      aria-label="Eliminar clasificación"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setWizard({ cargoNombre: cargo })}
                    className="btn btn-primary btn-xs"
                    disabled={saving}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {val ? "Re-clasificar" : "Clasificar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notification toast */}
      {notification && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {notification}
        </div>
      )}

      {/* CAPRI Wizard */}
      {wizard && (
        <CapriWizardModal
          mode="full"
          companyInfo={companyInfo}
          cargoNombre={wizard.cargoNombre}
          existingGrade={valoraciones[wizard.cargoNombre]?.grade}
          onSave={(grade, familia) => handleSave(wizard.cargoNombre, grade, familia)}
          onClose={() => setWizard(null)}
        />
      )}
    </main>
  );
}
