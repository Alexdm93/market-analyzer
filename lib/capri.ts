/**
 * Clasificación CAPRI compartida.
 *
 * Vivía duplicada: el nivel dentro de `app/api/admin/study/route.ts` y los roles
 * dentro de `components/CapriWizardModal.tsx`, que es un componente de cliente y
 * por eso no se podía importar desde el servidor.
 */

export type CapriFamily = "IC" | "LO" | "GE" | "EJ";

export const CAPRI_ROLES: Record<number, { rol: string; mirrors: string[] }> = {
  8:  { rol: "Trabajo Simple y Rutinario",             mirrors: ["Operario de Limpieza", "Empacador", "Mensajero"] },
  9:  { rol: "Trabajo Semi-Complejo",                  mirrors: ["Operador de Maquinaria", "Recepcionista", "Cajero"] },
  10: { rol: "Trabajo Técnico Variado",                mirrors: ["Técnico Junior", "Asistente Sr"] },
  11: { rol: "Trabajo Técnico Especializado",          mirrors: ["Técnico de Mantenimiento"] },
  12: { rol: "Trabajo Técnico Especializado Superior", mirrors: ["Técnico Senior"] },
  13: { rol: "Trabajo Profesional Básico",             mirrors: ["Ingeniero Junior", "Analista Jr"] },
  14: { rol: "Profesional con Experiencia / Supervisor Inicial",  mirrors: ["Analista", "Supervisor de turno"] },
  15: { rol: "Especialista Técnico Inicial / Supervisor Técnico", mirrors: ["Supervisor de área"] },
  16: { rol: "Especialista Semi Senior / Supervisor Senior",      mirrors: ["Coordinador", "Ingeniero de procesos"] },
  17: { rol: "Especialista Senior / Gerencia Media Inicial",      mirrors: ["Jefe de área"] },
  18: { rol: "Gerencia Media Intermedia",              mirrors: ["Gerente de departamento"] },
  19: { rol: "Gerencia Media Avanzada",                mirrors: ["Gerente Senior"] },
  20: { rol: "Gerencia Alta Inicial",                  mirrors: ["GM startup"] },
  21: { rol: "Gerencia Alta Intermedia",               mirrors: ["GM empresa familiar"] },
  22: { rol: "Gerencia Alta Avanzada",                 mirrors: ["Director Unidad de Negocio"] },
  23: { rol: "Gerencia Ejecutiva Inicial",             mirrors: ["VP Operaciones", "CFO"] },
  24: { rol: "Gerencia Ejecutiva Intermedia",          mirrors: ["CEO empresa nacional"] },
  25: { rol: "Gerencia Ejecutiva Avanzada",            mirrors: ["CEO multinacional"] },
};

/** Nivel organizacional a partir del grado y la familia. */
export function gradeToNivel(grade: number | undefined, family: string | undefined): string {
  if (!grade) return "";
  const f = family ?? "";
  if (f === "IC") {
    if (grade >= 8  && grade <= 12) return "Operativo";
    if (grade >= 13 && grade <= 19) return "Profesional";
  }
  if (f === "LO") {
    if (grade >= 14 && grade <= 16) return "Supervisor";
  }
  if (f === "GE") {
    if (grade >= 17 && grade <= 19) return "Gerencia Media";
    if (grade >= 20 && grade <= 23) return "Gerencia Alta";
  }
  if (f === "EJ") {
    if (grade >= 23 && grade <= 25) return "Ejecutivo";
  }
  // Sin familia: mapeo simple por rango.
  if (grade >= 8  && grade <= 12) return "Operativo";
  if (grade >= 13 && grade <= 16) return "Profesional";
  if (grade >= 17 && grade <= 19) return "Gerencia Media";
  if (grade >= 20 && grade <= 22) return "Gerencia Alta";
  if (grade >= 23) return "Ejecutivo";
  return "";
}

export function capriRol(grade: number | undefined): string {
  if (!grade) return "";
  return CAPRI_ROLES[grade]?.rol ?? "";
}
