/**
 * Lectura de la planilla de carga del Estudio de Competitividad.
 *
 * Es la contraparte de `lib/planilla-competitividad`: lee el mismo archivo que
 * ese módulo genera. Las dos mitades tienen que moverse juntas, así que las
 * constantes de forma —qué columna es cuál, desde qué fila empiezan los datos—
 * viven una sola vez, en `lib/planilla-formato`.
 *
 * Esto corre EN EL NAVEGADOR, así que no puede importar ni el generador (trae
 * exceljs) ni `lib/estudio-cargos` (habla con Prisma). Por eso la forma y la
 * normalización de títulos viven en módulos propios y sin dependencias.
 *
 * Dos cosas no se le creen al archivo:
 *
 *  - el grado CAPRI, que en la planilla es una fórmula y por tanto se puede
 *    pisar; se recalcula con `lib/capri-evaluacion` a partir de las respuestas;
 *  - la configuración de cada elemento de pago (si es fijo o variable, su
 *    frecuencia, si impacta prestaciones), que sale de la hoja Configuracion y
 *    no de lo que alguien escriba en la fila.
 *
 * No importa exceljs: esto corre en el navegador, que ya tiene cargada `xlsx`.
 */
import * as XLSX from "xlsx";

import { gradoDesdeLaPlanilla, type Familia } from "@/lib/capri-evaluacion";
import type { ImportIssue } from "@/lib/import-cargos";
import {
  CABECERAS_BASE,
  HOJA_CATALOGO,
  HOJA_CONFIG,
  HOJA_INSTRUCCIONES,
  HOJA_METODOLOGIA,
  PRIMERA_COL_PAGO,
  PRIMERA_FILA,
} from "@/lib/planilla-formato";
import { normalizarTitulo } from "@/lib/texto";
import type { ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition, PaymentFrequency } from "@/types/salary";

/** Lo que la planilla ofrece en sus desplegables de moneda. */
const MONEDAS: Record<string, "USD" | "VES"> = {
  "usd": "USD", "us$": "USD", "dolares": "USD", "dólares": "USD", "$": "USD",
  "bs": "VES", "bs.": "VES", "ves": "VES", "bolivares": "VES", "bolívares": "VES",
};

const FRECUENCIAS: Record<string, PaymentFrequency> = {
  "quincenal": "biweekly",
  "mensual": "monthly",
  "bimestral": "bimonthly",
  "trimestral": "quarterly",
  "semestral": "semiannual",
  "anual": "annual",
};

/** La configuración de un elemento de pago, leída de la hoja Configuracion. */
type ConfigConcepto = {
  clase: "Fijo" | "Variable";
  tipoVariable: "performance" | "commission" | undefined;
  frecuencia: PaymentFrequency;
  impacto: boolean;
};

export type FilaPlanilla = {
  /** La fila del Excel, para poder señalarla en los avisos. */
  fila: number;
  ocupanteId: string;
  departamento: string;
  tituloCargo: string;
  reportaA: string;
  descripcion: string;
  /** El cargo del catálogo del corte con el que equivale; puede ir vacío. */
  homologado: string;
  /** El texto de la ruta y de las cinco variables, para recalcular del lado servidor. */
  ruta: string;
  variables: string[];
  hayGrade: number | null;
  capriFamily: Familia | null;
  data: Partial<ExtendedMarketPosition>;
};

export type ImportPlanilla = {
  filas: FilaPlanilla[];
  issues: ImportIssue[];
  filasLeidas: number;
  filasVacias: number;
  filasDescartadas: number;
  /** El nombre de la hoja de carga, para nombrarla en los mensajes. */
  hoja: string;
};

function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Admite "1.234,56" y "1,234.56": gana el último separador que aparezca.
  const crudo = String(v).replace(/[^\d,.-]/g, "");
  const ultimaComa = crudo.lastIndexOf(",");
  const ultimoPunto = crudo.lastIndexOf(".");
  const normal = ultimaComa > ultimoPunto
    ? crudo.replace(/\./g, "").replace(",", ".")
    : crudo.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

function moneda(v: unknown): "USD" | "VES" | undefined {
  return MONEDAS[texto(v).toLowerCase()] ?? undefined;
}

/**
 * Las filas de una hoja como matriz, SIEMPRE ancladas en A1.
 *
 * Sin esto, `sheet_to_json` empieza a contar donde empieza el contenido: si la
 * columna A está vacía, lo que el archivo tiene en B llega en el índice 0 y
 * todas las columnas quedan corridas una posición.
 */
function filasDeLaHoja(hoja: XLSX.WorkSheet): unknown[][] {
  const ref = hoja["!ref"];
  if (!ref) return [];
  const rango = XLSX.utils.decode_range(ref);
  rango.s.c = 0;
  rango.s.r = 0;
  return XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1, blankrows: true, defval: null, range: XLSX.utils.encode_range(rango),
  });
}

/**
 * La hoja donde está la data: la que tiene las cabeceras que escribimos. Se
 * busca por contenido y no por nombre porque la hoja se llama como la empresa.
 */
function hojaDeCarga(wb: XLSX.WorkBook): { nombre: string; filas: unknown[][] } | null {
  const conocidas = new Set([HOJA_INSTRUCCIONES, HOJA_CONFIG, HOJA_CATALOGO, HOJA_METODOLOGIA]);
  const candidatas = [
    ...wb.SheetNames.filter((n) => !conocidas.has(n)),
    ...wb.SheetNames.filter((n) => conocidas.has(n)),
  ];

  for (const nombre of candidatas) {
    const hoja = wb.Sheets[nombre];
    if (!hoja) continue;
    const filas = filasDeLaHoja(hoja);
    const primera = (filas[0] ?? []).map((c) => texto(c).toLowerCase());
    if (primera[0] === CABECERAS_BASE[0].toLowerCase()) return { nombre, filas };
  }
  return null;
}

/** Los elementos de pago declarados en la hoja Configuracion, por nombre. */
function configuracionDePagos(wb: XLSX.WorkBook): Map<string, ConfigConcepto> {
  const mapa = new Map<string, ConfigConcepto>();
  const hoja = wb.Sheets[HOJA_CONFIG];
  if (!hoja) return mapa;

  const filas = filasDeLaHoja(hoja);
  let dentro = false;
  for (const fila of filas) {
    const b = texto(fila?.[1]);
    if (!dentro) {
      if (b.toLowerCase() === "elemento de pago") dentro = true;
      continue;
    }
    if (!b) break;
    const clase = texto(fila?.[2]).toLowerCase().startsWith("var") ? "Variable" : "Fijo";
    const tipo = texto(fila?.[3]).toLowerCase();
    mapa.set(normalizarTitulo(b), {
      clase,
      tipoVariable: clase === "Variable"
        ? (tipo.includes("comis") ? "commission" : "performance")
        : undefined,
      frecuencia: FRECUENCIAS[texto(fila?.[4]).toLowerCase()] ?? "monthly",
      impacto: texto(fila?.[5]).toLowerCase().startsWith("s"),
    });
  }
  return mapa;
}

type Bloque = { concepto: string; col: number; config: ConfigConcepto };

const CONFIG_POR_DEFECTO: ConfigConcepto = {
  clase: "Fijo", tipoVariable: undefined, frecuencia: "monthly", impacto: false,
};

/** Los bloques de cuatro columnas que siguen a la columna M. */
function bloquesDePago(cabecera: unknown[], config: Map<string, ConfigConcepto>): Bloque[] {
  const bloques: Bloque[] = [];
  for (let col = PRIMERA_COL_PAGO - 1; col < cabecera.length; col += 4) {
    const concepto = texto(cabecera[col]);
    if (!concepto) continue;
    bloques.push({ concepto, col, config: config.get(normalizarTitulo(concepto)) ?? CONFIG_POR_DEFECTO });
  }
  return bloques;
}

/** Un grado escrito a mano en la columna L, si cae en la escala CAPRI. */
function gradoDelArchivo(v: unknown): number | null {
  const n = numero(v);
  if (n === null) return null;
  const entero = Math.round(n);
  return entero >= 8 && entero <= 25 ? entero : null;
}

/** Los dos conceptos que tienen campo propio en la ficha de un cargo. */
const SUELDO = normalizarTitulo("Sueldo Básico");
const ALIMENTACION = normalizarTitulo("Bono Alimentación");

export function parsePlanillaWorkbook(
  workbook: XLSX.WorkBook,
  opciones: { tasas: ExchangeRate[]; revenueUSD: string },
): ImportPlanilla {
  const issues: ImportIssue[] = [];
  const carga = hojaDeCarga(workbook);

  if (!carga) {
    return {
      filas: [], issues: [{
        fila: null, hoja: "", nivel: "error",
        mensaje: "El archivo no tiene la hoja de carga de la planilla. Descarga la planilla desde \"Bajar planilla\" y llena esa.",
      }],
      filasLeidas: 0, filasVacias: 0, filasDescartadas: 0, hoja: "",
    };
  }

  const { nombre: hoja, filas } = carga;
  const bloques = bloquesDePago(filas[0] ?? [], configuracionDePagos(workbook));
  const porTasa = new Map(opciones.tasas.map((t) => [normalizarTitulo(t.nombre), t.id]));

  const resultado: FilaPlanilla[] = [];
  const vistos = new Map<string, number>();
  let vacias = 0;
  let descartadas = 0;
  let leidas = 0;

  for (let i = PRIMERA_FILA - 1; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    const numeroDeFila = i + 1;
    if (fila.every((c) => texto(c) === "")) { vacias++; continue; }
    leidas++;

    const tituloCargo = texto(fila[2]);
    if (!tituloCargo) {
      issues.push({ fila: numeroDeFila, hoja, nivel: "error", mensaje: "La fila no dice el nombre del cargo." });
      descartadas++;
      continue;
    }

    const ocupanteId = texto(fila[0]);
    if (ocupanteId) {
      const previa = vistos.get(ocupanteId.toLowerCase());
      if (previa !== undefined) {
        issues.push({
          fila: numeroDeFila, hoja, nivel: "error",
          mensaje: `El identificador "${ocupanteId}" ya venía en la fila ${previa}. Cada ocupante necesita el suyo.`,
        });
        descartadas++;
        continue;
      }
      vistos.set(ocupanteId.toLowerCase(), numeroDeFila);
    }

    const ruta = texto(fila[5]);
    const variables = [0, 1, 2, 3, 4].map((k) => texto(fila[6 + k]));
    const capri = gradoDesdeLaPlanilla(ruta, variables, opciones.revenueUSD);

    // Sin ruta, vale lo que diga la columna de grado: así vuelve entero lo que
    // la planilla trajo precargado de una evaluación hecha en la plataforma.
    const gradoEscrito = capri ? null : gradoDelArchivo(fila[11]);

    if (ruta && !capri) {
      issues.push({
        fila: numeroDeFila, hoja, nivel: "aviso",
        mensaje: `"${ruta}" no es una de las rutas CAPRI: la fila entra sin grado.`,
      });
    } else if (capri && capri.grado === null) {
      issues.push({
        fila: numeroDeFila, hoja, nivel: "aviso",
        mensaje: `A "${tituloCargo}" le faltan las variables ${capri.faltan.join(", ")} de su ruta: entra sin grado.`,
      });
    }

    const data: ExtendedMarketPosition = {
      id: `plan-${Date.now()}-${i}`,
      departamento: texto(fila[1]),
      tituloCargo,
      additionalFixedPayments: [],
      additionalVariablePayments: [],
    };
    if (capri?.grado !== null && capri?.grado !== undefined) {
      data.hayGrade = capri.grado;
      data.capriFamily = capri.familia;
    } else if (gradoEscrito !== null) {
      data.hayGrade = gradoEscrito;
    }

    for (const bloque of bloques) {
      const monto = numero(fila[bloque.col]);
      if (monto === null || monto === 0) continue;

      const cuenta = moneda(fila[bloque.col + 1]) ?? "USD";
      const pago = moneda(fila[bloque.col + 2]) ?? cuenta;
      const nombreTasa = texto(fila[bloque.col + 3]);
      const tasaId = nombreTasa ? porTasa.get(normalizarTitulo(nombreTasa)) : undefined;

      if (nombreTasa && !tasaId) {
        issues.push({
          fila: numeroDeFila, hoja, nivel: "aviso",
          mensaje: `La tasa "${nombreTasa}" no está entre las tuyas: el monto de "${bloque.concepto}" se convierte con el BCV.`,
        });
      }

      const clave = normalizarTitulo(bloque.concepto);
      if (clave === SUELDO) {
        data.sueldoBasico = monto;
        data.sueldoBasicoFreq = bloque.config.frecuencia;
        data.sueldoBasicoCuentaMoneda = cuenta;
        data.sueldoBasicoMonedaPago = pago;
        data.sueldoBasicoImpacto = true;
        data.sueldoBasicoTasaId = tasaId ?? "";
      } else if (clave === ALIMENTACION) {
        data.bonoAlimentacion = monto;
        data.bonoAlimentacionFreq = bloque.config.frecuencia;
        data.bonoAlimentacionCuentaMoneda = cuenta;
        data.bonoAlimentacionMonedaPago = pago;
        data.bonoAlimentacionImpacto = bloque.config.impacto;
        data.bonoAlimentacionTasaId = tasaId ?? "";
      } else {
        const concepto: CompensationConcept = {
          id: `${clave}-${i}`,
          concept: bloque.concepto,
          amount: monto,
          freq: bloque.config.frecuencia,
          accountCurrency: cuenta,
          paymentCurrency: pago,
          impacto: bloque.config.impacto,
          tasaId: tasaId ?? "",
          ...(bloque.config.tipoVariable ? { variableType: bloque.config.tipoVariable } : {}),
        };
        if (bloque.config.clase === "Variable") data.additionalVariablePayments!.push(concepto);
        else data.additionalFixedPayments!.push(concepto);
      }
    }

    if (!data.sueldoBasico) {
      issues.push({
        fila: numeroDeFila, hoja, nivel: "aviso",
        mensaje: `"${tituloCargo}" viene sin sueldo básico: entra igual, pero no se va a poder comparar.`,
      });
    }

    resultado.push({
      fila: numeroDeFila,
      ocupanteId,
      departamento: texto(fila[1]),
      tituloCargo,
      reportaA: texto(fila[3]),
      descripcion: "",
      homologado: texto(fila[4]),
      ruta,
      variables,
      hayGrade: capri?.grado ?? gradoEscrito,
      capriFamily: capri?.familia ?? null,
      data,
    });
  }

  return { filas: resultado, issues, filasLeidas: leidas, filasVacias: vacias, filasDescartadas: descartadas, hoja };
}
