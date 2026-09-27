/**
 * El grupo de mercado contra el que se compara: qué empresas del corte entran.
 *
 * Vive aparte porque lo aplican tres rutas —percentiles por cargo, por grado y
 * TCR— y tienen que coincidir exactamente: si una filtrara distinto, la misma
 * empresa se compararía contra muestras diferentes según la pantalla.
 *
 * Todos los filtros son opcionales; sin ninguno, el grupo es el corte completo.
 */
import type { CompanyInfo } from "@/lib/workspace";

export type FiltrosMercado = {
  sectores: string[];
  /** La "clasificación" de la empresa, que es el subsector. */
  clasificaciones: string[];
  empresas: string[];
  localidades: string[];
  /** Tamaño por headcount: "pequeña", "mediana" o "grande". */
  tamanos: string[];
};

/**
 * El tamaño de una empresa según su headcount, con los mismos cortes que usa
 * el resto del sistema: pequeña bajo 50, mediana hasta 200, grande arriba.
 */
export function tamanoDeEmpresa(headcount: string | undefined): "pequeña" | "mediana" | "grande" | null {
  const n = Number(headcount);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 50) return "pequeña";
  if (n <= 200) return "mediana";
  return "grande";
}

export const TAMANOS = [
  { valor: "pequeña", etiqueta: "Pequeña (menos de 50)" },
  { valor: "mediana", etiqueta: "Mediana (50 a 200)" },
  { valor: "grande",  etiqueta: "Grande (más de 200)" },
] as const;

function lista(valor: string | null): string[] {
  return (valor ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

export function leerFiltrosMercado(searchParams: URLSearchParams): FiltrosMercado {
  return {
    sectores: lista(searchParams.get("sectors")),
    // El nombre del parámetro quedó de antes; filtra la clasificación.
    clasificaciones: lista(searchParams.get("sizes")),
    empresas: lista(searchParams.get("companies")),
    localidades: lista(searchParams.get("localities")),
    tamanos: lista(searchParams.get("tamanos")),
  };
}

/** Una empresa puede operar en varias localidades, separadas por coma. */
export function localidadesDe(info: CompanyInfo): string[] {
  return (info.locality ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

export function pasaFiltros(info: CompanyInfo, f: FiltrosMercado): boolean {
  if (f.sectores.length > 0 && (!info.sector || !f.sectores.includes(info.sector))) return false;
  if (f.clasificaciones.length > 0 && (!info.classification || !f.clasificaciones.includes(info.classification))) return false;
  if (f.empresas.length > 0 && (!info.companyName || !f.empresas.includes(info.companyName))) return false;

  // Basta con que opere en alguna de las localidades elegidas.
  if (f.localidades.length > 0) {
    const suyas = localidadesDe(info);
    if (!suyas.some((l) => f.localidades.includes(l))) return false;
  }

  if (f.tamanos.length > 0) {
    const tamano = tamanoDeEmpresa(info.headcount);
    if (!tamano || !f.tamanos.includes(tamano)) return false;
  }

  return true;
}
