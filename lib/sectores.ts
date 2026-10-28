/**
 * El catálogo de sectores económicos y sus clasificaciones.
 *
 * Lo mantiene el admin desde su pantalla y vive en `GlobalConfig`; las listas
 * de `lib/company.ts` quedan solo como respaldo para cuando todavía no se ha
 * guardado nada.
 *
 * Vive acá y no dentro de la ruta de administración porque lo necesita también
 * el formulario público de solicitud de acceso, que no tiene sesión: si cada
 * pantalla trae su propia lista, alguien pide acceso declarando un sector que
 * el sistema ya no reconoce (AC Consulting, 2026-10-27).
 */
import {
  COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR,
  ECONOMIC_SECTOR_OPTIONS,
} from "@/lib/company";
import { prisma } from "@/lib/prisma";

export type SectorConClasificaciones = {
  name: string;
  classifications: string[];
};

export const CLAVE_SECTORES = "sectors";

/** Lo que vale mientras el admin no haya guardado su propio catálogo. */
export function sectoresPorDefecto(): SectorConClasificaciones[] {
  return (ECONOMIC_SECTOR_OPTIONS as readonly string[]).map((name) => ({
    name,
    classifications: COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[name] ?? [],
  }));
}

/** El catálogo vigente. Nunca falla: sin fila o con fila rota, el de respaldo. */
export async function leerSectores(): Promise<SectorConClasificaciones[]> {
  try {
    const fila = await prisma.globalConfig.findUnique({ where: { key: CLAVE_SECTORES } });
    if (!fila?.value) return sectoresPorDefecto();
    const parsed = JSON.parse(fila.value) as SectorConClasificaciones[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : sectoresPorDefecto();
  } catch {
    return sectoresPorDefecto();
  }
}
