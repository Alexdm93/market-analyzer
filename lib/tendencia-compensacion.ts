/**
 * La línea de tendencia de la compensación interna.
 *
 * El Análisis de Dispersión cruza grado contra compensación y traza una curva;
 * de esa curva sale la ecuación que después usa Equidad Interna para fijar el
 * punto medio de cada banda. AC Consulting dejó dicho cómo elegirla
 * (2026-10-14):
 *
 *  - se prueban cuatro modelos: exponencial, logarítmico, polinómico (hasta
 *    grado 6, que es lo que ofrece Excel) y potencial;
 *  - gana el de R² más cercano a 1;
 *  - pero solo entre los que dan una compensación **estrictamente creciente** a
 *    medida que sube el grado. Una curva que baje rompería el análisis de
 *    equidad, por bien que ajuste.
 *
 * El sistema la elige solo: el cliente no sabe —ni tiene por qué saber— cuál
 * conviene en su caso.
 */

export type TipoTendencia = "exponencial" | "logaritmica" | "polinomica" | "potencial";

export type Tendencia = {
  tipo: TipoTendencia;
  /** Los coeficientes, con el significado que le da cada modelo. */
  coeficientes: number[];
  r2: number;
  /** La ecuación como la escribiría Excel, para mostrarla en la hoja. */
  formula: string;
  /** Evalúa la curva en un grado. */
  evaluar: (grado: number) => number;
};

export type Punto = { x: number; y: number };

/** Resuelve A·c = b por eliminación de Gauss con pivoteo parcial. */
function resolver(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((fila, i) => [...fila, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivote = col;
    for (let f = col + 1; f < n; f++) {
      if (Math.abs(m[f][col]) > Math.abs(m[pivote][col])) pivote = f;
    }
    if (Math.abs(m[pivote][col]) < 1e-12) return null;
    [m[col], m[pivote]] = [m[pivote], m[col]];

    for (let f = col + 1; f < n; f++) {
      const factor = m[f][col] / m[col][col];
      for (let c = col; c <= n; c++) m[f][c] -= factor * m[col][c];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let f = n - 1; f >= 0; f--) {
    let suma = m[f][n];
    for (let c = f + 1; c < n; c++) suma -= m[f][c] * x[c];
    x[f] = suma / m[f][f];
  }
  return x.every((v) => Number.isFinite(v)) ? x : null;
}

/** Mínimos cuadrados polinómicos de grado `g`. Devuelve [c0, c1, … cg]. */
function polinomio(puntos: Punto[], g: number): number[] | null {
  const n = g + 1;
  if (puntos.length < n) return null;

  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);

  for (const p of puntos) {
    const potencias = Array.from({ length: 2 * g + 1 }, (_, k) => p.x ** k);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += potencias[i + j];
      b[i] += potencias[i] * p.y;
    }
  }

  return resolver(A, b);
}

/** R² de un modelo cualquiera, medido sobre los valores originales. */
function r2De(puntos: Punto[], f: (x: number) => number): number {
  const media = puntos.reduce((s, p) => s + p.y, 0) / puntos.length;
  const ssTot = puntos.reduce((s, p) => s + (p.y - media) ** 2, 0);
  const ssRes = puntos.reduce((s, p) => s + (p.y - f(p.x)) ** 2, 0);
  if (!Number.isFinite(ssRes)) return -Infinity;
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

/** "0,1022" — con coma, como lo escribe Excel en español. */
/**
 * Cuántas cifras significativas se conservan de cada coeficiente.
 *
 * La ecuación que se publica tiene que poder aplicarse a mano y dar el MISMO
 * monto que la columna de equidad interna; AC Consulting lo probó y no
 * cuadraba (2026-10-18). Antes se redondeaba a cuatro decimales —y a entero
 * por encima de mil— solo para que se viera corta, pero en un polinomio de
 * grado 6 el término mayor se multiplica por 25^6, así que recortar el
 * coeficiente movía el resultado en decenas.
 *
 * Ahora se redondea una sola vez, acá, y TODO usa el coeficiente redondeado:
 * la curva, el R² y la ecuación impresa. Con diez cifras el error del término
 * mayor queda por debajo de la milésima.
 */
const CIFRAS = 10;

function redondear(v: number): number {
  if (!Number.isFinite(v) || v === 0) return 0;
  const escala = 10 ** (CIFRAS - Math.ceil(Math.log10(Math.abs(v))));
  return Math.round(v * escala) / escala;
}

/** El número tal cual quedó, sin notación científica y con coma decimal. */
function num(v: number): string {
  if (!Number.isFinite(v)) return "0";
  let texto = String(v);
  if (texto.includes("e") || texto.includes("E")) {
    texto = v.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
  }
  return texto.replace(".", ",");
}

function formulaPolinomica(c: number[]): string {
  const terminos: string[] = [];
  for (let g = c.length - 1; g >= 0; g--) {
    const coef = c[g];
    if (Math.abs(coef) < 1e-12) continue;
    const cuerpo = g === 0 ? "" : g === 1 ? "x" : `x${g}`;
    const signo = terminos.length === 0 ? (coef < 0 ? "-" : "") : (coef < 0 ? " - " : " + ");
    terminos.push(`${signo}${num(Math.abs(coef))}${cuerpo}`);
  }
  return `y = ${terminos.join("") || "0"}`;
}

/** Ajusta por mínimos cuadrados sobre (x, y) transformados. */
function ajusteLineal(puntos: Punto[], tx: (x: number) => number, ty: (y: number) => number) {
  const n = puntos.length;
  const sx = puntos.reduce((s, p) => s + tx(p.x), 0);
  const sy = puntos.reduce((s, p) => s + ty(p.y), 0);
  const sxx = puntos.reduce((s, p) => s + tx(p.x) ** 2, 0);
  const sxy = puntos.reduce((s, p) => s + tx(p.x) * ty(p.y), 0);
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return { a, b };
}

/**
 * ¿La curva sube en todo el rango de grados observado?
 *
 * Se mira grado a grado y no por la derivada: los grados son enteros y lo que
 * importa es que el grado 20 pague más que el 19, no qué hace la curva en
 * 19,5.
 */
function esCreciente(f: (x: number) => number, desde: number, hasta: number): boolean {
  let previo = -Infinity;
  for (let g = Math.floor(desde); g <= Math.ceil(hasta); g++) {
    const v = f(g);
    if (!Number.isFinite(v) || v <= previo) return false;
    previo = v;
  }
  return true;
}

/**
 * Prueba los cuatro modelos y devuelve el mejor que además crece.
 *
 * `null` cuando no hay puntos suficientes o ninguna curva crece: en ese caso
 * la hoja se queda sin ecuación en vez de mostrar una que mentiría.
 */
export function elegirTendencia(puntos: Punto[]): Tendencia | null {
  const utiles = puntos.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.y > 0 && p.x > 0);
  if (utiles.length < 3) return null;

  const desde = Math.min(...utiles.map((p) => p.x));
  const hasta = Math.max(...utiles.map((p) => p.x));
  const candidatas: Tendencia[] = [];

  // Exponencial: y = a·e^(b·x)
  const exp = ajusteLineal(utiles, (x) => x, (y) => Math.log(y));
  if (exp) {
    const a = redondear(Math.exp(exp.a)), b = redondear(exp.b);
    const evaluar = (x: number) => a * Math.exp(b * x);
    candidatas.push({
      tipo: "exponencial", coeficientes: [a, b], r2: r2De(utiles, evaluar),
      formula: `y = ${num(a)}e^(${num(b)}x)`, evaluar,
    });
  }

  // Logarítmica: y = a + b·ln(x)
  const log = ajusteLineal(utiles, (x) => Math.log(x), (y) => y);
  if (log) {
    const a = redondear(log.a), b = redondear(log.b);
    const evaluar = (x: number) => a + b * Math.log(x);
    candidatas.push({
      tipo: "logaritmica", coeficientes: [a, b], r2: r2De(utiles, evaluar),
      formula: `y = ${num(b)}ln(x) ${a < 0 ? "-" : "+"} ${num(Math.abs(a))}`, evaluar,
    });
  }

  // Potencial: y = a·x^b
  const pot = ajusteLineal(utiles, (x) => Math.log(x), (y) => Math.log(y));
  if (pot) {
    const a = redondear(Math.exp(pot.a)), b = redondear(pot.b);
    const evaluar = (x: number) => a * x ** b;
    candidatas.push({
      tipo: "potencial", coeficientes: [a, b], r2: r2De(utiles, evaluar),
      formula: `y = ${num(a)}x^${num(b)}`, evaluar,
    });
  }

  // Polinómica, de grado 2 al 6: se queda la de mejor R² que crezca.
  for (let g = 2; g <= 6; g++) {
    const crudo = polinomio(utiles, g);
    if (!crudo) continue;
    const c = crudo.map(redondear);
    const evaluar = (x: number) => c.reduce((s, coef, i) => s + coef * x ** i, 0);
    candidatas.push({
      tipo: "polinomica", coeficientes: c, r2: r2De(utiles, evaluar),
      formula: formulaPolinomica(c), evaluar,
    });
  }

  const crecientes = candidatas.filter((c) => Number.isFinite(c.r2) && esCreciente(c.evaluar, desde, hasta));
  if (crecientes.length === 0) return null;

  return crecientes.reduce((mejor, c) => (c.r2 > mejor.r2 ? c : mejor));
}
