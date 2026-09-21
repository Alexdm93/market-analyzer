/**
 * Cálculos del informe del Estudio Especializado.
 *
 * Los cuatro análisis (dispersión, equidad interna, competitividad y mapa de
 * calor) salen de la misma base: la compensación de cada ocupante bajo un
 * concepto elegido. Por eso se calcula una sola vez y los análisis se arman
 * encima.
 *
 * La compensación NO se calcula a mano: se reusa `computeRowTotals`, el mismo
 * que usa el resto del sistema. Para excluir comisiones se pone en cero el
 * concepto antes de llamarlo, en vez de rehacer la suma: así no puede
 * divergir del cálculo canónico.
 */
import { gradeToNivel } from "@/lib/capri";
import { computeRowTotals } from "@/lib/compensation";
import type { ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition } from "@/types/salary";

export type Concepto = "sinPasivosMensual" | "directoMensualizado" | "conPasivosMensual" | "conPasivosAnual";

export const CONCEPTOS: Array<{ clave: Concepto; etiqueta: string }> = [
  { clave: "sinPasivosMensual",   etiqueta: "Total Efectivo Mensual ($)" },
  { clave: "directoMensualizado", etiqueta: "Total Efectivo Mensualizado ($)" },
  { clave: "conPasivosMensual",   etiqueta: "Compensación Integral Mensualizada ($)" },
  { clave: "conPasivosAnual",     etiqueta: "Total Compensación con PL Anualizado ($)" },
];

export type ConfiguracionInforme = {
  concepto: Concepto;
  incluirComisiones: boolean;
  /** Ancho total de la banda de equidad, p. ej. 0,20 para ±10 %. */
  aperturaBandas: number;
  /** Margen del mapa de calor, p. ej. 0,15. */
  margenMapaCalor: number;
};

export const CONFIG_POR_DEFECTO: ConfiguracionInforme = {
  concepto: "conPasivosAnual",
  incluirComisiones: false,
  aperturaBandas: 0.2,
  margenMapaCalor: 0.15,
};

export type Ocupante = {
  id: string;
  ocupanteId: string;
  departamento: string;
  tituloCargo: string;
  hayGrade: number | null;
  capriFamily: string | null;
  data: Partial<ExtendedMarketPosition>;
};

export type FilaAnalisis = {
  empresa: string;
  ocupanteId: string;
  unidadFuncional: string;
  tituloCargo: string;
  grado: number | null;
  nivel: string;
  compensacion: number;
};

/**
 * Quita las comisiones de una fila sin tocar nada más, para poder pedirle el
 * total al cálculo canónico con y sin ellas.
 */
function sinComisiones(data: Partial<ExtendedMarketPosition>): Partial<ExtendedMarketPosition> {
  return {
    ...data,
    comisiones: 0,
    additionalVariablePayments: (data.additionalVariablePayments ?? []).filter(
      (p: CompensationConcept) => p.variableType !== "commission",
    ),
  };
}

export function compensacionDe(
  ocupante: Ocupante,
  tasas: ExchangeRate[],
  bcv: number | null,
  diasVacaciones: number,
  diasUtilidades: number,
  config: ConfiguracionInforme,
): number {
  const data = config.incluirComisiones ? ocupante.data : sinComisiones(ocupante.data);
  const fila = { id: ocupante.id, tituloCargo: ocupante.tituloCargo, ...data } as ExtendedMarketPosition;
  const t = computeRowTotals(fila, tasas, bcv, diasVacaciones, diasUtilidades);

  switch (config.concepto) {
    case "sinPasivosMensual":   return t.totalSinPasivosMensual;
    case "directoMensualizado": return t.totalDirectoMensualizado;
    case "conPasivosMensual":   return t.totalConPasivosMensual;
    case "conPasivosAnual":     return t.totalConPasivosAnual;
  }
}

export function construirFilas(
  ocupantes: Ocupante[],
  empresa: string,
  tasas: ExchangeRate[],
  bcv: number | null,
  diasVacaciones: number,
  diasUtilidades: number,
  config: ConfiguracionInforme,
): FilaAnalisis[] {
  return ocupantes
    .map((o) => ({
      empresa,
      ocupanteId: o.ocupanteId || "",
      unidadFuncional: o.departamento,
      tituloCargo: o.tituloCargo,
      grado: o.hayGrade,
      nivel: gradeToNivel(o.hayGrade ?? undefined, o.capriFamily ?? undefined),
      compensacion: compensacionDe(o, tasas, bcv, diasVacaciones, diasUtilidades, config),
    }))
    // Ordenado por grado descendente, como en el modelo del cliente.
    .sort((a, b) => (b.grado ?? 0) - (a.grado ?? 0) || a.tituloCargo.localeCompare(b.tituloCargo, "es"));
}

// ── Equidad interna ─────────────────────────────────────────────────────────

export type Banda = { minimo: number; media: number; maximo: number };

export type FilaEquidad = FilaAnalisis & {
  banda: Banda | null;
  resultado: string;
  indice: number | null;
};

/**
 * La banda de un grado es la media de lo que cobran sus ocupantes, abierta
 * hacia arriba y hacia abajo por la mitad de la apertura configurada.
 */
export function bandasPorGrado(filas: FilaAnalisis[], apertura: number): Map<number, Banda> {
  const porGrado = new Map<number, number[]>();
  for (const f of filas) {
    if (f.grado === null || !f.compensacion) continue;
    const lista = porGrado.get(f.grado) ?? [];
    lista.push(f.compensacion);
    porGrado.set(f.grado, lista);
  }

  const bandas = new Map<number, Banda>();
  for (const [grado, valores] of porGrado) {
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    bandas.set(grado, {
      minimo: media * (1 - apertura / 2),
      media,
      maximo: media * (1 + apertura / 2),
    });
  }
  return bandas;
}

export function analizarEquidad(filas: FilaAnalisis[], apertura: number): { filas: FilaEquidad[]; indiceGlobal: number | null } {
  const bandas = bandasPorGrado(filas, apertura);

  const resultado = filas.map((f) => {
    const banda = f.grado !== null ? bandas.get(f.grado) ?? null : null;
    if (!banda || !f.compensacion) {
      return { ...f, banda, resultado: "Sin referencia", indice: null };
    }
    const dentro = f.compensacion >= banda.minimo && f.compensacion <= banda.maximo;
    return {
      ...f,
      banda,
      resultado: dentro ? "Dentro de Banda" : f.compensacion < banda.minimo ? "Debajo de Banda" : "Encima de Banda",
      indice: banda.media > 0 ? f.compensacion / banda.media : null,
    };
  });

  const indices = resultado.map((r) => r.indice).filter((i): i is number => i !== null);
  const indiceGlobal = indices.length > 0 ? indices.reduce((s, v) => s + v, 0) / indices.length : null;

  return { filas: resultado, indiceGlobal };
}

// ── Competitividad y mapa de calor ──────────────────────────────────────────

export type PercentilesGrado = {
  p90: number | null;
  p75: number | null;
  p50: number | null;
  p25: number | null;
  p10: number | null;
};

export const PERCENTILES_ORDEN: Array<keyof PercentilesGrado> = ["p90", "p75", "p50", "p25", "p10"];

export type FilaCompetitividad = FilaAnalisis & {
  mercado: PercentilesGrado | null;
  /** Actual menos mercado, en el mismo orden que PERCENTILES_ORDEN. */
  diferencias: Array<number | null>;
};

export function analizarCompetitividad(
  filas: FilaAnalisis[],
  mercadoPorGrado: Map<number, PercentilesGrado>,
): FilaCompetitividad[] {
  return filas.map((f) => {
    const mercado = f.grado !== null ? mercadoPorGrado.get(f.grado) ?? null : null;
    const diferencias = PERCENTILES_ORDEN.map((p) => {
      const valor = mercado?.[p];
      if (valor === null || valor === undefined || !f.compensacion) return null;
      return f.compensacion - valor;
    });
    return { ...f, mercado, diferencias };
  });
}

export type FilaMapaCalor = FilaAnalisis & {
  mercado: PercentilesGrado | null;
  compaRatio: number | null;
};

export function analizarMapaCalor(
  filas: FilaAnalisis[],
  mercadoPorGrado: Map<number, PercentilesGrado>,
): FilaMapaCalor[] {
  return filas.map((f) => {
    const mercado = f.grado !== null ? mercadoPorGrado.get(f.grado) ?? null : null;
    const referencia = mercado?.p50 ?? null;
    return {
      ...f,
      mercado,
      compaRatio: referencia && referencia > 0 && f.compensacion ? f.compensacion / referencia : null,
    };
  });
}

// ── Simulador de ajuste salarial (F9) ───────────────────────────────────────

export type ConfigSimulador = {
  percentil: keyof PercentilesGrado;
  variacionGeneral: number;
  variacionMaxima: number;
  delta: number;
};

export const SIMULADOR_POR_DEFECTO: ConfigSimulador = {
  percentil: "p50",
  variacionGeneral: 0.1,
  variacionMaxima: 0.2,
  delta: 0.025,
};

/** Las cuatro calificaciones de la plantilla, de peor a mejor. */
export const DESEMPENOS = ["Insatisfactorio", "Bueno", "Muy Bueno", "Sobresaliente"] as const;

export type FilaSimulador = FilaAnalisis & {
  mercadoReferencia: number | null;
  compaRatio: number | null;
  indiceEquidad: number | null;
  indiceCompuesto: number | null;
  /** % de ajuste para cada calificación, en el orden de DESEMPENOS. */
  porcentajesPorDesempeno: [number, number, number, number];
  ajusteMinimo: number;
  ajusteMaximo: number;
};

/**
 * Reparte el ajuste según qué tan atrás esté cada ocupante.
 *
 * El índice compuesto promedia su posición frente al mercado (compa-ratio) y
 * frente a sus pares del mismo grado (índice de equidad). Cuanto más abajo
 * está, más ajuste le toca: se parte de la variación general y se suman deltas
 * por cada tramo por debajo de la paridad, con el tope de la variación máxima.
 */
export function simularAjuste(
  filas: FilaAnalisis[],
  mercadoPorGrado: Map<number, PercentilesGrado>,
  apertura: number,
  config: ConfigSimulador,
): FilaSimulador[] {
  const { filas: conEquidad } = analizarEquidad(filas, apertura);

  return conEquidad.map((f) => {
    const mercado = f.grado !== null ? mercadoPorGrado.get(f.grado) ?? null : null;
    const referencia = mercado?.[config.percentil] ?? null;
    const compaRatio = referencia && referencia > 0 && f.compensacion ? f.compensacion / referencia : null;

    const componentes = [compaRatio, f.indice].filter((v): v is number => v !== null && Number.isFinite(v));
    const indiceCompuesto = componentes.length > 0
      ? componentes.reduce((s, v) => s + v, 0) / componentes.length
      : null;

    // El índice marca la base: cuanto más atrás está la persona, más ajuste.
    let base = config.variacionGeneral;
    if (indiceCompuesto !== null && indiceCompuesto < 1 && config.delta > 0) {
      const tramos = Math.ceil((1 - indiceCompuesto) / config.delta);
      base = Math.min(config.variacionMaxima, config.variacionGeneral + tramos * config.delta);
    }

    // Y el desempeño lo modula: un escalón de delta por calificación, con
    // "Insatisfactorio" en cero. La plantilla tiene una columna por cada una y
    // el cliente elige cuál aplica escribiendo la calificación de la persona.
    const tope = (v: number) => Math.min(config.variacionMaxima, Math.max(0, v));
    const porcentajesPorDesempeno: [number, number, number, number] = [
      0,
      tope(base),
      tope(base + config.delta),
      tope(base + config.delta * 2),
    ];

    return {
      ...f,
      mercadoReferencia: referencia,
      compaRatio,
      indiceEquidad: f.indice,
      indiceCompuesto,
      porcentajesPorDesempeno,
      ajusteMinimo: f.compensacion * (1 + porcentajesPorDesempeno[1]),
      ajusteMaximo: f.compensacion * (1 + porcentajesPorDesempeno[3]),
    };
  });
}
