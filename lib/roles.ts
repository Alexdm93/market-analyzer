export const USER_ROLE = "USER";
export const ANALYST_ROLE = "ANALYST";
export const ADMIN_ROLE = "ADMIN";

export type AppUserRole = typeof USER_ROLE | typeof ANALYST_ROLE | typeof ADMIN_ROLE;

export const ROLE_OPTIONS: Array<{ value: AppUserRole; label: string }> = [
  { value: USER_ROLE, label: "Usuario" },
  { value: ANALYST_ROLE, label: "Intermedio" },
  { value: ADMIN_ROLE, label: "Admin" },
];

export function isAppUserRole(role: string | null | undefined): role is AppUserRole {
  return role === USER_ROLE || role === ANALYST_ROLE || role === ADMIN_ROLE;
}

export function isAdminRole(role: string | null | undefined): role is typeof ADMIN_ROLE {
  return role === ADMIN_ROLE;
}

export function canAccessEmpresas(role: string | null | undefined) {
  return role === ADMIN_ROLE || role === ANALYST_ROLE;
}

export function getRoleLabel(role: string | null | undefined) {
  if (role === ADMIN_ROLE) {
    return "Admin";
  }

  if (role === ANALYST_ROLE) {
    return "Intermedio";
  }

  return "Usuario";
}