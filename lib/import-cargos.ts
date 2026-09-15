/**
 * Carga masiva de cargos desde Excel.
 *
 * Todo ocurre en el navegador: se genera la plantilla, se lee el archivo que
 * devuelve la empresa y se arma un `ExtendedMarketPosition` por fila. La
 * escritura se hace después con el mismo `PUT /api/workspace?companyId=…` que
 * usa la pantalla de Data, así que no hay una ruta nueva que pueda dejar la
 * data en un estado que el resto de la aplicación no entienda.
 *
 * Reglas que no son negociables (las impone el resto del sistema):
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
  filasDescartadas: number;
};

export const SHEET_CARGOS = "Cargos";
export const SHEET_ADICIONALES = "Pagos adicionales";
export const SHEET_TASAS = "Tasas";
export const SHEET_CATALOGO = "Catálogo del corte";
export const SHEET_INSTRUCCIONES = "Instrucciones";

const COL = {
  departamento: "Departamento",
  cargo: "Cargo",
  grado: "Grado CAPRI",
  familia: "Familia CAPRI",
  descripcion: "Descripción",
} as const;

/** Un bloque de columnas por concepto: monto, frecuencia, monedas, tasa e impacto. */
type ConceptBlock = {
  prefijo: string;
  campoMonto: keyof ExtendedMarketPosition;
  campoFreq: keyof ExtendedMarketPosition;
  campoCuenta: keyof ExtendedMarketPosition;
  campoPago: keyof ExtendedMarketPosition;
  campoImpacto: keyof ExtendedMarketPosition;
  /** Solo el sueldo y el bono de alimentación guardan una tasa propia. */
  campoTasa: keyof ExtendedMarketPosition | null;
  freqPorDefecto: PaymentFrequency;
  impactoPorDefecto: boolean;
};

const BLOQUES: ConceptBlock[] = [
  {
    prefijo: "Sueldo básico",
    campoMonto: "sueldoBasico", campoFreq: "sueldoBasicoFreq",
    campoCuenta: "sueldoBasicoCuentaMoneda", campoPago: "sueldoBasicoMonedaPago",
    campoImpacto: "sueldoBasicoImpacto", campoTasa: "sueldoBasicoTasaId",
    freqPorDefecto: "monthly", impactoPorDefecto: true,
  },
  {
    prefijo: "Bono alimentación",
    campoMonto: "bonoAlimentacion", campoFreq: "bonoAlimentacionFreq",
    campoCuenta: "bonoAlimentacionCuentaMoneda", campoPago: "bonoAlimentacionMonedaPago",
    campoImpacto: "bonoAlimentacionImpacto", campoTasa: "bonoAlimentacionTasaId",
    freqPorDefecto: "monthly", impactoPorDefecto: false,
  },
  {
    prefijo: "Bono movilización",
    campoMonto: "bonoMovilizacion", campoFreq: "bonoMovilizacionFreq",
    campoCuenta: "bonoMovilizacionCuentaMoneda", campoPago: "bonoMovilizacionMonedaPago",
    campoImpacto: "bonoMovilizacionImpacto", campoTasa: null,
    freqPorDefecto: "monthly", impactoPorDefecto: true,
  },
  {
    prefijo: "Bono desempeño",
    campoMonto: "bonoDesempeno", campoFreq: "bonoDesempenoFreq",
    campoCuenta: "bonoDesempenoCuentaMoneda", campoPago: "bonoDesempenoMonedaPago",
    campoImpacto: "bonoDesempenoImpacto", campoTasa: null,
    freqPorDefecto: "monthly", impactoPorDefecto: true,
  },
  {
    prefijo: "Comisiones",
    campoMonto: "comisiones", campoFreq: "comisionesFreq",
    campoCuenta: "comisionesCuentaMoneda", campoPago: "comisionesMonedaPago",
    campoImpacto: "comisionesImpacto", campoTasa: null,
    freqPorDefecto: "monthly", impactoPorDefecto: true,
  },
  {
    prefijo: "Otros pagos variables",
    campoMonto: "pagoVariableOtros", campoFreq: "pagoVariableOtrosFreq",
    campoCuenta: "pagoVariableOtrosCuentaMoneda", campoPago: "pagoVariableOtrosMonedaPago",
    campoImpacto: "pagoVariableOtrosImpacto", campoTasa: null,
    freqPorDefecto: "monthly", impactoPorDefecto: true,
  },
];

const SUF = {
  frecuencia: "Frecuencia",
  cuenta: "Moneda del monto",
  pago: "Moneda de pago",
  tasa: "Tasa",
  impacto: "Impacta prestaciones",
} as const;

function col(prefijo: string, sufijo: string) {
  return `${prefijo} - ${sufijo}`;
}

export const CARGOS_HEADERS: string[] = [
  COL.departamento, COL.cargo, COL.grado, COL.familia, COL.descripcion,
  ...BLOQUES.flatMap((b) => [
    b.prefijo,
    col(b.prefijo, SUF.frecuencia),
    col(b.prefijo, SUF.cuenta),
    col(b.prefijo, SUF.pago),
    ...(b.campoTasa ? [col(b.prefijo, SUF.tasa)] : []),
    col(b.prefijo, SUF.impacto),
  ]),
];

export const ADICIONALES_HEADERS = [
  "Cargo", "Clase", "Concepto", "Monto", "Frecuencia",
  "Moneda del monto", "Moneda de pago", "Tasa", "Impacta prestaciones", "Tipo de variable",
];

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

type CatalogIndex = Map<string, CatalogCargo[]>;

function buildCatalogIndex(catalogo: CatalogCargo[]): CatalogIndex {
  const map: CatalogIndex = new Map();
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
      rows: [], filasLeidas: 0, filasVacias: 0, filasDescartadas: 0,
      issues: [{ fila: null, hoja: SHEET_CARGOS, nivel: "error", mensaje: "El archivo no tiene ninguna hoja que se pueda leer." }],
    };
  }

  const catalogIndex = buildCatalogIndex(catalogo);
  const tasaIndex = buildTasaIndex(tasas);
  const registros = sheetToObjects(hojaCargos);

  const vistos = new Map<string, number>();
  const porCargo = new Map<string, ExtendedMarketPosition>();
  let filasVacias = 0;
  let descartadas = 0;

  registros.forEach((registro, idx) => {
    const fila = Number(registro.__fila) || idx + 2;

    if (esFilaVacia(registro)) { filasVacias++; return; }

    const tituloArchivo = text(pick(registro, COL.cargo));
    const deptArchivo = text(pick(registro, COL.departamento));

    if (!tituloArchivo) {
      // Una fila del catálogo que quedó sin llenar no es un error: se ignora.
      const tieneMontos = BLOQUES.some((b) => parseAmount(pick(registro, b.prefijo)).valor !== 0);
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

    const descripcion = text(pick(registro, COL.descripcion));
    if (descripcion) row.descripcion = descripcion;

    // Grado y familia CAPRI
    const gradoRaw = pick(registro, COL.grado);
    const gradoTexto = text(gradoRaw);
    if (gradoTexto) {
      const grado = Math.round(parseAmount(gradoRaw).valor);
      if (!Number.isFinite(grado) || grado < 8 || grado > 25) {
        issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `Grado CAPRI "${gradoTexto}" fuera del rango 8-25; la fila queda sin clasificar.` });
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
    } else {
      issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: "Sin grado CAPRI: la fila se carga, pero el corte no se puede enviar hasta clasificarla." });
    }

    const campos = row as unknown as Record<string, unknown>;

    // Conceptos
    for (const bloque of BLOQUES) {
      const montoRaw = pick(registro, bloque.prefijo);
      const { valor: monto, ambiguo } = parseAmount(montoRaw);
      if (ambiguo) {
        issues.push({
          fila, hoja: SHEET_CARGOS, nivel: "aviso",
          mensaje: `"${text(montoRaw)}" en ${bloque.prefijo} se leyó como ${monto}. Verifica si eran decimales.`,
        });
      }

      const freq = parseFrequency(pick(registro, col(bloque.prefijo, SUF.frecuencia)), bloque.freqPorDefecto);
      const cuenta = parseCurrency(pick(registro, col(bloque.prefijo, SUF.cuenta)), "USD");
      const pago = parseCurrency(pick(registro, col(bloque.prefijo, SUF.pago)), cuenta.valor);
      const impacto = parseBool(pick(registro, col(bloque.prefijo, SUF.impacto)), bloque.impactoPorDefecto);

      if (monto !== 0) {
        if (!freq.reconocido) issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `Frecuencia no reconocida en ${bloque.prefijo}; se usa Mensual.` });
        if (!cuenta.reconocido) issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `Moneda del monto no reconocida en ${bloque.prefijo}; se usa USD.` });
        if (!pago.reconocido) issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `Moneda de pago no reconocida en ${bloque.prefijo}; se usa la del monto.` });
        if (!impacto.reconocido) issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: `"Impacta prestaciones" no reconocido en ${bloque.prefijo}; se usa el valor por defecto.` });
      }

      campos[bloque.campoMonto] = monto;
      campos[bloque.campoFreq] = freq.valor;
      campos[bloque.campoCuenta] = cuenta.valor;
      campos[bloque.campoPago] = pago.valor;
      campos[bloque.campoImpacto] = impacto.valor;

      if (bloque.campoTasa) {
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

      // La tasa solo se aplica cuando el monto y el pago van en monedas distintas.
      if (monto !== 0 && cuenta.valor !== pago.valor && bloque.campoTasa === null) {
        issues.push({
          fila, hoja: SHEET_CARGOS, nivel: "aviso",
          mensaje: `${bloque.prefijo} tiene monedas distintas; la plataforma solo guarda tasa propia para el sueldo y el bono de alimentación, así que se convierte con el BCV.`,
        });
      }
    }

    if ((row.sueldoBasico ?? 0) <= 0) {
      issues.push({ fila, hoja: SHEET_CARGOS, nivel: "aviso", mensaje: "Sueldo básico en 0: la fila se carga, pero el corte no se puede enviar así." });
    }

    rows.push(row);
    porCargo.set(clave, row);
  });

  // ── Pagos adicionales ─────────────────────────────────────────────────────
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
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "error", mensaje: `No hay ninguna fila cargada para el cargo "${cargoTexto}"; el pago adicional se descarta.` });
        return;
      }
      if (!concepto) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "error", mensaje: "El pago adicional no tiene nombre de concepto." });
        return;
      }

      const { valor: monto } = parseAmount(pick(registro, "Monto"));
      if (monto === 0) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `"${concepto}" viene en 0; se descarta.` });
        return;
      }

      const clase = norm(pick(registro, "Clase"));
      const esVariable = clase.startsWith("var");
      const cuenta = parseCurrency(pick(registro, "Moneda del monto"), "USD");
      const pago = parseCurrency(pick(registro, "Moneda de pago"), cuenta.valor);
      const tasaTexto = text(pick(registro, "Tasa"));
      const tasa = tasaTexto ? tasaIndex.get(norm(tasaTexto)) : undefined;
      if (tasaTexto && !tasa) {
        issues.push({ fila, hoja: SHEET_ADICIONALES, nivel: "aviso", mensaje: `La tasa "${tasaTexto}" no está registrada; "${concepto}" se convierte con el BCV.` });
      }

      const tipoVariable = norm(pick(registro, "Tipo de variable"));
      const concepto_: CompensationConcept = {
        id: `imp-add-${Date.now()}-${idx}`,
        concept: concepto,
        amount: monto,
        freq: parseFrequency(pick(registro, "Frecuencia"), "monthly").valor,
        accountCurrency: cuenta.valor,
        paymentCurrency: pago.valor,
        impacto: parseBool(pick(registro, "Impacta prestaciones"), !esVariable).valor,
        tasaId: tasa?.id ?? "",
      };

      if (esVariable) {
        concepto_.variableType = tipoVariable.startsWith("comis") ? "commission" : "performance";
        destino.additionalVariablePayments = [...(destino.additionalVariablePayments ?? []), concepto_];
      } else {
        destino.additionalFixedPayments = [...(destino.additionalFixedPayments ?? []), concepto_];
      }
    });
  }

  return { rows, issues, filasLeidas: registros.length - filasVacias, filasVacias, filasDescartadas: descartadas };
}

// ── Generación de la plantilla ──────────────────────────────────────────────

function autoWidths(headers: string[], extra = 4): XLSX.ColInfo[] {
  return headers.map((h) => ({ wch: Math.min(38, Math.max(12, h.length + extra)) }));
}

export function buildTemplateWorkbook(options: {
  catalogo: CatalogCargo[];
  tasas: ExchangeRate[];
  nombreCorte: string;
  nombreEmpresa: string;
  prellenarCatalogo: boolean;
}): XLSX.WorkBook {
  const { catalogo, tasas, nombreCorte, nombreEmpresa, prellenarCatalogo } = options;
  const wb = XLSX.utils.book_new();

  const instrucciones: string[][] = [
    ["Carga de data salarial"],
    [],
    ["Corte", nombreCorte],
    ["Empresa", nombreEmpresa || "(indicar)"],
    [],
    ["Cómo se llena"],
    ["1", `Una fila por cargo en la hoja "${SHEET_CARGOS}".`],
    ["2", `El nombre del cargo debe ser exactamente uno de la hoja "${SHEET_CATALOGO}". Si no coincide, la fila no se carga.`],
    ["3", "Borra las filas de los cargos que la empresa no tiene. Las filas sin montos se ignoran."],
    ["4", "No repitas el mismo cargo dos veces."],
    ["5", "Los montos van como número, sin símbolos de moneda ni texto."],
    [],
    ["Qué hace falta para que el corte se pueda enviar"],
    ["", "Cargo del catálogo · Grado CAPRI (8 a 25) · Sueldo básico mayor que cero."],
    ["", "Todo lo demás es opcional: si falta, se carga igual y se completa después en la plataforma."],
    [],
    ["Moneda y tasa, concepto por concepto"],
    ["Moneda del monto", "La moneda en la que está escrito el número: USD o VES."],
    ["Moneda de pago", "La moneda en la que la persona efectivamente cobra: USD o VES."],
    ["Tasa", `Solo hace falta cuando las dos monedas son distintas. Escribe el nombre exacto de una tasa de la hoja "${SHEET_TASAS}". Si se deja vacía, se usa el BCV.`],
    ["", "Sueldo básico y bono de alimentación son los únicos conceptos que guardan tasa propia; el resto siempre se convierte con el BCV."],
    [],
    ["Impacta prestaciones"],
    ["", 'Sí / No. Indica si el concepto entra en el cálculo de prestaciones sociales.'],
    [],
    ["Valores admitidos"],
    ["Frecuencia", "Quincenal · Mensual · Bimestral · Trimestral · Semestral · Anual"],
    ["Moneda", "USD · VES"],
    ["Grado CAPRI", "Número entero del 8 al 25"],
    ["Familia CAPRI", "IC (individual, 8-19) · LO (liderazgo operativo, 14-16) · GE (liderazgo táctico/estratégico, 17-22) · EJ (ejecutiva, 23-25)"],
    ["", "La familia solo hace falta cuando el grado cae en un rango compartido (14-16 y 17-19). En el resto se deduce sola."],
    [],
    ["Pagos adicionales"],
    ["", `Conceptos fuera de los que ya trae la hoja "${SHEET_CARGOS}" (por ejemplo una prima de profesionalización) van en la hoja "${SHEET_ADICIONALES}", una fila por concepto, repitiendo el nombre del cargo.`],
    ["", 'La columna "Clase" dice si es Fijo o Variable.'],
  ];
  const wsInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInstrucciones["!cols"] = [{ wch: 22 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, SHEET_INSTRUCCIONES);

  const cuerpo = prellenarCatalogo
    ? catalogo.map((c) => {
        const fila: Record<string, string | number> = { [COL.departamento]: c.departamento, [COL.cargo]: c.tituloCargo };
        CARGOS_HEADERS.forEach((h) => { if (!(h in fila)) fila[h] = ""; });
        return CARGOS_HEADERS.map((h) => fila[h]);
      })
    : [];
  const wsCargos = XLSX.utils.aoa_to_sheet([CARGOS_HEADERS, ...cuerpo]);
  wsCargos["!cols"] = autoWidths(CARGOS_HEADERS);
  wsCargos["!freeze"] = { xSplit: "2", ySplit: "1" };
  XLSX.utils.book_append_sheet(wb, wsCargos, SHEET_CARGOS);

  const wsAdicionales = XLSX.utils.aoa_to_sheet([ADICIONALES_HEADERS]);
  wsAdicionales["!cols"] = autoWidths(ADICIONALES_HEADERS);
  XLSX.utils.book_append_sheet(wb, wsAdicionales, SHEET_ADICIONALES);

  const filasTasas = tasas.length > 0
    ? tasas.map((t) => [t.nombre || t.referencia || t.id, t.referencia, t.valor])
    : [[
        "Cada empresa define sus tasas en la plataforma, en Empresa → Tasas.",
        "",
        "Si la columna Tasa se deja vacía, la conversión se hace con el BCV del día del guardado.",
      ]];
  const wsTasas = XLSX.utils.aoa_to_sheet([["Nombre de la tasa", "Referencia", "Valor (Bs por 1 USD)"], ...filasTasas]);
  wsTasas["!cols"] = [{ wch: 62 }, { wch: 24 }, { wch: 78 }];
  XLSX.utils.book_append_sheet(wb, wsTasas, SHEET_TASAS);

  const wsCatalogo = XLSX.utils.aoa_to_sheet([
    ["Departamento", "Cargo"],
    ...catalogo.map((c) => [c.departamento, c.tituloCargo]),
  ]);
  wsCatalogo["!cols"] = [{ wch: 34 }, { wch: 52 }];
  XLSX.utils.book_append_sheet(wb, wsCatalogo, SHEET_CATALOGO);

  return wb;
}
