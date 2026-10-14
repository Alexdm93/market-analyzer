/**
 * Suavizado de la matriz de percentiles por grado.
 *
 * La matriz cruda sale con dos incoherencias, y ninguna es un error de
 * cálculo: son consecuencia de que cada percentil exige una muestra distinta
 * (P90 pide 12 empresas, P50 pide 4) y de que al recortar el mercado quedan
 * grados sin nadie.
 *
 *  - **Serruchos horizontales**: dentro de un mismo grado, un percentil bajo
 *    paga más que uno alto. Imposible por definición.
 *  - **Serruchos verticales y huecos**: un grado inferior paga más que uno
 *    superior dentro del mismo percentil, o directamente no hay dato.
 *
 * AC Consulting fijó el procedimiento (2026-10-14) en tres fases, en este
 * orden. Aplica a la matriz **por grado**; la de cargos homologados no se
 * suaviza, porque entre dos cargos distintos no hay un orden que respetar.
 *
 * Todo esto es invisible para el cliente: ve la matriz final. Lo que se
 * devuelve en `diagnostico` es para el módulo de auditoría del admin.
 */

/** Los cinco percentiles, del más alto al más bajo. Ese orden importa. */
export const PERCENTILES = ["p90", "p75", "p50", "p25", "p10"] as const;
export type Percentil = (typeof PERCENTILES)[number];

export type FilaGrado = { grade: number } & Record<Percentil, number | null>;

/**
 * Hasta cuántos grados vacíos seguidos se pueden proyectar con la curva.
 *
 * Del cuarto en adelante el dato se queda nulo: proyectar más lejos que eso
 * es inventar mercado donde no lo hay.
 */
export const MAX_GRADOS_IMPUTADOS = 3;

export type AjusteColumna = {
  percentil: Percentil;
  /** Cuántos grados tenían dato real antes de suavizar. */
  puntos: number;
  /** y = a·e^(b·grado). Nulo si no se pudo ajustar. */
  a: number | null;
  b: number | null;
  r2: number | null;
  /**
   * Por qué no se tocó la columna, si no se tocó. La curva solo se adopta
   * cuando sube con el grado; si no, los datos crudos valen más que un
   * modelo que diría que el grado 8 paga más que el 25.
   */
  motivo?: "pocos-puntos" | "curva-no-creciente";
};

export type Diagnostico = {
  /** Cuántos grados se reordenaron en la fase 1. */
  filasReordenadas: number;
  /** Cuántas celdas vacías se rellenaron con la curva. */
  celdasImputadas: number;
  /** Cuántas celdas con dato real cambiaron de valor al suavizar. */
  celdasSuavizadas: number;
  columnas: AjusteColumna[];
};

export type MatrizSuavizada = {
  filas: FilaGrado[];
  /** La matriz tal como llegó, para el reporte de control del admin. */
  cruda: FilaGrado[];
  diagnostico: Diagnostico;
};

function clonar(filas: FilaGrado[]): FilaGrado[] {
  return filas.map((f) => ({ ...f }));
}

/**
 * FASE 1 — Consistencia horizontal.
 *
 * Dentro de un grado, los valores que existen se reparten de mayor a menor
 * entre los percentiles que tenían dato. Los nulos se quedan nulos: no se
 * rellena nada acá, solo se reordena lo que ya estaba.
 */
function ordenarFila(fila: FilaGrado): boolean {
  const conDato = PERCENTILES.filter((p) => fila[p] !== null);
  if (conDato.length < 2) return false;

  const valores = conDato.map((p) => fila[p] as number).sort((x, y) => y - x);
  let cambio = false;

  // `conDato` ya viene de mayor a menor percentil, así que el valor más alto
  // le toca al percentil más alto que tenga dato.
  conDato.forEach((p, i) => {
    if (fila[p] !== valores[i]) cambio = true;
    fila[p] = valores[i];
  });

  return cambio;
}

/**
 * Regresión exponencial: ln(y) = ln(a) + b·grado, por mínimos cuadrados.
 *
 * Es la que pidió AC Consulting y la que corresponde: una estructura salarial
 * crece de forma geométrica, no lineal — el salto en bolívares entre el grado
 * 24 y el 25 no se parece al que hay entre el 8 y el 9. Una recta aplanaría
 * la cima y exageraría la base.
 */
function ajusteExponencial(puntos: Array<{ x: number; y: number }>): { a: number; b: number; r2: number } | null {
  const utiles = puntos.filter((p) => p.y > 0);
  if (utiles.length < 2) return null;

  const n = utiles.length;
  const sx = utiles.reduce((s, p) => s + p.x, 0);
  const sy = utiles.reduce((s, p) => s + Math.log(p.y), 0);
  const sxx = utiles.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = utiles.reduce((s, p) => s + p.x * Math.log(p.y), 0);

  const denominador = n * sxx - sx * sx;
  if (denominador === 0) return null;

  const b = (n * sxy - sx * sy) / denominador;
  const lnA = (sy - b * sx) / n;
  const a = Math.exp(lnA);

  // R² sobre los logaritmos, que es donde se ajustó la recta.
  const mediaLn = sy / n;
  const ssTot = utiles.reduce((s, p) => s + (Math.log(p.y) - mediaLn) ** 2, 0);
  const ssRes = utiles.reduce((s, p) => s + (Math.log(p.y) - (lnA + b * p.x)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { a, b, r2 };
}

/** Distancia en grados hasta el dato real más cercano de esa columna. */
function distanciaAlDatoMasCercano(indice: number, conDato: number[]): number {
  let menor = Infinity;
  for (const i of conDato) menor = Math.min(menor, Math.abs(i - indice));
  return menor;
}

export function suavizarMatriz(entrada: FilaGrado[]): MatrizSuavizada {
  const cruda = clonar(entrada);
  // De menor a mayor grado, para que la curva y los huecos se lean en orden.
  const filas = clonar(entrada).sort((a, b) => a.grade - b.grade);

  const diagnostico: Diagnostico = {
    filasReordenadas: 0,
    celdasImputadas: 0,
    celdasSuavizadas: 0,
    columnas: [],
  };

  // ── FASE 1 ──
  for (const fila of filas) {
    if (ordenarFila(fila)) diagnostico.filasReordenadas += 1;
  }

  // ── FASE 2 ──
  for (const percentil of PERCENTILES) {
    const conDato = filas.flatMap((f, i) => (f[percentil] !== null ? [i] : []));
    const puntos = conDato.map((i) => ({ x: filas[i].grade, y: filas[i][percentil] as number }));
    const ajuste = ajusteExponencial(puntos);

    if (!ajuste) {
      diagnostico.columnas.push({ percentil, puntos: conDato.length, a: null, b: null, r2: null, motivo: "pocos-puntos" });
      continue;
    }

    // Una curva que baja con el grado no describe ninguna estructura salarial
    // real: antes de imponerla, se deja la columna como vino.
    if (ajuste.b <= 0) {
      diagnostico.columnas.push({
        percentil, puntos: conDato.length, a: ajuste.a, b: ajuste.b, r2: ajuste.r2, motivo: "curva-no-creciente",
      });
      continue;
    }

    diagnostico.columnas.push({ percentil, puntos: conDato.length, a: ajuste.a, b: ajuste.b, r2: ajuste.r2 });

    filas.forEach((fila, i) => {
      const proyectado = Math.round(ajuste.a * Math.exp(ajuste.b * fila.grade));

      if (fila[percentil] !== null) {
        if (fila[percentil] !== proyectado) diagnostico.celdasSuavizadas += 1;
        fila[percentil] = proyectado;
        return;
      }

      // Hueco: se rellena solo si hay un dato real a tres grados o menos.
      if (distanciaAlDatoMasCercano(i, conDato) <= MAX_GRADOS_IMPUTADOS) {
        fila[percentil] = proyectado;
        diagnostico.celdasImputadas += 1;
      }
    });
  }

  // ── FASE 3 ──
  // Dos columnas suavizadas por separado pueden cruzarse en algún grado, así
  // que la validación horizontal se corre de nuevo sobre el resultado.
  for (const fila of filas) ordenarFila(fila);

  return { filas, cruda, diagnostico };
}

/** Lo mínimo que tiene que traer una métrica para poder suavizarla. */
export type ConPercentiles = Record<Percentil, number | null>;

/**
 * Suaviza la matriz por grado de varias métricas a la vez, en el sitio.
 *
 * Cada métrica tiene su propia curva, así que se recorre por separado. Vive
 * acá y no en quien llama porque lo necesitan los dos caminos que publican
 * percentiles por grado, y tienen que dar exactamente lo mismo: si uno
 * suavizara y el otro no, la misma empresa vería dos P75 distintos según la
 * pantalla.
 */
export function suavizarPorMetrica<M extends string>(
  grades: Array<{ grade: number } & Record<M, ConPercentiles>>,
  metricas: readonly M[],
): Record<M, Diagnostico> {
  const diagnosticos = {} as Record<M, Diagnostico>;

  for (const metrica of metricas) {
    const matriz: FilaGrado[] = grades.map((g) => ({
      grade: g.grade,
      p90: g[metrica].p90, p75: g[metrica].p75, p50: g[metrica].p50,
      p25: g[metrica].p25, p10: g[metrica].p10,
    }));

    const { filas, diagnostico } = suavizarMatriz(matriz);
    diagnosticos[metrica] = diagnostico;

    const porGrado = new Map(filas.map((f) => [f.grade, f]));
    for (const g of grades) {
      const f = porGrado.get(g.grade);
      if (!f) continue;
      for (const p of PERCENTILES) g[metrica][p] = f[p];
    }
  }

  return diagnosticos;
}
