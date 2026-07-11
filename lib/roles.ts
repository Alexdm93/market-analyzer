export const USER_ROLE = "USER";
export const COORDINATOR_ROLE = "COORDINATOR";
export const ADMIN_ROLE = "ADMIN";

export type AppUserRole = typeof USER_ROLE | typeof COORDINATOR_ROLE | typeof ADMIN_ROLE;

export const ROLE_OPTIONS: Array<{ value: AppUserRole; label: string }> = [
  { value: USER_ROLE, label: "Usuario" },
  { value: COORDINATOR_ROLE, label: "Coordinador" },
  { value: ADMIN_ROLE, label: "Admin" },
];

export function isAppUserRole(role: string | null | undefined): role is AppUserRole {
  return role === USER_ROLE || role === COORDINATOR_ROLE || role === ADMIN_ROLE;
}

export function isAdminRole(role: string | null | undefined): role is typeof ADMIN_ROLE {
  return role === ADMIN_ROLE;
}

export function isCoordinatorRole(role: string | null | undefined): role is typeof COORDINATOR_ROLE {
  return role === COORDINATOR_ROLE;
}

export function canAccessEmpresas(role: string | null | undefined) {
  return role === ADMIN_ROLE;
}

export function getRoleLabel(role: string | null | undefined) {
  if (role === ADMIN_ROLE) return "Admin";
  if (role === COORDINATOR_ROLE) return "Coordinador";
  return "Usuario";
}
