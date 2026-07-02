"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Activity, BookOpen, Building2, CalendarDays, ChevronDown, ChevronRight, ClipboardList, LoaderCircle, Plus, Shield, Tag, Trash2, UserPlus, Users, X } from "lucide-react";
import UserRegistrationForm, { type UserRegistrationValues } from "@/components/UserRegistrationForm";
import { ROLE_OPTIONS, getRoleLabel, type AppUserRole } from "@/lib/roles";

const adminActions = [
  {
    title: "Gestionar empresas",
    description: "Crea y revisa las empresas disponibles para asignar usuarios.",
    href: "/empresas",
    icon: Building2,
  },
  {
    title: "Actividad de empresas",
    description: "Monitorea cuándo cada empresa inició sesión, guardó datos o descargó información.",
    href: "/admin/telemetry",
    icon: Activity,
  },
  {
    title: "Estudio Especializado",
    description: "Habilita o deshabilita el acceso al Estudio Especializado por empresa.",
    href: "/admin/estudio-especializado",
    icon: BookOpen,
  },
];

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AppUserRole;
  createdAt: string;
  company: {
    id: string;
    name: string;
  };
};

type CompanyOption = {
  id: string;
  name: string;
};

type PendingUserEdit = {
  role: AppUserRole;
  password: string;
  companyId: string;
};

function getRoleBadgeClasses(role: AppUserRole) {
  if (role === "ADMIN") {
    return "bg-teal-50 text-teal-800";
  }

  if (role === "ANALYST") {
    return "bg-amber-50 text-amber-800";
  }

  return "bg-slate-200/70 text-slate-700";
}

type AdminSnapshot = {
  id: string;
  label: string;
  date: string;
};

type SectorEntry = {
  name: string;
  classifications: string[];
};

type CargoEntry = {
  departamento: string;
  cargos: string[];
};

type SnapshotCargoItem = {
  departamento: string;
  tituloCargo: string;
};

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [snapshots, setSnapshots] = useState<AdminSnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(true);
  const [snapshotDate, setSnapshotDate] = useState(getTodayDate);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [totalUsers, setTotalUsers] = useState(0);
  const [isMutatingSnapshot, setIsMutatingSnapshot] = useState(false);
  const [renamingSnapshotId, setRenamingSnapshotId] = useState("");
  const [renameSnapshotLabel, setRenameSnapshotLabel] = useState("");
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);
  const [pendingUserEdits, setPendingUserEdits] = useState<Record<string, PendingUserEdit>>({});
  const [isSavingUserChanges, setIsSavingUserChanges] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [openCortes, setOpenCortes] = useState(false);
  const [openSectors, setOpenSectors] = useState(false);
  const [openCargos, setOpenCargos] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);
  const [sectors, setSectors] = useState<SectorEntry[]>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(true);
  const [isSavingSectors, setIsSavingSectors] = useState(false);
  const [newSectorName, setNewSectorName] = useState("");
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});
  const [newClassification, setNewClassification] = useState<Record<string, string>>({});
  const [masterCargos, setMasterCargos] = useState<CargoEntry[]>([]);
  const [isLoadingCargos, setIsLoadingCargos] = useState(true);
  const [isSavingCargos, setIsSavingCargos] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});
  const [newCargoByDept, setNewCargoByDept] = useState<Record<string, string>>({});
  const [snapshotCargosModal, setSnapshotCargosModal] = useState<{ snapshotId: string; label: string } | null>(null);
  const [snapshotCargosDraft, setSnapshotCargosDraft] = useState<Set<string> | null>(null);
  const [isLoadingSnapshotCargos, setIsLoadingSnapshotCargos] = useState(false);
  const [isSavingSnapshotCargos, setIsSavingSnapshotCargos] = useState(false);
  const [snapshotCompaniesModal, setSnapshotCompaniesModal] = useState<{ snapshotId: string; label: string } | null>(null);
  const [snapshotCompaniesDraft, setSnapshotCompaniesDraft] = useState<Set<string> | null>(null);
  const [isLoadingSnapshotCompanies, setIsLoadingSnapshotCompanies] = useState(false);
  const [isSavingSnapshotCompanies, setIsSavingSnapshotCompanies] = useState(false);
  const [createSnapshotCompanyIds, setCreateSnapshotCompanyIds] = useState<Set<string>>(new Set());
  const [createCompaniesModalOpen, setCreateCompaniesModalOpen] = useState(false);
  // TCR rates
  const [tcrBcvUsd, setTcrBcvUsd] = useState<number | null>(null);
  const [tcrBcvEur, setTcrBcvEur] = useState<number | null>(null);
  const [tcrBinance, setTcrBinance] = useState<number | null>(null);
  const [tcrLibre, setTcrLibre] = useState<number | null>(null);
  const [tcrLibreIsManual, setTcrLibreIsManual] = useState(false);
  const [tcrLibreUpdatedAt, setTcrLibreUpdatedAt] = useState<string | null>(null);
  const [tcrLibreInput, setTcrLibreInput] = useState("");
  const [tcrSaveStatus, setTcrSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "resetting">("idle");

  useEffect(() => {
    let ignore = false;

    async function loadUsers() {
      try {
        const response = await fetch("/api/admin/users", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as { users?: AdminUser[]; message?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "No fue posible cargar los usuarios.");
        }

        if (!ignore) {
          setUsers(Array.isArray(payload?.users) ? payload.users : []);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "No fue posible cargar los usuarios.");
        }
      } finally {
        if (!ignore) {
          setIsLoadingUsers(false);
        }
      }
    }

    void loadUsers();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

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
          setErrorMessage(error instanceof Error ? error.message : "No fue posible cargar las empresas.");
        }
      }
    }

    async function loadSnapshots() {
      try {
        const response = await fetch("/api/admin/snapshots", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as { snapshots?: AdminSnapshot[]; userCount?: number; message?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "No fue posible cargar los cortes.");
        }

        if (!ignore) {
          setSnapshots(Array.isArray(payload?.snapshots) ? payload.snapshots : []);
          setTotalUsers(typeof payload?.userCount === "number" ? payload.userCount : 0);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "No fue posible cargar los cortes.");
        }
      } finally {
        if (!ignore) {
          setIsLoadingSnapshots(false);
        }
      }
    }

    void loadCompanies();
    void loadSnapshots();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadConfig() {
      try {
        const response = await fetch("/api/admin/config", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { sectors?: SectorEntry[]; cargos?: CargoEntry[] } | null;
        if (!ignore) {
          if (Array.isArray(payload?.sectors)) setSectors(payload.sectors);
          if (Array.isArray(payload?.cargos)) setMasterCargos(payload.cargos);
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) { setIsLoadingSectors(false); setIsLoadingCargos(false); }
      }
    }

    void loadConfig();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    void fetch("/api/admin/tcr-rates", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((body: {
        bcvUsd?:  { rate: number | null };
        bcvEur?:  { rate: number | null };
        binance?: { rate: number | null };
        libre?:   { rate: number | null; updatedAt: string | null; isManual?: boolean };
      } | null) => {
        if (!body) return;
        setTcrBcvUsd(body.bcvUsd?.rate ?? null);
        setTcrBcvEur(body.bcvEur?.rate ?? null);
        setTcrBinance(body.binance?.rate ?? null);
        setTcrLibre(body.libre?.rate ?? null);
        setTcrLibreIsManual(body.libre?.isManual ?? false);
        setTcrLibreUpdatedAt(body.libre?.updatedAt ?? null);
        if (body.libre?.isManual && body.libre.rate) setTcrLibreInput(String(body.libre.rate));
      })
      .catch(() => {});
  }, []);

  async function saveSectors(next: SectorEntry[]) {
    setIsSavingSectors(true);
    try {
      const response = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectors: next }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo guardar.");
      setSectors(next);
      setStatusMessage(payload?.message ?? "Sectores guardados.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar los sectores.");
    } finally {
      setIsSavingSectors(false);
    }
  }

  function addSector() {
    const name = newSectorName.trim();
    if (!name) return;
    if (sectors.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setErrorMessage("Ese sector ya existe.");
      return;
    }
    const next = [...sectors, { name, classifications: [] }];
    setNewSectorName("");
    void saveSectors(next);
  }

  function removeSector(name: string) {
    if (!window.confirm(`¿Eliminar el sector "${name}" y todas sus clasificaciones?`)) return;
    void saveSectors(sectors.filter((s) => s.name !== name));
  }

  function addClassification(sectorName: string) {
    const value = (newClassification[sectorName] ?? "").trim();
    if (!value) return;
    const next = sectors.map((s) =>
      s.name === sectorName && !s.classifications.includes(value)
        ? { ...s, classifications: [...s.classifications, value] }
        : s
    );
    setNewClassification((c) => ({ ...c, [sectorName]: "" }));
    void saveSectors(next);
  }

  function removeClassification(sectorName: string, cls: string) {
    const next = sectors.map((s) =>
      s.name === sectorName
        ? { ...s, classifications: s.classifications.filter((c) => c !== cls) }
        : s
    );
    void saveSectors(next);
  }

  async function saveCargos(next: CargoEntry[]) {
    setIsSavingCargos(true);
    try {
      const response = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cargos: next }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo guardar.");
      setMasterCargos(next);
      setStatusMessage(payload?.message ?? "Cargos guardados.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar los cargos.");
    } finally {
      setIsSavingCargos(false);
    }
  }

  function addDept() {
    const name = newDeptName.trim();
    if (!name) return;
    if (masterCargos.some((d) => d.departamento.toLowerCase() === name.toLowerCase())) {
      setErrorMessage("Ese departamento ya existe.");
      return;
    }
    setNewDeptName("");
    void saveCargos([...masterCargos, { departamento: name, cargos: [] }]);
  }

  function removeDept(dept: string) {
    if (!window.confirm(`¿Eliminar el departamento "${dept}" y todos sus cargos?`)) return;
    void saveCargos(masterCargos.filter((d) => d.departamento !== dept));
  }

  function addCargo(dept: string) {
    const value = (newCargoByDept[dept] ?? "").trim();
    if (!value) return;
    const next = masterCargos.map((d) =>
      d.departamento === dept && !d.cargos.includes(value)
        ? { ...d, cargos: [...d.cargos, value] }
        : d
    );
    setNewCargoByDept((c) => ({ ...c, [dept]: "" }));
    void saveCargos(next);
  }

  function removeCargo(dept: string, cargo: string) {
    const next = masterCargos.map((d) =>
      d.departamento === dept
        ? { ...d, cargos: d.cargos.filter((c) => c !== cargo) }
        : d
    );
    void saveCargos(next);
  }

  async function openSnapshotCargosModal(snapshotId: string, label: string) {
    setSnapshotCargosModal({ snapshotId, label });
    setIsLoadingSnapshotCargos(true);
    setSnapshotCargosDraft(null);
    try {
      const response = await fetch(`/api/admin/config/snapshot-cargos?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { cargos?: SnapshotCargoItem[] } | null;
      const loaded: SnapshotCargoItem[] = Array.isArray(payload?.cargos) ? payload.cargos : [];
      setSnapshotCargosDraft(new Set(loaded.map((c) => `${c.departamento}::${c.tituloCargo}`)));
    } catch {
      setSnapshotCargosDraft(new Set());
    } finally {
      setIsLoadingSnapshotCargos(false);
    }
  }

  function closeSnapshotCargosModal() {
    setSnapshotCargosModal(null);
    setSnapshotCargosDraft(null);
  }

  function toggleSnapshotCargo(dept: string, cargo: string) {
    const key = `${dept}::${cargo}`;
    setSnapshotCargosDraft((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllDeptCargos(dept: string, deptCargos: string[]) {
    const allSelected = deptCargos.every((c) => snapshotCargosDraft?.has(`${dept}::${c}`));
    setSnapshotCargosDraft((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      deptCargos.forEach((c) => {
        if (allSelected) next.delete(`${dept}::${c}`);
        else next.add(`${dept}::${c}`);
      });
      return next;
    });
  }

  async function saveSnapshotCargos() {
    if (!snapshotCargosModal || !snapshotCargosDraft) return;
    setIsSavingSnapshotCargos(true);
    try {
      const cargos: SnapshotCargoItem[] = [...snapshotCargosDraft].map((key) => {
        const idx = key.indexOf("::");
        return { departamento: key.slice(0, idx), tituloCargo: key.slice(idx + 2) };
      });
      const response = await fetch("/api/admin/config/snapshot-cargos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snapshotCargosModal.snapshotId, cargos }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo guardar.");
      setStatusMessage(payload?.message ?? "Cargos del corte guardados.");
      closeSnapshotCargosModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar los cargos del corte.");
    } finally {
      setIsSavingSnapshotCargos(false);
    }
  }

  async function openSnapshotCompaniesModal(snapshotId: string, label: string) {
    setSnapshotCompaniesModal({ snapshotId, label });
    setIsLoadingSnapshotCompanies(true);
    setSnapshotCompaniesDraft(null);
    try {
      const response = await fetch(`/api/admin/snapshot-companies?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { companyIds?: string[] } | null;
      const loaded = Array.isArray(payload?.companyIds) ? payload.companyIds : null;
      // null = no restriction (all see it) → pre-select all
      // [] = nobody → pre-select none
      // [...] = subset → pre-select subset
      setSnapshotCompaniesDraft(loaded === null ? new Set(companies.map((c) => c.id)) : new Set(loaded));
    } catch {
      setSnapshotCompaniesDraft(new Set(companies.map((c) => c.id)));
    } finally {
      setIsLoadingSnapshotCompanies(false);
    }
  }

  function closeSnapshotCompaniesModal() {
    setSnapshotCompaniesModal(null);
    setSnapshotCompaniesDraft(null);
  }

  function toggleSnapshotCompany(companyId: string) {
    setSnapshotCompaniesDraft((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  async function saveSnapshotCompanies() {
    if (!snapshotCompaniesModal || !snapshotCompaniesDraft) return;
    setIsSavingSnapshotCompanies(true);
    try {
      const allSelected = snapshotCompaniesDraft.size === companies.length;
      // All selected = no restriction → DELETE key so everyone sees it
      // 0 selected = nobody → PUT with []
      // partial → PUT with subset
      const response = await fetch("/api/admin/snapshot-companies", {
        method: allSelected ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allSelected
          ? { snapshotId: snapshotCompaniesModal.snapshotId }
          : { snapshotId: snapshotCompaniesModal.snapshotId, companyIds: [...snapshotCompaniesDraft] }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo guardar.");
      setStatusMessage("Acceso de empresas al corte actualizado.");
      closeSnapshotCompaniesModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar el acceso de empresas.");
    } finally {
      setIsSavingSnapshotCompanies(false);
    }
  }

  async function reloadSnapshots() {
    const response = await fetch("/api/admin/snapshots", {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as { snapshots?: AdminSnapshot[]; userCount?: number; message?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.message ?? "No fue posible cargar los cortes.");
    }

    setSnapshots(Array.isArray(payload?.snapshots) ? payload.snapshots : []);
    setTotalUsers(typeof payload?.userCount === "number" ? payload.userCount : 0);
  }

  async function handleOpenCreateUserModal() {
    setErrorMessage("");
    setStatusMessage("");
    setIsCreateUserModalOpen(true);
  }

  function handleCloseCreateUserModal() {
    setIsCreateUserModalOpen(false);
    setIsSubmittingRegister(false);
  }

  async function handleCreateUser(values: UserRegistrationValues) {
    setErrorMessage("");
    setStatusMessage("");

    setIsSubmittingRegister(true);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          companyId: values.companyId,
          companyName: values.companyName,
          companyDescription: values.companyDescription,
          companyEconomicSector: values.companyEconomicSector,
          companyClassification: values.companyClassification,
          password: values.password,
          role: values.role,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; user?: { name?: string } } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible crear la cuenta.");
      }

      const usersResponse = await fetch("/api/admin/users", {
        method: "GET",
        cache: "no-store",
      });
      const usersPayload = (await usersResponse.json().catch(() => null)) as { users?: AdminUser[]; message?: string } | null;

      if (!usersResponse.ok) {
        throw new Error(usersPayload?.message ?? "La cuenta fue creada, pero no se pudo refrescar la lista de usuarios.");
      }

      setUsers(Array.isArray(usersPayload?.users) ? usersPayload.users : []);
      setStatusMessage(`Usuario creado: ${payload?.user?.name ?? values.name}.`);
      handleCloseCreateUserModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No fue posible crear la cuenta.");
    } finally {
      setIsSubmittingRegister(false);
    }
  }

  function updatePendingUserEdit(user: AdminUser, nextEdit: Partial<PendingUserEdit>) {
    setPendingUserEdits((current) => {
      const previous = current[user.id] ?? { role: user.role, password: "", companyId: user.company.id };
      const merged = { ...previous, ...nextEdit };
      const hasRoleChange = merged.role !== user.role;
      const hasPasswordChange = merged.password.trim().length > 0;
      const hasCompanyChange = merged.companyId !== user.company.id;

      if (!hasRoleChange && !hasPasswordChange && !hasCompanyChange) {
        const nextEdits = { ...current };
        delete nextEdits[user.id];
        return nextEdits;
      }

      return {
        ...current,
        [user.id]: merged,
      };
    });
  }

  async function handleSaveUserChanges() {
    setErrorMessage("");
    setStatusMessage("");

    const updates = users
      .map((user) => {
        const draft = pendingUserEdits[user.id];

        if (!draft) {
          return null;
        }

        return {
          userId: user.id,
          role: draft.role,
          password: draft.password.trim(),
          companyId: draft.companyId,
          currentRole: user.role,
          currentCompanyId: user.company.id,
          currentCompanyName: user.company.name,
          name: user.name,
        };
      })
      .filter((update): update is NonNullable<typeof update> => Boolean(update));

    if (updates.length === 0) {
      setStatusMessage("No hay cambios pendientes en usuarios.");
      return;
    }

    const invalidPasswordUpdate = updates.find((update) => update.password.length > 0 && update.password.length < 8);

    if (invalidPasswordUpdate) {
      setErrorMessage(`La nueva contrasena de ${invalidPasswordUpdate.name} debe tener al menos 8 caracteres.`);
      return;
    }

    const invalidCompanyUpdate = updates.find((update) => !update.companyId);

    if (invalidCompanyUpdate) {
      setErrorMessage(`Selecciona una empresa válida para ${invalidCompanyUpdate.name}.`);
      return;
    }

    const adminPromotion = updates.find((update) => update.currentRole !== "ADMIN" && update.role === "ADMIN");

    if (adminPromotion && !window.confirm(`Vas a otorgar permisos de administrador a ${adminPromotion.name}. ¿Deseas continuar?`)) {
      return;
    }

    setIsSavingUserChanges(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          updates: updates.map(({ userId, role, password, companyId }) => ({ userId, role, password, companyId })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { users?: AdminUser[]; message?: string } | null;

      if (!response.ok || !Array.isArray(payload?.users)) {
        throw new Error(payload?.message ?? "No fue posible guardar los cambios de usuarios.");
      }

      setUsers(payload.users);
      setPendingUserEdits({});
      setStatusMessage("Cambios de usuarios guardados correctamente.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No fue posible guardar los cambios de usuarios.");
    } finally {
      setIsSavingUserChanges(false);
    }
  }

  async function handleDeleteUser(user: AdminUser) {
    if (!window.confirm(`¿Eliminar al usuario "${user.name}" (${user.email})?\n\nEsta acción no se puede deshacer.`)) return;

    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible eliminar el usuario.");
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setPendingUserEdits((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      setStatusMessage(`Usuario "${user.name}" eliminado correctamente.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No fue posible eliminar el usuario.");
    }
  }

  async function handleCreateSnapshot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!snapshotDate) {
      setErrorMessage("Selecciona una fecha para crear el corte.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsMutatingSnapshot(true);

    try {
      const allSelected = createSnapshotCompanyIds.size === 0 || createSnapshotCompanyIds.size === companies.length;
      const companyIds = allSelected ? null : [...createSnapshotCompanyIds];

      const response = await fetch("/api/admin/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: snapshotDate, label: snapshotLabel, companyIds }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible crear el corte.");
      }

      setStatusMessage(payload?.message ?? "Corte creado correctamente.");
      setSnapshotLabel("");
      setCreateSnapshotCompanyIds(new Set());
      await reloadSnapshots();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No fue posible crear el corte.");
    } finally {
      setIsMutatingSnapshot(false);
    }
  }

  async function handleRenameSnapshot(snapshotId: string) {
    if (!renameSnapshotLabel.trim()) {
      setErrorMessage("Indica una nueva etiqueta para el corte.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsMutatingSnapshot(true);

    try {
      const response = await fetch("/api/admin/snapshots", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snapshotId,
          label: renameSnapshotLabel,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible renombrar el corte.");
      }

      setStatusMessage(payload?.message ?? "Corte renombrado correctamente.");
      setRenamingSnapshotId("");
      setRenameSnapshotLabel("");
      await reloadSnapshots();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No fue posible renombrar el corte.");
    } finally {
      setIsMutatingSnapshot(false);
    }
  }

  async function handleDeleteSnapshot(snapshotId: string) {
    const snap = snapshots.find((s) => s.id === snapshotId);
    const label = snap?.label || snapshotId;
    const confirmed = window.confirm(
      `¿Eliminar el corte "${label}"?\n\nToda la data que las empresas hayan ingresado para este corte se perderá permanentemente. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsMutatingSnapshot(true);

    try {
      const response = await fetch("/api/admin/snapshots", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ snapshotId }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible eliminar el corte.");
      }

      setStatusMessage(payload?.message ?? "Corte eliminado correctamente.");
      if (renamingSnapshotId === snapshotId) {
        setRenamingSnapshotId("");
        setRenameSnapshotLabel("");
      }
      await reloadSnapshots();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No fue posible eliminar el corte.");
    } finally {
      setIsMutatingSnapshot(false);
    }
  }

  return (
    <main className="page-wrap">
      <div className="flex w-full flex-col gap-6">
        <section className="surface-panel rounded-[1.75rem] p-4 md:p-5">
          <div>
            <div className="eyebrow mb-1.5">Control central</div>
            <h1 className="font-display text-[1.4rem] font-bold tracking-tight text-slate-900">Vista administrativa.</h1>
          </div>
        </section>

        {statusMessage ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            <Shield size={14} aria-hidden />
            {statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => void handleOpenCreateUserModal()}
            className="surface-card rounded-[1.5rem] p-4 text-left hover:border-slate-300"
          >
            <div className="rounded-full bg-slate-100 p-2.5 text-slate-700 w-fit">
              <UserPlus size={16} aria-hidden />
            </div>
            <h2 className="font-display mt-3 text-base font-bold text-slate-900">Crear usuarios</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Abre el alta controlada dentro de esta vista administrativa.</p>
          </button>
          {adminActions.map((action) => {
            const Icon = action.icon;

            return (
              <Link key={action.href} href={action.href} className="surface-card rounded-[1.5rem] p-4 hover:border-slate-300">
                <div className="rounded-full bg-slate-100 p-2.5 text-slate-700 w-fit">
                  <Icon size={16} aria-hidden />
                </div>
                <h2 className="font-display mt-3 text-base font-bold text-slate-900">{action.title}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">{action.description}</p>
              </Link>
            );
          })}
        </section>

        {/* TCR rate configuration */}
        <section className="surface-card overflow-hidden rounded-[1.75rem] p-5 md:p-6">
          <div className="eyebrow mb-4">Tasas TCR</div>
          <div className="grid gap-3 grid-cols-3 mb-5">
            {[
              { label: "BCV USD",   value: tcrBcvUsd },
              { label: "BCV EUR",   value: tcrBcvEur },
              { label: "Libre USD", value: tcrLibre, highlight: true, tag: tcrLibreIsManual ? "manual" : "auto" },
            ].map(({ label, value, highlight, tag }) => (
              <div key={label} className={`rounded-[1.1rem] px-4 py-3 ${highlight ? "bg-amber-50" : "bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`text-[0.65rem] font-bold uppercase tracking-wide ${highlight ? "text-amber-700" : "text-slate-500"}`}>{label}</span>
                  {tag && (
                    <span className={`text-[0.6rem] font-semibold rounded-full px-1.5 py-0.5 ${tag === "manual" ? "bg-amber-200 text-amber-800" : "bg-slate-200 text-slate-600"}`}>{tag}</span>
                  )}
                </div>
                <div className={`font-display text-xl font-bold ${highlight ? "text-amber-700" : "text-slate-800"}`}>
                  {value != null ? value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[10rem]">
              <label className="field-label">Override tasa libre (opcional)</label>
              <input
                type="number"
                min={1}
                step={0.01}
                value={tcrLibreInput}
                onChange={(e) => { setTcrLibreInput(e.target.value); setTcrSaveStatus("idle"); }}
                className="field w-full text-sm"
                placeholder={tcrLibre != null ? `Auto: ${tcrLibre.toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : "Ej: 316.50"}
              />
            </div>
            <button
              type="button"
              disabled={tcrSaveStatus === "saving"}
              onClick={async () => {
                const rate = Number(tcrLibreInput);
                if (!rate || rate <= 0) return;
                setTcrSaveStatus("saving");
                try {
                  const res = await fetch("/api/admin/tcr-rates", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ libreRate: rate }),
                  });
                  if (res.ok) {
                    setTcrLibre(rate);
                    setTcrLibreIsManual(true);
                    setTcrLibreUpdatedAt(new Date().toISOString());
                    setTcrSaveStatus("saved");
                  } else { setTcrSaveStatus("error"); }
                } catch { setTcrSaveStatus("error"); }
              }}
              className={`btn ${tcrSaveStatus === "saved" ? "btn-secondary text-emerald-700" : "btn-primary"}`}
            >
              {tcrSaveStatus === "saving" ? "Guardando…" : tcrSaveStatus === "saved" ? "Guardado" : "Guardar override"}
            </button>
            {tcrLibreIsManual && (
              <button
                type="button"
                disabled={tcrSaveStatus === "resetting"}
                onClick={async () => {
                  setTcrSaveStatus("resetting");
                  try {
                    const res = await fetch("/api/admin/tcr-rates", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ libreRate: null }),
                    });
                    if (res.ok) {
                      const auto = (tcrBinance && tcrBcvEur)
                        ? Math.round(((tcrBinance + tcrBcvEur) / 2) * 100) / 100
                        : (tcrBinance ?? tcrBcvEur ?? null);
                      setTcrLibre(auto);
                      setTcrLibreIsManual(false);
                      setTcrLibreInput("");
                      setTcrSaveStatus("idle");
                    }
                  } catch { setTcrSaveStatus("idle"); }
                }}
                className="btn btn-secondary text-slate-600"
              >
                {tcrSaveStatus === "resetting" ? "Restableciendo…" : "Usar automático"}
              </button>
            )}
            {tcrLibreUpdatedAt && (
              <span className="text-xs text-slate-400">
                {tcrLibreIsManual ? "Override " : "Auto "}
                {new Date(tcrLibreUpdatedAt).toLocaleDateString("es-VE")} {new Date(tcrLibreUpdatedAt).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </div>
        </section>

        {/* Cargo management */}
        <section className="surface-card overflow-hidden rounded-[1.75rem]">
          <button
            type="button"
            onClick={() => setOpenCargos((v) => !v)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left md:p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="rounded-full bg-violet-50 p-2.5 text-violet-700">
                <ClipboardList size={16} aria-hidden />
              </div>
              <h2 className="font-display text-base font-bold text-slate-900">Cargos</h2>
              {masterCargos.length > 0 && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.65rem] font-bold text-violet-800">
                  {masterCargos.reduce((sum, d) => sum + d.cargos.length, 0)}
                </span>
              )}
            </div>
            {openCargos ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
          </button>

          {openCargos && (
          <div className="border-t border-slate-200/60 px-4 pb-4 pt-3 md:px-5 md:pb-5">
          <p className="text-xs leading-5 text-slate-500">
            Administra la lista maestra de departamentos y cargos. Se utilizan en la carga de data de empresas y al definir los cargos de cada corte.
          </p>

          <div className="mt-3 flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="newDeptName" className="field-label">Nuevo departamento</label>
              <input
                id="newDeptName"
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDept(); } }}
                className="field"
                placeholder="Ej. Innovación"
                disabled={isSavingCargos}
              />
            </div>
            <button type="button" onClick={addDept} className="btn btn-primary shrink-0" disabled={!newDeptName.trim() || isSavingCargos}>
              <Plus className="h-4 w-4" />
              Agregar departamento
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {isLoadingCargos ? (
              <div className="text-xs text-slate-500">Cargando cargos...</div>
            ) : masterCargos.length === 0 ? (
              <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/70 px-4 py-4 text-xs text-slate-500">
                No hay departamentos definidos.
              </div>
            ) : masterCargos.map((dept) => {
              const isExpanded = expandedDepts[dept.departamento] ?? false;
              return (
                <div key={dept.departamento} className="rounded-[1.1rem] border border-slate-200/80 bg-white/80">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedDepts((s) => ({ ...s, [dept.departamento]: !isExpanded }))}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <span className="text-sm font-semibold text-slate-900">{dept.departamento}</span>
                      <span className="text-xs text-slate-400">{dept.cargos.length} cargos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDept(dept.departamento)}
                      className="btn btn-danger btn-xs"
                      disabled={isSavingCargos}
                      aria-label={`Eliminar departamento ${dept.departamento}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-200/60 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {dept.cargos.map((cargo) => (
                          <div key={cargo} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 pl-3 pr-1.5 py-1 text-xs font-medium text-slate-700">
                            {cargo}
                            <button
                              type="button"
                              onClick={() => removeCargo(dept.departamento, cargo)}
                              className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600"
                              aria-label={`Eliminar cargo ${cargo}`}
                              disabled={isSavingCargos}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {dept.cargos.length === 0 && (
                          <span className="text-xs text-slate-400">Sin cargos aún.</span>
                        )}
                      </div>
                      <div className="mt-2.5 flex gap-2">
                        <input
                          type="text"
                          value={newCargoByDept[dept.departamento] ?? ""}
                          onChange={(e) => setNewCargoByDept((c) => ({ ...c, [dept.departamento]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCargo(dept.departamento); } }}
                          className="field flex-1 py-1 text-xs"
                          placeholder="Nuevo cargo"
                          disabled={isSavingCargos}
                        />
                        <button
                          type="button"
                          onClick={() => addCargo(dept.departamento)}
                          className="btn btn-secondary btn-xs"
                          disabled={!(newCargoByDept[dept.departamento] ?? "").trim() || isSavingCargos}
                        >
                          <Plus className="h-3 w-3" />
                          Agregar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
          )}
        </section>

        <section className="surface-card overflow-hidden rounded-[1.75rem]">
          <button
            type="button"
            onClick={() => setOpenCortes((v) => !v)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left md:p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="rounded-full bg-teal-50 p-2.5 text-teal-700">
                <CalendarDays size={16} aria-hidden />
              </div>
              <h2 className="font-display text-base font-bold text-slate-900">Crear cortes</h2>
              {snapshots.length > 0 && (
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[0.65rem] font-bold text-teal-800">{snapshots.length}</span>
              )}
            </div>
            {openCortes ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
          </button>

          {openCortes && (
          <div className="border-t border-slate-200/60 px-4 pb-4 pt-3 md:px-5 md:pb-5">
          <form onSubmit={handleCreateSnapshot} className="rounded-[1.25rem] border border-slate-200/80 bg-white/70 p-4">
            <p className="field-label mb-3">Nuevo corte</p>
            <div className="grid gap-3 lg:grid-cols-[11rem_minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label htmlFor="snapshotDate" className="field-label">Fecha</label>
                <input
                  id="snapshotDate"
                  type="date"
                  value={snapshotDate}
                  onChange={(event) => setSnapshotDate(event.target.value)}
                  className="field"
                  disabled={isMutatingSnapshot}
                />
              </div>
              <div>
                <label htmlFor="snapshotLabel" className="field-label">Etiqueta</label>
                <input
                  id="snapshotLabel"
                  type="text"
                  value={snapshotLabel}
                  onChange={(event) => setSnapshotLabel(event.target.value)}
                  className="field"
                  placeholder="Ej. Corte abril 2026"
                  disabled={isMutatingSnapshot}
                />
              </div>
              <button type="submit" className="btn btn-primary w-full lg:w-auto" disabled={isMutatingSnapshot || totalUsers === 0}>
                {isMutatingSnapshot ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                {isMutatingSnapshot ? "Procesando..." : "Crear corte"}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2.5">
                {companies.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCreateCompaniesModalOpen(true)}
                    className="btn btn-secondary btn-xs shrink-0"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Empresas
                  </button>
                )}
                <p className="text-xs text-slate-500">
                  {totalUsers === 0
                    ? "Sin usuarios registrados."
                    : createSnapshotCompanyIds.size === 0
                    ? "Sin restricción — visible para todas las empresas."
                    : createSnapshotCompanyIds.size === companies.length
                    ? "Visible para todas las empresas."
                    : `Visible solo para ${createSnapshotCompanyIds.size} de ${companies.length} empresas seleccionadas.`}
                </p>
              </div>
            </div>
          </form>

          <div className="mt-4">
            <h3 className="font-display text-sm font-bold text-slate-700">Cortes globales</h3>
            {isLoadingSnapshots ? (
              <div className="mt-3 text-xs text-slate-600">Cargando cortes...</div>
            ) : snapshots.length === 0 ? (
              <div className="mt-3 rounded-[1.25rem] border border-dashed border-slate-300 bg-white/70 px-4 py-5 text-xs text-slate-500">
                Todavía no hay cortes globales creados.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {snapshots.map((snapshot) => (
                  <div key={snapshot.id} className="rounded-[1.1rem] border border-slate-200/80 bg-white/90 px-4 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{snapshot.label}</div>
                        <div className="mt-0.5 text-xs uppercase tracking-[0.12em] text-slate-500">{snapshot.date}</div>
                      </div>
                      <div className="flex flex-col gap-2 lg:flex-1 lg:flex-row lg:items-end">
                        <div className="flex-1">
                          <label htmlFor={`rename-${snapshot.id}`} className="field-label">Renombrar</label>
                          <input
                            id={`rename-${snapshot.id}`}
                            type="text"
                            value={renamingSnapshotId === snapshot.id ? renameSnapshotLabel : snapshot.label}
                            onFocus={() => { setRenamingSnapshotId(snapshot.id); setRenameSnapshotLabel(snapshot.label); }}
                            onChange={(event) => { setRenamingSnapshotId(snapshot.id); setRenameSnapshotLabel(event.target.value); }}
                            className="field"
                            disabled={isMutatingSnapshot}
                          />
                        </div>
                        <button type="button" onClick={() => void handleRenameSnapshot(snapshot.id)} className="btn btn-secondary" disabled={isMutatingSnapshot}>
                          <CalendarDays className="h-4 w-4" />
                          Renombrar
                        </button>
                        <button type="button" onClick={() => void openSnapshotCargosModal(snapshot.id, snapshot.label)} className="btn btn-secondary" disabled={isMutatingSnapshot}>
                          <ClipboardList className="h-4 w-4" />
                          Cargos
                        </button>
                        <button type="button" onClick={() => void openSnapshotCompaniesModal(snapshot.id, snapshot.label)} className="btn btn-secondary" disabled={isMutatingSnapshot}>
                          <Building2 className="h-4 w-4" />
                          Empresas
                        </button>
                        <button type="button" onClick={() => void handleDeleteSnapshot(snapshot.id)} className="btn btn-danger" disabled={isMutatingSnapshot}>
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
          )}
        </section>

        {/* Sector / classification management */}
        <section className="surface-card overflow-hidden rounded-[1.75rem]">
          <button
            type="button"
            onClick={() => setOpenSectors((v) => !v)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left md:p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="rounded-full bg-indigo-50 p-2.5 text-indigo-700">
                <Tag size={16} aria-hidden />
              </div>
              <h2 className="font-display text-base font-bold text-slate-900">Sectores económicos y clasificaciones</h2>
              {sectors.length > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[0.65rem] font-bold text-indigo-800">{sectors.length}</span>
              )}
            </div>
            {openSectors ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
          </button>

          {openSectors && (
          <div className="border-t border-slate-200/60 px-4 pb-4 pt-3 md:px-5 md:pb-5">
          <p className="text-xs leading-5 text-slate-500">
            Administra la lista de sectores económicos y sus clasificaciones. Se utilizan al registrar y editar empresas.
          </p>

          {/* Add new sector */}
          <div className="mt-3 flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="newSectorName" className="field-label">Nuevo sector</label>
              <input
                id="newSectorName"
                type="text"
                value={newSectorName}
                onChange={(e) => setNewSectorName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSector(); } }}
                className="field"
                placeholder="Ej. Tecnología / Software"
                disabled={isSavingSectors}
              />
            </div>
            <button type="button" onClick={addSector} className="btn btn-primary shrink-0" disabled={!newSectorName.trim() || isSavingSectors}>
              <Plus className="h-4 w-4" />
              Agregar sector
            </button>
          </div>

          {/* Sector list */}
          <div className="mt-3 space-y-2">
            {isLoadingSectors ? (
              <div className="text-xs text-slate-500">Cargando sectores...</div>
            ) : sectors.length === 0 ? (
              <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/70 px-4 py-4 text-xs text-slate-500">
                No hay sectores definidos.
              </div>
            ) : sectors.map((sector) => {
              const isExpanded = expandedSectors[sector.name] ?? false;
              return (
                <div key={sector.name} className="rounded-[1.1rem] border border-slate-200/80 bg-white/80">
                  {/* Sector header */}
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedSectors((s) => ({ ...s, [sector.name]: !isExpanded }))}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <span className="text-sm font-semibold text-slate-900">{sector.name}</span>
                      <span className="text-xs text-slate-400">{sector.classifications.length} clasificaciones</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSector(sector.name)}
                      className="btn btn-danger btn-xs"
                      disabled={isSavingSectors}
                      aria-label={`Eliminar sector ${sector.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Classifications (expanded) */}
                  {isExpanded && (
                    <div className="border-t border-slate-200/60 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {sector.classifications.map((cls) => (
                          <div key={cls} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 pl-3 pr-1.5 py-1 text-xs font-medium text-slate-700">
                            {cls}
                            <button
                              type="button"
                              onClick={() => removeClassification(sector.name, cls)}
                              className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600"
                              aria-label={`Eliminar clasificación ${cls}`}
                              disabled={isSavingSectors}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {sector.classifications.length === 0 && (
                          <span className="text-xs text-slate-400">Sin clasificaciones aún.</span>
                        )}
                      </div>
                      <div className="mt-2.5 flex gap-2">
                        <input
                          type="text"
                          value={newClassification[sector.name] ?? ""}
                          onChange={(e) => setNewClassification((c) => ({ ...c, [sector.name]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addClassification(sector.name); } }}
                          className="field flex-1 py-1 text-xs"
                          placeholder="Nueva clasificación"
                          disabled={isSavingSectors}
                        />
                        <button
                          type="button"
                          onClick={() => addClassification(sector.name)}
                          className="btn btn-secondary btn-xs"
                          disabled={!(newClassification[sector.name] ?? "").trim() || isSavingSectors}
                        >
                          <Plus className="h-3 w-3" />
                          Agregar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
          )}
        </section>

        <section className="surface-card overflow-hidden rounded-[1.75rem]">
          <button
            type="button"
            onClick={() => setOpenUsers((v) => !v)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left md:p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="rounded-full bg-slate-100 p-2.5 text-slate-700">
                <Users size={16} aria-hidden />
              </div>
              <h2 className="font-display text-base font-bold text-slate-900">Usuarios y roles</h2>
              {users.length > 0 && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-bold text-slate-700">{users.length}</span>
              )}
            </div>
            {openUsers ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
          </button>

          {openUsers && (
          <div className="border-t border-slate-200/60 px-4 pb-4 pt-3 md:px-5 md:pb-5">
          <div className="flex justify-end">
            <button type="button" onClick={() => void handleSaveUserChanges()} className="btn btn-primary" disabled={isSavingUserChanges || Object.keys(pendingUserEdits).length === 0}>
              {isSavingUserChanges ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {isSavingUserChanges ? "Guardando..." : "Guardar todo"}
            </button>
          </div>

          {isLoadingUsers ? (
            <div className="mt-4 text-sm text-slate-600">Cargando usuarios...</div>
          ) : users.length === 0 ? (
            <div className="mt-4 rounded-[1.25rem] border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-sm text-slate-500">
              No hay usuarios registrados.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {users.map((user) => {
                const draft = pendingUserEdits[user.id] ?? { role: user.role, password: "", companyId: user.company.id };
                const hasRoleChange = draft.role !== user.role;
                const hasPasswordChange = draft.password.trim().length > 0;
                const hasCompanyChange = draft.companyId !== user.company.id;
                const hasPending = hasRoleChange || hasPasswordChange || hasCompanyChange;
                const selectedCompany = companies.find((c) => c.id === draft.companyId);

                return (
                  <div key={user.id} className={`rounded-[1.1rem] border px-4 py-3 transition-colors ${hasPending ? "border-amber-200 bg-amber-50/40" : "border-slate-200/70 bg-white/80"}`}>
                    {/* User header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <div className="text-sm font-bold text-slate-900">{user.name}</div>
                        <div className="text-xs text-slate-400">{user.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${getRoleBadgeClasses(draft.role)}`}>
                          {getRoleLabel(draft.role)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteUser(user)}
                          disabled={isSavingUserChanges || user.id === session?.user?.id}
                          aria-label={`Eliminar usuario ${user.name}`}
                          title={user.id === session?.user?.id ? "No puedes eliminar tu propia cuenta" : `Eliminar ${user.name}`}
                          className="inline-flex items-center justify-center rounded-lg border border-transparent p-1.5 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className="field-label text-[0.7rem]">Empresa</label>
                        <select
                          aria-label={`Empresa de ${user.name}`}
                          title={`Empresa de ${user.name}`}
                          value={draft.companyId}
                          onChange={(e) => updatePendingUserEdit(user, { companyId: e.target.value })}
                          className="field-select w-full"
                          disabled={isSavingUserChanges}
                        >
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label text-[0.7rem]">Rol</label>
                        <select
                          aria-label={`Rol de ${user.name}`}
                          title={`Rol de ${user.name}`}
                          value={draft.role}
                          onChange={(e) => updatePendingUserEdit(user, { role: e.target.value as AppUserRole })}
                          className="field-select w-full"
                          disabled={isSavingUserChanges}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label text-[0.7rem]">Nueva contraseña</label>
                        <input
                          type="password"
                          value={draft.password}
                          onChange={(e) => updatePendingUserEdit(user, { password: e.target.value })}
                          className="field w-full"
                          placeholder="Dejar vacío para no cambiar"
                          autoComplete="new-password"
                          disabled={isSavingUserChanges}
                        />
                      </div>
                    </div>

                    {/* Pending changes strip */}
                    {hasPending && (
                      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-amber-200/60 pt-2.5 text-xs text-amber-800">
                        {hasCompanyChange && <span>Empresa: {user.company.name} → {selectedCompany?.name ?? "—"}</span>}
                        {hasRoleChange && <span>Rol: {getRoleLabel(user.role)} → {getRoleLabel(draft.role)}</span>}
                        {hasPasswordChange && <span>Contraseña: pendiente de cambio</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
          )}
        </section>
      </div>

      {createCompaniesModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setCreateCompaniesModalOpen(false)}
        >
          <div
            className="surface-card relative z-10 w-full max-w-4xl rounded-[1.75rem] p-6 max-h-[calc(100vh-3rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 shrink-0">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">Empresas del nuevo corte</h2>
                <p className="mt-1 text-xs text-slate-500">Solo las empresas seleccionadas verán este corte. Si seleccionas todas, el corte es visible para todos.</p>
              </div>
              <button type="button" onClick={() => setCreateCompaniesModalOpen(false)} className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto pr-1">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {createSnapshotCompanyIds.size === 0 ? "Ninguna seleccionada" : createSnapshotCompanyIds.size === companies.length ? "Todas seleccionadas" : `${createSnapshotCompanyIds.size} de ${companies.length} seleccionadas`}
                </span>
                <button
                  type="button"
                  className="text-xs font-medium text-teal-700 hover:underline"
                  onClick={() => setCreateSnapshotCompanyIds(
                    createSnapshotCompanyIds.size === companies.length ? new Set() : new Set(companies.map((c) => c.id))
                  )}
                >
                  {createSnapshotCompanyIds.size === companies.length ? "Desmarcar todas" : "Seleccionar todas"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3 lg:grid-cols-4">
                {companies.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={createSnapshotCompanyIds.has(c.id)}
                      onChange={() => {
                        setCreateSnapshotCompanyIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        });
                      }}
                      className="h-3.5 w-3.5 shrink-0 rounded accent-teal-700"
                    />
                    <span className="text-xs text-slate-700">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 shrink-0 border-t border-slate-200/60 pt-4">
              <button type="button" onClick={() => setCreateCompaniesModalOpen(false)} className="btn btn-secondary">
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {snapshotCompaniesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={closeSnapshotCompaniesModal}
        >
          <div
            className="surface-card relative z-10 w-full max-w-4xl rounded-[1.75rem] p-6 max-h-[calc(100vh-3rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 shrink-0">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">Empresas del corte</h2>
                <p className="mt-1 text-sm text-slate-600">{snapshotCompaniesModal.label}</p>
                <p className="mt-1 text-xs text-slate-500">Solo las empresas seleccionadas verán este corte. Si seleccionas todas, el corte es visible para todos.</p>
              </div>
              <button
                type="button"
                onClick={closeSnapshotCompaniesModal}
                className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto pr-1">
              {isLoadingSnapshotCompanies ? (
                <div className="text-sm text-slate-500">Cargando...</div>
              ) : companies.length === 0 ? (
                <div className="text-sm text-slate-500">No hay empresas registradas.</div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {snapshotCompaniesDraft?.size === companies.length ? "Todas seleccionadas" : `${snapshotCompaniesDraft?.size ?? 0} de ${companies.length}`}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-teal-700 hover:underline"
                      onClick={() => setSnapshotCompaniesDraft(
                        snapshotCompaniesDraft?.size === companies.length ? new Set() : new Set(companies.map((c) => c.id))
                      )}
                    >
                      {snapshotCompaniesDraft?.size === companies.length ? "Desmarcar todas" : "Seleccionar todas"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3 lg:grid-cols-4">
                    {companies.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={snapshotCompaniesDraft?.has(c.id) ?? false}
                          onChange={() => toggleSnapshotCompany(c.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded accent-teal-700"
                        />
                        <span className="text-xs text-slate-700">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 shrink-0 border-t border-slate-200/60 pt-4">
              <button type="button" onClick={closeSnapshotCompaniesModal} className="btn btn-secondary">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveSnapshotCompanies()}
                className="btn btn-primary"
                disabled={isSavingSnapshotCompanies || isLoadingSnapshotCompanies || !snapshotCompaniesDraft}
              >
                {isSavingSnapshotCompanies ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {isSavingSnapshotCompanies ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {snapshotCargosModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={closeSnapshotCargosModal}
        >
          <div
            className="surface-card relative z-10 w-full max-w-2xl rounded-[1.75rem] p-6 max-h-[calc(100vh-3rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 shrink-0">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">Cargos del corte</h2>
                <p className="mt-1 text-sm text-slate-600">{snapshotCargosModal.label}</p>
              </div>
              <button
                type="button"
                onClick={closeSnapshotCargosModal}
                className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto pr-1 space-y-4">
              {isLoadingSnapshotCargos ? (
                <div className="text-sm text-slate-500">Cargando cargos...</div>
              ) : (
                <>
                  {/* Selected cargos panel */}
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Cargos requeridos para este corte
                      </div>
                      {(snapshotCargosDraft?.size ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setSnapshotCargosDraft(new Set())}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Quitar todos
                        </button>
                      )}
                    </div>
                    {(snapshotCargosDraft?.size ?? 0) === 0 ? (
                      <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/60 px-4 py-4 text-xs text-slate-400">
                        Ningún cargo seleccionado. Usa la lista de abajo para agregar.
                      </div>
                    ) : (
                      <div className="rounded-[1.1rem] border border-violet-200/70 bg-violet-50/50 px-4 py-3">
                        {masterCargos.map((dept) => {
                          const selected = dept.cargos.filter((c) => snapshotCargosDraft?.has(`${dept.departamento}::${c}`));
                          if (selected.length === 0) return null;
                          return (
                            <div key={dept.departamento} className="mb-3 last:mb-0">
                              <div className="mb-1.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-violet-700">{dept.departamento}</div>
                              <div className="flex flex-wrap gap-1.5">
                                {selected.map((cargo) => (
                                  <div key={cargo} className="inline-flex items-center gap-1 rounded-full bg-violet-100 pl-2.5 pr-1 py-0.5 text-xs font-medium text-violet-800">
                                    {cargo}
                                    <button
                                      type="button"
                                      onClick={() => toggleSnapshotCargo(dept.departamento, cargo)}
                                      className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-violet-500 hover:bg-violet-200 hover:text-violet-800"
                                      aria-label={`Quitar ${cargo}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Master list for toggling */}
                  {masterCargos.length === 0 ? (
                    <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-sm text-slate-500">
                      No hay cargos en la lista maestra. Agrégalos en la sección &quot;Cargos&quot;.
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Lista maestra</div>
                      <div className="space-y-2">
                        {masterCargos.map((dept) => {
                          const modalKey = `modal-${dept.departamento}`;
                          const isExpanded = expandedDepts[modalKey] ?? false;
                          const allSelected = dept.cargos.length > 0 && dept.cargos.every((c) => snapshotCargosDraft?.has(`${dept.departamento}::${c}`));
                          const selectedCount = dept.cargos.filter((c) => snapshotCargosDraft?.has(`${dept.departamento}::${c}`)).length;
                          return (
                            <div key={dept.departamento} className="rounded-[1.1rem] border border-slate-200/80 bg-white/80">
                              <div className="flex items-center gap-2 px-4 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => setExpandedDepts((s) => ({ ...s, [modalKey]: !isExpanded }))}
                                  className="flex flex-1 items-center gap-2 text-left"
                                >
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                                  <span className="text-sm font-semibold text-slate-900">{dept.departamento}</span>
                                  <span className="text-xs text-slate-400">{selectedCount}/{dept.cargos.length}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleAllDeptCargos(dept.departamento, dept.cargos)}
                                  className="shrink-0 text-xs text-violet-600 hover:text-violet-800"
                                >
                                  {allSelected ? "Quitar todos" : "Seleccionar todos"}
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-slate-200/60 px-4 py-3">
                                  <div className="space-y-1.5">
                                    {dept.cargos.map((cargo) => {
                                      const key = `${dept.departamento}::${cargo}`;
                                      const checked = snapshotCargosDraft?.has(key) ?? false;
                                      return (
                                        <label key={cargo} className="flex items-center gap-2.5 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleSnapshotCargo(dept.departamento, cargo)}
                                            className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                                          />
                                          <span className="text-sm text-slate-700">{cargo}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 shrink-0 border-t border-slate-200/60 pt-4">
              <span className="text-xs text-slate-500">{snapshotCargosDraft?.size ?? 0} cargos seleccionados</span>
              <div className="flex gap-3">
                <button type="button" onClick={closeSnapshotCargosModal} className="btn btn-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void saveSnapshotCargos()}
                  disabled={isSavingSnapshotCargos || isLoadingSnapshotCargos}
                  className="btn btn-primary"
                >
                  {isSavingSnapshotCargos ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  {isSavingSnapshotCargos ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateUserModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-4 md:py-5">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={handleCloseCreateUserModal} />
          <div role="dialog" aria-modal="true" className="surface-card relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.6rem] p-5 md:max-h-[calc(100vh-2.5rem)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow mb-2">Alta controlada</div>
                <h2 className="font-display text-2xl font-bold text-slate-900 md:text-[1.35rem]">Crear usuario</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 md:text-[0.82rem] md:leading-5">Completa el formulario sin salir de la vista admin.</p>
              </div>
              <button type="button" onClick={handleCloseCreateUserModal} className="btn btn-secondary px-3" aria-label="Cerrar modal crear usuario">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 overflow-y-auto pr-1">
              <UserRegistrationForm
                allowRoleSelection
                forceExistingCompanySelector
                submitLabel={isSubmittingRegister ? "Creando usuario..." : "Crear usuario"}
                submittingLabel="Creando usuario..."
                isSubmitting={isSubmittingRegister}
                externalError={errorMessage}
                onSubmit={handleCreateUser}
                secondaryAction={
                  <button type="button" onClick={handleCloseCreateUserModal} className="btn btn-secondary" disabled={isSubmittingRegister}>
                    Cancelar
                  </button>
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}