/**
 * Carga de ocupantes del Estudio Especializado desde Excel.
 *
 * Hasta ahora la lista de "Mis cargos" solo se podía llenar a mano, uno por
 * uno. Para una empresa de doscientas personas eso no es una opción, y el CEO
 * pidió la carga por archivo (2026-10-14).
 *
 * Se parece al importador de la captura de mercado y comparte con él todo lo
 * que se puede —montos, monedas, tasas, grados— pero no es el mismo:
 *
 *  - la fila es la PERSONA, no el cargo, así que el mismo título puede
 *    repetirse tantas veces como ocupantes tenga;
 *  - lleva identificador de ocupante y a quién reporta, que el otro no tiene;
 *  - los cargos son los de la empresa, no los del catálogo del corte: la
 *    homologación con el mercado se hace después y por separado.
 */
import * as XLSX from "xlsx";

import {
  BLOQUES,
  COL,
  SUF,
  aplicarBloques,
  aplicarGrado,
  buildTasaIndex,
  col,
  esFilaVacia,
  parseTasasSheet,
  pick,
  sheetToObjects,
  text,
  type ImportIssue,
} from "@/lib/import-cargos";
import type { ExchangeRate } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";

export const HOJA_OCUPANTES = "Ocupantes";

/** Las columnas propias del Estudio Especializado. */
export const COL_OCUPANTE = "Ocupante / ID";
export const COL_REPORTA = "A quién reporta";
export const COL_UNIDAD = "Unidad funcional";
export const COL_DESCRIPCION = "Descripción del cargo";

export const OCUPANTES_HEADERS: string[] = [
  COL_OCUPANTE,
  COL_UNIDAD,
  COL_REPORTA,
  COL.cargo,
  COL_DESCRIPCION,
  COL.grado,
  COL.familia,
  ...BLOQUES.flatMap((b) => [b.prefijo, col(b.prefijo, SUF.cuenta), col(b.prefijo, SUF.pago), col(b.prefijo, SUF.tasa)]),
];

export type OcupanteImportado = {
  ocupanteId: string;
  departamento: string;
  reportaA: string;
  tituloCargo: string;
  descripcion: string;
  hayGrade: number | null;
  capriFamily: string | null;
  data: Partial<ExtendedMarketPosition>;
};

export type ImportOcupantes = {
  filas: OcupanteImportado[];
  issues: ImportIssue[];
  filasLeidas: number;
  filasVacias: number;
  filasDescartadas: number;
  tasasNuevas: ExchangeRate[];
};

export function parseOcupantesWorkbook(workbook: XLSX.WorkBook, tasas: ExchangeRate[]): ImportOcupantes {
  const issues: ImportIssue[] = [];
  const filas: OcupanteImportado[] = [];

  const hoja = workbook.Sheets[HOJA_OCUPANTES] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!hoja) {
    return {
      filas: [], filasLeidas: 0, filasVacias: 0, filasDescartadas: 0, tasasNuevas: [],
      issues: [{ fila: null, hoja: HOJA_OCUPANTES, nivel: "error", mensaje: "El archivo no tiene ninguna hoja que se pueda leer." }],
    };
  }

  // Las tasas del archivo se leen primero: un concepto puede apuntar a una que
  // todavía no existe en la plataforma.
  const tasasNuevas = parseTasasSheet(workbook, tasas, issues);
  const tasaIndex = buildTasaIndex([...tasas, ...tasasNuevas]);

  const registros = sheetToObjects(hoja);
  // El identificador de ocupante, cuando se usa, no se puede repetir.
  const vistos = new Map<string, number>();
  let filasVacias = 0;
  let descartadas = 0;

  registros.forEach((registro, idx) => {
    const fila = Number(registro.__fila) || idx + 2;
    if (esFilaVacia(registro)) { filasVacias++; return; }

    const tituloCargo = text(pick(registro, COL.cargo)).replace(/\s+/g, " ").trim();
    if (!tituloCargo) {
      issues.push({ fila, hoja: HOJA_OCUPANTES, nivel: "error", mensaje: "La fila no dice a qué cargo pertenece." });
      descartadas++;
      return;
    }

    const ocupanteId = text(pick(registro, COL_OCUPANTE)).replace(/\s+/g, " ").trim();
    if (ocupanteId) {
      const previa = vistos.get(ocupanteId.toLowerCase());
      if (previa !== undefined) {
        issues.push({
          fila, hoja: HOJA_OCUPANTES, nivel: "error",
          mensaje: `El identificador "${ocupanteId}" ya venía en la fila ${previa}. Cada ocupante necesita el suyo.`,
        });
        descartadas++;
        return;
      }
      vistos.set(ocupanteId.toLowerCase(), fila);
    }

    const row: ExtendedMarketPosition = {
      id: `imp-${Date.now()}-${idx}`,
      departamento: text(pick(registro, COL_UNIDAD)).replace(/\s+/g, " ").trim(),
      tituloCargo,
      additionalFixedPayments: [],
      additionalVariablePayments: [],
    };

    aplicarGrado(registro, row, issues, fila, HOJA_OCUPANTES);
    aplicarBloques(registro, row, tasaIndex, issues, fila, HOJA_OCUPANTES);

    if ((row.sueldoBasico ?? 0) <= 0) {
      issues.push({
        fila, hoja: HOJA_OCUPANTES, nivel: "aviso",
        mensaje: `"${tituloCargo}" viene con sueldo básico en 0: entra igual, pero no se va a poder comparar.`,
      });
    }

    filas.push({
      ocupanteId,
      departamento: row.departamento ?? "",
      reportaA: text(pick(registro, COL_REPORTA)).replace(/\s+/g, " ").trim(),
      tituloCargo,
      descripcion: text(pick(registro, COL_DESCRIPCION)).trim(),
      hayGrade: row.hayGrade ?? null,
      capriFamily: row.capriFamily ?? null,
      data: row,
    });
  });

  return {
    filas,
    issues,
    filasLeidas: registros.length,
    filasVacias,
    filasDescartadas: descartadas,
    tasasNuevas,
  };
}

/** El libro vacío que la empresa descarga para llenar. */
export function plantillaOcupantes(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const instrucciones = [
    ["Carga de ocupantes — Estudio Especializado"],
    [],
    ["Una fila por PERSONA, no por cargo: si tres personas tienen el mismo título, van tres filas."],
    ["El identificador de ocupante es opcional, pero si lo usas no puede repetirse."],
    ["El grado CAPRI va del 8 al 25. Si lo dejas vacío, el cargo se puede homologar igual por nombre."],
    ["Los montos van en la moneda que indiques en su columna de moneda; sin indicarla se asume USD."],
    ["Las columnas de tasa son para tus tasas propias; vacías, el monto se convierte con el BCV."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instrucciones), "Instrucciones");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([OCUPANTES_HEADERS]), HOJA_OCUPANTES);

  return wb;
}
