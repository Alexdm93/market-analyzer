"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, CalendarDays, Check, Edit, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";
import { DEPARTMENTS, JOB_TITLES_BY_DEPARTMENT, JOB_TITLES } from "@/data/jobTitles";
import { type Snapshot, type ExchangeRate, type CompanyInfo, EMPTY_COMPANY_INFO } from "@/lib/workspace";
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

function freqToMonthly(freq?: string): number {
  switch (freq) {
    case "biweekly": return 2;
    case "monthly": return 1;
    case "bimonthly": return 0.5;
    case "quarterly": return 1 / 3;
    case "semiannual": return 1 / 6;
    case "annual": return 1 / 12;
    default: return 1;
  }
}

function freqToAnnual(freq?: string): number {
  switch (freq) {
    case "biweekly": return 24;
    case "monthly": return 12;
    case "bimonthly": return 6;
    case "quarterly": return 4;
    case "semiannual": return 2;
    case "annual": return 1;
    default: return 12;
  }
}

function fmtMoney(n: number) {
  if (!n) return "—";
  return `$ ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const NIVELES_ADMIN = ["Operativo", "Profesional", "Supervisor", "Gerencia Media", "Gerencia Alta", "Ejecutivo"] as const;

function computeRowTotalAdmin(r: ExtendedMarketPosition): number {
  let s = Number(r.sueldoBasico ?? 0) + Number(r.bonoAlimentacion ?? 0) + Number(r.bonoMovilizacion ?? 0)
    + Number(r.bonoDesempeno ?? 0) + Number(r.comisiones ?? 0) + Number(r.pagoVariableOtros ?? 0)
    + Number(r.pagoTransporte ?? 0) + Number(r.viaticos ?? 0) + Number(r.otrosPagos ?? 0)
    + Number(r.aportesSeguridadSocial ?? 0) + Number(r.prestacionesLegales ?? 0);
  if (Array.isArray(r.additionalFixedPayments))
    s += r.additionalFixedPayments.reduce((a, b) => a + Number(b.amount ?? 0), 0);
  if (Array.isArray(r.additionalVariablePayments))
    s += r.additionalVariablePayments.reduce((a, b) => a + Number(b.amount ?? 0), 0);
  return s;
}

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const empty = (i: number): ExtendedMarketPosition => ({
  id: `r-${Date.now()}-${i}`,
  departamento: "",
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
  sueldoBasicoTasaId: '',

  bonoAlimentacionCuentaMoneda: 'USD',
  bonoAlimentacionMonedaPago: 'USD',
  bonoAlimentacionImpacto: true,
  bonoAlimentacionTasaId: '',

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

function findDuplicateCargoTitles(rows: ExtendedMarketPosition[]) {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  rows.forEach((row) => {
    const rawTitle = (row.tituloCargo || "").trim();
    const normalizedTitle = rawTitle.toLocaleLowerCase();

    if (!normalizedTitle) {
      return;
    }

    const previousTitle = seen.get(normalizedTitle);

    if (previousTitle) {
      duplicates.add(previousTitle);
      duplicates.add(rawTitle);
      return;
    }

    seen.set(normalizedTitle, rawTitle);
  });

  return Array.from(duplicates);
}

export default function DataPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "pending" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tasas, setTasas] = useState<ExchangeRate[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
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
  const [nivelMin, setNivelMin] = useState<Record<string, string>>({});
  const [nivelMax, setNivelMax] = useState<Record<string, string>>({});
  const snapshotsRef = useRef<Record<string, Snapshot>>({});

  function getDuplicateCargoMessage(nextRows: ExtendedMarketPosition[]) {
    const duplicates = findDuplicateCargoTitles(nextRows);

    if (duplicates.length === 0) {
      return null;
    }

    return `No puedes guardar cargos repetidos. Revisa: ${duplicates.join(", ")}.`;
  }

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
      setTasas(workspace.companyInfo?.tasas ?? []);
      setCompanyInfo(workspace.companyInfo ?? EMPTY_COMPANY_INFO);

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
    const activeSnapshot = nextSelectedSnapshotId ? next[nextSelectedSnapshotId] : null;
    const duplicateMessage = activeSnapshot ? getDuplicateCargoMessage(activeSnapshot.rows ?? []) : null;

    if (duplicateMessage) {
      setSaveState("error");

      if (options?.showErrorNotification) {
        showNotification(duplicateMessage, 4000);
      }

      return false;
    }

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
    } catch (error) {
      console.error(error);
      setSaveState("error");

      if (options?.showErrorNotification) {
        showNotification(error instanceof Error ? error.message : "Error al guardar cargos en Supabase", 4000);
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

    setSaveState("dirty");
    setLastSavedAt(null);
  }, [isReadOnlyDataView, rows, selectedSnapshotId, snapshots]);
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

  function updateDepartamento(i: number, dept: string) {
    setRows((prev) => {
      const next = [...prev];
      const current = next[i];
      const titlesForDept = JOB_TITLES_BY_DEPARTMENT[dept] || [];
      next[i] = {
        ...current,
        departamento: dept,
        tituloCargo: titlesForDept.includes(current.tituloCargo) ? current.tituloCargo : "",
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
      list.unshift({ id, concept: '', amount: 0, freq: 'monthly', accountCurrency: 'USD', paymentCurrency: 'USD', impacto: true, tasaId: '' });
      row.additionalFixedPayments = list;
      next[rowIndex] = row;
      return next;
    });
  }

  function updateAdditionalFixed(rowIndex: number, idx: number, key: 'concept' | 'amount' | 'freq' | 'accountCurrency' | 'paymentCurrency' | 'impacto' | 'tasaId', value: string | number | boolean) {
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
        tasaId: "",
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
    key: 'concept' | 'amount' | 'freq' | 'accountCurrency' | 'paymentCurrency' | 'impacto' | 'tasaId' | 'variableType' | 'commissionType' | 'calculationDetail' | 'goalsTarget',
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
      showNotification("Selecciona una actualización asignada por el admin antes de agregar cargos");
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
      showNotification("Seleccione una actualización");
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

  const modalSaveRow = modal.type === "save" && modal.id
    ? rows.find((r) => r.id === modal.id) ?? null
    : null;

  const modalMonthlyFixed = modalSaveRow
    ? Math.round(
        (modalSaveRow.sueldoBasico || 0) * freqToMonthly(modalSaveRow.sueldoBasicoFreq) +
        (modalSaveRow.bonoAlimentacion || 0) * freqToMonthly(modalSaveRow.bonoAlimentacionFreq) +
        (modalSaveRow.bonoMovilizacion || 0) * freqToMonthly(modalSaveRow.bonoMovilizacionFreq) +
        (modalSaveRow.additionalFixedPayments || []).reduce(
          (s, p) => s + (p.amount || 0) * freqToMonthly(p.freq), 0
        )
      )
    : 0;

  const modalAnnualVariable = modalSaveRow
    ? Math.round(
        (modalSaveRow.bonoDesempeno || 0) * freqToAnnual(modalSaveRow.bonoDesempenoFreq) +
        (modalSaveRow.comisiones || 0) * freqToAnnual(modalSaveRow.comisionesFreq) +
        (modalSaveRow.pagoVariableOtros || 0) * freqToAnnual(modalSaveRow.pagoVariableOtrosFreq) +
        (modalSaveRow.additionalVariablePayments || []).reduce(
          (s, p) => s + (p.amount || 0) * freqToAnnual(p.freq), 0
        )
      )
    : 0;

  const modalAnnualTotal = modalMonthlyFixed * 12 + modalAnnualVariable;

  const missingCompanyFields: string[] = [];
  if (modal.type === "save") {
    if (!companyInfo.headcount) missingCompanyFields.push("Headcount");
    if (!companyInfo.revenueUSD) missingCompanyFields.push("Facturación");
    if (!companyInfo.avgProfitPercent) missingCompanyFields.push("Utilidades antes de ISLR (%)");
    if (!companyInfo.hrName) missingCompanyFields.push("Nombre de contacto de RRHH");
    if (!companyInfo.hrEmail) missingCompanyFields.push("Correo de contacto de RRHH");
  }

  // Admin: medians per nivel from current rows
  const medianasPorNivelAdmin = useMemo(() => {
    const result: Record<string, number> = {};
    for (const nivel of NIVELES_ADMIN) {
      const totals = rows
        .filter((r) => r.nivelOrganizacional?.trim() === nivel)
        .map(computeRowTotalAdmin)
        .filter((v) => v > 0 && Number.isFinite(v));
      result[nivel] = totals.length ? Math.round(pct(totals, 50)) : 0;
    }
    return result;
  }, [rows]);

  // Admin: out-of-range warnings
  const outOfRangeRows = isAdmin
    ? rows.filter((r) => {
        const nivel = r.nivelOrganizacional?.trim() ?? "";
        const total = computeRowTotalAdmin(r);
        const min = Number(nivelMin[nivel] ?? 0);
        const max = Number(nivelMax[nivel] ?? 0);
        return total > 0 && ((min > 0 && total < min) || (max > 0 && total > max));
      })
    : [];

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-3">

        {/* Admin: rangos de referencia por nivel */}
        {isAdmin && (
          <section className="surface-card overflow-hidden rounded-[1.75rem] p-4 md:p-5">
            <div className="eyebrow mb-1.5">Rangos de referencia</div>
            <h2 className="font-display text-[1.1rem] font-bold text-slate-900">Valores mínimos y máximos aceptables por nivel</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                    <th className="px-3 py-1.5 text-left">Rango</th>
                    {NIVELES_ADMIN.map((n) => (
                      <th key={n} className="px-3 py-1.5 text-center">{n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="rounded-[1.25rem] bg-white/80">
                    <td className="rounded-l-[1.25rem] px-3 py-2 text-xs font-bold text-teal-700">Mínimo</td>
                    {NIVELES_ADMIN.map((n) => (
                      <td key={n} className="px-2 py-1.5">
                        <input
                          type="number"
                          placeholder="$ 0"
                          value={nivelMin[n] ?? ""}
                          onChange={(e) => setNivelMin((prev) => ({ ...prev, [n]: e.target.value }))}
                          className="field w-28 text-right text-sm"
                        />
                      </td>
                    ))}
                    <td className="rounded-r-[1.25rem]" />
                  </tr>
                  <tr className="rounded-[1.25rem] bg-white/80">
                    <td className="rounded-l-[1.25rem] px-3 py-2 text-xs font-bold text-amber-700">Máximo</td>
                    {NIVELES_ADMIN.map((n) => (
                      <td key={n} className="px-2 py-1.5">
                        <input
                          type="number"
                          placeholder="$ 0"
                          value={nivelMax[n] ?? ""}
                          onChange={(e) => setNivelMax((prev) => ({ ...prev, [n]: e.target.value }))}
                          className="field w-28 text-right text-sm"
                        />
                      </td>
                    ))}
                    <td className="rounded-r-[1.25rem]" />
                  </tr>
                </tbody>
              </table>
            </div>
            {outOfRangeRows.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="mt-0.5 text-amber-600">⚠</span>
                <div>
                  <p className="text-xs font-bold text-amber-800">{outOfRangeRows.length} cargo{outOfRangeRows.length !== 1 ? "s" : ""} fuera de rango</p>
                  <p className="mt-0.5 text-xs text-amber-700">{outOfRangeRows.map((r) => r.tituloCargo || "Sin título").join(", ")}</p>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="surface-panel rounded-[1.75rem] p-4 md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_20rem]">
            <div>
              <div className="eyebrow mb-2">{isAdmin ? "Vista Admin" : "Actualización de Data"}</div>
              <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-slate-900 md:text-[1.85rem]">
                {isAdmin ? "Resumen / Revisión de data por empresa" : "Suministro de data por cargo."}
              </h1>
              {isAdmin && (
                <div className="mt-3 max-w-md">
                  <label htmlFor="companyFilter" className="field-label">Empresa</label>
                  <select
                    id="companyFilter"
                    value={selectedCompanyId}
                    onChange={(event) => setSelectedCompanyId(event.target.value)}
                    className="field-select"
                    disabled={isLoadingCompanies}
                  >
                    <option value="">Seleccionar empresa</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {!isAdmin && (
                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  Actualizar la data de compensación y la identidad del rol bajo una estructura jerárquica que permita una edición continua y una lectura clara de la arquitectura del cargo.
                </p>
              )}

              {isAdmin ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-[auto_1fr]">
                  <div className="flex flex-wrap gap-2">
                    <div className="metric-tile w-44 shrink-0 py-2.5">
                      <div className="metric-label">Cargos reportados</div>
                      <div className="metric-value mt-1">{rows.length}</div>
                    </div>
                    <div className={`metric-tile w-44 shrink-0 py-2.5 ${outOfRangeRows.length > 0 ? "border-amber-200 bg-amber-50/60" : ""}`}>
                      <div className="metric-label">Estado de datos</div>
                      <div className={`metric-value mt-1 text-base ${outOfRangeRows.length > 0 ? "text-amber-700" : "text-teal-700"}`}>
                        {outOfRangeRows.length > 0 ? `${outOfRangeRows.length} fuera de rango` : selectedSnapshotId ? "Válidos" : "Sin corte"}
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-y-1.5 text-sm">
                      <thead>
                        <tr className="text-left text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
                          {NIVELES_ADMIN.map((n) => (
                            <th key={n} className="px-3 py-1 text-center">{n}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="rounded-[1.25rem] bg-white/60">
                          {NIVELES_ADMIN.map((n, i) => {
                            const val = medianasPorNivelAdmin[n] ?? 0;
                            return (
                              <td key={n} className={`px-3 py-2.5 text-center font-display font-semibold text-xs ${i === 0 ? "rounded-l-[1.25rem]" : ""} ${i === NIVELES_ADMIN.length - 1 ? "rounded-r-[1.25rem]" : ""} ${val === 0 ? "text-slate-400" : "text-teal-700"}`}>
                                <div className="text-[0.62rem] font-normal text-slate-400">P50</div>
                                {val === 0 ? "ND" : fmtMoney(val)}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <div className="metric-tile">
                    <div className="metric-label">Cargos cargados</div>
                    <div className="metric-value mt-3">{rows.length}</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Última actualización</div>
                    <div className="metric-value mt-3 text-base">
                      {Object.values(snapshots).length
                        ? new Date(
                            Object.values(snapshots).sort((a, b) => b.date.localeCompare(a.date))[0].date
                          ).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Estado</div>
                    <div className="metric-value mt-3">{selectedSnapshotId ? "Procesada" : "En espera"}</div>
                  </div>
                </div>
              )}

              {notification && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                  <Sparkles size={14} aria-hidden />
                  {notification}
                </div>
              )}

              {selectedSnapshotId ? (
                <div
                  className={`mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                    saveState === "dirty"
                      ? "bg-slate-100 text-slate-700"
                      :
                    saveState === "pending"
                      ? "bg-amber-50 text-amber-800"
                      : saveState === "error"
                        ? "bg-red-50 text-red-700"
                        : "bg-teal-50 text-teal-800"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${saveState === "dirty" ? "bg-slate-500" : saveState === "pending" ? "animate-pulse bg-amber-500" : saveState === "error" ? "bg-red-500" : "bg-teal-500"}`} />
                  {saveState === "dirty"
                    ? "Cambios sin guardar"
                    : saveState === "pending"
                    ? "Guardando en Supabase..."
                    : saveState === "error"
                      ? "Error al guardar en Supabase"
                      : lastSavedAt
                        ? `Guardado en Supabase a las ${lastSavedAt.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })}`
                        : "Guardado en Supabase"}
                </div>
              ) : null}

            </div>

            <div className="btn-compact-zone surface-card rounded-[1.25rem] p-3 md:p-3.5">
              <div className="flex items-center gap-2.5">
                <div className="rounded-full bg-teal-50 p-2 text-teal-700">
                  <CalendarDays size={14} aria-hidden />
                </div>
                <div>
                  <div className="eyebrow-xs eyebrow mb-0.5">{isAdmin ? "Empresa" : "Control de actualización"}</div>
                  <h2 className="font-display text-base font-bold text-slate-900">{isAdmin ? "Data por empresa" : "Actualización"}</h2>
                </div>
              </div>

              <div className="mt-2.5 space-y-2">
                <div>
                  <label htmlFor="snapshotSelect" className="field-label">Seleccionar actualización</label>
                  <select id="snapshotSelect" value={selectedSnapshotId} onChange={(e) => loadSnapshot(e.target.value)} className="field-select">
                    <option value="">-- seleccionar --</option>
                    {Object.values(snapshots)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((s) => (
                        <option key={s.id} value={s.id}>{getDisplayLabel(s)}</option>
                      ))}
                  </select>
                </div>

                {isReadOnlyDataView && (
                  <div className="rounded-[0.9rem] bg-slate-50 px-3 py-2 text-xs leading-4 text-slate-600">
                    Vista de consulta para admin. Las actualizaciones y cargos se muestran en modo solo lectura.
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => {
                      void reloadWorkspaceData({ showNotification: true });
                    }}
                    className="btn btn-secondary whitespace-nowrap"
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                    {isRefreshing ? "Actualizando..." : "Actualizar data"}
                  </button>
                  <button onClick={exportJSON} className="btn btn-secondary whitespace-nowrap">
                    <Check className="h-3.5 w-3.5" />
                    Exportar a Excel
                  </button>
                  {!isReadOnlyDataView ? (
                    <>
                      <button
                        onClick={() => {
                          if (!selectedSnapshotId) {
                            showNotification("Seleccione una actualización");
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
          <section className="surface-card rounded-[1.5rem] p-6 text-center">
            <div className="mx-auto flex max-w-xl flex-col items-center">
              <div className="rounded-full bg-teal-50 p-4 text-teal-700">
                <BriefcaseBusiness size={24} aria-hidden />
              </div>
              <h2 className="font-display mt-4 text-2xl font-bold text-slate-900 md:text-[1.35rem]">No hay cargos en esta actualización.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 md:text-[0.82rem]">
                {isReadOnlyDataView
                  ? "No hay cargos cargados para esta actualización en la vista seleccionada."
                  : "Si aún no ves actualizaciones disponibles, solicita al admin que cree o sincronice las actualizaciones globales. Cuando la actualización exista, podrás agregar cargos y completar la información."}
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
          <section className="space-y-3">
            {rows.map((r, i) => (
              <article key={r.id} className="surface-card overflow-hidden rounded-[1.5rem]">
                <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex-1">
                    <div className="mb-1.5 inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
                      Cargo {String(i + 1).padStart(2, "0")}
                    </div>
                    <h2 className="font-display text-xl font-bold text-slate-900 md:text-[1.1rem]">
                      {r.tituloCargo || `Cargo ${i + 1}`}
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600 md:text-[0.82rem]">
                      {r.descripcion || "Completa primero identidad, nivel y clasificación para dejar el cargo listo antes de cargar su compensación."}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="pill">{r.nivelOrganizacional || "Sin nivel"}</div>
                      <div className="pill">{r.clasificacion || "Sin clasificación"}</div>
                      <div className="pill">{(r.additionalFixedPayments || []).length} conceptos fijos</div>
                      <div className="pill">{(r.additionalVariablePayments || []).length} conceptos variables</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <button onClick={() => toggleExpand(r.id)} className="btn btn-secondary btn-xs">
                      <Edit className="h-3 w-3" />
                      {expanded[r.id] ? "Cerrar cargo" : isReadOnlyDataView ? "Ver detalle" : "Editar cargo"}
                    </button>
                    {!isReadOnlyDataView ? (
                      <button onClick={() => removeRow(i)} className="btn btn-danger btn-xs">
                        <Trash2 className="h-3 w-3" />
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                </div>

                {expanded[r.id] && (
                  <div className="border-t border-slate-200/70 bg-[rgba(255,248,241,0.76)] p-3.5 md:p-4">
                    <fieldset disabled={isReadOnlyDataView} className="space-y-4 disabled:opacity-90">
                      <section className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 p-4 md:p-4.5">
                        <div className="eyebrow mb-3">Paso 1</div>
                        <h3 className="font-display text-xl font-bold text-slate-900 md:text-[1.12rem]">Identidad del cargo</h3>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="field-label">Unidad / Departamento</label>
                            <select
                              value={r.departamento || ""}
                              onChange={(e) => updateDepartamento(i, e.target.value)}
                              className="field-select"
                              aria-label="Unidad organizacional o departamento"
                            >
                              <option value="">Seleccionar unidad</option>
                              {DEPARTMENTS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="field-label">Título del cargo</label>
                            <select
                              ref={(el) => { titleRefs.current[r.id] = el; }}
                              value={r.tituloCargo}
                              onChange={(e) => update(i, "tituloCargo", e.target.value)}
                              className="field-select"
                              aria-label="Título del cargo"
                              disabled={!r.departamento}
                            >
                              <option value="">Seleccionar cargo</option>
                              {(r.departamento ? JOB_TITLES_BY_DEPARTMENT[r.departamento] ?? [] : JOB_TITLES).map((t) => (
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

                      <section className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 p-4 md:p-4.5">
                        <div className="eyebrow mb-3">Paso 2</div>
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h3 className="font-display text-xl font-bold text-slate-900 md:text-[1.12rem]">Compensación fija</h3>
                          </div>
                          <button onClick={() => addAdditionalFixed(i)} className="btn btn-primary">
                            <Plus className="h-4 w-4" />
                            Agregar concepto
                          </button>
                        </div>
                        <div className="mt-4 space-y-3">
                          <div className="rounded-[1.1rem] border border-slate-200/80 bg-slate-50/70 p-3.5">
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_7rem_6rem_5.5rem_7rem] xl:items-end">
                              <div>
                                <label className="field-label">Concepto</label>
                                <input aria-label="Concepto sueldo basico" value="Sueldo Básico" readOnly className="field bg-slate-100" />
                              </div>
                              <div>
                                <label className="field-label">Monto</label>
                                <div className="relative">
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">{r.sueldoBasicoCuentaMoneda === "VES" ? "Bs." : "$"}</span>
                                  <input type="number" aria-label="Monto sueldo basico" placeholder="0" value={r.sueldoBasico || ""} onChange={(e) => update(i, "sueldoBasico", Number(e.target.value))} className="field pr-9" />
                                </div>
                              </div>
                              <div>
                                <label className="field-label">Moneda de Cuenta</label>
                                <select aria-label="Moneda de cuenta sueldo basico" value={r.sueldoBasicoCuentaMoneda || "USD"} onChange={(e) => update(i, "sueldoBasicoCuentaMoneda", e.target.value)} className="field-select">
                                  <option value="USD">Dólares (USD)</option>
                                  <option value="VES">Bolívares (Bs.)</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Moneda de Pago</label>
                                <select aria-label="Moneda de pago sueldo basico" value={r.sueldoBasicoMonedaPago || "USD"} onChange={(e) => update(i, "sueldoBasicoMonedaPago", e.target.value)} className="field-select">
                                  <option value="USD">Dólares (USD)</option>
                                  <option value="VES">Bolívares (Bs.)</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Tasa</label>
                                <select aria-label="Tasa sueldo basico" value={r.sueldoBasicoTasaId || ""} onChange={(e) => update(i, "sueldoBasicoTasaId", e.target.value)} className="field-select">
                                  <option value="">Sin tasa</option>
                                  {tasas.map((t) => (
                                    <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Impacto en Pasivos</label>
                                <select aria-label="Impacto salarial sueldo basico" value="yes" disabled className="field-select opacity-60">
                                  <option value="yes">Sí</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Frecuencia</label>
                                <select aria-label="Frecuencia sueldo basico" value={r.sueldoBasicoFreq || "biweekly"} onChange={(e) => update(i, "sueldoBasicoFreq", e.target.value)} className="field-select">
                                  <option value="biweekly">Quincenal</option>
                                  <option value="monthly">Mensual</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[1.1rem] border border-slate-200/80 bg-slate-50/70 p-3.5">
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_7rem_6rem_5.5rem_7rem] xl:items-end">
                              <div>
                                <label className="field-label">Concepto</label>
                                <input aria-label="Concepto bono alimentacion" value="Bono Alimentación" readOnly className="field bg-slate-100" />
                              </div>
                              <div>
                                <label className="field-label">Monto</label>
                                <div className="relative">
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">{r.bonoAlimentacionCuentaMoneda === "VES" ? "Bs." : "$"}</span>
                                  <input type="number" aria-label="Monto bono alimentacion" placeholder="0" value={r.bonoAlimentacion || ""} onChange={(e) => update(i, "bonoAlimentacion", Number(e.target.value))} className="field pr-9" />
                                </div>
                              </div>
                              <div>
                                <label className="field-label">Moneda de Cuenta</label>
                                <select aria-label="Moneda de cuenta bono alimentacion" value={r.bonoAlimentacionCuentaMoneda || "USD"} onChange={(e) => update(i, "bonoAlimentacionCuentaMoneda", e.target.value)} className="field-select">
                                  <option value="USD">Dólares (USD)</option>
                                  <option value="VES">Bolívares (Bs.)</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Moneda de Pago</label>
                                <select aria-label="Moneda de pago bono alimentacion" value={r.bonoAlimentacionMonedaPago || "USD"} onChange={(e) => update(i, "bonoAlimentacionMonedaPago", e.target.value)} className="field-select">
                                  <option value="USD">Dólares (USD)</option>
                                  <option value="VES">Bolívares (Bs.)</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Tasa</label>
                                <select aria-label="Tasa bono alimentacion" value={r.bonoAlimentacionTasaId || ""} onChange={(e) => update(i, "bonoAlimentacionTasaId", e.target.value)} className="field-select">
                                  <option value="">Sin tasa</option>
                                  {tasas.map((t) => (
                                    <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Impacto en Pasivos</label>
                                <select aria-label="Impacto salarial bono alimentacion" value="no" disabled className="field-select opacity-60">
                                  <option value="no">No</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Frecuencia</label>
                                <select aria-label="Frecuencia bono alimentacion" value={r.bonoAlimentacionFreq || "monthly"} onChange={(e) => update(i, "bonoAlimentacionFreq", e.target.value)} className="field-select">
                                  <option value="monthly">Mensual</option>
                                  <option value="biweekly">Quincenal</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {(r.additionalFixedPayments || []).length > 0 && (
                            (r.additionalFixedPayments || []).map((p, idx) => (
                              <div key={p.id} className="rounded-[1.1rem] border border-slate-200/80 bg-slate-50/70 p-3.5">
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_7rem_6rem_5.5rem_7rem_auto] xl:items-end">
                                  <div>
                                    <label className="field-label">Concepto</label>
                                    <input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalFixed(i, idx, "concept", e.target.value)} className="field" />
                                  </div>
                                  <div>
                                    <label className="field-label">Monto</label>
                                    <div className="relative">
                                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                                        {p.accountCurrency === "VES" ? "Bs." : "$"}
                                      </span>
                                      <input type="number" placeholder="0" value={p.amount || ""} onChange={(e) => updateAdditionalFixed(i, idx, "amount", Number(e.target.value))} className="field pr-9" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="field-label">Moneda de Cuenta</label>
                                    <select aria-label="Moneda de cuenta concepto fijo" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalFixed(i, idx, "accountCurrency", e.target.value)} className="field-select">
                                      <option value="USD">Dólares (USD)</option>
                                      <option value="VES">Bolívares (Bs.)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label">Moneda de Pago</label>
                                    <select aria-label="Moneda de pago concepto fijo" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalFixed(i, idx, "paymentCurrency", e.target.value)} className="field-select">
                                      <option value="USD">Dólares (USD)</option>
                                      <option value="VES">Bolívares (Bs.)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label">Tasa</label>
                                    <select aria-label="Tasa concepto fijo" value={p.tasaId || ""} onChange={(e) => updateAdditionalFixed(i, idx, "tasaId", e.target.value)} className="field-select">
                                      <option value="">Sin tasa</option>
                                      {tasas.map((t) => (
                                        <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label">Impacto en Pasivos</label>
                                    <select aria-label="Impacto concepto fijo" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalFixed(i, idx, "impacto", e.target.value === "yes")} className="field-select">
                                      <option value="yes">Sí</option>
                                      <option value="no">No</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="field-label">Frecuencia</label>
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

                      <section className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 p-4 md:p-4.5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="eyebrow mb-2">Paso 3</div>
                            <h3 className="font-display text-xl font-bold text-slate-900 md:text-[1.12rem]">Compensación variable</h3>
                        </div>
                          <button onClick={() => addAdditionalVariable(i)} className="btn btn-primary">
                          <Plus className="h-4 w-4" />
                            Agregar concepto
                          </button>
                        </div>

                        <div className="mt-4 space-y-3">
                          {(r.additionalVariablePayments || []).length > 0 && (
                            (r.additionalVariablePayments || []).map((p, idx) => (
                              <div key={p.id} className="rounded-[1.1rem] border border-slate-200/80 bg-slate-50/70 p-3.5">
                                <div className="space-y-2">
                                  {p.variableType === "performance" ? (
                                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[9rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem_7rem_6rem_5.5rem_7rem_auto] xl:items-end">
                                      <div>
                                        <label className="field-label">Variable</label>
                                        <select aria-label="Tipo de bono variable" value={p.variableType || ""} onChange={(e) => updateAdditionalVariable(i, idx, "variableType", e.target.value)} className="field-select">
                                          <option value="">Seleccionar</option>
                                          {VARIABLE_BONUS_TYPES.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="field-label">Concepto</label>
                                        <input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalVariable(i, idx, "concept", e.target.value)} className="field" />
                                      </div>
                                      <div>
                                        <label className="field-label">Monto</label>
                                        <div className="relative">
                                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                                            {p.accountCurrency === "VES" ? "Bs." : "$"}
                                          </span>
                                          <input type="number" placeholder="0" value={p.amount || ""} onChange={(e) => updateAdditionalVariable(i, idx, "amount", Number(e.target.value))} className="field pr-9" />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="field-label">Moneda de Cuenta</label>
                                        <select aria-label="Moneda de cuenta concepto variable" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "accountCurrency", e.target.value)} className="field-select">
                                          <option value="USD">Dólares (USD)</option>
                                          <option value="VES">Bolívares (Bs.)</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="field-label">Moneda de Pago</label>
                                        <select aria-label="Moneda de pago concepto variable" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "paymentCurrency", e.target.value)} className="field-select">
                                          <option value="USD">Dólares (USD)</option>
                                          <option value="VES">Bolívares (Bs.)</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="field-label">Tasa</label>
                                        <select aria-label="Tasa concepto variable desempeño" value={p.tasaId || ""} onChange={(e) => updateAdditionalVariable(i, idx, "tasaId", e.target.value)} className="field-select">
                                          <option value="">Sin tasa</option>
                                          {tasas.map((t) => (
                                            <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="field-label">Impacto en Pasivos</label>
                                        <select aria-label="Impacto concepto variable" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalVariable(i, idx, "impacto", e.target.value === "yes")} className="field-select">
                                          <option value="yes">Sí</option>
                                          <option value="no">No</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="field-label">Frecuencia</label>
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
                                    </div>
                                  ) : p.variableType === "commission" ? (
                                    <>
                                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[9rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem_7rem_6rem_5.5rem_7rem] xl:items-end">
                                        <div>
                                          <label className="field-label">Variable</label>
                                          <select aria-label="Tipo de bono variable" value={p.variableType || ""} onChange={(e) => updateAdditionalVariable(i, idx, "variableType", e.target.value)} className="field-select">
                                            <option value="">Seleccionar</option>
                                            {VARIABLE_BONUS_TYPES.map((option) => (
                                              <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="field-label">Concepto</label>
                                          <input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalVariable(i, idx, "concept", e.target.value)} className="field" />
                                        </div>
                                        <div>
                                          <label className="field-label">Monto</label>
                                          <div className="relative">
                                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                                              {p.accountCurrency === "VES" ? "Bs." : "$"}
                                            </span>
                                            <input type="number" placeholder="0" value={p.amount || ""} onChange={(e) => updateAdditionalVariable(i, idx, "amount", Number(e.target.value))} className="field pr-9" />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="field-label">Moneda de Cuenta</label>
                                          <select aria-label="Moneda de cuenta concepto variable" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "accountCurrency", e.target.value)} className="field-select">
                                            <option value="USD">Dólares (USD)</option>
                                            <option value="VES">Bolívares (Bs.)</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="field-label">Moneda de Pago</label>
                                          <select aria-label="Moneda de pago concepto variable" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "paymentCurrency", e.target.value)} className="field-select">
                                            <option value="USD">Dólares (USD)</option>
                                            <option value="VES">Bolívares (Bs.)</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="field-label">Tasa</label>
                                          <select aria-label="Tasa concepto variable comisión" value={p.tasaId || ""} onChange={(e) => updateAdditionalVariable(i, idx, "tasaId", e.target.value)} className="field-select">
                                            <option value="">Sin tasa</option>
                                            {tasas.map((t) => (
                                              <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="field-label">Impacto en Pasivos</label>
                                          <select aria-label="Impacto concepto variable comisión" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalVariable(i, idx, "impacto", e.target.value === "yes")} className="field-select">
                                            <option value="yes">Sí</option>
                                            <option value="no">No</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="field-label">Frecuencia</label>
                                          <select aria-label="Frecuencia concepto variable comisión" value={p.freq || "monthly"} onChange={(e) => updateAdditionalVariable(i, idx, "freq", e.target.value)} className="field-select">
                                            {FREQUENCY_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
                                        <div>
                                          <label className="field-label">Tipo de comisión</label>
                                          <select aria-label="Tipo de comision" value={p.commissionType || "simple"} onChange={(e) => updateAdditionalVariable(i, idx, "commissionType", e.target.value)} className="field-select">
                                            {VARIABLE_COMMISSION_TYPES.map((option) => (
                                              <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="field-label">Detalle de cálculo</label>
                                          <select aria-label="Detalle de calculo" value={p.calculationDetail || "sale_value"} onChange={(e) => updateAdditionalVariable(i, idx, "calculationDetail", e.target.value)} className="field-select">
                                            {VARIABLE_CALCULATION_DETAILS.map((option) => (
                                              <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="field-label">Objetivos y metas</label>
                                          <select aria-label="Objetivos y metas" value={p.goalsTarget || "sales_quota"} onChange={(e) => updateAdditionalVariable(i, idx, "goalsTarget", e.target.value)} className="field-select">
                                            {VARIABLE_GOALS_TARGETS.map((option) => (
                                              <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <button type="button" onClick={() => removeAdditionalVariable(i, idx)} className="btn btn-danger">
                                          <Trash2 className="h-4 w-4" />
                                          Eliminar
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="grid gap-2 xl:grid-cols-[10rem_minmax(0,1fr)] xl:items-end">
                                      <div>
                                        <label className="field-label">Variable</label>
                                        <select aria-label="Tipo de bono variable" value={p.variableType || ""} onChange={(e) => updateAdditionalVariable(i, idx, "variableType", e.target.value)} className="field-select">
                                          <option value="">Seleccionar</option>
                                          {VARIABLE_BONUS_TYPES.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="rounded-[1rem] border border-dashed border-slate-300 bg-white/70 px-4 py-3.5 text-sm text-slate-500 md:text-[0.82rem]">
                                        Selecciona si el concepto corresponde a bono por desempeño o bono por comisiones para continuar.
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    </fieldset>
                    {!isReadOnlyDataView && (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedSnapshotId) {
                              showNotification("Seleccione una actualización");
                              return;
                            }
                            setModal({ type: "save", id: r.id });
                          }}
                          className="btn btn-secondary btn-xs"
                        >
                          <Save className="h-3 w-3" />
                          Guardar cargo
                        </button>
                      </div>
                    )}
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
          <div role="dialog" aria-modal="true" className="surface-card relative z-10 w-full max-w-lg rounded-[1.75rem] p-6">
            {modal.type === "save" && (
              <div>
                <div className="eyebrow mb-2">Resumen del cargo</div>
                <h3 className="font-display text-2xl font-bold text-slate-900">
                  {modalSaveRow?.tituloCargo || "Cargo sin nombre"}
                </h3>
                {modalSaveRow?.nivelOrganizacional && (
                  <p className="mt-1 text-sm text-slate-500">{modalSaveRow.nivelOrganizacional}</p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="metric-tile">
                    <div className="metric-label">Monto fijo mensual</div>
                    <div className="font-display mt-2 text-xl font-bold text-teal-700">
                      {fmtMoney(modalMonthlyFixed)}
                    </div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">Total anual</div>
                    <div className="font-display mt-2 text-xl font-bold text-amber-700">
                      {fmtMoney(modalAnnualTotal)}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  El total anual incluye todos los conceptos fijos (×12) y variables anualizado según su frecuencia.
                </p>

                {missingCompanyFields.length > 0 && (
                  <div className="mt-4 rounded-[1.1rem] border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber-700">Información de empresa incompleta</p>
                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      Completa estos campos en la sección Empresa antes de guardar:
                    </p>
                    <ul className="mt-2 space-y-0.5">
                      {missingCompanyFields.map((f) => (
                        <li key={f} className="flex items-center gap-1.5 text-xs text-amber-800">
                          <span className="h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-3">
                  <button onClick={() => setModal({ type: null })} className="btn btn-secondary">Cancelar</button>
                  <button onClick={() => { if (modal.id) { void saveRowById(modal.id); } setModal({ type: null }); }} disabled={missingCompanyFields.length > 0} className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none">Guardar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}