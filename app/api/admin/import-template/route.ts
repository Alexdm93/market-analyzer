/**
 * Genera la plantilla de carga de data salarial de un corte.
 *
 * Se arma con exceljs (y no con xlsx, que se usa para leer) porque es la única
 * de las dos que escribe validación de datos: así las columnas de moneda,
 * frecuencia, clase y familia salen como desplegable en Excel y la empresa no
 * puede escribir un valor que después el lector no entienda.
 */
import ExcelJS from "exceljs";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ADICIONALES_HEADERS,
  CARGOS_HEADERS,
  COL,
  OPCIONES,
  SHEET_ADICIONALES,
  SHEET_CARGOS,
  SHEET_CATALOGO,
  SHEET_INSTRUCCIONES,
  SHEET_LISTAS,
  SHEET_TASAS,
  SUF,
  TASAS_HEADERS,
  MAX_TASAS_EMPRESA,
  col,
  type CatalogCargo,
} from "@/lib/import-cargos";

/** Excel exige que la lista de un desplegable venga entre comillas dobles. */
function listaFija(valores: readonly string[]) {
  return [`"${valores.join(",")}"`];
}

/** Referencia a una columna de la hoja de listas, para las listas largas. */
function listaEnHoja(columna: string, cantidad: number) {
  return [`'${SHEET_LISTAS}'!$${columna}$2:$${columna}$${cantidad + 1}`];
}

const ULTIMA_FILA = 1000;

function aplicarLista(
  hoja: ExcelJS.Worksheet,
  encabezado: string,
  encabezados: string[],
  formulae: string[],
  mensaje: string,
) {
  const indice = encabezados.indexOf(encabezado);
  if (indice < 0) return;
  const letra = hoja.getColumn(indice + 1).letter;
  for (let fila = 2; fila <= ULTIMA_FILA; fila++) {
    hoja.getCell(`${letra}${fila}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae,
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Valor fuera de la lista",
      error: mensaje,
    };
  }
}

function encabezar(hoja: ExcelJS.Worksheet, encabezados: string[], anchos?: number[]) {
  hoja.addRow(encabezados);
  const fila = hoja.getRow(1);
  fila.font = { bold: true, size: 10 };
  fila.alignment = { vertical: "middle", wrapText: true };
  fila.height = 34;
  encabezados.forEach((h, i) => {
    hoja.getColumn(i + 1).width = anchos?.[i] ?? Math.min(26, Math.max(12, h.length + 2));
  });
  hoja.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  const prellenar = searchParams.get("prellenar") !== "0";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const [configRow, snapshot] = await Promise.all([
    prisma.globalConfig.findUnique({ where: { key: `snapshot-cargos-${snapshotId}` }, select: { value: true } }),
    prisma.userSnapshot.findFirst({ where: { snapshotId }, select: { label: true, date: true } }),
  ]);

  let catalogo: CatalogCargo[] = [];
  try {
    const parsed = configRow?.value ? (JSON.parse(configRow.value) as CatalogCargo[]) : [];
    if (Array.isArray(parsed)) catalogo = parsed;
  } catch {
    catalogo = [];
  }

  if (catalogo.length === 0) {
    return Response.json({ message: "Este corte no tiene cargos configurados." }, { status: 400 });
  }

  const nombreCorte = snapshot?.label ?? snapshotId;
  const fechaCorte = snapshot?.date ? snapshot.date.toISOString().split("T")[0] : snapshotId;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Market Analyzer";
  wb.created = new Date();

  // ── Instrucciones ─────────────────────────────────────────────────────────
  const instrucciones = wb.addWorksheet(SHEET_INSTRUCCIONES);
  instrucciones.getColumn(1).width = 26;
  instrucciones.getColumn(2).width = 112;
  const bloques: Array<[string, string]> = [
    ["Carga de data salarial", ""],
    ["Corte", `${nombreCorte} — ${fechaCorte}`],
    ["", ""],
    ["Cómo se llena", ""],
    ["1", `Una fila por cargo en la hoja "${SHEET_CARGOS}".`],
    ["2", `El nombre del cargo debe ser exactamente uno de la hoja "${SHEET_CATALOGO}". Si no coincide, la fila no se carga.`],
    ["3", "Borra las filas de los cargos que la empresa no tiene. Las filas sin montos se ignoran."],
    ["4", "No repitas el mismo cargo dos veces."],
    ["5", "Los montos van como número, sin símbolos de moneda ni texto."],
    ["6", "Las columnas con desplegable solo admiten los valores de la lista. No escribas otros."],
    ["", ""],
    ["Lo mínimo para poder enviar el corte", ""],
    ["", "Cargo del catálogo · grado CAPRI entre 8 y 25 · sueldo básico mayor que cero."],
    ["", "Todo lo demás es opcional: si falta, se carga igual y se completa después en la plataforma."],
    ["", ""],
    ["Qué pasa con una celda en blanco", ""],
    ["", "Una celda vacía NO conserva lo que la empresa ya tenga cargado en la plataforma: se toma el valor por defecto."],
    ["", "Un monto en blanco es cero. Una moneda en blanco es USD."],
    ["", "La única excepción es el grado CAPRI: si va vacío y el cargo ya estaba clasificado en la plataforma, se conserva su clasificación."],
    ["", ""],
    ["Moneda y tasa, concepto por concepto", ""],
    [SUF.cuenta, "La moneda en la que está escrito el número: USD o VES."],
    [SUF.pago, "La moneda en la que la persona efectivamente cobra: USD o VES."],
    [SUF.tasa, `Solo hace falta cuando las dos monedas son distintas. Escribe el nombre exacto de una tasa: puede ser una que la empresa ya tenga en la plataforma, o una que declares en la hoja "${SHEET_TASAS}". Si se deja vacía, se usa el BCV del día de la carga.`],
    ["", ""],
    [`Hoja "${SHEET_TASAS}"`, ""],
    ["", "Sirve para declarar las tasas propias de la empresa cuando todavía no las tiene cargadas en la plataforma. Se crean al importar."],
    ["", `Nunca se pisa una tasa existente: si la empresa ya tiene una con ese nombre, se respeta su valor y el del archivo se ignora (queda avisado en el análisis).`],
    ["", `Una empresa puede tener como máximo ${MAX_TASAS_EMPRESA} tasas propias. Las tasas BCV del sistema no cuentan y no hay que declararlas.`],
    ["", "El valor va en bolívares por 1 dólar."],
    ["", ""],
    ["Grado y familia CAPRI", ""],
    [COL.grado, "Número entero del 8 al 25."],
    [COL.familia, "IC (individual, 8-19) · LO (liderazgo operativo, 14-16) · GE (liderazgo táctico y estratégico, 17-22) · EJ (ejecutiva, 23-25)."],
    ["", "Solo hace falta cuando el grado cae en un rango compartido (14 a 16 y 17 a 19). En el resto se deduce sola."],
    ["", ""],
    [`Hoja "${SHEET_ADICIONALES}"`, ""],
    ["", "Todo lo que no sea sueldo básico ni bono de alimentación va ahí: bono de movilización, bono de desempeño, comisiones, primas, lo que sea."],
    ["", "Una fila por concepto, repitiendo el nombre del cargo tal como aparece en la hoja de cargos."],
    ["Clase", "Fijo (se paga siempre) o Variable (depende de desempeño o comisiones)."],
    ["Tipo de variable", "Solo para los variables: Desempeño o Comisión."],
    ["Impacta prestaciones", "Sí o No. Si el concepto entra en el cálculo de prestaciones sociales."],
    ["", "Los conceptos fijos no admiten frecuencia quincenal; los variables sí."],
    ["", ""],
    ["Por qué la frecuencia del sueldo no se pide", ""],
    ["", "En la plataforma el sueldo básico y el bono de alimentación son siempre mensuales, y su impacto en prestaciones está fijo (el sueldo sí impacta, el bono no)."],
    ["", "Por eso esas columnas no están: se cargan con el mismo valor que tendrían si se llenaran a mano."],
  ];
  bloques.forEach(([a, b]) => {
    const fila = instrucciones.addRow([a, b]);
    if (b === "" && a !== "") fila.getCell(1).font = { bold: true, size: 11 };
    fila.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });

  // ── Cargos ────────────────────────────────────────────────────────────────
  const hojaCargos = wb.addWorksheet(SHEET_CARGOS);
  encabezar(hojaCargos, CARGOS_HEADERS, [30, 46, 13, 13, 15, 18, 18, 22, 17, 18, 18, 22]);

  if (prellenar) {
    catalogo.forEach((c) => {
      const fila: (string | number | null)[] = CARGOS_HEADERS.map((h) => {
        if (h === COL.departamento) return c.departamento;
        if (h === COL.cargo) return c.tituloCargo;
        return null;
      });
      hojaCargos.addRow(fila);
    });
  }

  aplicarLista(hojaCargos, COL.familia, CARGOS_HEADERS, listaFija(OPCIONES.familia), "Usa IC, LO, GE o EJ.");
  for (const prefijo of ["Sueldo básico", "Bono alimentación"]) {
    aplicarLista(hojaCargos, col(prefijo, SUF.cuenta), CARGOS_HEADERS, listaFija(OPCIONES.moneda), "Usa USD o VES.");
    aplicarLista(hojaCargos, col(prefijo, SUF.pago), CARGOS_HEADERS, listaFija(OPCIONES.moneda), "Usa USD o VES.");
  }

  // El grado se valida como número entero, no como lista, para poder escribirlo.
  const colGrado = hojaCargos.getColumn(CARGOS_HEADERS.indexOf(COL.grado) + 1).letter;
  for (let fila = 2; fila <= ULTIMA_FILA; fila++) {
    hojaCargos.getCell(`${colGrado}${fila}`).dataValidation = {
      type: "whole",
      operator: "between",
      formulae: [8, 25],
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Grado fuera de rango",
      error: "El grado CAPRI va del 8 al 25.",
    };
  }

  // Cargo y departamento se validan contra el catálogo del corte.
  aplicarLista(hojaCargos, COL.cargo, CARGOS_HEADERS, listaEnHoja("B", catalogo.length), "Ese cargo no está en el catálogo del corte.");

  // ── Otros pagos ───────────────────────────────────────────────────────────
  const hojaOtros = wb.addWorksheet(SHEET_ADICIONALES);
  encabezar(hojaOtros, ADICIONALES_HEADERS, [46, 12, 34, 14, 15, 18, 18, 22, 20, 18]);
  aplicarLista(hojaOtros, "Cargo", ADICIONALES_HEADERS, listaEnHoja("B", catalogo.length), "Ese cargo no está en el catálogo del corte.");
  aplicarLista(hojaOtros, "Clase", ADICIONALES_HEADERS, listaFija(OPCIONES.clase), "Usa Fijo o Variable.");
  aplicarLista(hojaOtros, "Frecuencia", ADICIONALES_HEADERS, listaFija(OPCIONES.frecuenciaVariable), "Usa una de las frecuencias de la lista. Los pagos fijos no admiten Quincenal.");
  aplicarLista(hojaOtros, "Moneda del monto", ADICIONALES_HEADERS, listaFija(OPCIONES.moneda), "Usa USD o VES.");
  aplicarLista(hojaOtros, "Moneda de pago", ADICIONALES_HEADERS, listaFija(OPCIONES.moneda), "Usa USD o VES.");
  aplicarLista(hojaOtros, "Impacta prestaciones", ADICIONALES_HEADERS, listaFija(OPCIONES.siNo), "Usa Sí o No.");
  aplicarLista(hojaOtros, "Tipo de variable", ADICIONALES_HEADERS, listaFija(OPCIONES.tipoVariable), "Usa Desempeño o Comisión.");

  // ── Tasas ─────────────────────────────────────────────────────────────────
  const hojaTasas = wb.addWorksheet(SHEET_TASAS);
  encabezar(hojaTasas, TASAS_HEADERS, [38, 30, 24]);
  aplicarLista(hojaTasas, "Referencia", TASAS_HEADERS, listaFija(OPCIONES.referencia), "Usa una de las referencias de la lista.");

  // ── Catálogo del corte ────────────────────────────────────────────────────
  const hojaCatalogo = wb.addWorksheet(SHEET_CATALOGO);
  encabezar(hojaCatalogo, ["Departamento", "Cargo"], [34, 52]);
  catalogo.forEach((c) => hojaCatalogo.addRow([c.departamento, c.tituloCargo]));

  // ── Listas (fuente de los desplegables largos) ─────────────────────────────
  const hojaListas = wb.addWorksheet(SHEET_LISTAS);
  encabezar(hojaListas, ["Departamento", "Cargo"], [34, 52]);
  catalogo.forEach((c) => hojaListas.addRow([c.departamento, c.tituloCargo]));
  hojaListas.state = "veryHidden";

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `Plantilla data salarial - ${nombreCorte}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
