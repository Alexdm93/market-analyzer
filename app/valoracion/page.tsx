"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Download, Layers, Plus, Search, Trash2, X, CheckCircle2, Circle,
} from "lucide-react";
import { CapriWizardModal, ROLES } from "@/components/CapriWizardModal";
import { exportStyledExcel } from "@/lib/excel-export";
import type { CargoEntry } from "@/app/api/admin/config/route";
import type { ValoracionItem } from "@/app/api/admin/valoracion/route";
import { EMPTY_COMPANY_INFO, type CompanyInfo } from "@/lib/workspace";

// ─── Cargo picker modal ───────────────────────────────────────────────────────

function CargoPicker({
  allCargos,
  addedSet,
  onAdd,
  onClose,
}: {
  allCargos: CargoEntry[];
  addedSet: Set<string>;
  onAdd: (cargo: string, departamento: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return allCargos.flatMap((d) =>
      d.cargos
        .filter((c) => (!dept || d.departamento === dept) && (!term || c.toLowerCase().includes(term) || d.departamento.toLowerCase().includes(term)))
        .map((c) => ({ cargo: c, departamento: d.departamento, key: `${d.departamento}|${c}` }))
    );
  }, [allCargos, search, dept]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center p-4">
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-teal-700">Valoración</p>
            <h2 className="font-display text-lg font-bold text-slate-900">Agregar cargo</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="search"
              placeholder="Buscar cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field pl-8 text-sm w-full"
            />
          </div>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="field-select text-sm min-w-36">
            <option value="">Todos</option>
            {allCargos.map((d) => <option key={d.departamento} value={d.departamento}>{d.departamento}</option>)}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Sin resultados</p>
          ) : (
            filtered.map(({ cargo, departamento, key }) => {
              const already = addedSet.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={already}
                  onClick={() => onAdd(cargo, departamento)}
                  className={`flex w-full items-center justify-between px-5 py-3 text-left transition-colors ${already ? "opacity-40 cursor-default" : "hover:bg-teal-50"}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{cargo}</p>
                    <p className="text-xs text-slate-400">{departamento}</p>
                  </div>
                  {already
                    ? <span className="text-xs text-slate-400">Agregado</span>
                    : <Plus className="h-4 w-4 text-teal-600" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ValoracionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [items, setItems] = useState<ValoracionItem[]>([]);
  const [allCargos, setAllCargos] = useState<CargoEntry[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [loading, setLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizard, setWizard] = useState<ValoracionItem | null>(null);
  const [exporting, setExporting] = useState(false);
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
      setAllCargos((cfg as { cargos?: CargoEntry[] }).cargos ?? []);
      setItems((val as { items?: ValoracionItem[] }).items ?? []);
      const wsData = ws as { companyInfo?: CompanyInfo };
      if (wsData.companyInfo) setCompanyInfo({ ...EMPTY_COMPANY_INFO, ...wsData.companyInfo });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [status]);

  const addedSet = useMemo(
    () => new Set(items.map((i) => `${i.departamento}|${i.cargo}`)),
    [items]
  );

  const classified = useMemo(() => items.filter((i) => i.grade !== undefined), [items]);

  function notify(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  }

  async function handleAdd(cargo: string, departamento: string) {
    const res = await fetch("/api/admin/valoracion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cargo, departamento }),
    });
    const data = (await res.json()) as { items?: ValoracionItem[]; message?: string };
    if (data.items) setItems(data.items);
    else notify(data.message ?? "Error al agregar cargo");
  }

  async function handleSaveClassification(itemId: string, grade: number, familia: string) {
    const rol = ROLES[grade]?.rol ?? "";
    const res = await fetch("/api/admin/valoracion", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, grade, familia, rol }),
    });
    const data = (await res.json()) as { items?: ValoracionItem[] };
    if (data.items) {
      setItems(data.items);
      notify("Clasificación guardada");
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch("/api/admin/valoracion", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = (await res.json()) as { items?: ValoracionItem[] };
    if (data.items) setItems(data.items);
  }

  async function handleExport() {
    if (items.length === 0) return;
    setExporting(true);
    try {
      await exportStyledExcel([{
        name: "Valoración CAPRI",
        columns: [
          { header: "Cargo",                  key: "cargo",         width: 36, align: "left" },
          { header: "Departamento",            key: "departamento",  width: 28, align: "left" },
          { header: "Grado HAY",               key: "grade",         width: 12, align: "center" },
          { header: "Nivel Organizacional",    key: "rol",           width: 44, align: "left" },
          { header: "Familia CAPRI",           key: "familia",       width: 14, align: "center" },
          { header: "Fecha clasificación",     key: "updatedAt",     width: 20, align: "center" },
        ],
        rows: items.map((i) => ({
          cargo:        i.cargo,
          departamento: i.departamento,
          grade:        i.grade ?? null,
          rol:          i.rol ?? (i.grade !== undefined ? "" : "Pendiente"),
          familia:      i.familia ?? (i.grade !== undefined ? "" : "—"),
          updatedAt:    i.updatedAt ?? "—",
        })),
      }], "valoracion-capri.xlsx");
    } catch { /* ignore */ } finally {
      setExporting(false);
    }
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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Administración</div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Valoración de Cargos</h1>
          <p className="mt-1 text-sm text-slate-500">
            {items.length === 0
              ? "Agrega cargos para comenzar con la valoración CAPRI."
              : `${classified.length} de ${items.length} clasificados`}
          </p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="btn btn-secondary"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exportando..." : "Exportar Excel"}
            </button>
          )}
          <button type="button" onClick={() => setPickerOpen(true)} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            Agregar cargo
          </button>
        </div>
      </div>

      {/* Progress bar (only when there are items) */}
      {items.length > 0 && (
        <div className="mb-6 flex items-center gap-3">
          <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-600 transition-all duration-500"
              style={{ width: `${(classified.length / items.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-500">
            {Math.round((classified.length / items.length) * 100)}%
          </span>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-24 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50">
            <Layers className="h-7 w-7 text-teal-600" />
          </div>
          <p className="text-base font-semibold text-slate-700">Lista de valoración vacía</p>
          <p className="mt-1 max-w-xs text-sm text-slate-400">
            Usa el botón <strong>Agregar cargo</strong> para seleccionar los cargos que quieres clasificar con CAPRI.
          </p>
          <button type="button" onClick={() => setPickerOpen(true)} className="btn btn-primary mt-6">
            <Plus className="h-4 w-4" />
            Agregar cargo
          </button>
        </div>
      )}

      {/* Valoración list */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:gap-4"
            >
              {/* Status */}
              <div className="shrink-0">
                {item.grade !== undefined
                  ? <CheckCircle2 className="h-5 w-5 text-teal-600" />
                  : <Circle className="h-5 w-5 text-slate-300" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{item.cargo}</p>
                <p className="text-xs text-slate-500">{item.departamento}</p>
                {item.grade !== undefined && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-700">
                      Grado {item.grade}
                    </span>
                    <span className="text-xs text-slate-600">{item.rol}</span>
                    <span className="text-xs text-slate-400">· {item.updatedAt}</span>
                  </div>
                )}
                {item.grade === undefined && (
                  <span className="mt-1 inline-block text-xs text-slate-400">Pendiente de clasificación</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="btn btn-danger btn-xs"
                  aria-label="Eliminar de la lista"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setWizard(item)}
                  className="btn btn-primary btn-xs"
                >
                  <Layers className="h-3.5 w-3.5" />
                  {item.grade !== undefined ? "Re-clasificar" : "Clasificar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {notification && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {notification}
        </div>
      )}

      {/* Cargo picker */}
      {pickerOpen && (
        <CargoPicker
          allCargos={allCargos}
          addedSet={addedSet}
          onAdd={(cargo, departamento) => { void handleAdd(cargo, departamento); }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* CAPRI wizard */}
      {wizard && (
        <CapriWizardModal
          mode="full"
          companyInfo={companyInfo}
          cargoNombre={wizard.cargo}
          existingGrade={wizard.grade}
          onSave={(grade, familia) => void handleSaveClassification(wizard.id, grade, familia)}
          onClose={() => setWizard(null)}
        />
      )}
    </main>
  );
}
