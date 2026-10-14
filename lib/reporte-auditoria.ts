/**
 * El Excel de control del suavizado.
 *
 * Tres pestañas, como las pidió AC Consulting (2026-10-14): la matriz cruda
 * que llegó del mercado, la que se le mostró al cliente, y la comparación
 * entre las dos en monto y en porcentaje. Más una cuarta con las series
 * puestas una al lado de la otra para graficarlas.
 *
 * Sirve para auditar, meses más tarde, si las líneas de tendencia estaban
 * ajustando bien y si el algoritmo necesita cambios. Para el cliente todo esto
 * es invisible: él solo ve la matriz final.
 */
import ExcelJS from "exceljs";

import { PERCENTILES, type Diagnostico, type FilaGrado, type Percentil } from "@/lib/suavizado-percentiles";

export type MetricaAuditada = string;

export type FichaAuditoria = {
  empresa: string;
  corte: string;
  grupoComparacion: string;
  /** La métrica que se publicó en el informe. */
  metrica: MetricaAuditada;
  generadoPor: string;
  fecha: Date;
};

const NOMBRE_METRICA: Record<string, string> = {
  sinPasivosMensual: "TEM",
  directoMensualizado: "TEMz",
  conPasivosMensual: "CIM",
  conPasivosAnual: "PCTA",
};

function cabecera(hoja: ExcelJS.Worksheet, titulo: string, ficha: FichaAuditoria) {
  hoja.addRow([titulo]).font = { bold: true, size: 14 };
  hoja.addRow([`${ficha.empresa} · ${ficha.corte}`]);
  hoja.addRow([`Grupo de comparación: ${ficha.grupoComparacion}`]);
  hoja.addRow([`Métrica del informe: ${NOMBRE_METRICA[ficha.metrica] ?? ficha.metrica}`]);
  hoja.addRow([`Generado por ${ficha.generadoPor || "—"} el ${ficha.fecha.toLocaleString("es-VE")}`]);
  hoja.addRow([]);
}

function estiloCabecera(fila: ExcelJS.Row) {
  fila.font = { bold: true };
  fila.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F6" } };
    celda.border = { bottom: { style: "thin", color: { argb: "FFBFCBD4" } } };
  });
}

function ordenarPorGrado(filas: FilaGrado[]): FilaGrado[] {
  return [...filas].sort((a, b) => b.grade - a.grade);
}

/** Una matriz grado × percentil, con una columna por métrica agrupada. */
function escribirMatriz(
  hoja: ExcelJS.Worksheet,
  diagnosticos: Record<string, Diagnostico>,
  cual: "cruda" | "procesada",
) {
  for (const [metrica, d] of Object.entries(diagnosticos)) {
    hoja.addRow([NOMBRE_METRICA[metrica] ?? metrica]).font = { bold: true };
    estiloCabecera(hoja.addRow(["Grado", ...PERCENTILES.map((p) => p.toUpperCase())]));

    for (const fila of ordenarPorGrado(d[cual])) {
      hoja.addRow([fila.grade, ...PERCENTILES.map((p) => fila[p] ?? "ND")]);
    }
    hoja.addRow([]);
  }
}

export async function construirReporteAuditoria(
  ficha: FichaAuditoria,
  diagnosticos: Record<string, Diagnostico>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Market Analyzer";
  wb.created = ficha.fecha;

  // ── 1. Data inicial ──
  const cruda = wb.addWorksheet("1 - Data inicial");
  cruda.columns = [{ width: 10 }, ...PERCENTILES.map(() => ({ width: 14 }))];
  cabecera(cruda, "Matriz cruda del mercado", ficha);
  cruda.addRow(["Tal como salió del corte, con sus huecos y sus cruces."]).font = { italic: true };
  cruda.addRow([]);
  escribirMatriz(cruda, diagnosticos, "cruda");

  // ── 2. Data entregada ──
  const procesada = wb.addWorksheet("2 - Data entregada");
  procesada.columns = [{ width: 10 }, ...PERCENTILES.map(() => ({ width: 14 }))];
  cabecera(procesada, "Matriz suavizada", ficha);
  procesada.addRow(["La que vio el cliente: ordenada, suavizada e imputada."]).font = { italic: true };
  procesada.addRow([]);
  escribirMatriz(procesada, diagnosticos, "procesada");

  // ── 3. Análisis de ajustes ──
  const deltas = wb.addWorksheet("3 - Análisis de ajustes");
  deltas.columns = [{ width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }];
  cabecera(deltas, "Qué cambió el suavizado", ficha);

  for (const [metrica, d] of Object.entries(diagnosticos)) {
    deltas.addRow([NOMBRE_METRICA[metrica] ?? metrica]).font = { bold: true };

    const ajuste = d.columnas.map((c) =>
      `${c.percentil.toUpperCase()}: ${c.puntos} puntos`
      + (c.r2 !== null ? `, R²=${c.r2.toFixed(4)}` : "")
      + (c.motivo ? ` (sin suavizar: ${c.motivo})` : ""),
    ).join(" · ");
    deltas.addRow([ajuste]).font = { italic: true, size: 9 };
    deltas.addRow([
      `Grados reordenados: ${d.filasReordenadas} · celdas imputadas: ${d.celdasImputadas} · celdas suavizadas: ${d.celdasSuavizadas}`,
    ]).font = { italic: true, size: 9 };

    estiloCabecera(deltas.addRow(["Grado", "Percentil", "Inicial", "Final", "Diferencia", "Variación", "Qué pasó"]));

    const porGrado = new Map(d.procesada.map((f) => [f.grade, f]));
    for (const fila of ordenarPorGrado(d.cruda)) {
      const final = porGrado.get(fila.grade);
      for (const p of PERCENTILES as readonly Percentil[]) {
        const antes = fila[p];
        const despues = final?.[p] ?? null;
        if (antes === null && despues === null) continue;

        const diferencia = antes !== null && despues !== null ? despues - antes : null;
        const variacion = antes !== null && despues !== null && antes !== 0 ? despues / antes - 1 : null;
        const quePaso = antes === null ? "Imputado" : despues === null ? "Descartado" : diferencia === 0 ? "Sin cambio" : "Suavizado";

        const r = deltas.addRow([
          fila.grade, p.toUpperCase(),
          antes ?? "ND", despues ?? "ND",
          diferencia ?? "—", variacion ?? "—", quePaso,
        ]);
        if (variacion !== null) r.getCell(6).numFmt = "0.0%";
        if (quePaso === "Imputado") r.getCell(7).font = { color: { argb: "FF9A6B00" } };
      }
    }
    deltas.addRow([]);
  }

  // ── 4. Series para las gráficas ──
  // Cruda y suavizada enfrentadas por percentil, listas para seleccionar y
  // graficar. La librería con la que se arma este archivo no sabe crear
  // gráficas nativas de Excel; mientras tanto, los datos quedan puestos.
  const series = wb.addWorksheet("4 - Series de control");
  series.columns = [{ width: 10 }, ...PERCENTILES.flatMap(() => [{ width: 14 }, { width: 14 }])];
  cabecera(series, "Línea de mercado: cruda contra suavizada", ficha);
  series.addRow(["Selecciona un bloque y inserta un gráfico de líneas para ver las dos curvas."]).font = { italic: true };
  series.addRow([]);

  for (const [metrica, d] of Object.entries(diagnosticos)) {
    series.addRow([NOMBRE_METRICA[metrica] ?? metrica]).font = { bold: true };
    estiloCabecera(series.addRow([
      "Grado",
      ...PERCENTILES.flatMap((p) => [`${p.toUpperCase()} cruda`, `${p.toUpperCase()} suavizada`]),
    ]));

    const porGrado = new Map(d.procesada.map((f) => [f.grade, f]));
    for (const fila of ordenarPorGrado(d.cruda)) {
      const final = porGrado.get(fila.grade);
      series.addRow([
        fila.grade,
        ...PERCENTILES.flatMap((p) => [fila[p] ?? null, final?.[p] ?? null]),
      ]);
    }
    series.addRow([]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
