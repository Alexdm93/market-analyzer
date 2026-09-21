/**
 * Informes del Estudio Especializado.
 *
 * Un informe es una FOTO CONGELADA. Guarda los números tal como se le mostraron
 * al cliente en el momento de generarlo, no referencias a los cargos: si
 * después se corrige un sueldo o se republica el corte, el informe entregado
 * sigue diciendo lo mismo. Para tener los números al día se genera uno nuevo.
 *
 * Por eso las cifras las manda la pantalla que acaba de mostrarlas, y no se
 * recalculan al guardar: recalcular sería justamente lo contrario de congelar.
 * El servidor comprueba la pertenencia y la forma, no los montos.
 */

export type MetricaInforme = "sinPasivosMensual" | "directoMensualizado" | "conPasivosMensual" | "conPasivosAnual";

export const METRICAS_INFORME: Array<{ value: MetricaInforme; label: string; sigla: string }> = [
  { value: "sinPasivosMensual",   label: "Total Efectivo Mensual",              sigla: "TEM" },
  { value: "directoMensualizado", label: "Total Efectivo Mensualizado",         sigla: "TEMz" },
  { value: "conPasivosMensual",   label: "Compensación Integral Mensualizada",  sigla: "CIM" },
  { value: "conPasivosAnual",     label: "Paquete de Compensación Total Anual", sigla: "PCTA" },
];

export type PercentilesInforme = {
  n: number;
  min: number | null;
  max: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  promedio: number | null;
};

export type FilaInforme = {
  cargoId: string;
  departamento: string;
  tituloCargo: string;
  hayGrade: number | null;
  capriFamily: string | null;
  nivel: string;
  /** Contra qué cargo del catálogo se comparó; vacío si no estaba homologado. */
  equivalencia: string;
  propio: number;
  percentiles: PercentilesInforme | null;
};

export type DatosInforme = {
  generadoEl: string;
  modo: "cargo" | "grado";
  metrica: MetricaInforme;
  filas: FilaInforme[];
};

export const MAX_FILAS_INFORME = 500;

type Validacion = { ok: true; datos: DatosInforme } | { ok: false; mensaje: string };

function numeroONulo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function validarDatosInforme(entrada: unknown): Validacion {
  if (!entrada || typeof entrada !== "object") return { ok: false, mensaje: "El informe no trae datos." };
  const e = entrada as Record<string, unknown>;

  const modo = e.modo === "grado" ? "grado" : "cargo";
  const metrica = METRICAS_INFORME.some((m) => m.value === e.metrica)
    ? (e.metrica as MetricaInforme)
    : "sinPasivosMensual";

  if (!Array.isArray(e.filas) || e.filas.length === 0) {
    return { ok: false, mensaje: "El informe necesita al menos un cargo." };
  }
  if (e.filas.length > MAX_FILAS_INFORME) {
    return { ok: false, mensaje: `Un informe no puede tener más de ${MAX_FILAS_INFORME} cargos.` };
  }

  const filas: FilaInforme[] = [];
  for (const cruda of e.filas) {
    if (!cruda || typeof cruda !== "object") continue;
    const f = cruda as Record<string, unknown>;
    const titulo = String(f.tituloCargo ?? "").trim();
    if (!titulo) continue;

    const p = f.percentiles && typeof f.percentiles === "object" ? (f.percentiles as Record<string, unknown>) : null;

    filas.push({
      cargoId: String(f.cargoId ?? ""),
      departamento: String(f.departamento ?? ""),
      tituloCargo: titulo,
      hayGrade: numeroONulo(f.hayGrade),
      capriFamily: f.capriFamily ? String(f.capriFamily) : null,
      nivel: String(f.nivel ?? ""),
      equivalencia: String(f.equivalencia ?? ""),
      propio: Number(f.propio) || 0,
      percentiles: p
        ? {
            n: Number(p.n) || 0,
            min: numeroONulo(p.min), max: numeroONulo(p.max),
            p25: numeroONulo(p.p25), p50: numeroONulo(p.p50), p75: numeroONulo(p.p75),
            promedio: numeroONulo(p.promedio),
          }
        : null,
    });
  }

  if (filas.length === 0) return { ok: false, mensaje: "Ninguna fila del informe es válida." };

  return {
    ok: true,
    datos: { generadoEl: new Date().toISOString(), modo, metrica, filas },
  };
}

export function parseDatosInforme(json: string): DatosInforme | null {
  try {
    const parsed = JSON.parse(json) as DatosInforme;
    return parsed && Array.isArray(parsed.filas) ? parsed : null;
  } catch {
    return null;
  }
}

/** Dónde cae el cargo respecto al mercado. Compartido entre comparación e informe. */
export function posicionEnMercado(propio: number, p: PercentilesInforme | null): { texto: string; clase: string } {
  if (!propio || !p || p.p25 === null || p.p50 === null || p.p75 === null) {
    return { texto: "—", clase: "bg-slate-100 text-slate-500" };
  }
  if (propio < p.p25) return { texto: "Bajo P25", clase: "bg-red-50 text-red-700" };
  if (propio < p.p50) return { texto: "P25 – P50", clase: "bg-amber-50 text-amber-700" };
  if (propio < p.p75) return { texto: "P50 – P75", clase: "bg-sky-50 text-sky-700" };
  return { texto: "Sobre P75", clase: "bg-teal-50 text-teal-700" };
}
