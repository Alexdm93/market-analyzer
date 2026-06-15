"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, CalendarDays, ChevronDown, ChevronRight, LoaderCircle, Plus, RefreshCw, Shield, Tag, Trash2, UserPlus, Users, X } from "lucide-react";
import UserRegistrationForm, { type UserRegistrationValues } from "@/components/UserRegistrationForm";
import { ROLE_OPTIONS, getRoleLabel, type AppUserRole } from "@/lib/roles";

const adminActions = [
  {
    title: "Gestionar empresas",
    description: "Crea y revisa las empresas disponibles para asignar usuarios.",
    href: "/empresas",
    icon: Building2,
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

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

export default function AdminPage() {
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
  const [sectors, setSectors] = useState<SectorEntry[]>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(true);
  const [isSavingSectors, setIsSavingSectors] = useState(false);
  const [newSectorName, setNewSectorName] = useState("");
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});
  const [newClassification, setNewClassification] = useState<Record<string, string>>({});

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

    async function loadSectors() {
      try {
        const response = await fetch("/api/admin/config", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { sectors?: SectorEntry[] } | null;
        if (!ignore && Array.isArray(payload?.sectors)) {
          setSectors(payload.sectors);
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) setIsLoadingSectors(false);
      }
    }

    void loadSectors();
    return () => { ignore = true; };
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
      const response = await fetch("/api/admin/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: snapshotDate,
          label: snapshotLabel,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible crear el corte.");
      }

      setStatusMessage(payload?.message ?? "Corte creado correctamente.");
      setSnapshotLabel("");
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

  async function handleSyncSnapshots() {
    setErrorMessage("");
    setStatusMessage("");
    setIsMutatingSnapshot(true);

    try {
      const response = await fetch("/api/admin/snapshots", {
        method: "PUT",
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible sincronizar los cortes.");
      }

      setStatusMessage(payload?.message ?? "Cortes sincronizados correctamente.");
      await reloadSnapshots();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No fue posible sincronizar los cortes.");
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

        <section className="grid gap-3 md:grid-cols-2">
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

        <section className="surface-card rounded-[1.75rem] p-4 md:p-5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-teal-50 p-2.5 text-teal-700">
              <CalendarDays size={16} aria-hidden />
            </div>
            <h2 className="font-display text-base font-bold text-slate-900">Crear cortes</h2>
          </div>

          <form onSubmit={handleCreateSnapshot} className="mt-3 grid gap-3 lg:grid-cols-[11rem_minmax(0,1fr)_auto] lg:items-end">
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
              <label htmlFor="snapshotLabel" className="field-label">Etiqueta opcional</label>
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
          </form>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {totalUsers > 0
                ? `Este corte se propagará a ${totalUsers} usuarios y también se copiará a los nuevos usuarios que se registren.`
                : "Aún no hay usuarios registrados para recibir cortes globales."}
            </p>
            <button type="button" onClick={() => void handleSyncSnapshots()} className="btn btn-secondary shrink-0" disabled={isMutatingSnapshot || totalUsers === 0}>
              {isMutatingSnapshot ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isMutatingSnapshot ? "Sincronizando..." : "Sincronizar cortes globales"}
            </button>
          </div>

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
                      <div className="flex flex-col gap-2 lg:w-[34rem] lg:flex-row lg:items-end">
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
        </section>

        {/* Sector / classification management */}
        <section className="surface-card rounded-[1.75rem] p-4 md:p-5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-indigo-50 p-2.5 text-indigo-700">
              <Tag size={16} aria-hidden />
            </div>
            <h2 className="font-display text-base font-bold text-slate-900">Sectores económicos y clasificaciones</h2>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
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
        </section>

        <section className="surface-card rounded-[1.75rem] p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-full bg-slate-100 p-2.5 text-slate-700">
                <Users size={16} aria-hidden />
              </div>
              <h2 className="font-display text-base font-bold text-slate-900">Usuarios y roles</h2>
            </div>
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
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${getRoleBadgeClasses(draft.role)}`}>
                        {getRoleLabel(draft.role)}
                      </span>
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
        </section>
      </div>

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