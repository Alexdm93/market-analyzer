"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, CalendarDays, Check, Edit, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";
import { JOB_TITLES } from "@/data/jobTitles";
import { type Snapshot } from "@/lib/workspace";
import { fetchWorkspace, updateWorkspace } from "@/lib/workspace-client";

type CompanyOption = {
  id: string;
  name: string;
};

const FREQUENCY_OPTIONS: Array<{ value: PaymentFrequency; label: string }> = [
  { value: "biweekly", label: "Quincenal" },
  { value: "monthly", label: "Mensual" },
  { value: "bimonthly", label: "Bimensual" },
  { value: "semiannual", label: "Semestral" },
  { value: "quarterly", label: "Trimestral" },
  { value: "annual", label: "Anual" },
];

const ORGANIZATIONAL_LEVEL_OPTIONS = [
  { value: "Operativo Auxiliar Asistente AnalistaJR", label: "Operativo / Auxiliares / Asistentes / Analistas Jr" },
  { value: "Profesional Especialista", label: "Profesional / Especialista" },
  { value: "Supervisor Coordinador", label: "Supervisor / Coordinadores" },
  { value: "Gerencia Media", label: "Gerencia Media" },
  { value: "Gerencia Alta", label: "Gerencia Alta" },
  { value: "Ejecutivo", label: "Ejecutivo" },
] as const;

const CLASSIFICATION_OPTIONS_BY_LEVEL: Record<string, string[]> = {
  "Operativo Auxiliar Asistente AnalistaJR": [
    "Trabajo Simple y Rutinario",
    "Trabajo Semi-Complejo",
    "Trabajo Técnico Variado",
    "Trabajo Técnico Especializado",
    "Trabajo Técnico Especializado (Nivel Superior)",
    "Trabajo Profesional Básico",
  ],
  "Profesional Especialista": [
    "Profesional con Experiencia",
    "Especialista Técnico Inicial",
    "Especialista Técnico Semi Senior",
    "Especialista Senior",
    "Especialista - Mejora Continua",
    "Especialista en Innovación",
  ],
  "Supervisor Coordinador": [
    "Supervisor/Coordinador Inicial",
    "Supervisor/Coordinador Técnico",
    "Supervisor/Coordinador Senior",
  ],
  "Gerencia Media": [
    "Gerencia Media Inicial",
    "Gerencia Media Intermedia",
    "Gerencia Media Avanzada",
  ],
  "Gerencia Alta": [
    "Gerencia Alta Inicial",
    "Gerencia Alta Intermedia",
    "Gerencia Alta Avanzada",
  ],
  Ejecutivo: [
    "Gerencia Ejecutiva Inicial",
    "Gerencia Ejecutiva Intermedia",
    "Gerencia Ejecutiva Avanzada",
  ],
};

const VARIABLE_COMMISSION_TYPES = [
  { value: "simple", label: "Simple" },
  { value: "tiered", label: "Escalonada" },
  { value: "product", label: "Por Producto" },
  { value: "service", label: "Servicio" },
  { value: "other", label: "Otro" },
] as const;

const VARIABLE_CALCULATION_DETAILS = [
  { value: "sale_value", label: "Valor de la venta" },
  { value: "profit_margin", label: "Margen de la ganancia" },
  { value: "units_sold", label: "Unidades vendidas" },
  { value: "other", label: "Otro" },
] as const;

const VARIABLE_GOALS_TARGETS = [
  { value: "sales_quota", label: "Cuotas de ventas monetaria" },
  { value: "units_sold", label: "Numero de unidades vendidas" },
  { value: "new_clients", label: "Numero de nuevos clientes" },
  { value: "client_retention", label: "Retencion de clientes" },
  { value: "profit_margin", label: "Margen de ganancias" },
  { value: "mixed", label: "Mixto" },
] as const;

const VARIABLE_BONUS_TYPES = [
  { value: "performance", label: "Por desempeño" },
  { value: "commission", label: "Por comisiones" },
] as const;

const empty = (i: number): ExtendedMarketPosition => ({
  id: `r-${Date.now()}-${i}`,
  tituloCargo: "",
  nivelOrganizacional: "",
  clasificacion: "",
  descripcion: "",
  sueldoBasico: 0,
  bonoAlimentacion: 0,
  bonoMovilizacion: 0,
  // frecuencia por defecto para pagos fijos
  sueldoBasicoFreq: 'monthly',
  bonoAlimentacionFreq: 'monthly',
  bonoMovilizacionFreq: 'monthly',

  // monedas y flags
  sueldoBasicoCuentaMoneda: 'USD',
  sueldoBasicoMonedaPago: 'USD',
  sueldoBasicoImpacto: true,

  bonoAlimentacionCuentaMoneda: 'USD',
  bonoAlimentacionMonedaPago: 'USD',
  bonoAlimentacionImpacto: true,

  bonoMovilizacionCuentaMoneda: 'USD',
  bonoMovilizacionMonedaPago: 'USD',
  bonoMovilizacionImpacto: true,

  // pagos fijos adicionales (concepto, monto, frecuencia)
  additionalFixedPayments: [],

  horasExtras: 0,
  nocturnidad: 0,
  pagoTransporte: 0,
  viaticos: 0,
  otrosPagos: 0,

  bonoDesempeno: 0,
  bonoDesempenoFreq: 'monthly',
  bonoDesempenoCuentaMoneda: 'USD',
  bonoDesempenoMonedaPago: 'USD',
  bonoDesempenoImpacto: true,

  comisiones: 0,
  comisionesFreq: 'monthly',
  comisionesCuentaMoneda: 'USD',
  comisionesMonedaPago: 'USD',
  comisionesImpacto: true,

  pagoVariableOtros: 0,
  pagoVariableOtrosFreq: 'monthly',
  pagoVariableOtrosCuentaMoneda: 'USD',
  pagoVariableOtrosMonedaPago: 'USD',
  pagoVariableOtrosImpacto: true,
  additionalVariablePayments: [],

  aportesSeguridadSocial: 0,
  prestacionesLegales: 0,
  beneficiosNoMonetarios: "",
});

export default function DataPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  const isReadOnlyDataView = isAdmin;
  const isAdminCompanyView = isAdmin && Boolean(selectedCompanyId);

  function getDisplayLabel(snapshot: Snapshot) {
    const formattedDate = new Date(snapshot.date).toLocaleDateString();
    const rawLabel = (snapshot.label || "").trim();
    if (!rawLabel) return formattedDate;
    if (rawLabel === snapshot.date || rawLabel === formattedDate) return formattedDate;
    return `${rawLabel} — ${formattedDate}`;
  }

  // start empty on server/client initial render to avoid hydration mismatches
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});

  // start with no snapshot selected by default (user asked that "-- seleccionar --" shows nothing)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");

  // If no snapshot selected, show nothing (user requested empty view when "-- seleccionar --")
  const [rows, setRows] = useState<ExtendedMarketPosition[]>([]);
  const snapshotsRef = useRef<Record<string, Snapshot>>({});
  const draftSaveTimer = useRef<number | null>(null);

  const reloadWorkspaceData = useCallback(async (options?: { showNotification?: boolean }) => {
    setIsRefreshing(true);

    try {
      const workspace = await fetchWorkspace(isAdminCompanyView ? selectedCompanyId : undefined);
      const filtered: Record<string, Snapshot> = {};

      Object.entries(workspace.snapshots).forEach(([key, value]) => {
        const label = (value.label || "").toString().toLowerCase();
        const id = (value.id || "").toString().toLowerCase();
        if (label.includes("default") || id.includes("default") || label === "default algo" || id === "default algo") {
          return;
        }
        filtered[key] = value;
      });

      const selectedId = workspace.selectedSnapshotId || "";

      setSnapshots(filtered);
      setSelectedSnapshotId(selectedId);
      setSaveState(selectedId ? "saved" : "idle");
      setLastSavedAt(null);

      if (selectedId && filtered[selectedId] && Array.isArray(filtered[selectedId].rows)) {
        setRows(filtered[selectedId].rows);
      } else {
        setRows([]);
      }

      if (!isReadOnlyDataView && Object.keys(filtered).length !== Object.keys(workspace.snapshots).length) {
        await updateWorkspace({ snapshots: filtered, selectedSnapshotId: selectedId });
      }

      if (options?.showNotification) {
        showNotification(isAdminCompanyView ? "Data de empresa actualizada desde Supabase" : "Data actualizada desde Supabase");
      }
    } catch (error) {
      console.error(error);
      if (options?.showNotification) {
        showNotification(isAdminCompanyView ? "No se pudo actualizar la data de la empresa" : "No se pudo actualizar la data desde Supabase");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [isAdminCompanyView, isReadOnlyDataView, selectedCompanyId]);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    void reloadWorkspaceData();
  }, [reloadWorkspaceData, status]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let ignore = false;
    setIsLoadingCompanies(true);

    async function loadCompanies() {
      try {
        const response = await fetch("/api/companies", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as { companies?: CompanyOption[]; message?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "No fue posible cargar las empresas.");
        }

        if (!ignore) {
          setCompanies(Array.isArray(payload?.companies) ? payload.companies : []);
        }
      } catch (error) {
        if (!ignore) {
          console.error(error);
        }
      } finally {
        if (!ignore) {
          setIsLoadingCompanies(false);
        }
      }
    }

    void loadCompanies();

    return () => {
      ignore = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  const persistSnapshots = useCallback(async (
    next: Record<string, Snapshot>,
    nextSelectedSnapshotId = selectedSnapshotId,
    options?: { showErrorNotification?: boolean }
  ) => {
    setSnapshots(next);
    setSaveState("pending");

    try {
      if (isReadOnlyDataView) {
        throw new Error("La vista de data para admin es solo lectura.");
      }

      await updateWorkspace({
        snapshots: next,
        selectedSnapshotId: nextSelectedSnapshotId,
      });

      setSaveState(nextSelectedSnapshotId ? "saved" : "idle");
      setLastSavedAt(nextSelectedSnapshotId ? new Date() : null);

      return true;
    } catch (e) {
      console.error(e);
      setSaveState("error");

      if (options?.showErrorNotification) {
        showNotification("Error al guardar cargos en Supabase");
      }

      return false;
    }
  }, [isReadOnlyDataView, selectedSnapshotId]);

  useEffect(() => {
    if (isReadOnlyDataView) {
      setSaveState("idle");
      return;
    }

    if (!selectedSnapshotId) {
      return;
    }

    const activeSnapshot = snapshots[selectedSnapshotId];

    if (!activeSnapshot) {
      return;
    }

    const nextRowsJson = JSON.stringify(rows);
    const currentRowsJson = JSON.stringify(activeSnapshot.rows ?? []);

    if (nextRowsJson === currentRowsJson) {
      return;
    }

    setSaveState("pending");

    if (draftSaveTimer.current) {
      window.clearTimeout(draftSaveTimer.current);
    }

    draftSaveTimer.current = window.setTimeout(() => {
      const currentSnapshot = snapshotsRef.current[selectedSnapshotId];

      if (!currentSnapshot) {
        return;
      }

      const nextSnapshots = {
        ...snapshotsRef.current,
        [selectedSnapshotId]: {
          ...currentSnapshot,
          rows: JSON.parse(nextRowsJson) as ExtendedMarketPosition[],
        },
      };

      void persistSnapshots(nextSnapshots, selectedSnapshotId, { showErrorNotification: true });
    }, 700);

    return () => {
      if (draftSaveTimer.current) {
        window.clearTimeout(draftSaveTimer.current);
      }
    };
  }, [isReadOnlyDataView, persistSnapshots, rows, selectedSnapshotId, snapshots]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggleExpand(id: string) {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

  async function saveCurrentToSnapshot(id: string) {
    if (!id) return;
    const next = { ...snapshots, [id]: { ...(snapshots[id] || { id, label: id, date: id, rows: [] }), rows: JSON.parse(JSON.stringify(rows)) } };
    const wasPersisted = await persistSnapshots(next, id, { showErrorNotification: true });
    showNotification(wasPersisted ? 'Guardado correctamente' : 'No se pudo guardar en Supabase');
  }

  // simple transient notification
  const [notification, setNotification] = useState<string>("");
  const notificationTimer = useRef<number | null>(null);
  function showNotification(msg: string, ms = 2500) {
    setNotification(msg);
    if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
    notificationTimer.current = window.setTimeout(() => setNotification(""), ms);
  }

  // modal state
  const [modal, setModal] = useState<{ type: 'save' | null; id?: string }>(() => ({ type: null }));
  const titleRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  function loadSnapshot(id: string) {
    // if empty selection, clear rows and unset selected snapshot
    if (!id) {
      setRows([]);
      setSelectedSnapshotId("");
      setSaveState("idle");
      setLastSavedAt(null);
      if (!isReadOnlyDataView) {
        void updateWorkspace({ selectedSnapshotId: "" }).catch(() => {
          // ignore
        });
      }
      return;
    }
    const snap = snapshots[id];
    if (!snap) return;
    setRows(JSON.parse(JSON.stringify(snap.rows)));
    setSelectedSnapshotId(id);
    setSaveState("saved");
    setLastSavedAt(null);
    if (!isReadOnlyDataView) {
      void updateWorkspace({ selectedSnapshotId: id }).catch(() => {
        // ignore
      });
    }
  }

  function update(i: number, key: keyof ExtendedMarketPosition, value: string | number | boolean) {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: value } as ExtendedMarketPosition;
      return next;
    });
  }

  function updateOrganizationalLevel(i: number, level: string) {
    setRows((prev) => {
      const next = [...prev];
      const current = next[i];
      const normalizedLevel =
        level === "Operativo" || level === "Auxiliar" || level === "Asistente" || level === "AnalistaJR"
          ? "Operativo Auxiliar Asistente AnalistaJR"
          : level;
      const allowedClassifications = CLASSIFICATION_OPTIONS_BY_LEVEL[normalizedLevel] || [];
      next[i] = {
        ...current,
        nivelOrganizacional: normalizedLevel,
        clasificacion: allowedClassifications.includes(current.clasificacion || "") ? current.clasificacion : "",
      } as ExtendedMarketPosition;
      return next;
    });
  }

  function addAdditionalFixed(rowIndex: number) {
    const id = `ap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] } as ExtendedMarketPosition;
      const list = row.additionalFixedPayments ? [...row.additionalFixedPayments] : [];
      list.unshift({ id, concept: '', amount: 0, freq: 'monthly', accountCurrency: 'USD', paymentCurrency: 'USD', impacto: true });
      row.additionalFixedPayments = list;
      next[rowIndex] = row;
      return next;
    });
  }

  function updateAdditionalFixed(rowIndex: number, idx: number, key: 'concept' | 'amount' | 'freq' | 'accountCurrency' | 'paymentCurrency' | 'impacto', value: string | number | boolean) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] } as ExtendedMarketPosition;
      const list = row.additionalFixedPayments ? [...row.additionalFixedPayments] : [];
      if (!list[idx]) return prev;
      const item = { ...list[idx], [key]: value } as {
        id: string;
        concept: string;
        amount?: number;
        freq?: PaymentFrequency;
        accountCurrency?: 'USD' | 'VES';
        paymentCurrency?: 'USD' | 'VES';
        impacto?: boolean;
      };
      list[idx] = item;
      row.additionalFixedPayments = list;
      next[rowIndex] = row;
      return next;
    });
  }

  function removeAdditionalFixed(rowIndex: number, idx: number) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] } as ExtendedMarketPosition;
      const list = row.additionalFixedPayments ? [...row.additionalFixedPayments] : [];
      list.splice(idx, 1);
      row.additionalFixedPayments = list;
      next[rowIndex] = row;
      return next;
    });
  }

  function addAdditionalVariable(rowIndex: number) {
    const id = `vp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] } as ExtendedMarketPosition;
      const list = row.additionalVariablePayments ? [...row.additionalVariablePayments] : [];
      list.unshift({
        id,
        concept: "",
        amount: 0,
        freq: "monthly",
        accountCurrency: "USD",
        paymentCurrency: "USD",
        impacto: true,
        variableType: undefined,
        commissionType: "simple",
        calculationDetail: "sale_value",
        goalsTarget: "sales_quota",
      });
      row.additionalVariablePayments = list;
      next[rowIndex] = row;
      return next;
    });
  }

  function updateAdditionalVariable(
    rowIndex: number,
    idx: number,
    key: 'concept' | 'amount' | 'freq' | 'accountCurrency' | 'paymentCurrency' | 'impacto' | 'variableType' | 'commissionType' | 'calculationDetail' | 'goalsTarget',
    value: string | number | boolean
  ) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] } as ExtendedMarketPosition;
      const list = row.additionalVariablePayments ? [...row.additionalVariablePayments] : [];
      if (!list[idx]) return prev;
      list[idx] = { ...list[idx], [key]: value };
      row.additionalVariablePayments = list;
      next[rowIndex] = row;
      return next;
    });
  }

  function removeAdditionalVariable(rowIndex: number, idx: number) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] } as ExtendedMarketPosition;
      const list = row.additionalVariablePayments ? [...row.additionalVariablePayments] : [];
      list.splice(idx, 1);
      row.additionalVariablePayments = list;
      next[rowIndex] = row;
      return next;
    });
  }

  function addRow() {
    if (!selectedSnapshotId) {
      showNotification("Selecciona un corte asignado por el admin antes de agregar cargos");
      return;
    }

    const newRow = empty(rows.length || 0);
    // add the new row at the top and expand it + focus its title input
    setRows((r) => [newRow, ...r]);
    setExpanded((s) => ({ ...s, [newRow.id]: true }));
    // focus after next paint
    setTimeout(() => {
      try {
        titleRefs.current[newRow.id]?.focus();
      } catch {}
    }, 50);
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function saveRowById(rowId: string) {
    if (!selectedSnapshotId) {
      showNotification("Seleccione un corte");
      return;
    }
    const current: Snapshot = snapshots[selectedSnapshotId] || { id: selectedSnapshotId, label: selectedSnapshotId, date: selectedSnapshotId, rows: [] };
    const nextRows = Array.isArray(current.rows) ? [...current.rows] : [];
    const rowIndex = rows.findIndex((rr) => rr.id === rowId);
    if (rowIndex === -1) return;
    const rowToSave = JSON.parse(JSON.stringify(rows[rowIndex]));
    const existingIndex = nextRows.findIndex((rr) => rr.id === rowToSave.id);
    if (existingIndex !== -1) {
      nextRows[existingIndex] = rowToSave;
    } else {
      nextRows.splice(rowIndex, 0, rowToSave);
    }
    const next = { ...snapshots, [selectedSnapshotId]: { ...current, rows: nextRows } };
    const wasPersisted = await persistSnapshots(next, selectedSnapshotId, { showErrorNotification: true });
    showNotification(wasPersisted ? 'Cargo guardado' : 'No se pudo guardar el cargo en Supabase');
  }

  // legacy save function removed (use snapshots / saveCurrentToSnapshot instead)

  function exportJSON() {
    navigator.clipboard?.writeText(JSON.stringify(rows, null, 2));
    showNotification("JSON copiado al portapapeles");
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_26rem]">
            <div>
              <div className="eyebrow mb-3">Captura por corte</div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Suministro de data por cargo.</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                Ordena la información del cargo desde la identidad del rol hasta su compensación fija, con una lectura mucho más clara para edición continua.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="metric-tile">
                  <div className="metric-label">Cargos cargados</div>
                  <div className="metric-value mt-3">{rows.length}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Versiones guardadas</div>
                  <div className="metric-value mt-3">{Object.keys(snapshots).length}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Estado</div>
                  <div className="metric-value mt-3">{selectedSnapshotId ? "Procesada" : "En espera"}</div>
                </div>
              </div>

              {notification && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                  <Sparkles size={14} aria-hidden />
                  {notification}
                </div>
              )}

              {selectedSnapshotId ? (
                <div
                  className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                    saveState === "pending"
                      ? "bg-amber-50 text-amber-800"
                      : saveState === "error"
                        ? "bg-red-50 text-red-700"
                        : "bg-teal-50 text-teal-800"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${saveState === "pending" ? "animate-pulse bg-amber-500" : saveState === "error" ? "bg-red-500" : "bg-teal-500"}`} />
                  {saveState === "pending"
                    ? "Guardando en Supabase..."
                    : saveState === "error"
                      ? "Error al guardar en Supabase"
                      : lastSavedAt
                        ? `Guardado en Supabase a las ${lastSavedAt.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })}`
                        : "Guardado en Supabase"}
                </div>
              ) : null}

              {isAdmin ? (
                <div className="mt-6 max-w-md">
                  <label htmlFor="companyFilter" className="field-label">Empresa</label>
                  <select
                    id="companyFilter"
                    value={selectedCompanyId}
                    onChange={(event) => setSelectedCompanyId(event.target.value)}
                    className="field-select"
                    disabled={isLoadingCompanies}
                  >
                    <option value="">Seleccionar</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {isReadOnlyDataView
                      ? "Estás viendo una vista consolidada por empresa en modo solo lectura."
                      : "Selecciona una empresa para consultar su data consolidada."}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-teal-50 p-3 text-teal-700">
                  <CalendarDays size={18} aria-hidden />
                </div>
                <div>
                  <div className="eyebrow mb-1">Control de versión</div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">Cortes</h2>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="snapshotSelect" className="field-label">Seleccionar corte</label>
                  <select id="snapshotSelect" value={selectedSnapshotId} onChange={(e) => loadSnapshot(e.target.value)} className="field-select">
                    <option value="">-- seleccionar --</option>
                    {Object.values(snapshots)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((s) => (
                        <option key={s.id} value={s.id}>{getDisplayLabel(s)}</option>
                      ))}
                  </select>
                </div>

                <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                  {isReadOnlyDataView
                    ? "Vista de consulta para admin. Los cortes y cargos se muestran en modo solo lectura."
                    : ""}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => {
                      if (draftSaveTimer.current) {
                        window.clearTimeout(draftSaveTimer.current);
                      }
                      void reloadWorkspaceData({ showNotification: true });
                    }}
                    className="btn btn-secondary"
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    {isRefreshing ? "Actualizando..." : "Actualizar data"}
                  </button>
                  <button onClick={exportJSON} className="btn btn-secondary">
                    <Check className="h-4 w-4" />
                    Exportar JSON
                  </button>
                  {!isReadOnlyDataView ? (
                    <>
                      <button
                        onClick={() => {
                          if (!selectedSnapshotId) {
                            showNotification("Seleccione un corte");
                            return;
                          }
                          void saveCurrentToSnapshot(selectedSnapshotId);
                        }}
                        className="btn btn-secondary"
                      >
                        <Save className="h-4 w-4" />
                        Guardar
                      </button>
                      <button onClick={addRow} className="btn btn-primary">
                        <Plus className="h-4 w-4" />
                        Agregar cargo
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        {rows.length === 0 ? (
          <section className="surface-card rounded-[2rem] p-10 text-center">
            <div className="mx-auto flex max-w-xl flex-col items-center">
              <div className="rounded-full bg-teal-50 p-4 text-teal-700">
                <BriefcaseBusiness size={24} aria-hidden />
              </div>
              <h2 className="font-display mt-5 text-2xl font-bold text-slate-900">No hay cargos en este corte.</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {isReadOnlyDataView
                  ? "No hay cargos cargados para este corte en la vista seleccionada."
                  : "Si aún no ves cortes disponibles, solicita al admin que cree o sincronice los cortes globales. Cuando el corte exista, podrás agregar cargos y completar la información."}
              </p>
              {!isReadOnlyDataView ? (
                <button onClick={addRow} className="btn btn-primary mt-6">
                  <Plus className="h-4 w-4" />
                  Crear primer cargo
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="space-y-5">
            {rows.map((r, i) => (
              <article key={r.id} className="surface-card overflow-hidden rounded-[2rem]">
                <div className="flex flex-col gap-5 p-5 md:p-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex-1">
                    <div className="mb-3 inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
                      Cargo {String(i + 1).padStart(2, "0")}
                    </div>
                    <h2 className="font-display text-2xl font-bold text-slate-900">
                      {r.tituloCargo || `Cargo ${i + 1}`}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                      {r.descripcion || "Completa primero identidad, nivel y clasificación para dejar el cargo listo antes de cargar su compensación."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="pill">{r.nivelOrganizacional || "Sin nivel"}</div>
                      <div className="pill">{r.clasificacion || "Sin clasificación"}</div>
                      <div className="pill">{(r.additionalFixedPayments || []).length} conceptos fijos</div>
                      <div className="pill">{(r.additionalVariablePayments || []).length} conceptos variables</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 xl:justify-end">
                    <button onClick={() => toggleExpand(r.id)} className="btn btn-secondary">
                      <Edit className="h-4 w-4" />
                      {expanded[r.id] ? "Cerrar detalle" : isReadOnlyDataView ? "Ver detalle" : "Editar cargo"}
                    </button>
                    {!isReadOnlyDataView ? (
                      <>
                        <button
                          onClick={() => {
                            if (!selectedSnapshotId) {
                              showNotification("Seleccione un corte");
                              return;
                            }
                            setModal({ type: 'save', id: r.id });
                          }}
                          className="btn btn-secondary"
                        >
                          <Save className="h-4 w-4" />
                          Guardar cargo
                        </button>
                        <button onClick={() => removeRow(i)} className="btn btn-danger">
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {expanded[r.id] && (
                  <div className="border-t border-slate-200/70 bg-[rgba(255,248,241,0.76)] p-5 md:p-6">
                    <fieldset disabled={isReadOnlyDataView} className="space-y-5 disabled:opacity-90">
                      <section className="rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-5">
                        <div className="eyebrow mb-3">Paso 1</div>
                        <h3 className="font-display text-xl font-bold text-slate-900">Identidad del cargo</h3>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <label className="field-label">Título del cargo</label>
                            <select
                              ref={(el) => {
                                titleRefs.current[r.id] = el;
                              }}
                              value={r.tituloCargo}
                              onChange={(e) => update(i, "tituloCargo", e.target.value)}
                              className="field-select"
                              aria-label="Título del cargo"
                            >
                              <option value="">Seleccionar cargo</option>
                              {JOB_TITLES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="field-label">Nivel organizacional</label>
                            <select
                              value={r.nivelOrganizacional}
                              onChange={(e) => updateOrganizationalLevel(i, e.target.value)}
                              className="field-select"
                              aria-label="Nivel organizacional"
                            >
                              <option value="">Seleccionar nivel</option>
                              {ORGANIZATIONAL_LEVEL_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="field-label">Clasificación</label>
                            {(() => {
                              const classificationOptions: string[] = r.nivelOrganizacional
                                ? CLASSIFICATION_OPTIONS_BY_LEVEL[r.nivelOrganizacional] ?? []
                                : [];

                              return (
                            <select
                              value={r.clasificacion}
                              onChange={(e) => update(i, "clasificacion", e.target.value)}
                              className="field-select"
                              aria-label="Clasificación"
                              disabled={!r.nivelOrganizacional}
                            >
                              <option value="">Seleccionar clasificación</option>
                              {classificationOptions.map((option: string) => (
                                <option key={option} value={option}>{option === "AnalistaJR" ? "Analista JR" : option}</option>
                              ))}
                            </select>
                              );
                            })()}
                          </div>
                          <div className="md:col-span-2">
                            <label className="field-label">Descripción</label>
                            <textarea
                              placeholder="Resume alcance, foco funcional y responsabilidades principales"
                              value={r.descripcion}
                              onChange={(e) => update(i, "descripcion", e.target.value)}
                              className="field-textarea"
                            />
                          </div>
                        </div>
                      </section>

                      <section className="rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-5">
                        <div className="eyebrow mb-3">Paso 2</div>
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h3 className="font-display text-xl font-bold text-slate-900">Compensación fija</h3>
                          </div>
                          <button onClick={() => addAdditionalFixed(i)} className="btn btn-primary">
                            <Plus className="h-4 w-4" />
                            Agregar concepto
                          </button>
                        </div>
                        <div className="mt-5 space-y-4">
                          <div className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 p-4">
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)_8.5rem_8.5rem_8.5rem_9rem] xl:items-end">
                              <div>
                                <label className="field-label min-h-8">Concepto</label>
                                <input aria-label="Concepto sueldo basico" value="Sueldo Básico" readOnly className="field bg-slate-100" />
                              </div>
                              <div>
                                <label className="field-label min-h-8">Monto</label>
                                <input type="number" aria-label="Monto sueldo basico" placeholder="Monto" value={r.sueldoBasico} onChange={(e) => update(i, "sueldoBasico", Number(e.target.value))} className="field" />
                              </div>
                              <div>
                                <label className="field-label min-h-8">Moneda de Cuenta</label>
                                <select aria-label="Moneda de cuenta sueldo basico" value={r.sueldoBasicoCuentaMoneda || "USD"} onChange={(e) => update(i, "sueldoBasicoCuentaMoneda", e.target.value)} className="field-select">
                                  <option value="USD">$</option>
                                  <option value="VES">BS</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label min-h-8">Moneda de Pago</label>
                                <select aria-label="Moneda de pago sueldo basico" value={r.sueldoBasicoMonedaPago || "USD"} onChange={(e) => update(i, "sueldoBasicoMonedaPago", e.target.value)} className="field-select">
                                  <option value="USD">$</option>
                                  <option value="VES">BS</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label min-h-8">Impacto en Pasivos</label>
                                <select aria-label="Impacto salarial sueldo basico" value={r.sueldoBasicoImpacto ? "yes" : "no"} onChange={(e) => update(i, "sueldoBasicoImpacto", e.target.value === "yes")} className="field-select">
                                  <option value="yes">Sí</option>
                                  <option value="no">No</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label min-h-8">Frecuencia</label>
                                <select aria-label="Frecuencia sueldo basico" value={r.sueldoBasicoFreq || "monthly"} onChange={(e) => update(i, "sueldoBasicoFreq", e.target.value)} className="field-select">
                                  {FREQUENCY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 p-4">
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)_8.5rem_8.5rem_8.5rem_9rem] xl:items-end">
                              <div>
                                <label className="field-label min-h-8">Concepto</label>
                                <input aria-label="Concepto bono alimentacion" value="Bono Alimentación" readOnly className="field bg-slate-100" />
                              </div>
                              <div>
                                <label className="field-label min-h-8">Monto</label>
                                <input type="number" aria-label="Monto bono alimentacion" placeholder="Monto" value={r.bonoAlimentacion} onChange={(e) => update(i, "bonoAlimentacion", Number(e.target.value))} className="field" />
                              </div>
                              <div>
                                <label className="field-label min-h-8">Moneda de Cuenta</label>
                                <select aria-label="Moneda de cuenta bono alimentacion" value={r.bonoAlimentacionCuentaMoneda || "USD"} onChange={(e) => update(i, "bonoAlimentacionCuentaMoneda", e.target.value)} className="field-select">
                                  <option value="USD">$</option>
                                  <option value="VES">BS</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label min-h-8">Moneda de Pago</label>
                                <select aria-label="Moneda de pago bono alimentacion" value={r.bonoAlimentacionMonedaPago || "USD"} onChange={(e) => update(i, "bonoAlimentacionMonedaPago", e.target.value)} className="field-select">
                                  <option value="USD">$</option>
                                  <option value="VES">BS</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label min-h-8">Impacto en Pasivos</label>
                                <select aria-label="Impacto salarial bono alimentacion" value={r.bonoAlimentacionImpacto ? "yes" : "no"} onChange={(e) => update(i, "bonoAlimentacionImpacto", e.target.value === "yes")} className="field-select">
                                  <option value="yes">Sí</option>
                                  <option value="no">No</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label min-h-8">Frecuencia</label>
                                <select aria-label="Frecuencia bono alimentacion" value={r.bonoAlimentacionFreq || "monthly"} onChange={(e) => update(i, "bonoAlimentacionFreq", e.target.value)} className="field-select">
                                  {FREQUENCY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          {(r.additionalFixedPayments || []).length > 0 && (
                            (r.additionalFixedPayments || []).map((p, idx) => (
                              <div key={p.id} className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 p-4">
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)_8.5rem_8.5rem_8.5rem_9rem_auto] xl:items-end">
                                  <div>
                                    <label className="field-label min-h-8">Concepto</label>
                                    <input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalFixed(i, idx, "concept", e.target.value)} className="field" />
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Monto</label>
                                    <input type="number" placeholder="Monto" value={p.amount ?? 0} onChange={(e) => updateAdditionalFixed(i, idx, "amount", Number(e.target.value))} className="field" />
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Moneda de Cuenta</label>
                                    <select aria-label="Moneda de cuenta concepto fijo" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalFixed(i, idx, "accountCurrency", e.target.value)} className="field-select">
                                      <option value="USD">$</option>
                                      <option value="VES">BS</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Moneda de Pago</label>
                                    <select aria-label="Moneda de pago concepto fijo" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalFixed(i, idx, "paymentCurrency", e.target.value)} className="field-select">
                                      <option value="USD">$</option>
                                      <option value="VES">BS</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Impacto en Pasivos</label>
                                    <select aria-label="Impacto concepto fijo" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalFixed(i, idx, "impacto", e.target.value === "yes")} className="field-select">
                                      <option value="yes">Sí</option>
                                      <option value="no">No</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Frecuencia</label>
                                    <select aria-label="Frecuencia concepto fijo" value={p.freq || "monthly"} onChange={(e) => updateAdditionalFixed(i, idx, "freq", e.target.value)} className="field-select">
                                      {FREQUENCY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <button onClick={() => removeAdditionalFixed(i, idx)} className="btn btn-danger">
                                    <Trash2 className="h-4 w-4" />
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </section>

                      <section className="rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="eyebrow mb-2">Paso 3</div>
                            <h3 className="font-display text-xl font-bold text-slate-900">Compensación variable</h3>
                        </div>
                          <button onClick={() => addAdditionalVariable(i)} className="btn btn-primary">
                          <Plus className="h-4 w-4" />
                            Agregar concepto
                          </button>
                        </div>

                        <div className="mt-5 space-y-4">
                          {(r.additionalVariablePayments || []).length > 0 && (
                            (r.additionalVariablePayments || []).map((p, idx) => (
                              <div key={p.id} className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 p-4">
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[12rem_minmax(0,1.05fr)_minmax(0,0.8fr)_8.5rem_8.5rem_8.5rem_9rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
                                  <div>
                                    <label className="field-label min-h-8">Tipo de bono</label>
                                    <select aria-label="Tipo de bono variable" value={p.variableType || ""} onChange={(e) => updateAdditionalVariable(i, idx, "variableType", e.target.value)} className="field-select">
                                      <option value="">Seleccionar</option>
                                      {VARIABLE_BONUS_TYPES.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {p.variableType === "performance" ? (
                                    <>
                                      <div>
                                        <label className="field-label min-h-8">Concepto</label>
                                        <input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalVariable(i, idx, "concept", e.target.value)} className="field" />
                                      </div>
                                      <div>
                                        <label className="field-label min-h-8">Monto</label>
                                        <input type="number" placeholder="Monto" value={p.amount ?? 0} onChange={(e) => updateAdditionalVariable(i, idx, "amount", Number(e.target.value))} className="field" />
                                      </div>
                                      <div>
                                        <label className="field-label min-h-8">Moneda de Cuenta</label>
                                        <select aria-label="Moneda de cuenta concepto variable" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "accountCurrency", e.target.value)} className="field-select">
                                          <option value="USD">$</option>
                                          <option value="VES">BS</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="field-label min-h-8">Moneda de Pago</label>
                                        <select aria-label="Moneda de pago concepto variable" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "paymentCurrency", e.target.value)} className="field-select">
                                          <option value="USD">$</option>
                                          <option value="VES">BS</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="field-label min-h-8">Impacto en Pasivos</label>
                                        <select aria-label="Impacto concepto variable" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalVariable(i, idx, "impacto", e.target.value === "yes")} className="field-select">
                                          <option value="yes">Sí</option>
                                          <option value="no">No</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="field-label min-h-8">Frecuencia</label>
                                        <select aria-label="Frecuencia concepto variable" value={p.freq || "monthly"} onChange={(e) => updateAdditionalVariable(i, idx, "freq", e.target.value)} className="field-select">
                                          {FREQUENCY_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <button onClick={() => removeAdditionalVariable(i, idx)} className="btn btn-danger">
                                        <Trash2 className="h-4 w-4" />
                                        Eliminar
                                      </button>
                                    </>
                                  ) : p.variableType === "commission" ? (
                                    <>
                                  <div>
                                    <label className="field-label min-h-8">Concepto</label>
                                    <input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalVariable(i, idx, "concept", e.target.value)} className="field" />
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Monto</label>
                                    <input type="number" placeholder="Monto" value={p.amount ?? 0} onChange={(e) => updateAdditionalVariable(i, idx, "amount", Number(e.target.value))} className="field" />
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Moneda de Cuenta</label>
                                    <select aria-label="Moneda de cuenta concepto variable" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "accountCurrency", e.target.value)} className="field-select">
                                      <option value="USD">$</option>
                                      <option value="VES">BS</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Moneda de Pago</label>
                                    <select aria-label="Moneda de pago concepto variable" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "paymentCurrency", e.target.value)} className="field-select">
                                      <option value="USD">$</option>
                                      <option value="VES">BS</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Impacto en Pasivos</label>
                                    <select aria-label="Impacto concepto variable" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalVariable(i, idx, "impacto", e.target.value === "yes")} className="field-select">
                                      <option value="yes">Sí</option>
                                      <option value="no">No</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Frecuencia</label>
                                    <select aria-label="Frecuencia concepto variable" value={p.freq || "monthly"} onChange={(e) => updateAdditionalVariable(i, idx, "freq", e.target.value)} className="field-select">
                                      {FREQUENCY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Tipo de comision</label>
                                    <select aria-label="Tipo de comision" value={p.commissionType || "simple"} onChange={(e) => updateAdditionalVariable(i, idx, "commissionType", e.target.value)} className="field-select">
                                      {VARIABLE_COMMISSION_TYPES.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Detalle de calculo</label>
                                    <select aria-label="Detalle de calculo" value={p.calculationDetail || "sale_value"} onChange={(e) => updateAdditionalVariable(i, idx, "calculationDetail", e.target.value)} className="field-select">
                                      {VARIABLE_CALCULATION_DETAILS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label min-h-8">Objetivos y metas</label>
                                    <select aria-label="Objetivos y metas" value={p.goalsTarget || "sales_quota"} onChange={(e) => updateAdditionalVariable(i, idx, "goalsTarget", e.target.value)} className="field-select">
                                      {VARIABLE_GOALS_TARGETS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <button onClick={() => removeAdditionalVariable(i, idx)} className="btn btn-danger">
                                    <Trash2 className="h-4 w-4" />
                                    Eliminar
                                  </button>
                                    </>
                                  ) : (
                                    <div className="md:col-span-1 xl:col-span-10 rounded-[1rem] border border-dashed border-slate-300 bg-white/70 px-4 py-4 text-sm text-slate-500">
                                      Selecciona si el concepto corresponde a bono por desempeño o bono por comisiones para continuar.
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    </fieldset>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
      {modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setModal({ type: null })} />
          <div role="dialog" aria-modal="true" className="surface-card relative z-10 w-full max-w-md rounded-[1.75rem] p-6">
            {modal.type === "save" && (
              <div>
                <div className="eyebrow mb-2">Confirmar</div>
                <h3 className="font-display text-2xl font-bold text-slate-900">Guardar cargo</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">¿Deseas guardar los cambios de este cargo en el corte seleccionado?</p>
                <div className="mt-5 flex justify-end gap-3">
                  <button onClick={() => setModal({ type: null })} className="btn btn-secondary">Cancelar</button>
                  <button onClick={() => { if (modal.id) { void saveRowById(modal.id); } setModal({ type: null }); }} className="btn btn-primary">Guardar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}