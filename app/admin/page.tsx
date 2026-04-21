"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, CalendarDays, LoaderCircle, RefreshCw, Shield, Trash2, UserPlus, Users, X } from "lucide-react";
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
        <section className="surface-panel rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_22rem]">
            <div>
              <div className="eyebrow mb-3">Control central</div>
              <h1 className="dashboard-title font-display font-bold tracking-tight text-slate-900">Vista administrativa.</h1>
              <p className="dashboard-lead mt-3 max-w-3xl text-slate-600">
                Desde aquí solo un usuario con rol admin puede gestionar el catálogo base y el alta controlada de accesos.
              </p>
            </div>

            <div className="surface-card rounded-[1.75rem] p-5 md:p-6">
              <div className="rounded-full bg-teal-50 p-3 text-teal-700 w-fit">
                <Shield size={18} aria-hidden />
              </div>
              <h2 className="font-display mt-4 text-2xl font-bold text-slate-900">Acceso restringido</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Esta vista solo está disponible para usuarios con el rol administrativo persistido en base de datos.
              </p>
            </div>
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

        <section className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => void handleOpenCreateUserModal()}
            className="surface-card rounded-[2rem] p-6 text-left hover:border-slate-300 md:p-8"
          >
            <div className="rounded-full bg-slate-100 p-3 text-slate-700 w-fit">
              <UserPlus size={18} aria-hidden />
            </div>
            <h2 className="font-display mt-5 text-2xl font-bold text-slate-900">Crear usuarios</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">Abre el alta controlada dentro de esta vista administrativa.</p>
          </button>
          {adminActions.map((action) => {
            const Icon = action.icon;

            return (
              <Link key={action.href} href={action.href} className="surface-card rounded-[2rem] p-6 md:p-8 hover:border-slate-300">
                <div className="rounded-full bg-slate-100 p-3 text-slate-700 w-fit">
                  <Icon size={18} aria-hidden />
                </div>
                <h2 className="font-display mt-5 text-2xl font-bold text-slate-900">{action.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{action.description}</p>
              </Link>
            );
          })}
        </section>

        <section className="surface-card rounded-[2rem] p-6 md:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-teal-50 p-3 text-teal-700">
              <CalendarDays size={18} aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900">Crear cortes</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Los cortes ya no se crean desde Data. Se crean aquí y se replican iguales para todos los usuarios.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateSnapshot} className="mt-6 grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)_auto] lg:items-end">
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

          <div className="mt-4 rounded-[1.25rem] bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {totalUsers > 0
              ? `Este corte se propagará a ${totalUsers} usuarios y también se copiará a los nuevos usuarios que se registren.`
              : "Aún no hay usuarios registrados para recibir cortes globales."}
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => void handleSyncSnapshots()} className="btn btn-secondary" disabled={isMutatingSnapshot || totalUsers === 0}>
              {isMutatingSnapshot ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isMutatingSnapshot ? "Sincronizando..." : "Sincronizar cortes globales"}
            </button>
          </div>

          <div className="mt-6">
            <h3 className="font-display text-xl font-bold text-slate-900">Cortes globales</h3>
            {isLoadingSnapshots ? (
              <div className="mt-4 text-sm text-slate-600">Cargando cortes...</div>
            ) : snapshots.length === 0 ? (
              <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-sm text-slate-500">
                Todavía no hay cortes globales creados.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {snapshots.map((snapshot) => (
                  <div key={snapshot.id} className="rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{snapshot.label}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{snapshot.date}</div>
                      </div>
                      <div className="flex flex-col gap-3 lg:w-[36rem] lg:flex-row lg:items-end">
                        <div className="flex-1">
                          <label htmlFor={`rename-${snapshot.id}`} className="field-label">Renombrar</label>
                          <input
                            id={`rename-${snapshot.id}`}
                            type="text"
                            value={renamingSnapshotId === snapshot.id ? renameSnapshotLabel : snapshot.label}
                            onFocus={() => {
                              setRenamingSnapshotId(snapshot.id);
                              setRenameSnapshotLabel(snapshot.label);
                            }}
                            onChange={(event) => {
                              setRenamingSnapshotId(snapshot.id);
                              setRenameSnapshotLabel(event.target.value);
                            }}
                            className="field"
                            disabled={isMutatingSnapshot}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRenameSnapshot(snapshot.id)}
                          className="btn btn-secondary"
                          disabled={isMutatingSnapshot}
                        >
                          <CalendarDays className="h-4 w-4" />
                          Renombrar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSnapshot(snapshot.id)}
                          className="btn btn-danger"
                          disabled={isMutatingSnapshot}
                        >
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

        <section className="surface-card rounded-[2rem] p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 p-3 text-slate-700">
                <Users size={18} aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">Usuarios y roles</h2>
              </div>
            </div>
            <button type="button" onClick={() => void handleSaveUserChanges()} className="btn btn-primary" disabled={isSavingUserChanges || Object.keys(pendingUserEdits).length === 0}>
              {isSavingUserChanges ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {isSavingUserChanges ? "Guardando..." : "Guardar todo"}
            </button>
          </div>

          {isLoadingUsers ? (
            <div className="mt-6 text-sm text-slate-600">Cargando usuarios...</div>
          ) : users.length === 0 ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-sm text-slate-500">
              No hay usuarios registrados.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full table-fixed border-separate border-spacing-y-2.5 md:border-spacing-y-2">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[24%]" />
                  <col className="w-[16%]" />
                  <col className="w-[20%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead>
                  <tr className="text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    <th className="px-4 pb-1 md:px-3">Usuario</th>
                    <th className="px-4 pb-1 md:px-3">Empresa</th>
                    <th className="px-4 pb-1 md:px-3">Rol</th>
                    <th className="px-4 pb-1 md:px-3">Contraseña</th>
                    <th className="px-4 pb-1 md:px-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    (() => {
                      const draft = pendingUserEdits[user.id] ?? { role: user.role, password: "", companyId: user.company.id };
                      const hasRoleChange = draft.role !== user.role;
                      const hasPasswordChange = draft.password.trim().length > 0;
                      const hasCompanyChange = draft.companyId !== user.company.id;
                      const selectedCompany = companies.find((company) => company.id === draft.companyId);

                      return (
                    <tr key={user.id} className="rounded-[1.1rem] bg-slate-50/80 text-sm text-slate-700 md:text-[0.82rem]">
                      <td className="rounded-l-[1.1rem] px-4 py-4 align-top md:px-3 md:py-3">
                        <div className="flex min-h-[4.75rem] flex-col justify-start">
                          <div className="font-display text-base font-bold text-slate-900 md:text-[0.98rem]">{user.name}</div>
                          <div className="mt-1 break-words text-xs leading-5 text-slate-500">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top md:px-3 md:py-3">
                        <div className="flex min-h-[4.75rem] flex-col justify-start gap-2.5">
                          <div className="min-h-5">
                            <div className="break-words font-semibold leading-5 text-slate-900">{selectedCompany?.name ?? user.company.name}</div>
                          </div>
                          <select
                            aria-label={`Empresa de ${user.name}`}
                            title={`Empresa de ${user.name}`}
                            value={draft.companyId}
                            onChange={(event) => updatePendingUserEdit(user, { companyId: event.target.value })}
                            className="field-select w-full min-w-0"
                            disabled={isSavingUserChanges}
                          >
                            {companies.map((company) => (
                              <option key={company.id} value={company.id}>{company.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top md:px-3 md:py-3">
                        <div className="flex min-h-[4.75rem] flex-col justify-start gap-2.5">
                          <div className="min-h-5">
                            <span className={`inline-flex rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] ${getRoleBadgeClasses(draft.role)}`}>
                              {getRoleLabel(draft.role)}
                            </span>
                          </div>
                          <select
                            aria-label={`Rol de ${user.name}`}
                            title={`Rol de ${user.name}`}
                            value={draft.role}
                            onChange={(event) => updatePendingUserEdit(user, { role: event.target.value as AppUserRole })}
                            className="field-select w-full min-w-0"
                            disabled={isSavingUserChanges}
                          >
                            {ROLE_OPTIONS.map((roleOption) => (
                              <option key={roleOption.value} value={roleOption.value}>{roleOption.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top md:px-3 md:py-3">
                        <div className="flex min-h-[4.75rem] flex-col justify-start gap-2.5">
                          <div className="min-h-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Actual protegida</div>
                          <input
                            type="password"
                            value={draft.password}
                            onChange={(event) => updatePendingUserEdit(user, { password: event.target.value })}
                            className="field w-full min-w-0"
                            placeholder="Nueva contrasena"
                            autoComplete="new-password"
                            disabled={isSavingUserChanges}
                          />
                        </div>
                      </td>
                      <td className="rounded-r-[1.1rem] px-4 py-4 align-top md:px-3 md:py-3">
                        {hasRoleChange || hasPasswordChange || hasCompanyChange ? (
                          <div className="flex min-h-[4.75rem] flex-col justify-start space-y-2 text-xs leading-5 text-slate-600">
                            {hasCompanyChange ? <div>Empresa pendiente: {user.company.name} → {selectedCompany?.name ?? "Sin empresa"}</div> : null}
                            {hasRoleChange ? <div>Rol pendiente: {getRoleLabel(user.role)} → {getRoleLabel(draft.role)}</div> : null}
                            {hasPasswordChange ? <div>Contraseña pendiente de cambio</div> : null}
                          </div>
                        ) : (
                          <div className="flex min-h-[4.75rem] items-start text-xs leading-5 text-slate-500">Sin cambios</div>
                        )}
                      </td>
                    </tr>
                      );
                    })()
                  ))}
                </tbody>
              </table>
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
              />
              <div className="mt-3 flex justify-end gap-3">
                <button type="button" onClick={handleCloseCreateUserModal} className="btn btn-secondary" disabled={isSubmittingRegister}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}