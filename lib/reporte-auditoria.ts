/**
 * El Excel de control del suavizado.
 *
 * Tres pestañas, como las pidió AC Consulting (2026-10-14): la matriz cruda
 * que llegó del mercado, la que se le mostró al cliente, y la comparación
 * entre las dos en monto y en porcentaje. Más una cuarta con las gráficas de
 * control: por cada métrica, las cinco líneas crudas contra las cinco
 * suavizadas, superpuestas.
 *
 * Sirve para auditar, meses más tarde, si las líneas de tendencia estaban
 * ajustando bien y si el algoritmo necesita cambios. Para el cliente todo esto
 * es invisible: él solo ve la matriz final.
 */
import ExcelJS from "exceljs";

import { inyectarGraficas, type Grafica } from "@/lib/graficas-excel";
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

/** Un color por percentil. Cruda y suavizada comparten color y se distinguen
 *  por el trazo, que es lo que deja compararlas de un vistazo. */
const COLOR_PERCENTIL: Record<string, string> = {
  p90: "1B4965",
  p75: "2E8BA6",
  p50: "3E8E7E",
  p25: "C28A2B",
  p10: "A4505A",
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

/** "A", "B", … hasta donde llegan las columnas de la hoja de series. */
const COLUMNAS = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));

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
  series.addRow(["Cada percentil lleva su color; la línea punteada es la cruda y la continua la suavizada."]).font = { italic: true };
  series.addRow([]);

  const graficas: Grafica[] = [];

  for (const [metrica, d] of Object.entries(diagnosticos)) {
    series.addRow([NOMBRE_METRICA[metrica] ?? metrica]).font = { bold: true };
    estiloCabecera(series.addRow([
      "Grado",
      ...PERCENTILES.flatMap((p) => [`${p.toUpperCase()} cruda`, `${p.toUpperCase()} suavizada`]),
    ]));

    const primeraFila = series.rowCount + 1;
    const porGrado = new Map(d.procesada.map((f) => [f.grade, f]));
    for (const fila of ordenarPorGrado(d.cruda)) {
      const final = porGrado.get(fila.grade);
      series.addRow([
        fila.grade,
        ...PERCENTILES.flatMap((p) => [fila[p] ?? null, final?.[p] ?? null]),
      ]);
    }
    const ultimaFila = series.rowCount;

    if (ultimaFila >= primeraFila) {
      graficas.push({
        titulo: `${NOMBRE_METRICA[metrica] ?? metrica} · línea de mercado cruda contra suavizada`,
        hoja: series.name,
        categorias: `$A$${primeraFila}:$A$${ultimaFila}`,
        series: PERCENTILES.flatMap((p, i) => {
          // Cada percentil ocupa dos columnas: la cruda y la suavizada.
          const colCruda = COLUMNAS[1 + i * 2];
          const colSuave = COLUMNAS[2 + i * 2];
          return [
            {
              nombre: `${p.toUpperCase()} cruda`, color: COLOR_PERCENTIL[p], punteada: true,
              rango: `$${colCruda}$${primeraFila}:$${colCruda}$${ultimaFila}`,
            },
            {
              nombre: `${p.toUpperCase()} suavizada`, color: COLOR_PERCENTIL[p],
              rango: `$${colSuave}$${primeraFila}:$${colSuave}$${ultimaFila}`,
            },
          ];
        }),
        // A la derecha de la tabla, a la altura de su bloque.
        ancla: { col: 12, fila: primeraFila - 2 },
        tamano: { cols: 9, filas: Math.max(16, ultimaFila - primeraFila + 3) },
      });
    }

    // Aire para que la gráfica del bloque siguiente no se monte sobre esta.
    for (let i = 0; i < 4; i++) series.addRow([]);
  }

  const libro = Buffer.from(await wb.xlsx.writeBuffer());
  // La hoja de series es la cuarta del libro.
  return inyectarGraficas(libro, 4, graficas);
}
