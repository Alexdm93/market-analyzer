/**
 * La planilla de carga del Estudio de Competitividad.
 *
 * AC Consulting mantenía esta planilla como un `.xlsm`: el cliente llenaba una
 * hoja de configuración y una macro le armaba la hoja de carga. Acá se genera
 * ya armada, por dos razones (2026-10-17):
 *
 *  - un archivo con macros descargado de internet llega bloqueado por Excel y
 *    no corre en Excel Web ni en Numbers, así que la mitad de los clientes
 *    nunca vería la hoja que la macro debía crear;
 *  - todo lo que la macro calculaba ya lo sabemos acá: la estructura de
 *    compensación de la empresa, sus tasas, el catálogo del corte y las reglas
 *    CAPRI. No hay nada que el archivo tenga que averiguar solo.
 *
 * Lo que sí se conserva es la forma: las mismas hojas, las mismas columnas y
 * las mismas listas desplegables encadenadas, para que quien ya usaba la
 * planilla no tenga que reaprenderla.
 *
 * El grado CAPRI lo calcula una fórmula dentro del archivo para que el cliente
 * lo vea mientras llena, pero al importar se vuelve a calcular acá con
 * `lib/capri-evaluacion`: la fórmula es una comodidad, no la fuente.
 */
import ExcelJS from "exceljs";

import { CAPRI_ROLES } from "@/lib/capri";
import {
  CABECERAS_BASE,
  COL_GRADO,
  COL_ROL,
  FILAS_PLANILLA,
  HOJA_CATALOGO,
  HOJA_CONFIG,
  HOJA_INSTRUCCIONES,
  HOJA_METODOLOGIA,
  HOJA_SYS,
  MONEDAS,
  PRIMERA_COL_PAGO,
  PRIMERA_FILA,
  SUBCOLUMNAS_PAGO,
} from "@/lib/planilla-formato";
import type { ExtendedMarketPosition } from "@/types/salary";
import {
  FACT_RULES,
  Q,
  RUTAS,
  columnasDeLaFamilia,
  revenueToIndex,
  type Familia,
} from "@/lib/capri-evaluacion";

export type ConceptoPlanilla = {
  nombre: string;
  clase: "Fijo" | "Variable";
  tipoVariable: string;
  frecuencia: string;
  impacto: string;
};

export type TasaPlanilla = { nombre: string; referencia: string; valor: string };

/** Un pago ya cargado, listo para escribirse en el bloque de su concepto. */
export type PagoPrecargado = {
  concepto: string;
  monto: number | null;
  cuenta: string;
  pago: string;
  tasa: string;
};

export type OcupantePrecargado = {
  ocupanteId: string;
  departamento: string;
  tituloCargo: string;
  reportaA: string;
  homologado: string;
  /** El grado que ya tiene en la plataforma, si lo tiene. */
  grado: number | null;
  pagos: PagoPrecargado[];
};

export type DatosPlanilla = {
  empresa: string;
  corte: string;
  diasBonoVacacional: string;
  diasUtilidades: string;
  /** El tramo tal como lo eligió la empresa ("c. Entre 5MM USD hasta 15MM USD"). */
  facturacion: string;
  conceptos: ConceptoPlanilla[];
  tasas: TasaPlanilla[];
  catalogo: Array<{ departamento: string; tituloCargo: string }>;
  ocupantes: OcupantePrecargado[];
};

// ─── Fórmulas ────────────────────────────────────────────────────────────────

function letra(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** CHOOSE sobre el número con el que empieza la opción elegida. */
function elige(col: string, fila: number, valores: number[]): string {
  return `CHOOSE(LEFT($${col}${fila},1),${valores.join(",")})`;
}

/** El ajuste por presupuesto y tamaño de equipo, igual que en el asistente. */
function ajuste(a: string, b: string, fila: number): string {
  const suma = `(LEFT($${a}${fila},1)*1+LEFT($${b}${fila},1)*1)`;
  return `IF(${suma}<=2,-1,IF(${suma}<=5,0,IF(${suma}<=8,1,IF(${suma}<=11,2,3))))`;
}

function valores(familia: Familia, i: number): number[] {
  return Q[familia][i].options.map((o) => o.value);
}

/**
 * El grado CAPRI de una fila. Es la misma cuenta que hace `calcGrade`, escrita
 * en Excel: pesos para la ruta individual, promedio para las demás, el ajuste
 * por magnitud donde aplica, el recorte por familia y el tope del tramo de
 * facturación de la empresa.
 */
export function formulaGrado(fila: number, tope: number): string {
  const ic = `MAX(8,MIN(19,ROUND(${elige("G", fila, valores("IC", 0))}*0.3+${elige("H", fila, valores("IC", 1))}*0.3`
    + `+${elige("I", fila, valores("IC", 2))}*0.2+${elige("J", fila, valores("IC", 3))}*0.2,0)))`;
  const lo = `MAX(14,MIN(16,ROUND((${elige("G", fila, valores("LO", 0))}+${elige("H", fila, valores("LO", 1))})/2,0)))`;
  const ge = `MAX(17,MIN(22,ROUND((${elige("G", fila, valores("GE", 0))}+${elige("H", fila, valores("GE", 1))}`
    + `+${elige("I", fila, valores("GE", 2))})/3+${ajuste("J", "K", fila)},0)))`;
  const ej = `MAX(23,MIN(25,ROUND((${elige("G", fila, valores("EJ", 0))}+${elige("H", fila, valores("EJ", 1))})/2`
    + `+${ajuste("I", "J", fila)},0)))`;

  const [ri, rlo, rge, rej] = RUTAS.map((r) => r.etiqueta);
  const cadena = `IF($F${fila}="${ri}",${ic},IF($F${fila}="${rlo}",${lo},`
    + `IF($F${fila}="${rge}",${ge},IF($F${fila}="${rej}",${ej},""))))`;

  return `IFERROR(MIN(${tope},${cadena}),"")`;
}

/** El rol que le corresponde al grado, con los nombres de `lib/capri`. */
export function formulaRol(fila: number): string {
  const roles = Object.keys(CAPRI_ROLES)
    .map(Number)
    .sort((a, b) => a - b)
    .map((g) => `"${CAPRI_ROLES[g].rol.replace(/"/g, '""')}"`);
  return `IF($L${fila}="","",IFERROR(CHOOSE($L${fila}-7,${roles.join(",")}),""))`;
}


/** Cómo se escribe en la planilla cada moneda que la plataforma sabe guardar. */
export function monedaDePlanilla(c: "USD" | "VES" | undefined): string {
  if (c === "USD") return "USD";
  if (c === "VES") return "Bs.";
  return "";
}

/**
 * Los pagos de un ocupante con el nombre del concepto que les puso la empresa,
 * para escribirlos en el bloque de columnas que les toca.
 */
export function pagosDelOcupante(
  data: Partial<ExtendedMarketPosition>,
  opciones: {
    /** El nombre de una tasa propia de la empresa, o "" si no la encuentra. */
    nombreDeLaTasa: (id: string | undefined) => string;
    /** Con qué se convierte cuando el concepto no eligió tasa propia. */
    tasaPorDefecto: string;
  },
): PagoPrecargado[] {
  const pagos: PagoPrecargado[] = [];

  const agregar = (
    concepto: string,
    monto: number | undefined,
    cuenta: "USD" | "VES" | undefined,
    pago: "USD" | "VES" | undefined,
    tasaId: string | undefined,
  ) => {
    if (!concepto || !monto) return;
    const cuentaTexto = monedaDePlanilla(cuenta) || "USD";
    const pagoTexto = monedaDePlanilla(pago) || cuentaTexto;

    // La tasa solo existe cuando se cobra en una moneda y se paga en otra.
    // Si el concepto no eligió una propia, la plataforma convierte con el BCV
    // —el selector lo dice así, "Sin tasa (BCV)"— y la planilla tiene que
    // mostrar esa, no una celda vacía (AC Consulting, 2026-10-17).
    const tasa = cuentaTexto === pagoTexto
      ? ""
      : opciones.nombreDeLaTasa(tasaId) || opciones.tasaPorDefecto;

    pagos.push({ concepto, monto, cuenta: cuentaTexto, pago: pagoTexto, tasa });
  };

  agregar("Sueldo Básico", data.sueldoBasico, data.sueldoBasicoCuentaMoneda, data.sueldoBasicoMonedaPago, data.sueldoBasicoTasaId);
  agregar("Bono Alimentación", data.bonoAlimentacion, data.bonoAlimentacionCuentaMoneda, data.bonoAlimentacionMonedaPago, data.bonoAlimentacionTasaId);

  for (const lista of [data.additionalFixedPayments, data.additionalVariablePayments]) {
    for (const c of lista ?? []) {
      agregar((c.concept ?? "").trim(), c.amount, c.accountCurrency, c.paymentCurrency, c.tasaId);
    }
  }

  return pagos;
}

// ─── Armado del libro ────────────────────────────────────────────────────────

/**
 * Las validaciones por rango existen en exceljs pero no en sus tipos, y
 * ponerlas celda por celda escribiría una entrada por celda en el XML.
 */
type HojaConValidaciones = ExcelJS.Worksheet & {
  dataValidations: { add(rango: string, validacion: ExcelJS.DataValidation): void };
};

const AZUL = "FF1B4965";
const AZUL_CLARO = "FFDCE7EE";
const GRIS = "FFF1F4F7";

function cabecera(celda: ExcelJS.Cell, fondo = AZUL, color = "FFFFFFFF") {
  celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fondo } };
  celda.font = { bold: true, color: { argb: color }, size: 10 };
  celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  celda.border = {
    top: { style: "thin", color: { argb: "FFB9C6D0" } },
    left: { style: "thin", color: { argb: "FFB9C6D0" } },
    bottom: { style: "thin", color: { argb: "FFB9C6D0" } },
    right: { style: "thin", color: { argb: "FFB9C6D0" } },
  };
}

/** El nombre de la hoja de carga: el de la empresa, podado a lo que Excel admite. */
export function nombreDeLaHoja(empresa: string): string {
  const limpio = empresa.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim();
  return (limpio || "Carga de Data").slice(0, 31);
}

export async function generarPlanilla(d: DatosPlanilla): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Market Analyzer";
  wb.created = new Date();
  // El archivo sale sin valores calculados: sin esto Excel muestra las celdas
  // de grado vacías hasta que alguien toque algo.
  wb.calcProperties.fullCalcOnLoad = true;

  const tramo = revenueToIndex(d.facturacion);
  const regla = FACT_RULES[tramo] ?? FACT_RULES[7];

  armarInstrucciones(wb, d, regla);
  const filaPrimeraTasa = armarConfiguracion(wb, d);
  armarCatalogo(wb, d);
  armarMetodologia(wb);
  armarSys(wb);
  armarCarga(wb, d, regla.max);

  definirNombres(wb, d, filaPrimeraTasa, regla.ej);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function armarInstrucciones(
  wb: ExcelJS.Workbook,
  d: DatosPlanilla,
  regla: { ej: boolean; max: number; label: string },
) {
  const ws = wb.addWorksheet(HOJA_INSTRUCCIONES, { views: [{ showGridLines: false }] });
  ws.getColumn(2).width = 110;

  const lineas: Array<[string, string]> = [
    ["titulo", `Planilla de carga — Estudio de Competitividad`],
    ["sub", `${d.empresa} · ${d.corte}`],
    ["", ""],
    ["h", "1. Qué trae ya resuelto este archivo"],
    ["p", `La hoja "${HOJA_CONFIG}" viene con tu estructura de compensación, tus días de bono vacacional y utilidades, tu tramo de facturación y tus tasas, tal como los tienes cargados en la sección Empresas de la plataforma. Si algo de eso cambió, actualízalo allá y vuelve a descargar la planilla: editarlo acá no lo cambia en la plataforma.`],
    ["p", `La hoja "${HOJA_CATALOGO}" trae el catálogo completo del corte seleccionado, que es contra lo que se compara tu nómina.`],
    ["", ""],
    ["h", `2. Dónde se carga la data: la hoja "${nombreDeLaHoja(d.empresa)}"`],
    ["p", "Una fila por PERSONA, no por cargo: si tres personas tienen el mismo título, van tres filas. Los datos empiezan en la fila 3."],
    ["p", "Columnas A a E — identificación: ID del ocupante (opcional, pero si lo usas no puede repetirse), unidad funcional, nombre del cargo tal como lo llamas tú, supervisor inmediato y, si ya lo sabes, el cargo del catálogo con el que equivale."],
    ["p", "El cargo homologado es opcional: puedes dejarlo vacío en todas las filas o en algunas, y completarlo después en la plataforma."],
    ["", ""],
    ["h", "3. Evaluación CAPRI (columnas F a K)"],
    ["p", "Elige primero la Ruta CAPRI en la columna F. Las columnas G a K se abren entonces con las preguntas de esa ruta; las que esa ruta no usa quedan sin opciones y se dejan vacías."],
    ["p", `Tu tramo de facturación (${regla.label}) ${regla.ej ? "habilita las cuatro rutas" : "no habilita la Ruta Ejecutiva / Alta Dirección"} y topa el grado en ${regla.max}.`],
    ["p", `La hoja "${HOJA_METODOLOGIA}" explica qué significa cada opción.`],
    ["", ""],
    ["h", "4. Grado y Rol (columnas L y M)"],
    ["p", "Se calculan solos a medida que eliges las variables. No los escribas a mano: si la fila ya trae un grado, es el que esa persona tiene evaluado en la plataforma."],
    ["", ""],
    ["h", "5. Compensación (desde la columna N)"],
    ["p", "Un bloque de cuatro columnas por cada elemento de pago de tu estructura: monto, moneda en la que está expresado, moneda en la que se paga y, solo si las dos monedas son distintas, con qué tasa lo conviertes. Si las dos monedas son la misma, la tasa se deja vacía."],
    ["", ""],
    ["h", "6. Al terminar"],
    ["p", `Guarda el archivo y súbelo en "Mis cargos". Se vuelve a validar todo del lado de la plataforma, así que si algo quedó mal te lo decimos fila por fila. El tope son ${FILAS_PLANILLA} ocupantes por archivo.`],
  ];

  lineas.forEach(([tipo, texto], i) => {
    const celda = ws.getCell(`B${i + 2}`);
    celda.value = texto;
    if (tipo === "titulo") celda.font = { bold: true, size: 16, color: { argb: AZUL } };
    else if (tipo === "sub") celda.font = { size: 11, color: { argb: "FF5B6B78" } };
    else if (tipo === "h") celda.font = { bold: true, size: 12, color: { argb: AZUL } };
    else celda.alignment = { wrapText: true, vertical: "top" };
    if (tipo === "p") ws.getRow(i + 2).height = 30;
  });
}

/** Devuelve la fila donde arranca el listado de tasas, para el nombre ListaTasas. */
function armarConfiguracion(wb: ExcelJS.Workbook, d: DatosPlanilla): number {
  const ws = wb.addWorksheet(HOJA_CONFIG, { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 26;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 18;

  ws.getCell("B2").value = "Configuración de la empresa";
  ws.getCell("B2").font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.getCell("B3").value = "Viene de tu ficha en la plataforma. Para cambiarla, actualízala en la sección Empresas.";
  ws.getCell("B3").font = { size: 10, italic: true, color: { argb: "FF5B6B78" } };

  const datos: Array<[string, string]> = [
    ["Nombre de la Empresa:", d.empresa],
    ["Días Bono Vacacional:", d.diasBonoVacacional],
    ["Días Utilidades:", d.diasUtilidades],
    ["Facturación Anual (USD):", d.facturacion],
    ["Corte de referencia:", d.corte],
  ];
  datos.forEach(([etiqueta, valor], i) => {
    const fila = 5 + i;
    ws.getCell(`B${fila}`).value = etiqueta;
    ws.getCell(`B${fila}`).font = { bold: true, size: 10 };
    ws.getCell(`C${fila}`).value = valor;
    ws.getCell(`C${fila}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
  });

  const filaCabeceraPagos = 5 + datos.length + 1;
  ["Elemento de Pago", "Tipo de Elemento", "Tipo de Variable", "Frecuencia", "Impacto Salarial"]
    .forEach((t, i) => {
      const celda = ws.getCell(filaCabeceraPagos, 2 + i);
      celda.value = t;
      cabecera(celda);
    });

  d.conceptos.forEach((c, i) => {
    const fila = filaCabeceraPagos + 1 + i;
    [c.nombre, c.clase, c.tipoVariable, c.frecuencia, c.impacto].forEach((v, j) => {
      const celda = ws.getCell(fila, 2 + j);
      celda.value = v;
      celda.alignment = { vertical: "middle" };
    });
  });

  const filaCabeceraTasas = filaCabeceraPagos + d.conceptos.length + 3;
  ["Nombre de la tasa", "Referencia", "Valor (Bs. por 1 unidad)"].forEach((t, i) => {
    const celda = ws.getCell(filaCabeceraTasas, 2 + i);
    celda.value = t;
    cabecera(celda);
  });

  d.tasas.forEach((t, i) => {
    const fila = filaCabeceraTasas + 1 + i;
    ws.getCell(fila, 2).value = t.nombre;
    ws.getCell(fila, 3).value = t.referencia;
    ws.getCell(fila, 4).value = t.valor;
  });

  return filaCabeceraTasas + 1;
}

function armarCatalogo(wb: ExcelJS.Workbook, d: DatosPlanilla) {
  const ws = wb.addWorksheet(HOJA_CATALOGO, { views: [{ state: "frozen", ySplit: 3 }] });
  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 62;

  ws.getCell("A1").value = `Catálogo del corte: ${d.corte}`;
  ws.getCell("A1").font = { bold: true, size: 13, color: { argb: AZUL } };
  ws.getCell("A2").value = "Estos son los cargos contra los que se compara. Úsalos en la columna \"Cargo Homologado\".";
  ws.getCell("A2").font = { size: 10, italic: true, color: { argb: "FF5B6B78" } };

  ["Departamento", "Cargo"].forEach((t, i) => {
    const celda = ws.getCell(3, 1 + i);
    celda.value = t;
    cabecera(celda);
  });

  d.catalogo.forEach((c, i) => {
    const fila = 4 + i;
    ws.getCell(fila, 1).value = c.departamento;
    ws.getCell(fila, 2).value = c.tituloCargo;
  });
}

/**
 * La metodología sale de las mismas preguntas que usa el asistente, así que no
 * puede quedar describiendo una versión vieja del modelo.
 */
function armarMetodologia(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(HOJA_METODOLOGIA, { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 46;
  ws.getColumn(3).width = 90;

  ws.getCell("B2").value = "Metodología CAPRI 2.0";
  ws.getCell("B2").font = { bold: true, size: 14, color: { argb: AZUL } };

  let fila = 4;
  for (const { familia, etiqueta } of RUTAS) {
    ws.getCell(`B${fila}`).value = `${etiqueta} (${familia})`;
    ws.getCell(`B${fila}`).font = { bold: true, size: 12, color: { argb: AZUL } };
    fila += 1;

    const columnas = columnasDeLaFamilia(familia);
    Q[familia].forEach((pregunta, i) => {
      ws.getCell(`B${fila}`).value = `Variable ${i + 1} — ${pregunta.title}`;
      ws.getCell(`B${fila}`).font = { bold: true, size: 10 };
      ws.getCell(`B${fila}`).alignment = { wrapText: true, vertical: "top" };
      fila += 1;
      pregunta.options.forEach((opcion, j) => {
        ws.getCell(`B${fila}`).value = `${j + 1}. ${opcion.title}`;
        ws.getCell(`B${fila}`).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(`C${fila}`).value = opcion.desc ?? "";
        ws.getCell(`C${fila}`).alignment = { wrapText: true, vertical: "top" };
        fila += 1;
      });
    });

    const magnitud = columnas.slice(Q[familia].length).filter((c) => c.length > 0);
    magnitud.forEach((opciones, i) => {
      const titulo = i === 0 ? "Presupuesto anual gestionado (USD)" : "Tamaño total del equipo (directo + indirecto)";
      ws.getCell(`B${fila}`).value = `Variable ${Q[familia].length + i + 1} — ${titulo}`;
      ws.getCell(`B${fila}`).font = { bold: true, size: 10 };
      fila += 1;
      opciones.forEach((o) => {
        ws.getCell(`B${fila}`).value = o;
        fila += 1;
      });
    });

    fila += 1;
  }
}

/** La hoja oculta con las listas. Su posición la fijan los nombres definidos. */
function armarSys(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(HOJA_SYS);
  ws.state = "veryHidden";

  ws.getCell("A1").value = "-"; // EmptyList

  let col = 2; // B
  for (const { familia } of RUTAS) {
    for (const opciones of columnasDeLaFamilia(familia)) {
      opciones.forEach((o, i) => { ws.getCell(i + 1, col).value = o; });
      col += 1;
    }
  }

  // Rutas y su sigla, para que la validación sepa qué lista encadenar.
  RUTAS.forEach((r, i) => {
    ws.getCell(i + 1, col).value = r.etiqueta;
    ws.getCell(i + 1, col + 1).value = r.familia;
  });
  MONEDAS.forEach((m, i) => { ws.getCell(i + 1, col + 2).value = m; });
}

/** Dónde quedó cada lista en la hoja oculta, en el mismo orden en que se escribió. */
function mapaDeColumnas(): { porFamilia: Record<Familia, number[]>; rutas: number; siglas: number; monedas: number } {
  const porFamilia = {} as Record<Familia, number[]>;
  let col = 2;
  for (const { familia } of RUTAS) {
    porFamilia[familia] = columnasDeLaFamilia(familia).map(() => col++);
  }
  return { porFamilia, rutas: col, siglas: col + 1, monedas: col + 2 };
}

function armarCarga(wb: ExcelJS.Workbook, d: DatosPlanilla, tope: number) {
  const ws = wb.addWorksheet(nombreDeLaHoja(d.empresa), {
    views: [{ state: "frozen", xSplit: 5, ySplit: 2 }],
  });

  // ── Encabezados ──
  CABECERAS_BASE.slice(0, 6).forEach((t, i) => {
    const c = letra(i + 1);
    ws.mergeCells(`${c}1:${c}2`);
    ws.getCell(`${c}1`).value = t;
    cabecera(ws.getCell(`${c}1`));
  });

  ws.mergeCells("G1:K1");
  ws.getCell("G1").value = "VARIABLES DE EVALUACIÓN CAPRI (elige primero la ruta en la columna F)";
  cabecera(ws.getCell("G1"));
  for (let i = 0; i < 5; i++) {
    const celda = ws.getCell(2, 7 + i);
    celda.value = `Variable ${i + 1}`;
    cabecera(celda, AZUL_CLARO, "FF1B4965");
  }

  ["L", "M"].forEach((c, i) => {
    ws.mergeCells(`${c}1:${c}2`);
    ws.getCell(`${c}1`).value = CABECERAS_BASE[11 + i];
    cabecera(ws.getCell(`${c}1`), "FF2E7D6B");
  });

  d.conceptos.forEach((concepto, i) => {
    const inicio = PRIMERA_COL_PAGO + i * 4;
    ws.mergeCells(1, inicio, 1, inicio + 3);
    const titulo = ws.getCell(1, inicio);
    titulo.value = concepto.nombre;
    cabecera(titulo, concepto.clase === "Variable" ? "FFB07D2B" : "FF4A6D86");
    titulo.note = `Tipo: ${concepto.clase} | Variable: ${concepto.tipoVariable || "-"} | `
      + `Frecuencia: ${concepto.frecuencia} | Impacto salarial: ${concepto.impacto}`;
    SUBCOLUMNAS_PAGO.forEach((s, j) => {
      const celda = ws.getCell(2, inicio + j);
      celda.value = s;
      cabecera(celda, AZUL_CLARO, "FF1B4965");
    });
  });

  // ── Anchos ──
  const anchos = [16, 30, 34, 26, 38, 30, 34, 34, 34, 30, 26, 11, 34];
  anchos.forEach((a, i) => { ws.getColumn(i + 1).width = a; });
  d.conceptos.forEach((_, i) => {
    const inicio = PRIMERA_COL_PAGO + i * 4;
    ws.getColumn(inicio).width = 15;
    ws.getColumn(inicio + 1).width = 13;
    ws.getColumn(inicio + 2).width = 13;
    ws.getColumn(inicio + 3).width = 24;
  });
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 20;

  // ── Fórmulas y formatos de las filas de datos ──
  const ultima = PRIMERA_FILA + FILAS_PLANILLA - 1;
  for (let fila = PRIMERA_FILA; fila <= ultima; fila++) {
    ws.getCell(fila, COL_GRADO).value = { formula: formulaGrado(fila, tope) };
    ws.getCell(fila, COL_GRADO).alignment = { horizontal: "center" };
    ws.getCell(fila, COL_GRADO).font = { bold: true };
    ws.getCell(fila, COL_ROL).value = { formula: formulaRol(fila) };
    d.conceptos.forEach((_, i) => {
      ws.getCell(fila, PRIMERA_COL_PAGO + i * 4).numFmt = "#,##0.00";
    });
  }

  // ── Validaciones ──
  const dv = (ws as HojaConValidaciones).dataValidations;
  const listaRutas = FACT_RULES[revenueToIndex(d.facturacion)]?.ej === false
    ? "ListaRutasCorta" : "ListaRutasCompleta";

  dv.add(`B${PRIMERA_FILA}:B${ultima}`, {
    type: "list", allowBlank: true, formulae: ["ListaDepartamentos"],
    showErrorMessage: false,
  });
  dv.add(`E${PRIMERA_FILA}:E${ultima}`, {
    type: "list", allowBlank: true, formulae: ["ListaCargosCorte"],
    showErrorMessage: true, errorStyle: "warning",
    error: "Ese cargo no está en el catálogo del corte. Puedes dejarlo vacío y homologarlo en la plataforma.",
    errorTitle: "Cargo fuera del catálogo",
  });
  dv.add(`F${PRIMERA_FILA}:F${ultima}`, {
    type: "list", allowBlank: true, formulae: [listaRutas],
    showErrorMessage: true, error: "Elige una de las rutas de la lista.", errorTitle: "Ruta CAPRI",
  });

  for (let i = 0; i < 5; i++) {
    const c = letra(7 + i);
    dv.add(`${c}${PRIMERA_FILA}:${c}${ultima}`, {
      type: "list", allowBlank: true,
      formulae: [`INDIRECT(IF($F${PRIMERA_FILA}="","EmptyList",VLOOKUP($F${PRIMERA_FILA},MapaRutas,2,FALSE)&"_${i + 1}"))`],
      showErrorMessage: true, errorStyle: "warning",
      error: "Esa opción no pertenece a la ruta elegida.", errorTitle: "Variable CAPRI",
    });
  }

  d.conceptos.forEach((_, i) => {
    const inicio = PRIMERA_COL_PAGO + i * 4;
    const cuenta = letra(inicio + 1);
    const pago = letra(inicio + 2);
    const tasa = letra(inicio + 3);
    [cuenta, pago].forEach((c) => {
      dv.add(`${c}${PRIMERA_FILA}:${c}${ultima}`, {
        type: "list", allowBlank: true, formulae: ["ListaMonedas"], showErrorMessage: false,
      });
    });
    dv.add(`${tasa}${PRIMERA_FILA}:${tasa}${ultima}`, {
      type: "list", allowBlank: true,
      formulae: [`INDIRECT(IF(AND($${cuenta}${PRIMERA_FILA}<>"",$${pago}${PRIMERA_FILA}<>"",`
        + `$${cuenta}${PRIMERA_FILA}<>$${pago}${PRIMERA_FILA}),"ListaTasas","EmptyList"))`],
      showErrorMessage: false,
    });
  });

  // ── Lo que la empresa ya tiene cargado ──
  const porConcepto = new Map(d.conceptos.map((c, i) => [c.nombre.trim().toLowerCase(), i]));
  d.ocupantes.slice(0, FILAS_PLANILLA).forEach((o, i) => {
    const fila = PRIMERA_FILA + i;
    ws.getCell(fila, 1).value = o.ocupanteId;
    ws.getCell(fila, 2).value = o.departamento;
    ws.getCell(fila, 3).value = o.tituloCargo;
    ws.getCell(fila, 4).value = o.reportaA;
    ws.getCell(fila, 5).value = o.homologado;
    // El grado evaluado en la plataforma pisa la fórmula: las respuestas que lo
    // produjeron no se guardan, así que no se pueden reconstruir en las columnas.
    if (o.grado !== null) ws.getCell(fila, COL_GRADO).value = o.grado;

    for (const pago of o.pagos) {
      const idx = porConcepto.get(pago.concepto.trim().toLowerCase());
      if (idx === undefined) continue;
      const inicio = PRIMERA_COL_PAGO + idx * 4;
      if (pago.monto !== null) ws.getCell(fila, inicio).value = pago.monto;
      ws.getCell(fila, inicio + 1).value = pago.cuenta;
      ws.getCell(fila, inicio + 2).value = pago.pago;
      ws.getCell(fila, inicio + 3).value = pago.tasa;
    }
  });
}

function definirNombres(wb: ExcelJS.Workbook, d: DatosPlanilla, filaPrimeraTasa: number, ej: boolean) {
  const sys = mapaDeColumnas();
  const agregar = (nombre: string, refiere: string) => wb.definedNames.add(refiere, nombre);

  agregar("EmptyList", `${HOJA_SYS}!$A$1`);

  for (const { familia } of RUTAS) {
    const columnas = columnasDeLaFamilia(familia);
    sys.porFamilia[familia].forEach((col, i) => {
      const largo = columnas[i].length;
      const c = letra(col);
      agregar(`${familia}_${i + 1}`, largo > 0 ? `${HOJA_SYS}!$${c}$1:$${c}$${largo}` : `${HOJA_SYS}!$A$1`);
    });
  }

  const colRutas = letra(sys.rutas);
  const colSiglas = letra(sys.siglas);
  agregar("ListaRutasCompleta", `${HOJA_SYS}!$${colRutas}$1:$${colRutas}$4`);
  agregar("ListaRutasCorta", `${HOJA_SYS}!$${colRutas}$1:$${colRutas}$3`);
  agregar("MapaRutas", `${HOJA_SYS}!$${colRutas}$1:$${colSiglas}$4`);
  agregar("ListaMonedas", `${HOJA_SYS}!$${letra(sys.monedas)}$1:$${letra(sys.monedas)}$${MONEDAS.length}`);

  const ultimaTasa = filaPrimeraTasa + Math.max(d.tasas.length, 1) - 1;
  agregar("ListaTasas", `'${HOJA_CONFIG}'!$B$${filaPrimeraTasa}:$B$${ultimaTasa}`);

  const ultimoCargo = 4 + Math.max(d.catalogo.length, 1) - 1;
  agregar("ListaCargosCorte", `'${HOJA_CATALOGO}'!$B$4:$B$${ultimoCargo}`);
  agregar("ListaDepartamentos", `'${HOJA_CATALOGO}'!$A$4:$A$${ultimoCargo}`);

  void ej;
}
