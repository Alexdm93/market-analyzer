"use client";
import { exportStyledExcel } from "@/lib/excel-export";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, CalendarDays, Check, Edit, Layers, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { CapriWizardModal } from "@/components/CapriWizardModal";
import { useSession } from "next-auth/react";
import { useWorkspaceNotification } from "@/contexts/WorkspaceNotificationContext";
import { ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";
import { type Snapshot, type ExchangeRate, type CompanyInfo, EMPTY_COMPANY_INFO } from "@/lib/workspace";
import { fetchWorkspace, updateWorkspace } from "@/lib/workspace-client";
import { computeRowTotals, resolveRowTotals } from "@/lib/compensation";
import { FREQUENCY_OPTIONS, VARIABLE_BONUS_TYPES, VARIABLE_COMMISSION_TYPES, VARIABLE_CALCULATION_DETAILS, VARIABLE_GOALS_TARGETS } from "@/lib/compensation-options";
import { FmtMoney } from "@/components/FmtMoney";
import { NumericInput } from "@/components/NumericInput";

type CompanyOption = {
  id: string;
  name: string;
};


function fmtMoney(n: number) {
  return <FmtMoney value={n} />;
}

const NIVELES_ADMIN = ["Operativo", "Profesional", "Gerencia Media", "Gerencia Alta", "Ejecutivo"] as const;

const GRADE_RANGES: Record<string, [number, number]> = {
  "Operativo":      [8,  12],
  "Profesional":    [13, 16],
  "Gerencia Media": [17, 19],
  "Gerencia Alta":  [20, 22],
  "Ejecutivo":      [23, 25],
};

function computeRowTotalAdmin(r: ExtendedMarketPosition): number {
  let s = Number(r.sueldoBasico ?? 0) + Number(r.bonoAlimentacion ?? 0) + Number(r.bonoMovilizacion ?? 0)
    + Number(r.bonoDesempeno ?? 0) + Number(r.comisiones ?? 0) + Number(r.pagoVariableOtros ?? 0);
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
  bonoAlimentacionImpacto: false,
  bonoAlimentacionTasaId: '',

  bonoMovilizacionCuentaMoneda: 'USD',
  bonoMovilizacionMonedaPago: 'USD',
  bonoMovilizacionImpacto: true,

  // pagos fijos adicionales (concepto, monto, frecuencia)
  additionalFixedPayments: [],

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
  const { markRouteSeen } = useWorkspaceNotification();

  useEffect(() => { markRouteSeen("data"); }, [markRouteSeen]);

  const [saveState, setSaveState] = useState<"idle" | "dirty" | "pending" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tasas, setTasas] = useState<ExchangeRate[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  const isReadOnlyDataView = isAdmin && !selectedCompanyId;
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

  // cargos configured by admin for the selected snapshot
  const [snapshotCargos, setSnapshotCargos] = useState<{ departamento: string; tituloCargo: string }[] | null>(null);

  // If no snapshot selected, show nothing (user requested empty view when "-- seleccionar --")
  const [rows, setRows] = useState<ExtendedMarketPosition[]>([]);

  const snapshotsRef = useRef<Record<string, Snapshot>>({});
  const rowsRef = useRef<ExtendedMarketPosition[]>([]);
  const selectedCompanyIdRef = useRef(selectedCompanyId);
  const isAdminRef = useRef(isAdmin);

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

      const mostRecentId = Object.values(filtered)
        .sort((a, b) => b.date.localeCompare(a.date))
        .at(0)?.id ?? "";
      const savedId = workspace.selectedSnapshotId ?? "";
      const selectedId = (savedId && filtered[savedId]) ? savedId : mostRecentId;

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

      if (!isReadOnlyDataView && !isAdminCompanyView && Object.keys(filtered).length !== Object.keys(workspace.snapshots).length) {
        await updateWorkspace({ snapshots: filtered, selectedSnapshotId: selectedId });
      }

      if (options?.showNotification) {
        showNotification(isAdminCompanyView ? "Data de empresa actualizada desde la base de datos" : "Data actualizada desde la base de datos");
      }
    } catch (error) {
      console.error(error);
      if (options?.showNotification) {
        showNotification(isAdminCompanyView ? "No se pudo actualizar la data de la empresa" : "No se pudo actualizar la data desde la base de datos");
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

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    selectedCompanyIdRef.current = selectedCompanyId;
  }, [selectedCompanyId]);

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

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
      await updateWorkspace(
        { snapshots: next, selectedSnapshotId: nextSelectedSnapshotId },
        isAdmin && selectedCompanyId ? selectedCompanyId : undefined
      );

      setSaveState(nextSelectedSnapshotId ? "saved" : "idle");
      setLastSavedAt(nextSelectedSnapshotId ? new Date() : null);

      // Quitar _carried de los rows del snapshot guardado
      if (nextSelectedSnapshotId && next[nextSelectedSnapshotId]) {
        setRows((prev) => prev.map((r) => (r._carried ? { ...r, _carried: undefined } : r)));
      }

      return true;
    } catch (error) {
      console.error(error);
      setSaveState("error");

      if (options?.showErrorNotification) {
        showNotification(error instanceof Error ? error.message : "Error al guardar cargos en la base de datos", 4000);
      }

      return false;
    }
  }, [isAdmin, selectedCompanyId, selectedSnapshotId]);

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

  useEffect(() => {
    if (!selectedSnapshotId) {
      setSnapshotCargos(null);
      return;
    }
    let ignore = false;
    fetch(`/api/admin/config/snapshot-cargos?snapshotId=${encodeURIComponent(selectedSnapshotId)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((payload: { cargos?: { departamento: string; tituloCargo: string }[] | null } | null) => {
        if (!ignore) {
          const cargos = payload?.cargos;
          const nextCargos = Array.isArray(cargos) ? cargos : null;
          setSnapshotCargos(nextCargos);

          if (nextCargos && nextCargos.length > 0) {
            const currentRows = rowsRef.current;

            if (currentRows.length === 0) {
              // Snapshot vacío: auto-populate desde el corte anterior más reciente con data.
              const prevSnap = Object.values(snapshotsRef.current)
                .filter((s) => s.id !== selectedSnapshotId && s.rows.length > 0)
                .sort((a, b) => b.date.localeCompare(a.date))[0];
              if (prevSnap) {
                let idx = 0;
                const carried = nextCargos.flatMap((cargo) => {
                  const normDept = cargo.departamento.trim().toLowerCase();
                  const normTitle = cargo.tituloCargo.trim().toLowerCase();
                  const match = prevSnap.rows.find(
                    (r) =>
                      (r.departamento ?? "").trim().toLowerCase() === normDept &&
                      (r.tituloCargo ?? "").trim().toLowerCase() === normTitle
                  );
                  if (!match) return [];
                  idx++;
                  return [{
                    ...JSON.parse(JSON.stringify(match)) as ExtendedMarketPosition,
                    id: `carried-${idx}-${Date.now()}`,
                    departamento: cargo.departamento,
                    tituloCargo: cargo.tituloCargo,
                    _carried: true as const,
                  }];
                });
                if (carried.length > 0) {
                  setRows(carried);
                  setSaveState("dirty");
                }
              }
            } else {
              // Snapshot con rows: eliminar los que no estén en la lista del admin y guardar.
              const validRows = currentRows.filter((r) => {
                const normTitle = (r.tituloCargo ?? "").trim().toLowerCase();
                const normDept = (r.departamento ?? "").trim().toLowerCase();
                return nextCargos.some((c) => {
                  if (c.tituloCargo.trim().toLowerCase() !== normTitle) return false;
                  return !normDept || normDept === c.departamento.trim().toLowerCase();
                });
              });
              if (validRows.length < currentRows.length) {
                const nextSnaps = {
                  ...snapshotsRef.current,
                  [selectedSnapshotId]: {
                    ...snapshotsRef.current[selectedSnapshotId],
                    rows: validRows,
                  },
                };
                setSnapshots(nextSnaps);
                setRows(validRows);
                setSaveState("pending");
                const companyId = isAdminRef.current && selectedCompanyIdRef.current
                  ? selectedCompanyIdRef.current
                  : undefined;
                void updateWorkspace({ snapshots: nextSnaps, selectedSnapshotId }, companyId)
                  .then(() => { if (!ignore) { setSaveState("saved"); setLastSavedAt(new Date()); } })
                  .catch(() => { if (!ignore) setSaveState("dirty"); });
              }
            }
          }
        }
      })
      .catch(() => { if (!ignore) setSnapshotCargos(null); });
    return () => { ignore = true; };
  }, [selectedSnapshotId]);

  const availableDepts = useMemo(() => {
    if (!snapshotCargos) return [];
    return [...new Set(snapshotCargos.map((c) => c.departamento))];
  }, [snapshotCargos]);

  const availableCargosByDept = useMemo(() => {
    if (!snapshotCargos) return {} as Record<string, string[]>;
    const map: Record<string, string[]> = {};
    for (const c of snapshotCargos) {
      if (!map[c.departamento]) map[c.departamento] = [];
      map[c.departamento].push(c.tituloCargo);
    }
    return map;
  }, [snapshotCargos]);

  const cargosConfigured = snapshotCargos !== null && snapshotCargos.length > 0;
  const cargosUnconfigured = snapshotCargos !== null && snapshotCargos.length === 0;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<Record<string, "identidad" | "fija" | "variable">>({});

  function toggleExpand(id: string) {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

  // Use the BCV rate from when data was last saved — falls back to the current live rate.
  // This keeps USD totals stable across days even as the daily BCV fluctuates.
  const effectiveBcvRate = (() => {
    const saved = companyInfo.ratesAtSave?.bcvUsd;
    if (typeof saved === "number" && saved > 0) return saved;
    const v = Number(tasas.find((t) => t.id === "bcv-usd")?.valor);
    return Number.isFinite(v) && v > 0 ? v : null;
  })();

  function stampRowTotals(row: ExtendedMarketPosition): ExtendedMarketPosition {
    const cached = computeRowTotals(row, tasas, effectiveBcvRate, Number(companyInfo.minVacationDays) || 0, Number(companyInfo.minUtilityDays) || 0);
    return { ...row, _cachedTotalSinPasivosMensual: cached.totalSinPasivosMensual, _cachedTotalConPasivosMensual: cached.totalConPasivosMensual, _cachedTotalConPasivosAnual: cached.totalConPasivosAnual, _cachedTotalDirectoMensualizado: cached.totalDirectoMensualizado };
  }

  async function saveCurrentToSnapshot(id: string) {
    if (!id) return;
    const stamped = rows.map(stampRowTotals);
    const next = { ...snapshots, [id]: { ...(snapshots[id] || { id, label: id, date: id, rows: [] }), rows: JSON.parse(JSON.stringify(stamped)) } };
    const wasPersisted = await persistSnapshots(next, id, { showErrorNotification: true });
    showNotification(wasPersisted ? 'Guardado correctamente' : 'No se pudo guardar en la base de datos');
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
  const [modal, setModal] = useState<{ type: 'save' | 'confirm-delete' | null; id?: string }>(() => ({ type: null }));
  const [capriModal, setCapriModal] = useState<{ rowIndex: number } | null>(null);
  const titleRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  function closeModal() {
    setModal({ type: null });
  }

  function loadSnapshot(id: string) {
    // if empty selection, clear rows and unset selected snapshot
    if (!id) {
      setRows([]);
      setSelectedSnapshotId("");
      setSaveState("idle");
      setLastSavedAt(null);
      if (!isReadOnlyDataView && !isAdminCompanyView) {
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
    if (!isReadOnlyDataView && !isAdminCompanyView) {
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

  function updateDepartamento(i: number, dept: string) {
    setRows((prev) => {
      const next = [...prev];
      const current = next[i];
      const titlesForDept = availableCargosByDept[dept] ?? [];
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
      list.push({ id, concept: '', amount: 0, freq: 'monthly', accountCurrency: 'USD', paymentCurrency: 'USD', impacto: false, tasaId: '' });
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
        impacto: false,
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

  const [cargoPickerOpen, setCargoPickerOpen] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerExpandedDepts, setPickerExpandedDepts] = useState<Set<string>>(new Set());

  function addRow(prefill?: { departamento: string; tituloCargo: string }) {
    if (!selectedSnapshotId) {
      showNotification("Selecciona una actualización asignada por el admin antes de agregar cargos");
      return;
    }

    const newRow = empty(rows.length || 0);

    const template = companyInfo.compensationTemplate;
    if (template) {
      const sueldoTpl = template.fixed.find((c) => c.locked && c.id === "sys-sueldo-basico");
      const bonoTpl = template.fixed.find((c) => c.locked && c.id === "sys-bono-alimentacion");
      if (sueldoTpl) {
        newRow.sueldoBasicoCuentaMoneda = sueldoTpl.accountCurrency ?? "USD";
        newRow.sueldoBasicoMonedaPago = sueldoTpl.paymentCurrency ?? "USD";
        if (sueldoTpl.tasaId) newRow.sueldoBasicoTasaId = sueldoTpl.tasaId;
      }
      if (bonoTpl) {
        newRow.bonoAlimentacionCuentaMoneda = bonoTpl.accountCurrency ?? "USD";
        newRow.bonoAlimentacionMonedaPago = bonoTpl.paymentCurrency ?? "USD";
        if (bonoTpl.tasaId) newRow.bonoAlimentacionTasaId = bonoTpl.tasaId;
      }
      if (template.fixed.length > 0) {
        newRow.additionalFixedPayments = template.fixed.filter((c) => !c.locked).map((c) => ({
          id: `af-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          concept: c.concept,
          amount: 0,
          freq: (c.freq ?? "monthly") as PaymentFrequency,
          accountCurrency: c.accountCurrency ?? "USD",
          paymentCurrency: c.paymentCurrency ?? "USD",
          impacto: c.impacto ?? false,
          tasaId: c.tasaId ?? "",
        }));
      }
      if (template.variable.length > 0) {
        newRow.additionalVariablePayments = template.variable.map((c) => ({
          id: `av-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          concept: c.concept,
          amount: 0,
          freq: (c.freq ?? "monthly") as PaymentFrequency,
          accountCurrency: c.accountCurrency ?? "USD",
          paymentCurrency: c.paymentCurrency ?? "USD",
          impacto: c.impacto ?? false,
          tasaId: c.tasaId ?? "",
          variableType: c.variableType,
          commissionType: c.commissionType as "simple" | "tiered" | "product" | "service" | "other" | undefined,
          calculationDetail: c.calculationDetail as "sale_value" | "profit_margin" | "units_sold" | "other" | undefined,
          goalsTarget: c.goalsTarget as "sales_quota" | "units_sold" | "new_clients" | "client_retention" | "profit_margin" | "mixed" | undefined,
        }));
      }
    }

    if (prefill) {
      const normPrefillTitle = prefill.tituloCargo.trim().toLowerCase();
      const normPrefillDept = prefill.departamento.trim().toLowerCase();
      const isDuplicate = rows.some((r) => {
        if ((r.tituloCargo ?? "").trim().toLowerCase() !== normPrefillTitle) return false;
        const rd = (r.departamento ?? "").trim();
        return !rd || rd.toLowerCase() === normPrefillDept;
      });
      if (isDuplicate) {
        showNotification(`"${prefill.tituloCargo}" ya está en este corte.`);
        return;
      }
      newRow.departamento = prefill.departamento;
      newRow.tituloCargo = prefill.tituloCargo;
    }
    setRows((r) => [newRow, ...r]);
    setExpanded((s) => ({ ...s, [newRow.id]: true }));
    setTimeout(() => {
      try {
        titleRefs.current[newRow.id]?.focus();
      } catch {}
    }, 50);
  }

  function addMultipleRows(prefills: { departamento: string; tituloCargo: string }[]) {
    if (!selectedSnapshotId || prefills.length === 0) return;

    const template = companyInfo.compensationTemplate;
    const sueldoTpl = template?.fixed.find((c) => c.locked && c.id === "sys-sueldo-basico");
    const bonoTpl = template?.fixed.find((c) => c.locked && c.id === "sys-bono-alimentacion");
    const extraFixed = template?.fixed.filter((c) => !c.locked) ?? [];
    const extraVariable = template?.variable ?? [];

    const toAdd = prefills.filter(({ departamento, tituloCargo }) => {
      const norm = tituloCargo.trim().toLowerCase();
      const normDept = departamento.trim().toLowerCase();
      return !rows.some((r) => {
        if ((r.tituloCargo ?? "").trim().toLowerCase() !== norm) return false;
        const rd = (r.departamento ?? "").trim();
        return !rd || rd.toLowerCase() === normDept;
      });
    });

    if (toAdd.length === 0) return;

    const newRows = toAdd.map(({ departamento, tituloCargo }, i) => {
      const row = empty(rows.length + i);
      if (sueldoTpl) {
        row.sueldoBasicoCuentaMoneda = sueldoTpl.accountCurrency ?? "USD";
        row.sueldoBasicoMonedaPago = sueldoTpl.paymentCurrency ?? "USD";
        if (sueldoTpl.tasaId) row.sueldoBasicoTasaId = sueldoTpl.tasaId;
      }
      if (bonoTpl) {
        row.bonoAlimentacionCuentaMoneda = bonoTpl.accountCurrency ?? "USD";
        row.bonoAlimentacionMonedaPago = bonoTpl.paymentCurrency ?? "USD";
        if (bonoTpl.tasaId) row.bonoAlimentacionTasaId = bonoTpl.tasaId;
      }
      if (extraFixed.length > 0) {
        row.additionalFixedPayments = extraFixed.map((c, j) => ({
          id: `af-${Date.now()}-${i}-${j}`,
          concept: c.concept,
          amount: 0,
          freq: (c.freq ?? "monthly") as PaymentFrequency,
          accountCurrency: c.accountCurrency ?? "USD",
          paymentCurrency: c.paymentCurrency ?? "USD",
          impacto: c.impacto ?? false,
          tasaId: c.tasaId ?? "",
        }));
      }
      if (extraVariable.length > 0) {
        row.additionalVariablePayments = extraVariable.map((c, j) => ({
          id: `av-${Date.now()}-${i}-${j}`,
          concept: c.concept,
          amount: 0,
          freq: (c.freq ?? "monthly") as PaymentFrequency,
          accountCurrency: c.accountCurrency ?? "USD",
          paymentCurrency: c.paymentCurrency ?? "USD",
          impacto: c.impacto ?? false,
          tasaId: c.tasaId ?? "",
          variableType: c.variableType,
          commissionType: c.commissionType as "simple" | "tiered" | "product" | "service" | "other" | undefined,
          calculationDetail: c.calculationDetail as "sale_value" | "profit_margin" | "units_sold" | "other" | undefined,
          goalsTarget: c.goalsTarget as "sales_quota" | "units_sold" | "new_clients" | "client_retention" | "profit_margin" | "mixed" | undefined,
        }));
      }
      row.departamento = departamento;
      row.tituloCargo = tituloCargo;
      return row;
    });

    setRows((r) => [...newRows, ...r]);
  }

  function openCargoPicker() {
    if (!selectedSnapshotId) {
      showNotification("Selecciona una actualización asignada por el admin antes de agregar cargos");
      return;
    }
    if (cargosConfigured) {
      setPickerSelected(new Set());
      setPickerExpandedDepts(new Set());
      setCargoPickerOpen(true);
    } else {
      addRow();
    }
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function removeRowById(id: string) {
    setRows((r) => r.filter((row) => row.id !== id));
  }

  async function saveRowById(rowId: string) {
    if (!selectedSnapshotId) {
      showNotification("Seleccione una actualización");
      return;
    }
    const rowIndex = rows.findIndex((rr) => rr.id === rowId);
    if (rowIndex === -1) return;
    const rowToSave = JSON.parse(JSON.stringify(stampRowTotals(rows[rowIndex])));
    // Build nextRows from the current rows state (not snapshots) so that local deletes
    // are respected and don't get re-introduced when saving an individual cargo.
    const nextRows = rows.map((r) => (r.id === rowToSave.id ? rowToSave : r));
    const current: Snapshot = snapshots[selectedSnapshotId] || { id: selectedSnapshotId, label: selectedSnapshotId, date: selectedSnapshotId, rows: [] };
    const next = { ...snapshots, [selectedSnapshotId]: { ...current, rows: nextRows } };
    const wasPersisted = await persistSnapshots(next, selectedSnapshotId, { showErrorNotification: true });
    showNotification(wasPersisted ? 'Cargo guardado' : 'No se pudo guardar el cargo en la base de datos');
  }

  // legacy save function removed (use snapshots / saveCurrentToSnapshot instead)


  async function exportJSON() {
    const diasVac = Number(companyInfo.minVacationDays) || 0;
    const diasUtil = Number(companyInfo.minUtilityDays) || 0;
    const snapshotLabel = selectedSnapshotId
      ? (snapshots[selectedSnapshotId]?.label || selectedSnapshotId).replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()
      : "data";
    await exportStyledExcel([{
      name: "Cargos",
      columns: [
        { header: "Cargo",         key: "cargo",  width: 40, align: "left"  },
        { header: "Grado CAPRI",   key: "grado",  width: 14, align: "center" },
        { header: "TEM (USD)",     key: "tem",    width: 14, align: "right"  },
        { header: "PCTA (USD)",    key: "pcta",   width: 14, align: "right"  },
      ],
      rows: rows.map((row) => {
        const totals = resolveRowTotals(row, tasas, effectiveBcvRate, diasVac, diasUtil);
        return {
          cargo: row.tituloCargo ?? "",
          grado: row.hayGrade ?? null,
          tem:   totals.totalSinPasivosMensual || null,
          pcta:  totals.totalConPasivosAnual   || null,
        };
      }),
    }], `cargos-${snapshotLabel}.xlsx`);
    void fetch("/api/workspace/track-export", { method: "POST" });
  }

  const modalSaveRow = modal.type === "save" && modal.id
    ? rows.find((r) => r.id === modal.id) ?? null
    : null;

  const modalTotals = modalSaveRow
    ? computeRowTotals(
        modalSaveRow,
        tasas,
        effectiveBcvRate,
        Number(companyInfo.minVacationDays) || 0,
        Number(companyInfo.minUtilityDays) || 0,
      )
    : null;

  const missingCompanyFields: string[] = [];
  if (modal.type === "save") {
    if (!companyInfo.headcount) missingCompanyFields.push("Headcount");
    if (!companyInfo.revenueUSD) missingCompanyFields.push("Facturación");
    if (!companyInfo.avgProfitPercent) missingCompanyFields.push("Utilidades antes de ISLR (%)");
    if (!companyInfo.hrName) missingCompanyFields.push("Nombre de contacto de RRHH");
    if (!companyInfo.hrEmail) missingCompanyFields.push("Correo de contacto de RRHH");
  }

  // Admin: medians per grade group from current rows
  const medianasPorNivelAdmin = useMemo(() => {
    const result: Record<string, number> = {};
    for (const nivel of NIVELES_ADMIN) {
      const [lo, hi] = GRADE_RANGES[nivel] ?? [0, 0];
      const totals = rows
        .filter((r) => { const g = r.hayGrade; return g !== undefined && g >= lo && g <= hi; })
        .map(computeRowTotalAdmin)
        .filter((v) => v > 0 && Number.isFinite(v));
      result[nivel] = totals.length ? Math.round(pct(totals, 50)) : 0;
    }
    return result;
  }, [rows]);


  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-3">


        <section className="surface-panel rounded-[1.75rem] p-4 md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_20rem] xl:items-start">
            <div>
              <div className="eyebrow mb-2">{isAdmin ? "Vista Admin" : "Actualización de Data"}</div>
              <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-slate-900 md:text-[1.85rem]">
                {isAdmin ? "Resumen / Revisión de data por empresa" : "Suministro de data por cargo."}
              </h1>
              {!isAdmin && (
                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  Actualizar la data de compensación y la identidad del rol bajo una estructura jerárquica que permita una edición continua y una lectura clara de la arquitectura del cargo.
                </p>
              )}

              {isAdmin ? (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="metric-tile w-40 shrink-0 py-2">
                      <div className="metric-label">Cargos reportados</div>
                      <div className="metric-value mt-1">{rows.length}</div>
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
                    ? "Guardando en la base de datos..."
                    : saveState === "error"
                      ? "Error al guardar en la base de datos"
                      : lastSavedAt
                        ? `Guardado en la base de datos a las ${lastSavedAt.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })}`
                        : "Guardado en la base de datos"}
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
                {isAdmin && (
                  <div>
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
                      <button onClick={openCargoPicker} className="btn btn-primary" disabled={cargosUnconfigured}>
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
                  : cargosUnconfigured
                  ? "El administrador aún no ha configurado los cargos para este corte. Contacta al administrador para que configure los cargos requeridos."
                  : "Si aún no ves actualizaciones disponibles, solicita al admin que cree o sincronice las actualizaciones globales. Cuando la actualización exista, podrás agregar cargos y completar la información."}
              </p>
              {!isReadOnlyDataView && !cargosUnconfigured ? (
                <button onClick={openCargoPicker} className="btn btn-primary mt-6">
                  <Plus className="h-4 w-4" />
                  {cargosConfigured ? "Seleccionar cargo" : "Crear primer cargo"}
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
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
                        Cargo {String(i + 1).padStart(2, "0")}
                      </div>
                      {r._carried ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.68rem] font-semibold text-amber-700">
                          datos del corte anterior
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[0.68rem] font-semibold text-emerald-700">
                          actualizado
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-xl font-bold text-slate-900 md:text-[1.1rem]">
                      {r.tituloCargo || `Cargo ${i + 1}`}
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600 md:text-[0.82rem]">
                      {r.descripcion || "Completa la identidad y clasifica con CAPRI para dejar el cargo listo antes de cargar su compensación."}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.hayGrade ? (
                        <div className="pill bg-teal-50 font-semibold text-teal-700">Grado {r.hayGrade}</div>
                      ) : (
                        <div className="pill text-slate-400">Sin grado CAPRI</div>
                      )}
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
                      <button type="button" onClick={() => setModal({ type: "confirm-delete", id: r.id })} className="btn btn-danger btn-xs">
                        <Trash2 className="h-3 w-3" />
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                </div>

                {expanded[r.id] && (
                  <div className="border-t border-slate-200/70">
                    {/* Tab bar */}
                    <div className="flex border-b border-slate-200 bg-slate-50/80 px-4">
                      {(["identidad", "fija", "variable"] as const).map((tab) => {
                        const labels = { identidad: "Identidad", fija: "Comp. Fija", variable: "Comp. Variable" };
                        const isActive = (activeTab[r.id] ?? "identidad") === tab;
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab((prev) => ({ ...prev, [r.id]: tab }))}
                            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${isActive ? "border-teal-600 bg-white text-teal-700" : "border-transparent bg-transparent text-slate-500 hover:text-slate-800"}`}
                          >
                            {labels[tab]}
                          </button>
                        );
                      })}
                    </div>

                    <fieldset disabled={isReadOnlyDataView} className="disabled:opacity-90">
                      <div className="p-4 md:p-5">

                        {/* Tab: Identidad */}
                        {(activeTab[r.id] ?? "identidad") === "identidad" && (
                          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                            <div>
                              <label className="field-label">Unidad / Departamento</label>
                              <input readOnly value={r.departamento || "—"} className="field bg-slate-100 text-sm w-full" aria-label="Unidad organizacional o departamento" />
                            </div>
                            <div>
                              <label className="field-label">Título del cargo</label>
                              <input readOnly value={r.tituloCargo || "—"} className="field bg-slate-100 text-sm w-full" aria-label="Título del cargo" />
                            </div>
                            <div>
                              <label className="field-label">Metodología CAPRI</label>
                              <div className={`field flex items-center gap-2 bg-slate-50 text-sm select-none leading-none ${r.hayGrade ? "text-teal-700 font-semibold" : "text-slate-400"}`}>
                                {r.hayGrade ? (
                                  <>
                                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-teal-600 text-[0.6rem] font-black text-white">{r.hayGrade}</span>
                                    Grado {r.hayGrade}
                                  </>
                                ) : "Sin grado"}
                              </div>
                            </div>
                            {!isReadOnlyDataView && (
                              <button
                                type="button"
                                onClick={() => setCapriModal({ rowIndex: i })}
                                className="btn btn-primary flex items-center gap-1.5 whitespace-nowrap self-end"
                                title={r.hayGrade ? "Re-clasificar con CAPRI" : "Clasificar con CAPRI"}
                              >
                                <Layers className="h-4 w-4" />
                                {r.hayGrade ? "Re-clasificar" : "Clasificar"}
                              </button>
                            )}
                            <div className="md:col-span-4">
                              <label className="field-label">Descripción</label>
                              <textarea placeholder="Resume alcance, foco funcional y responsabilidades principales" value={r.descripcion} onChange={(e) => update(i, "descripcion", e.target.value)} className="field-textarea" />
                            </div>
                          </div>
                        )}

                        {/* Tab: Compensación Fija */}
                        {(activeTab[r.id] ?? "identidad") === "fija" && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-slate-500">Compensación fija del cargo</p>
                              <button type="button" onClick={() => addAdditionalFixed(i)} className="btn btn-primary">
                                <Plus className="h-4 w-4" />
                                Agregar concepto
                              </button>
                            </div>
                            <div className="overflow-x-auto rounded-[1.1rem] border border-slate-200/80">
                              <table className="w-full min-w-[720px] border-collapse text-sm">
                                <thead>
                                  <tr className="border-b border-slate-200 bg-slate-50">
                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 text-xs">Concepto</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 text-xs">Monto</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 text-xs">Mon. Cuenta</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 text-xs">Mon. Pago</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 text-xs">Tasa</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 text-xs">Pasivos</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 text-xs">Frecuencia</th>
                                    <th className="w-8" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  <tr className="bg-white">
                                    <td className="px-3 py-2"><input aria-label="Concepto sueldo basico" value="Sueldo Básico" readOnly className="field bg-slate-100 text-sm w-full" /></td>
                                    <td className="px-3 py-2"><div className="relative"><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{r.sueldoBasicoCuentaMoneda === "VES" ? "Bs." : "$"}</span><NumericInput aria-label="Monto sueldo basico" placeholder="0" value={r.sueldoBasico ?? 0} onChange={(v) => update(i, "sueldoBasico", v)} className="field pr-8 text-sm w-full" /></div></td>
                                    <td className="px-3 py-2"><select aria-label="Moneda de cuenta sueldo basico" value={r.sueldoBasicoCuentaMoneda || "USD"} onChange={(e) => update(i, "sueldoBasicoCuentaMoneda", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></td>
                                    <td className="px-3 py-2"><select aria-label="Moneda de pago sueldo basico" value={r.sueldoBasicoMonedaPago || "USD"} onChange={(e) => update(i, "sueldoBasicoMonedaPago", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></td>
                                    <td className="px-3 py-2">{(r.sueldoBasicoCuentaMoneda || "USD") === (r.sueldoBasicoMonedaPago || "USD") ? <select disabled aria-label="Tasa sueldo basico" className="field-select text-sm w-full opacity-50"><option>No aplica</option></select> : <select aria-label="Tasa sueldo basico" value={r.sueldoBasicoTasaId || ""} onChange={(e) => update(i, "sueldoBasicoTasaId", e.target.value)} className="field-select text-sm w-full"><option value="">Sin tasa</option>{tasas.map((t) => <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>)}</select>}</td>
                                    <td className="px-3 py-2"><select aria-label="Impacto salarial sueldo basico" value="yes" disabled className="field-select opacity-60 text-sm w-full"><option value="yes">Sí</option></select></td>
                                    <td className="px-3 py-2"><span className="flex h-9 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 select-none">Mensual</span></td>
                                    <td className="px-3 py-2" />
                                  </tr>
                                  <tr className="bg-white">
                                    <td className="px-3 py-2"><input aria-label="Concepto bono alimentacion" value="Bono Alimentación" readOnly className="field bg-slate-100 text-sm w-full" /></td>
                                    <td className="px-3 py-2"><div className="relative"><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{r.bonoAlimentacionCuentaMoneda === "VES" ? "Bs." : "$"}</span><NumericInput aria-label="Monto bono alimentacion" placeholder="0" value={r.bonoAlimentacion ?? 0} onChange={(v) => update(i, "bonoAlimentacion", v)} className="field pr-8 text-sm w-full" /></div></td>
                                    <td className="px-3 py-2"><select aria-label="Moneda de cuenta bono alimentacion" value={r.bonoAlimentacionCuentaMoneda || "USD"} onChange={(e) => update(i, "bonoAlimentacionCuentaMoneda", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></td>
                                    <td className="px-3 py-2"><select aria-label="Moneda de pago bono alimentacion" value={r.bonoAlimentacionMonedaPago || "USD"} onChange={(e) => update(i, "bonoAlimentacionMonedaPago", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></td>
                                    <td className="px-3 py-2">{(r.bonoAlimentacionCuentaMoneda || "USD") === (r.bonoAlimentacionMonedaPago || "USD") ? <select disabled aria-label="Tasa bono alimentacion" className="field-select text-sm w-full opacity-50"><option>No aplica</option></select> : <select aria-label="Tasa bono alimentacion" value={r.bonoAlimentacionTasaId || ""} onChange={(e) => update(i, "bonoAlimentacionTasaId", e.target.value)} className="field-select text-sm w-full"><option value="">Sin tasa</option>{tasas.map((t) => <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>)}</select>}</td>
                                    <td className="px-3 py-2"><select aria-label="Impacto salarial bono alimentacion" value="no" disabled className="field-select opacity-60 text-sm w-full"><option value="no">No</option></select></td>
                                    <td className="px-3 py-2"><span className="flex h-9 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 select-none">Mensual</span></td>
                                    <td className="px-3 py-2" />
                                  </tr>
                                  {(r.additionalFixedPayments || []).map((p, idx) => (
                                    <tr key={p.id} className="bg-white">
                                      <td className="px-3 py-2"><input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalFixed(i, idx, "concept", e.target.value)} className="field text-sm w-full" /></td>
                                      <td className="px-3 py-2"><div className="relative"><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{p.accountCurrency === "VES" ? "Bs." : "$"}</span><NumericInput placeholder="0" value={p.amount ?? 0} onChange={(v) => updateAdditionalFixed(i, idx, "amount", v)} className="field pr-8 text-sm w-full" /></div></td>
                                      <td className="px-3 py-2"><select aria-label="Moneda de cuenta concepto fijo" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalFixed(i, idx, "accountCurrency", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></td>
                                      <td className="px-3 py-2"><select aria-label="Moneda de pago concepto fijo" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalFixed(i, idx, "paymentCurrency", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></td>
                                      <td className="px-3 py-2">{(p.accountCurrency || "USD") === (p.paymentCurrency || "USD") ? <select disabled aria-label="Tasa concepto fijo" className="field-select text-sm w-full opacity-50"><option>No aplica</option></select> : <select aria-label="Tasa concepto fijo" value={p.tasaId || ""} onChange={(e) => updateAdditionalFixed(i, idx, "tasaId", e.target.value)} className="field-select text-sm w-full"><option value="">Sin tasa</option>{tasas.map((t) => <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>)}</select>}</td>
                                      <td className="px-3 py-2"><select aria-label="Impacto concepto fijo" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalFixed(i, idx, "impacto", e.target.value === "yes")} className="field-select text-sm w-full"><option value="yes">Sí</option><option value="no">No</option></select></td>
                                      <td className="px-3 py-2"><select aria-label="Frecuencia concepto fijo" value={p.freq || "monthly"} onChange={(e) => updateAdditionalFixed(i, idx, "freq", e.target.value)} className="field-select text-sm w-full">{FREQUENCY_OPTIONS.filter((o) => o.value !== "biweekly").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                                      <td className="px-3 py-2"><button type="button" onClick={() => removeAdditionalFixed(i, idx)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Tab: Compensación Variable */}
                        {(activeTab[r.id] ?? "identidad") === "variable" && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-slate-500">Bonos y comisiones variables del cargo</p>
                              <button type="button" onClick={() => addAdditionalVariable(i)} className="btn btn-primary">
                                <Plus className="h-4 w-4" />
                                Agregar concepto
                              </button>
                            </div>
                            {(r.additionalVariablePayments || []).length === 0 ? (
                              <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-400">
                                Sin conceptos variables. Haz clic en &quot;Agregar concepto&quot; para añadir bonos o comisiones.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {(r.additionalVariablePayments || []).map((p, idx) => (
                                  <div key={p.id} className="rounded-[1.1rem] border border-slate-200/80 bg-white p-3.5 space-y-2.5">
                                    {/* Card header: always shows delete button top-right */}
                                    <div className="flex items-center justify-between">
                                      <span className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-slate-400">
                                        {p.variableType === "performance" ? "Bono por desempeño" : p.variableType === "commission" ? "Bono por comisión" : "Concepto variable"}
                                      </span>
                                      <button type="button" onClick={() => removeAdditionalVariable(i, idx)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors" aria-label="Eliminar concepto">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>

                                    {p.variableType === "performance" ? (
                                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[10rem_minmax(0,1.5fr)_11rem_6rem_6rem_7.5rem_3.5rem_7rem] lg:items-center">
                                        <div><label className="field-label">Variable</label><select aria-label="Tipo de bono variable" value={p.variableType || ""} onChange={(e) => updateAdditionalVariable(i, idx, "variableType", e.target.value)} className="field-select text-sm w-full"><option value="">Seleccionar</option>{VARIABLE_BONUS_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                        <div><label className="field-label">Concepto</label><input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalVariable(i, idx, "concept", e.target.value)} className="field text-sm w-full" /></div>
                                        <div><label className="field-label">Monto</label><div className="relative"><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{p.accountCurrency === "VES" ? "Bs." : "$"}</span><NumericInput placeholder="0" value={p.amount ?? 0} onChange={(v) => updateAdditionalVariable(i, idx, "amount", v)} className="field pr-8 text-sm w-full" /></div></div>
                                        <div><label className="field-label">Mon. Cuenta</label><select aria-label="Moneda de cuenta concepto variable" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "accountCurrency", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></div>
                                        <div><label className="field-label">Mon. Pago</label><select aria-label="Moneda de pago concepto variable" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "paymentCurrency", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></div>
                                        <div><label className="field-label">Tasa</label>{(p.accountCurrency || "USD") === (p.paymentCurrency || "USD") ? <select disabled aria-label="Tasa concepto variable desempeño" className="field-select text-sm w-full opacity-50"><option>No aplica</option></select> : <select aria-label="Tasa concepto variable desempeño" value={p.tasaId || ""} onChange={(e) => updateAdditionalVariable(i, idx, "tasaId", e.target.value)} className="field-select text-sm w-full"><option value="">Sin tasa</option>{tasas.map((t) => <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>)}</select>}</div>
                                        <div><label className="field-label">Pasivos</label><select aria-label="Impacto concepto variable" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalVariable(i, idx, "impacto", e.target.value === "yes")} className="field-select text-sm w-full"><option value="yes">Sí</option><option value="no">No</option></select></div>
                                        <div><label className="field-label">Frecuencia</label><select aria-label="Frecuencia concepto variable" value={p.freq || "monthly"} onChange={(e) => updateAdditionalVariable(i, idx, "freq", e.target.value)} className="field-select text-sm w-full">{FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                      </div>
                                    ) : p.variableType === "commission" ? (
                                      <>
                                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[10rem_minmax(0,1.5fr)_11rem_6rem_6rem_7.5rem_3.5rem_7rem] lg:items-center">
                                          <div><label className="field-label">Variable</label><select aria-label="Tipo de bono variable" value={p.variableType || ""} onChange={(e) => updateAdditionalVariable(i, idx, "variableType", e.target.value)} className="field-select text-sm w-full"><option value="">Seleccionar</option>{VARIABLE_BONUS_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                          <div><label className="field-label">Concepto</label><input placeholder="Concepto" value={p.concept} onChange={(e) => updateAdditionalVariable(i, idx, "concept", e.target.value)} className="field text-sm w-full" /></div>
                                          <div><label className="field-label">Monto</label><div className="relative"><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{p.accountCurrency === "VES" ? "Bs." : "$"}</span><NumericInput placeholder="0" value={p.amount ?? 0} onChange={(v) => updateAdditionalVariable(i, idx, "amount", v)} className="field pr-8 text-sm w-full" /></div></div>
                                          <div><label className="field-label">Mon. Cuenta</label><select aria-label="Moneda de cuenta concepto variable" value={p.accountCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "accountCurrency", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></div>
                                          <div><label className="field-label">Mon. Pago</label><select aria-label="Moneda de pago concepto variable" value={p.paymentCurrency || "USD"} onChange={(e) => updateAdditionalVariable(i, idx, "paymentCurrency", e.target.value)} className="field-select text-sm w-full"><option value="USD">USD</option><option value="VES">Bs.</option></select></div>
                                          <div><label className="field-label">Tasa</label>{(p.accountCurrency || "USD") === (p.paymentCurrency || "USD") ? <select disabled aria-label="Tasa concepto variable comisión" className="field-select text-sm w-full opacity-50"><option>No aplica</option></select> : <select aria-label="Tasa concepto variable comisión" value={p.tasaId || ""} onChange={(e) => updateAdditionalVariable(i, idx, "tasaId", e.target.value)} className="field-select text-sm w-full"><option value="">Sin tasa</option>{tasas.map((t) => <option key={t.id} value={t.id}>{t.nombre || t.referencia}</option>)}</select>}</div>
                                          <div><label className="field-label">Pasivos</label><select aria-label="Impacto concepto variable comisión" value={p.impacto ? "yes" : "no"} onChange={(e) => updateAdditionalVariable(i, idx, "impacto", e.target.value === "yes")} className="field-select text-sm w-full"><option value="yes">Sí</option><option value="no">No</option></select></div>
                                          <div><label className="field-label">Frecuencia</label><select aria-label="Frecuencia concepto variable comisión" value={p.freq || "monthly"} onChange={(e) => updateAdditionalVariable(i, idx, "freq", e.target.value)} className="field-select text-sm w-full">{FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-3 lg:items-end">
                                          <div><label className="field-label">Tipo de comisión</label><select aria-label="Tipo de comision" value={p.commissionType || "simple"} onChange={(e) => updateAdditionalVariable(i, idx, "commissionType", e.target.value)} className="field-select text-sm w-full">{VARIABLE_COMMISSION_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                          <div><label className="field-label">Detalle de cálculo</label><select aria-label="Detalle de calculo" value={p.calculationDetail || "sale_value"} onChange={(e) => updateAdditionalVariable(i, idx, "calculationDetail", e.target.value)} className="field-select text-sm w-full">{VARIABLE_CALCULATION_DETAILS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                          <div><label className="field-label">Objetivos y metas</label><select aria-label="Objetivos y metas" value={p.goalsTarget || "sales_quota"} onChange={(e) => updateAdditionalVariable(i, idx, "goalsTarget", e.target.value)} className="field-select text-sm w-full">{VARIABLE_GOALS_TARGETS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="grid gap-2 lg:grid-cols-[10rem_minmax(0,1fr)] lg:items-end">
                                        <div><label className="field-label">Variable</label><select aria-label="Tipo de bono variable" value={p.variableType || ""} onChange={(e) => updateAdditionalVariable(i, idx, "variableType", e.target.value)} className="field-select text-sm w-full"><option value="">Seleccionar</option>{VARIABLE_BONUS_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                        <div className="rounded-[1rem] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3.5 text-sm text-slate-500">
                                          Selecciona si el concepto corresponde a bono por desempeño o bono por comisiones para continuar.
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    </fieldset>

                    {!isReadOnlyDataView && (
                      <div className="flex justify-end border-t border-slate-200/70 bg-slate-50/50 px-4 py-3">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={closeModal} />
          <div role="dialog" aria-modal="true" className="surface-card relative z-10 w-full max-w-lg rounded-[1.75rem] p-6">

            {/* Modal: Confirmar eliminación de cargo */}
            {modal.type === "confirm-delete" && (
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="font-display text-center text-xl font-bold text-slate-900">¿Eliminar este cargo?</h3>
                <p className="mt-2 text-center text-sm text-slate-500">
                  {(() => {
                    const row = rows.find((r) => r.id === modal.id);
                    return row?.tituloCargo
                      ? `Se eliminará "${row.tituloCargo}" y toda su información de compensación. Esta acción no se puede deshacer.`
                      : "Se eliminará el cargo y toda su información de compensación. Esta acción no se puede deshacer.";
                  })()}
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={closeModal} className="btn btn-secondary">Cancelar</button>
                  <button
                    type="button"
                    onClick={async () => {
                      const deleteId = modal.id;
                      setModal({ type: null });
                      if (!deleteId) return;
                      const newRows = rows.filter((row) => row.id !== deleteId);
                      setRows(newRows);
                      if (selectedSnapshotId && !isReadOnlyDataView) {
                        const stamped = newRows.map(stampRowTotals);
                        const current = snapshots[selectedSnapshotId] ?? { id: selectedSnapshotId, label: selectedSnapshotId, date: selectedSnapshotId, rows: [] };
                        const next = { ...snapshots, [selectedSnapshotId]: { ...current, rows: JSON.parse(JSON.stringify(stamped)) } };
                        const wasPersisted = await persistSnapshots(next, selectedSnapshotId, { showErrorNotification: true });
                        showNotification(wasPersisted ? "Cargo eliminado" : "No se pudo guardar la eliminación");
                      }
                    }}
                    className="btn btn-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                    Sí, eliminar
                  </button>
                </div>
              </div>
            )}


            {modal.type === "save" && (
              <div>
                <div className="eyebrow mb-2">Resumen del cargo</div>
                <h3 className="font-display text-2xl font-bold text-slate-900">
                  {modalSaveRow?.tituloCargo || "Cargo sin nombre"}
                </h3>
                {modalSaveRow?.hayGrade && (
                  <p className="mt-1 text-sm font-semibold text-teal-600">Grado CAPRI {modalSaveRow.hayGrade}</p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="metric-tile flex flex-col items-center justify-center text-center">
                    <div className="metric-label">Total Efectivo Mensual (TEM)</div>
                    <div className="font-display mt-2 text-xl font-bold text-teal-700">
                      {fmtMoney(modalTotals?.totalSinPasivosMensual ?? 0)}
                    </div>
                  </div>
                  <div className="metric-tile flex flex-col items-center justify-center text-center">
                    <div className="metric-label">Paquete de Compensación Total Anual (PCTA)</div>
                    <div className="font-display mt-2 text-xl font-bold text-amber-700">
                      {fmtMoney(modalTotals?.totalConPasivosAnual ?? 0)}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Todos los montos en USD. Pagos en Bs con moneda de pago=Bs usan tasa BCV; con moneda de pago=USD usan la tasa establecida en el campo.
                </p>

                {!modalSaveRow?.hayGrade && (
                  <div className="mt-4 rounded-[1.1rem] border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-red-700">Clasificación CAPRI requerida</p>
                    <p className="mt-1 text-xs leading-5 text-red-700">
                      Este cargo no tiene grado CAPRI asignado. Abre la pestaña <strong>Identidad</strong> y clasifícalo antes de guardar.
                    </p>
                  </div>
                )}

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
                  <button onClick={() => { const id = modal.id; if (id) { void saveRowById(id); setExpanded((prev) => ({ ...prev, [id]: false })); } setModal({ type: null }); }} disabled={!modalSaveRow?.hayGrade || missingCompanyFields.length > 0} className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none">Guardar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {cargoPickerOpen && snapshotCargos && snapshotCargos.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setCargoPickerOpen(false)} />
          <div role="dialog" aria-modal="true" className="surface-card relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-[1.75rem] p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="eyebrow mb-1">Corte seleccionado</div>
                <h2 className="font-display text-xl font-bold text-slate-900">Agregar cargos</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {pickerSelected.size === 0
                    ? "Selecciona uno o varios cargos para agregar"
                    : `${pickerSelected.size} cargo${pickerSelected.size !== 1 ? "s" : ""} seleccionado${pickerSelected.size !== 1 ? "s" : ""}`}
                </p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setCargoPickerOpen(false)} className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-1 pr-1">
              {availableDepts.map((dept) => {
                const normDeptPicker = dept.trim().toLowerCase();
                const cargosEnDept = availableCargosByDept[dept] ?? [];
                const isExpanded = pickerExpandedDepts.has(dept);
                const selectedInDept = cargosEnDept.filter((t) => pickerSelected.has(`${dept}::${t}`)).length;
                return (
                  <div key={dept}>
                    <button
                      type="button"
                      onClick={() => setPickerExpandedDepts((prev) => {
                        const next = new Set(prev);
                        if (next.has(dept)) next.delete(dept);
                        else next.add(dept);
                        return next;
                      })}
                      className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2">
                        <svg
                          width="12" height="12" viewBox="0 0 12 12" fill="none"
                          className={`shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        >
                          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-slate-400">{dept}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedInDept > 0 && (
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[0.65rem] font-bold text-teal-700">
                            {selectedInDept}
                          </span>
                        )}
                        <span className="text-[0.65rem] text-slate-300">{cargosEnDept.length}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-1 mb-2 space-y-1.5 pl-2">
                        {cargosEnDept.map((titulo) => {
                          const pickerKey = `${dept}::${titulo}`;
                          const normTituloPicker = titulo.trim().toLowerCase();
                          const yaAgregado = rows.some((r) => {
                            if ((r.tituloCargo ?? "").trim().toLowerCase() !== normTituloPicker) return false;
                            const rowDept = (r.departamento ?? "").trim();
                            return !rowDept || rowDept.toLowerCase() === normDeptPicker;
                          });
                          const isSelected = pickerSelected.has(pickerKey);
                          return (
                            <button
                              key={titulo}
                              type="button"
                              disabled={yaAgregado}
                              onClick={() => {
                                if (yaAgregado) return;
                                setPickerSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(pickerKey)) next.delete(pickerKey);
                                  else next.add(pickerKey);
                                  return next;
                                });
                              }}
                              className={`flex w-full items-center justify-between rounded-[0.9rem] border px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                                yaAgregado
                                  ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                                  : isSelected
                                    ? "border-teal-400 bg-teal-50 text-teal-800"
                                    : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                              }`}
                            >
                              <span>{titulo}</span>
                              {yaAgregado ? (
                                <span className="ml-3 shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-bold text-slate-400">
                                  ya agregado
                                </span>
                              ) : isSelected ? (
                                <span className="ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
                                  <Check className="h-3 w-3" />
                                </span>
                              ) : (
                                <span className="ml-3 h-5 w-5 shrink-0 rounded-full border-2 border-slate-200" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setCargoPickerOpen(false)} className="btn btn-secondary flex-1">
                Cancelar
              </button>
              <button
                type="button"
                disabled={pickerSelected.size === 0}
                onClick={() => {
                  const prefills = [...pickerSelected].map((key) => {
                    const sep = key.indexOf("::");
                    return { departamento: key.slice(0, sep), tituloCargo: key.slice(sep + 2) };
                  });
                  addMultipleRows(prefills);
                  setCargoPickerOpen(false);
                }}
                className="btn btn-primary flex-1"
              >
                <Plus className="h-4 w-4" />
                Agregar{pickerSelected.size > 0 ? ` ${pickerSelected.size}` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAPRI Wizard Modal */}
      {capriModal !== null && (
        <CapriWizardModal
          companyInfo={companyInfo}
          cargoNombre={rows[capriModal.rowIndex]?.tituloCargo || "Cargo"}
          existingGrade={rows[capriModal.rowIndex]?.hayGrade}
          onSave={(grade, familia) => {
            update(capriModal.rowIndex, "hayGrade", grade);
            update(capriModal.rowIndex, "capriFamily", familia);
          }}
          onClose={() => setCapriModal(null)}
        />
      )}
    </main>
  );
}