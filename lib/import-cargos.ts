/**
 * Carga masiva de cargos desde Excel.
 *
 * La plantilla se genera en el servidor (`/api/admin/import-template`) y el
 * archivo que devuelve la empresa se lee aquí, en el navegador. La escritura
 * reutiliza `PUT /api/workspace?companyId=…`, el mismo camino que usa la
 * pantalla de Data, así que no hay una ruta nueva que pueda dejar la data en un
 * estado que el resto de la aplicación no entienda.
 *
 * La plantilla solo pide lo que la pantalla de Data deja editar por cargo. Todo
 * lo que la página fija o no muestra se quedó fuera a propósito:
 *
 *  - La frecuencia del sueldo y del bono de alimentación es siempre mensual, y
 *    su impacto en prestaciones está fijo (sí para el sueldo, no para el bono).
 *  - `bonoMovilizacion`, `bonoDesempeno`, `comisiones` y `pagoVariableOtros`
 *    suman en los totales pero NO tienen interfaz: cargarlos ahí dejaría dinero
 *    que la empresa no puede ver ni corregir. Esos conceptos van por la hoja de
 *    pagos adicionales, que sí se ve y se edita.
 *
 * Reglas que impone el resto del sistema:
 *  - El par (departamento, cargo) tiene que existir en el catálogo del corte.
 *    Si no existe, la pantalla de Data borra la fila la próxima vez que la
 *    empresa entra — ver el efecto de `snapshot-cargos` en data/page.tsx.
 *  - No puede repetirse el mismo cargo dos veces en la misma empresa; el
 *    servidor rechaza el guardado completo.
 *  - Sin grado CAPRI o con sueldo básico en 0 la fila se guarda, pero el corte
 *    no se puede enviar hasta completarla.
 */
import * as XLSX from "xlsx";

import type { ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";

export type CatalogCargo = { departamento: string; tituloCargo: string };

export type ImportIssue = {
  fila: number | null;
  hoja: string;
  nivel: "error" | "aviso";
  mensaje: string;
};

export type ParsedImport = {
  rows: ExtendedMarketPosition[];
  issues: ImportIssue[];
  filasLeidas: number;
  filasVacias: number;
  /** Filas del catálogo que venían en la plantilla y la empresa no llenó. */
  filasSinLlenar: number;
  filasDescartadas: number;
  /** Tasas declaradas en el archivo que la empresa todavía no tiene registradas. */
  tasasNuevas: ExchangeRate[];
};

export const SHEET_CARGOS = "Cargos";
export const SHEET_ADICIONALES = "Otros pagos";
export const SHEET_TASAS = "Tasas";
export const SHEET_CATALOGO = "Catálogo del corte";
export const SHEET_INSTRUCCIONES = "Instrucciones";
export const SHEET_LISTAS = "Listas";

export const COL = {
  departamento: "Departamento",
  cargo: "Cargo",
  grado: "Grado CAPRI",
  familia: "Familia CAPRI",
} as const;

export const SUF = {
  cuenta: "Moneda del monto",
  pago: "Moneda de pago",
  tasa: "Tasa",
} as const;

export function col(prefijo: string, sufijo: string) {
  return `${prefijo} - ${sufijo}`;
}

/**
 * Los dos únicos conceptos con columnas propias, porque son los dos que la
 * pantalla de Data muestra fijos para cada cargo. Su frecuencia y su impacto
 * en prestaciones no se piden: la página los tiene bloqueados.
 */
type ConceptBlock = {
  prefijo: string;
  campoMonto: "sueldoBasico" | "bonoAlimentacion";
  campoFreq: "sueldoBasicoFreq" | "bonoAlimentacionFreq";
  campoCuenta: "sueldoBasicoCuentaMoneda" | "bonoAlimentacionCuentaMoneda";
  campoPago: "sueldoBasicoMonedaPago" | "bonoAlimentacionMonedaPago";
  campoImpacto: "sueldoBasicoImpacto" | "bonoAlimentacionImpacto";
  campoTasa: "sueldoBasicoTasaId" | "bonoAlimentacionTasaId";
  impactoFijo: boolean;
};

const BLOQUES: ConceptBlock[] = [
  {
    prefijo: "Sueldo básico",
    campoMonto: "sueldoBasico", campoFreq: "sueldoBasicoFreq",
    campoCuenta: "sueldoBasicoCuentaMoneda", campoPago: "sueldoBasicoMonedaPago",
    campoImpacto: "sueldoBasicoImpacto", campoTasa: "sueldoBasicoTasaId",
    impactoFijo: true,
  },
  {
    prefijo: "Bono alimentación",
    campoMonto: "bonoAlimentacion", campoFreq: "bonoAlimentacionFreq",
    campoCuenta: "bonoAlimentacionCuentaMoneda", campoPago: "bonoAlimentacionMonedaPago",
    campoImpacto: "bonoAlimentacionImpacto", campoTasa: "bonoAlimentacionTasaId",
    impactoFijo: false,
  },
];

export const CARGOS_HEADERS: string[] = [
  COL.departamento, COL.cargo, COL.grado, COL.familia,
  ...BLOQUES.flatMap((b) => [b.prefijo, col(b.prefijo, SUF.cuenta), col(b.prefijo, SUF.pago), col(b.prefijo, SUF.tasa)]),
];

export const TASAS_HEADERS = ["Nombre de la tasa", "Referencia", "Valor (Bs por 1 USD)"];

/** Tope de tasas propias por empresa, igual que el formulario de Empresa. */
export const MAX_TASAS_EMPRESA = 5;

export const ADICIONALES_HEADERS = [
  "Cargo", "Clase", "Concepto", "Monto", "Frecuencia",
  "Moneda del monto", "Moneda de pago", "Tasa", "Impacta prestaciones", "Tipo de variable",
];

/** Listas que la plantilla ofrece como desplegable. */
export const OPCIONES = {
  moneda: ["USD", "VES"],
  clase: ["Fijo", "Variable"],
  tipoVariable: ["Desempeño", "Comisión"],
  familia: ["IC", "LO", "GE", "EJ"],
  referencia: ["Tasa BCV (Bs./USD)", "Tasa BCV (Bs./EUR)", "Tasa de Referencia Externa"],
  siNo: ["Sí", "No"],
  /** El concepto fijo no admite quincenal; el variable sí. */
  frecuenciaFija: ["Mensual", "Bimestral", "Trimestral", "Semestral", "Anual"],
  frecuenciaVariable: ["Quincenal", "Mensual", "Bimestral", "Trimestral", "Semestral", "Anual"],
} as const;

// ── Normalización de valores ────────────────────────────────────────────────

/** Sin acentos, en minúsculas y con cualquier guion tratado igual. */
function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Acepta el número tal cual viene de Excel y, si llega como texto, intenta
 * leerlo con separadores en cualquiera de los dos formatos. Con un solo
 * separador seguido de exactamente tres dígitos se asume separador de miles
 * ("1.500" son mil quinientos, no uno coma cinco).
 */
export function parseAmount(value: unknown): { valor: number; ambiguo: boolean } {
  if (value === null || value === undefined || value === "") return { valor: 0, ambiguo: false };
  if (typeof value === "number") return { valor: Number.isFinite(value) ? value : 0, ambiguo: false };

  const raw = String(value).trim();
  if (!raw) return { valor: 0, ambiguo: false };

  const limpio = raw.replace(/[^\d.,-]/g, "");
  if (!limpio || !/\d/.test(limpio)) return { valor: 0, ambiguo: false };

  const negativo = limpio.startsWith("-");
  const cuerpo = limpio.replace(/-/g, "");
  const puntos = (cuerpo.match(/\./g) ?? []).length;
  const comas = (cuerpo.match(/,/g) ?? []).length;

  let normalizado: string;
  let ambiguo = false;

  if (puntos > 0 && comas > 0) {
    const decimal = cuerpo.lastIndexOf(".") > cuerpo.lastIndexOf(",") ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    normalizado = cuerpo.split(miles).join("").replace(decimal, ".");
  } else if (puntos + comas === 0) {
    normalizado = cuerpo;
  } else if (puntos + comas > 1) {
    normalizado = cuerpo.replace(/[.,]/g, "");
  } else {
    const sep = puntos === 1 ? "." : ",";
    const decimales = cuerpo.length - cuerpo.indexOf(sep) - 1;
    if (decimales === 3) {
      normalizado = cuerpo.replace(sep, "");
      ambiguo = true;
    } else {
      normalizado = cuerpo.replace(sep, ".");
    }
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return { valor: 0, ambiguo: false };
  return { valor: negativo ? -n : n, ambiguo };
}

const FREQ_ALIAS: Record<string, PaymentFrequency> = {
  quincenal: "biweekly", biweekly: "biweekly", quincena: "biweekly",
  mensual: "monthly", monthly: "monthly", mes: "monthly",
  bimestral: "bimonthly", bimonthly: "bimonthly",
  trimestral: "quarterly", quarterly: "quarterly",
  semestral: "semiannual", semiannual: "semiannual",
  anual: "annual", annual: "annual", ano: "annual", yearly: "annual",
};

export function parseFrequency(value: unknown, porDefecto: PaymentFrequency): { valor: PaymentFrequency; reconocido: boolean } {
  const key = norm(value);
  if (!key) return { valor: porDefecto, reconocido: true };
  const found = FREQ_ALIAS[key];
  return found ? { valor: found, reconocido: true } : { valor: porDefecto, reconocido: false };
}

const VES_ALIAS = new Set(["ves", "bs", "bs.", "bss", "bs.s", "bsd", "bolivar", "bolivares", "vef", "bolivar soberano"]);
const USD_ALIAS = new Set(["usd", "$", "us$", "dolar", "dolares", "dolar americano", "usd$"]);

export function parseCurrency(value: unknown, porDefecto: "USD" | "VES"): { valor: "USD" | "VES"; reconocido: boolean } {
  const key = norm(value);
  if (!key) return { valor: porDefecto, reconocido: true };
  if (VES_ALIAS.has(key)) return { valor: "VES", reconocido: true };
  if (USD_ALIAS.has(key)) return { valor: "USD", reconocido: true };
  return { valor: porDefecto, reconocido: false };
}

const BOOL_TRUE = new Set(["si", "s", "yes", "y", "true", "verdadero", "1", "x", "si aplica"]);
const BOOL_FALSE = new Set(["no", "n", "false", "falso", "0", "-"]);

export function parseBool(value: unknown, porDefecto: boolean): { valor: boolean; reconocido: boolean } {
  if (typeof value === "boolean") return { valor: value, reconocido: true };
  const key = norm(value);
  if (!key) return { valor: porDefecto, reconocido: true };
  if (BOOL_TRUE.has(key)) return { valor: true, reconocido: true };
  if (BOOL_FALSE.has(key)) return { valor: false, reconocido: true };
  return { valor: porDefecto, reconocido: false };
}

/** Rangos de grado por familia, iguales a los que aplica el asistente CAPRI. */
const FAMILIA_RANGOS: Array<{ familia: "IC" | "LO" | "GE" | "EJ"; min: number; max: number }> = [
  { familia: "IC", min: 8, max: 19 },
  { familia: "LO", min: 14, max: 16 },
  { familia: "GE", min: 17, max: 22 },
  { familia: "EJ", min: 23, max: 25 },
];

const FAMILIA_ALIAS: Record<string, "IC" | "LO" | "GE" | "EJ"> = {
  ic: "IC", a: "IC", individual: "IC", "ruta individual": "IC",
  lo: "LO", b: "LO", "liderazgo operativo": "LO",
  ge: "GE", c: "GE", "liderazgo tactico y estrategico": "GE", gerencial: "GE",
  ej: "EJ", d: "EJ", ejecutiva: "EJ", ejecutivo: "EJ", "alta direccion": "EJ",
};

export function familiasPosibles(grado: number): Array<"IC" | "LO" | "GE" | "EJ"> {
  return FAMILIA_RANGOS.filter((r) => grado >= r.min && grado <= r.max).map((r) => r.familia);
}

// ── Lectura del archivo ─────────────────────────────────────────────────────

function sheetToObjects(sheet: XLSX.WorkSheet): Array<Record<string, unknown>> {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (matrix.length === 0) return [];

  // La fila de encabezados es la primera que trae al menos dos celdas con texto,
  // así una empresa puede dejar un título o un logo encima de la tabla.
  let headerIndex = 0;
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const filled = (matrix[i] ?? []).filter((c) => text(c).length > 0).length;
    if (filled >= 2) { headerIndex = i; break; }
  }

  const headers = (matrix[headerIndex] ?? []).map((c) => norm(c));
  return matrix.slice(headerIndex + 1).map((rowArr, idx) => {
    const obj: Record<string, unknown> = { __fila: headerIndex + idx + 2 };
    headers.forEach((h, i) => { if (h) obj[h] = rowArr?.[i] ?? ""; });
    return obj;
  });
}

function pick(row: Record<string, unknown>, header: string): unknown {
  return row[norm(header)];
}

function esFilaVacia(row: Record<string, unknown>): boolean {
  return Object.entries(row).every(([k, v]) => k === "__fila" || text(v).length === 0);
}

function buildCatalogIndex(catalogo: CatalogCargo[]): Map<string, CatalogCargo[]> {
  const map = new Map<string, CatalogCargo[]>();
  for (const c of catalogo) {
    const key = norm(c.tituloCargo);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(c); else map.set(key, [c]);
  }
  return map;
}

function buildTasaIndex(tasas: ExchangeRate[]): Map<string, ExchangeRate> {
  const map = new Map<string, ExchangeRate>();
  for (const t of tasas) {
    for (const alias of [t.nombre, t.referencia, t.id]) {
      const key = norm(alias);
      if (key && !map.has(key)) map.set(key, t);
    }
  }
  return map;
}

/**
 * Lee la hoja de tasas. Es aditiva a propósito: si la empresa ya tiene una tasa
 * con ese nombre, se respeta la suya y solo se avisa cuando el valor difiere.
 * Nunca se le pisa un número que ella cargó.
 */
function parseTasasSheet(
  workbook: XLSX.WorkBook,
  existentes: ExchangeRate[],
  issues: ImportIssue[],
): ExchangeRate[] {
  const hoja = workbook.Sheets[SHEET_TASAS];
  if (!hoja) return [];

  const porNombre = new Map(existentes.map((t) => [norm(t.nombre || t.referencia), t]));
  const nuevas: ExchangeRate[] = [];
  let cupo = MAX_TASAS_EMPRESA - existentes.length;

  sheetToObjects(hoja).forEach((registro, idx) => {
    const fila = Number(registro.__fila) || idx + 2;
    if (esFilaVacia(registro)) return;

    const nombre = text(pick(registro, "Nombre de la tasa"));
    const valorTexto = text(pick(registro, "Valor (Bs por 1 USD)"));
    if (!nombre && !valorTexto) return;

    if (!nombre) {
      issues.push({ fila, hoja: SHEET_TASAS, nivel: "error", mensaje: "La tasa no tiene nombre; se descarta." });
      return;
    }

    const { valor } = parseAmount(pick(registro, "Valor (Bs por 1 USD)"));
    if (valor <= 0) {
      issues.push({ fila, hoja: SHEET_TASAS, nivel: "error", mensaje: `La tasa "${nombre}" no tiene un valor mayor que cero; se descarta.` });
      return;
    }

    const clave = norm(nombre);
    const yaExiste = porNombre.get(clave);
    if (yaExiste) {
      if (Number(yaExiste.valor) !== valor) {
        issues.push({
          fila, hoja: SHEET_TASAS, nivel: "aviso",
          mensaje: `La empresa ya tiene la tasa "${nombre}" en ${yaExiste.valor}; se respeta la suya y se ignora el ${valor} del archivo.`,
        });
      }
      return;
    }

    if (nuevas.some((t) => norm(t.nombre) === clave)) {
      issues.push({ fila, hoja: SHEET_TASAS, nivel: "aviso", mensaje: `La tasa "${nombre}" viene repetida; se usa la primera.` });
      return;
    }

    if (cupo <= 0) {
      issues.push({
        fila, hoja: SHEET_TASAS, nivel: "error",
        mensaje: `La empresa no puede tener más de ${MAX_TASAS_EMPRESA} tasas propias; "${nombre}" no se crea.`,
      });
      return;
    }

    const referenciaTexto = text(pick(registro, "Referencia"));
    const referencia = OPCIONES.referencia.find((r) => norm(r) === norm(referenciaTexto)) ?? "Tasa de Referencia Externa";
    if (referenciaTexto && norm(referencia) !== norm(referenciaTexto)) {
      issues.push({ fila, hoja: SHEET_TASAS, nivel: "aviso", mensaje: `Referencia "${referenciaTexto}" no reconocida en "${nombre}"; se usa "${referencia}".` });
    }

    nuevas.push({ id: `t-${Date.now()}-${idx}`, nombre, referencia, valor: String(valor) });
    cupo--;
  });

  return nuevas;
}

export function parseCargosWorkbook(
  workbook: XLSX.WorkBook,
  catalogo: CatalogCargo[],
  tasas: ExchangeRate[],
): ParsedImport {
  const issues: ImportIssue[] = [];
  const rows: ExtendedMarketPosition[] = [];

  const hojaCargos = workbook.Sheets[SHEET_CARGOS] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!hojaCargos) {
    return {
      rows: [], filasLeidas: 0, filasVacias: 0, filasSinLlenar: 0, filasDescartadas: 0, tasasNuevas: [],
      issues: [{ fila: null, hoja: SHEET_CARGOS, nivel: "error", mensaje: "El archivo no tiene ninguna hoja que se pueda leer." }],
    };
  }

  const catalogIndex = buildCatalogIndex(catalogo);
  // Las tasas del archivo se leen primero: un concepto puede apuntar a una que
  // todavía no existe en la plataforma y que esta misma carga va a crear.
  const tasasNuevas = parseTasasSheet(workbook, tasas, issues);
  const tasaIndex = buildTasaIndex([...tasas, ...tasasNuevas]);
  const registros = sheetToObjects(hojaCargos);

  const vistos = new Map<string, number>();
  const porCargo = new Map<string, ExtendedMarketPosition>();
  let filasVacias = 0;
  let sinLlenar = 0;
  let descartadas = 0;

  registros.forEach((registro, idx) => {
    const fila = Number(registro.__fila) || idx + 2;

    if (esFilaVacia(registro)) { filasVacias++; return; }

    const tituloArchivo = text(pick(registro, COL.cargo));
    const deptArchivo = text(pick(registro, COL.departamento));
    const gradoRaw = pick(registro, COL.grado);
    const gradoTexto = text(gradoRaw);
    const tieneMontos = BLOQUES.some((b) => parseAmount(pick(registro, b.prefijo)).valor !== 0);

    // La plantilla se descarga con los cargos del catálogo ya escritos. Las que
    // la empresa no llenó traen departamento y cargo pero nada más: son filas
    // que sobraron, no cargos en cero.
    if (tituloArchivo && !tieneMontos && !gradoTexto) { sinLlenar++; return; }

    if (!tituloArchivo) {
      if (!tieneMontos) { filasVacias++; return; }
      issues.push({ fila, hoja: SHEET_CARGOS, nivel: "error", mensaje: "Tiene montos pero no dice a qué cargo pertenece." });
      descartadas++;
      return;
    }

    const candidatos = catalogIndex.get(norm(tituloArchivo)) ?? [];
    if (candidatos.length === 0) {
      issues.push({
        fila, hoja: SHEET_CARGOS, nivel: "error",
        mensaje: `El cargo "${tituloArchivo}" no está en el catálogo del corte. Si se carga así, la plataforma lo borra cuando la empresa abra su Data.`,
      });
      descartadas++;
      return;
    }

    let cargo = candidatos[0];
    if (candidatos.length > 1) {
      const match = candidatos.find((c) => norm(c.departamento) === norm(deptArchivo));
      if (!match) {
        issues.push({
          fila, hoja: SHEET_CARGOS, nivel: "error",
          mensaje: `"${tituloArchivo}" existe en varios departamentos del catálogo (${candidatos.map((c) => c.departamento).join(", ")}). Indica cuál en la columna Departamento.`,
        });
        descartadas++;
        return;
      }
      cargo = match;
    } else if (deptArchivo && norm(deptArchivo) !== norm(cargo.departamento)) {
      issues.push({
        fila, hoja: SHEET_CARGOS, nivel: "aviso",
        mensaje: `El departamento del archivo ("${deptArchivo}") no coincide con el del catálogo; se usa "${cargo.departamento}".`,
      });
    }

    const clave = norm(cargo.tituloCargo);
    const filaPrevia = vistos.get(clave);
    if (filaPrevia !== undefined) {
      issues.push({
        fila, hoja: SHEET_CARGOS, nivel: "error",
        mensaje: `"${cargo.tituloCargo}" ya venía en la fila ${filaPrevia}. La plataforma no acepta el mismo cargo dos veces en una empresa.`,
      });
      descartadas++;
      return;
    }
    vistos.set(clave, fila);

    const row: ExtendedMarketPosition = {
      id: `imp-${Date.now()}-${idx}`,
      departamento: cargo.departamento,
      tituloCargo: cargo.tituloCargo,
      additionalFixedPayments: [],
      additionalVariablePayments: [],
    };

    // Grado y familia CAPRI
    if (gradoTexto) {
      const grado = Math.round(parseAmount(gradoRaw).valor);
      if (!Number.isFinite(grado) || grado < 8 || grado > 25) {
        issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `Grado CAPRI "${gradoTexto}" fuera del rango 8-25; se ignora.` });
      } else {
        row.hayGrade = grado;
        const familiaTexto = norm(pick(registro, COL.familia));
        const posibles = familiasPosibles(grado);
        const declarada = familiaTexto ? FAMILIA_ALIAS[familiaTexto] : undefined;

        if (declarada && posibles.includes(declarada)) {
          row.capriFamily = declarada;
        } else if (declarada) {
          issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `La familia ${declarada} no aplica al grado ${grado}; se deja sin familia.` });
        } else if (posibles.length === 1) {
          row.capriFamily = posibles[0];
        } else if (posibles.length > 1) {
          issues.push({
            fila, hoja: SHEET_CARGOS, nivel: "aviso",
            mensaje: `El grado ${grado} puede ser ${posibles.join(" o ")}. Sin la familia, el cargo no aparece en el gráfico por nivel del dashboard.`,
          });
        }
      }
    }

    const campos = row as unknown as Record<string, unknown>;

    for (const bloque of BLOQUES) {
      const montoRaw = pick(registro, bloque.prefijo);
      const { valor: monto, ambiguo } = parseAmount(montoRaw);
      if (ambiguo) {
        issues.push({
          fila, hoja: SHEET_CARGOS, nivel: "aviso",
          mensaje: `"${text(montoRaw)}" en ${bloque.prefijo} se leyó como ${monto}. Verifica si eran decimales.`,
        });
      }

      const cuenta = parseCurrency(pick(registro, col(bloque.prefijo, SUF.cuenta)), "USD");
      const pago = parseCurrency(pick(registro, col(bloque.prefijo, SUF.pago)), cuenta.valor);

      if (monto !== 0) {
        if (!cuenta.reconocido) issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `Moneda del monto no reconocida en ${bloque.prefijo}; se usa USD.` });
        if (!pago.reconocido) issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `Moneda de pago no reconocida en ${bloque.prefijo}; se usa la del monto.` });
      }

      campos[bloque.campoMonto] = monto;
      campos[bloque.campoCuenta] = cuenta.valor;
      campos[bloque.campoPago] = pago.valor;
      // La página tiene estos dos bloqueados; se escriben igual que ella.
      campos[bloque.campoFreq] = "monthly" satisfies PaymentFrequency;
      campos[bloque.campoImpacto] = bloque.impactoFijo;

      const tasaTexto = text(pick(registro, col(bloque.prefijo, SUF.tasa)));
      let tasaId = "";
      if (tasaTexto) {
        const tasa = tasaIndex.get(norm(tasaTexto));
        if (tasa) {
          tasaId = tasa.id;
        } else if (monto !== 0) {
          issues.push({
            fila, hoja: SHEET_CARGOS, nivel: "aviso",
            mensaje: `La tasa "${tasaTexto}" no está registrada en la empresa; ${bloque.prefijo} se convierte con el BCV.`,
          });
        }
      }
      campos[bloque.campoTasa] = tasaId;
    }

    if ((row.sueldoBasico ?? 0) <= 0) {
      issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: "Sueldo básico en 0: la fila se carga, pero el corte no se puede enviar así." });
    }

    rows.push(row);
    porCargo.set(clave, row);
  });

  // ── Otros pagos ───────────────────────────────────────────────────────────
  const hojaAdicionales = workbook.Sheets[SHEET_ADICIONALES];
  if (hojaAdicionales) {
    sheetToObjects(hojaAdicionales).forEach((registro, idx) => {
      const fila = Number(registro.__fila) || idx + 2;
      if (esFilaVacia(registro)) return;

      const cargoTexto = text(pick(registro, "Cargo"));
      const concepto = text(pick(registro, "Concepto"));
      if (!cargoTexto && !concepto) return;

      const destino = porCargo.get(norm(cargoTexto));
      if (!destino) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "error", mensaje: `No hay ninguna fila cargada para el cargo "${cargoTexto}"; el pago se descarta.` });
        return;
      }
      if (!concepto) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "error", mensaje: "El pago no tiene nombre de concepto." });
        return;
      }

      const { valor: monto, ambiguo } = parseAmount(pick(registro, "Monto"));
      if (monto === 0) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `"${concepto}" viene en 0; se descarta.` });
        return;
      }
      if (ambiguo) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `El monto de "${concepto}" se leyó como ${monto}. Verifica si eran decimales.` });
      }

      const claseTexto = norm(pick(registro, "Clase"));
      const esVariable = claseTexto.startsWith("var");
      if (claseTexto && !esVariable && !claseTexto.startsWith("fij")) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `Clase "${text(pick(registro, "Clase"))}" no reconocida en "${concepto}"; se toma como Fijo.` });
      }

      const cuenta = parseCurrency(pick(registro, "Moneda del monto"), "USD");
      const pago = parseCurrency(pick(registro, "Moneda de pago"), cuenta.valor);
      const tasaTexto = text(pick(registro, "Tasa"));
      const tasa = tasaTexto ? tasaIndex.get(norm(tasaTexto)) : undefined;
      if (tasaTexto && !tasa) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `La tasa "${tasaTexto}" no está registrada; "${concepto}" se convierte con el BCV.` });
      }

      const freq = parseFrequency(pick(registro, "Frecuencia"), "monthly");
      if (!freq.reconocido) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `Frecuencia no reconocida en "${concepto}"; se usa Mensual.` });
      }
      // La página no ofrece quincenal para los conceptos fijos.
      let frecuencia = freq.valor;
      if (!esVariable && frecuencia === "biweekly") {
        frecuencia = "monthly";
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `"${concepto}" es un pago fijo y la plataforma no admite frecuencia quincenal ahí; se usa Mensual.` });
      }

      const nuevo: CompensationConcept = {
        id: `imp-add-${Date.now()}-${idx}`,
        concept: concepto,
        amount: monto,
        freq: frecuencia,
        accountCurrency: cuenta.valor,
        paymentCurrency: pago.valor,
        impacto: parseBool(pick(registro, "Impacta prestaciones"), false).valor,
        tasaId: tasa?.id ?? "",
      };

      if (esVariable) {
        const tipoTexto = norm(pick(registro, "Tipo de variable"));
        if (tipoTexto.startsWith("comis")) {
          nuevo.variableType = "commission";
          nuevo.commissionType = "simple";
          nuevo.calculationDetail = "sale_value";
          nuevo.goalsTarget = "sales_quota";
        } else {
          nuevo.variableType = "performance";
          if (!tipoTexto) {
            issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `"${concepto}" es variable y no dice si es por desempeño o por comisión; se toma como Desempeño.` });
          } else if (!tipoTexto.startsWith("desemp")) {
            issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `Tipo de variable "${text(pick(registro, "Tipo de variable"))}" no reconocido en "${concepto}"; se toma como Desempeño.` });
          }
        }
        destino.additionalVariablePayments = [...(destino.additionalVariablePayments ?? []), nuevo];
      } else {
        destino.additionalFixedPayments = [...(destino.additionalFixedPayments ?? []), nuevo];
      }
    });
  }

  return {
    rows, issues,
    filasLeidas: registros.length - filasVacias - sinLlenar,
    filasVacias, filasSinLlenar: sinLlenar, filasDescartadas: descartadas,
    tasasNuevas,
  };
}
