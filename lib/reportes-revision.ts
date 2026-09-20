/**
 * Reportes de revisión de un corte, en Excel. SOLO LECTURA: no escriben nada.
 *
 * Dos reportes sobre la misma selección de empresas:
 *  1. Por empresa — una hoja por empresa, con su ficha arriba y una fila por
 *     cada elemento de pago de cada cargo.
 *  2. General por grados — una hoja, una fila por cargo, con TEM/TEMz/CIM/PCTA.
 *
 * Los totales se calculan con la tasa BCV que tenía la empresa cuando guardó
 * (`ratesAtSave.bcvUsd`), igual que `/api/admin/study`: es la tasa histórica
 * correcta para esa empresa, no la de hoy.
 */
import ExcelJS from "exceljs";

import { capriRol, gradeToNivel } from "@/lib/capri";
import { computeRowTotals } from "@/lib/compensation";
import { FREQUENCY_OPTIONS } from "@/lib/compensation-options";
import { getBcvRate } from "@/lib/bcv";
import { prisma } from "@/lib/prisma";
import { safeParseCompanyInfo, type CompanyInfo, type ExchangeRate } from "@/lib/workspace";
import type { CompensationConcept, ExtendedMarketPosition } from "@/types/salary";

export type FiltrosReporte = {
  snapshotId: string;
  sectores: string[];
  subsectores: string[];
  empresaIds: string[];
  headcountMin: number | null;
  headcountMax: number | null;
  soloEnviados: boolean;
};

export type EmpresaConData = {
  companyId: string;
  userId: string;
  nombre: string;
  sector: string;
  subsector: string;
  headcount: string;
  facturacion: string;
  diasBonoVacacional: string;
  diasUtilidades: string;
  localidades: string;
  enviado: boolean;
  companyInfo: CompanyInfo;
  filas: ExtendedMarketPosition[];
};

const FREQ_LABEL = new Map(FREQUENCY_OPTIONS.map((o) => [o.value, o.label]));

function freqLabel(freq: string | undefined) {
  return FREQ_LABEL.get((freq ?? "monthly") as never) ?? "Mensual";
}

function monedaLabel(m: string | undefined) {
  return m === "VES" ? "VES (Bs.)" : "USD";
}

/** Un renglón por cada elemento de pago con monto distinto de cero. */
type ElementoDePago = {
  concepto: string;
  tipo: "Fijo" | "Variable";
  monto: number;
  cuentaMoneda: string;
  monedaPago: string;
  tasa: string;
  frecuencia: string;
  impacto: string;
};

function nombreTasa(tasaId: string | undefined, tasas: ExchangeRate[]) {
  if (!tasaId) return "";
  const t = tasas.find((x) => x.id === tasaId);
  return t ? (t.nombre || t.referencia || t.id) : tasaId;
}

function elementosDePago(row: ExtendedMarketPosition, tasas: ExchangeRate[]): ElementoDePago[] {
  const out: ElementoDePago[] = [];

  function agregar(
    concepto: string,
    tipo: "Fijo" | "Variable",
    monto: number | undefined,
    freq: string | undefined,
    cuenta: string | undefined,
    pago: string | undefined,
    impacto: boolean | undefined,
    tasaId?: string,
  ) {
    if (!monto) return;
    out.push({
      concepto,
      tipo,
      monto,
      cuentaMoneda: monedaLabel(cuenta),
      monedaPago: monedaLabel(pago),
      tasa: nombreTasa(tasaId, tasas),
      frecuencia: freqLabel(freq),
      impacto: impacto ? "Sí" : "No",
    });
  }

  agregar("Sueldo básico", "Fijo", row.sueldoBasico, row.sueldoBasicoFreq, row.sueldoBasicoCuentaMoneda, row.sueldoBasicoMonedaPago, row.sueldoBasicoImpacto, row.sueldoBasicoTasaId);
  agregar("Bono alimentación", "Fijo", row.bonoAlimentacion, row.bonoAlimentacionFreq, row.bonoAlimentacionCuentaMoneda, row.bonoAlimentacionMonedaPago, row.bonoAlimentacionImpacto, row.bonoAlimentacionTasaId);
  // Estos cuatro no tienen interfaz en la pantalla de Data, pero suman en los
  // totales y puede haber data vieja con valores: en un reporte de revisión hay
  // que verlos, justamente para detectarlos.
  agregar("Bono movilización", "Fijo", row.bonoMovilizacion, row.bonoMovilizacionFreq, row.bonoMovilizacionCuentaMoneda, row.bonoMovilizacionMonedaPago, row.bonoMovilizacionImpacto);
  for (const p of row.additionalFixedPayments ?? []) {
    agregar(p.concept || "(sin nombre)", "Fijo", p.amount, p.freq, p.accountCurrency, p.paymentCurrency, p.impacto, p.tasaId);
  }

  agregar("Bono desempeño", "Variable", row.bonoDesempeno, row.bonoDesempenoFreq, row.bonoDesempenoCuentaMoneda, row.bonoDesempenoMonedaPago, row.bonoDesempenoImpacto);
  agregar("Comisiones", "Variable", row.comisiones, row.comisionesFreq, row.comisionesCuentaMoneda, row.comisionesMonedaPago, row.comisionesImpacto);
  agregar("Otros pagos variables", "Variable", row.pagoVariableOtros, row.pagoVariableOtrosFreq, row.pagoVariableOtrosCuentaMoneda, row.pagoVariableOtrosMonedaPago, row.pagoVariableOtrosImpacto);
  for (const p of row.additionalVariablePayments ?? []) {
    const c = p as CompensationConcept;
    const etiqueta = c.variableType === "commission" ? " (comisión)" : c.variableType === "performance" ? " (desempeño)" : "";
    agregar((c.concept || "(sin nombre)") + etiqueta, "Variable", c.amount, c.freq, c.accountCurrency, c.paymentCurrency, c.impacto, c.tasaId);
  }

  return out;
}

// ── Datos ───────────────────────────────────────────────────────────────────

export async function cargarEmpresas(filtros: FiltrosReporte): Promise<EmpresaConData[]> {
  const { snapshotId } = filtros;

  const [snapshots, positions] = await Promise.all([
    prisma.userSnapshot.findMany({
      where: { snapshotId },
      select: {
        userId: true,
        companyId: true,
        submittedAt: true,
        company: {
          select: {
            id: true, name: true, economicSector: true, classification: true,
            headcount: true, revenueUSD: true, minVacationDays: true,
            minUtilityDays: true, locality: true,
          },
        },
      },
    }),
    prisma.userPosition.findMany({
      where: { snapshotId },
      select: { userId: true, companyId: true, title: true, dataJson: true },
      orderBy: [{ companyId: "asc" }, { title: "asc" }],
    }),
  ]);

  const userIds = [...new Set(snapshots.map((s) => s.userId))];
  const workspaces = await prisma.userWorkspace.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, companyInfoJson: true },
  });
  const infoPorUsuario = new Map(workspaces.map((w) => [w.userId, safeParseCompanyInfo(w.companyInfoJson)]));

  const filasPorUsuario = new Map<string, ExtendedMarketPosition[]>();
  for (const p of positions) {
    try {
      const fila = JSON.parse(p.dataJson) as ExtendedMarketPosition;
      const lista = filasPorUsuario.get(p.userId);
      if (lista) lista.push(fila); else filasPorUsuario.set(p.userId, [fila]);
    } catch { /* fila corrupta: se ignora en vez de tumbar el reporte */ }
  }

  const empresas: EmpresaConData[] = [];
  const vistas = new Set<string>();

  for (const s of snapshots) {
    if (!s.company || vistas.has(s.companyId)) continue;
    const filas = filasPorUsuario.get(s.userId) ?? [];
    if (filas.length === 0) continue;
    vistas.add(s.companyId);

    empresas.push({
      companyId: s.companyId,
      userId: s.userId,
      nombre: s.company.name,
      sector: s.company.economicSector || "",
      subsector: s.company.classification || "",
      headcount: s.company.headcount || "",
      facturacion: s.company.revenueUSD || "",
      diasBonoVacacional: s.company.minVacationDays || "",
      diasUtilidades: s.company.minUtilityDays || "",
      localidades: (s.company.locality || "").split(",").filter(Boolean).join(", "),
      enviado: Boolean(s.submittedAt),
      companyInfo: infoPorUsuario.get(s.userId) ?? safeParseCompanyInfo(""),
      filas,
    });
  }

  return aplicarFiltros(empresas, filtros).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function aplicarFiltros(empresas: EmpresaConData[], f: FiltrosReporte): EmpresaConData[] {
  return empresas.filter((e) => {
    if (f.soloEnviados && !e.enviado) return false;
    if (f.empresaIds.length > 0 && !f.empresaIds.includes(e.companyId)) return false;
    if (f.sectores.length > 0 && !f.sectores.includes(e.sector)) return false;
    if (f.subsectores.length > 0 && !f.subsectores.includes(e.subsector)) return false;

    if (f.headcountMin !== null || f.headcountMax !== null) {
      const n = Number(e.headcount);
      if (!Number.isFinite(n)) return false;
      if (f.headcountMin !== null && n < f.headcountMin) return false;
      if (f.headcountMax !== null && n > f.headcountMax) return false;
    }
    return true;
  });
}

// ── Totales ─────────────────────────────────────────────────────────────────

type Totales = { tem: number; temz: number; cim: number; pcta: number };

function totalesDe(row: ExtendedMarketPosition, empresa: EmpresaConData, bcvFallback: number | null): Totales {
  const tasas = empresa.companyInfo.tasas ?? [];
  const bcv = empresa.companyInfo.ratesAtSave?.bcvUsd ?? bcvFallback;
  const t = computeRowTotals(
    row, tasas, bcv,
    Number(empresa.companyInfo.minVacationDays ?? empresa.diasBonoVacacional) || 0,
    Number(empresa.companyInfo.minUtilityDays ?? empresa.diasUtilidades) || 0,
  );
  return {
    tem: t.totalSinPasivosMensual,
    temz: t.totalDirectoMensualizado,
    cim: t.totalConPasivosMensual,
    pcta: t.totalConPasivosAnual,
  };
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const TEAL = "FF0F766E";
const GRIS = "FFF1F5F9";
const BORDE = "FFE2E8F0";

function estiloCabecera(fila: ExcelJS.Row) {
  fila.height = 26;
  fila.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BORDE } }, left: { style: "thin", color: { argb: BORDE } },
      bottom: { style: "thin", color: { argb: BORDE } }, right: { style: "thin", color: { argb: BORDE } },
    };
  });
}

/** Excel no admite : \ / ? * [ ] en el nombre de una hoja, ni más de 31 caracteres. */
function nombreDeHoja(nombre: string, usados: Set<string>): string {
  const base = (nombre.replace(/[:\\/?*[\]]/g, "-").trim() || "Empresa").slice(0, 28);
  let candidato = base;
  let n = 2;
  while (usados.has(candidato.toLowerCase())) {
    candidato = `${base.slice(0, 25)} (${n})`;
    n++;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

// ── Reporte 1: por empresa ──────────────────────────────────────────────────

const COLS_CARGO = [
  { h: "Departamento", w: 26 }, { h: "Cargo", w: 40 },
  { h: "Grado", w: 8 }, { h: "Familia", w: 9 }, { h: "Nivel CAPRI", w: 18 }, { h: "Rol CAPRI", w: 34 },
  { h: "Elemento de pago", w: 32 }, { h: "Tipo", w: 10 }, { h: "Monto", w: 14 },
  { h: "Moneda de cuenta", w: 18 }, { h: "Moneda de pago", w: 17 }, { h: "Tasa", w: 22 },
  { h: "Frecuencia", w: 14 }, { h: "Impacta pasivos", w: 16 },
  { h: "TEM", w: 14 }, { h: "TEMz", w: 14 }, { h: "CIM", w: 14 }, { h: "PCTA", w: 16 },
];

export async function construirReportePorEmpresa(
  empresas: EmpresaConData[],
  etiquetaCorte: string,
  bcvFallback: number | null,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Market Analyzer";
  wb.created = new Date();

  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [
    { width: 40 }, { width: 28 }, { width: 28 }, { width: 14 },
    { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 },
  ];
  resumen.addRow([`Reporte por empresa — ${etiquetaCorte}`]);
  resumen.getRow(1).font = { bold: true, size: 14 };
  resumen.addRow([`Generado el ${new Date().toLocaleString("es-VE")}`]);
  resumen.addRow([]);
  estiloCabecera(resumen.addRow(["Empresa", "Sector", "Subsector", "Headcount", "Facturación USD", "Cargos", "Enviado", "Hoja"]));

  const usados = new Set<string>();

  for (const empresa of empresas) {
    const hoja = nombreDeHoja(empresa.nombre, usados);
    resumen.addRow([
      empresa.nombre, empresa.sector, empresa.subsector, empresa.headcount,
      empresa.facturacion, empresa.filas.length, empresa.enviado ? "Sí" : "No", hoja,
    ]);
  }
  resumen.views = [{ state: "frozen", ySplit: 4 }];

  const usadosHojas = new Set<string>();
  for (const empresa of empresas) {
    const ws = wb.addWorksheet(nombreDeHoja(empresa.nombre, usadosHojas));
    ws.columns = COLS_CARGO.map((c) => ({ width: c.w }));

    // ── Ficha de la empresa ──
    const titulo = ws.addRow([empresa.nombre]);
    titulo.font = { bold: true, size: 14 };

    const ficha: Array<[string, string]> = [
      ["Sector", empresa.sector],
      ["Subsector", empresa.subsector],
      ["Headcount", empresa.headcount],
      ["Facturación USD", empresa.facturacion],
      ["Días de bono vacacional", empresa.diasBonoVacacional],
      ["Días de utilidades", empresa.diasUtilidades],
      ["Dónde tiene operación", empresa.localidades],
      ["Corte", etiquetaCorte],
      ["Data enviada", empresa.enviado ? "Sí" : "No"],
      ["Cargos reportados", String(empresa.filas.length)],
    ];
    for (const [k, v] of ficha) {
      const fila = ws.addRow([k, v]);
      fila.getCell(1).font = { bold: true, size: 10 };
      fila.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
      fila.getCell(2).alignment = { wrapText: true };
    }

    // ── Tasas de cambio ──
    ws.addRow([]);
    const tTasas = ws.addRow(["Tasas de cambio"]);
    tTasas.font = { bold: true, size: 12 };
    const tasas = (empresa.companyInfo.tasas ?? []).filter((t) => !t.isSystem);
    estiloCabecera(ws.addRow(["Nombre", "Referencia", "Valor (Bs por 1 USD)"]));
    if (tasas.length === 0) {
      ws.addRow(["(sin tasas propias registradas)", "", ""]);
    } else {
      for (const t of tasas) ws.addRow([t.nombre || t.referencia, t.referencia, Number(t.valor) || t.valor]);
    }
    const guardadas = empresa.companyInfo.ratesAtSave;
    if (guardadas) {
      ws.addRow(["BCV al momento de guardar", "", guardadas.bcvUsd ?? ""]);
    }

    // ── Cargos y sus elementos de pago ──
    ws.addRow([]);
    const tCargos = ws.addRow(["Cargos reportados y detalle de compensación"]);
    tCargos.font = { bold: true, size: 12 };
    estiloCabecera(ws.addRow(COLS_CARGO.map((c) => c.h)));

    const filasOrdenadas = [...empresa.filas].sort((a, b) =>
      (a.departamento ?? "").localeCompare(b.departamento ?? "", "es") ||
      (a.tituloCargo ?? "").localeCompare(b.tituloCargo ?? "", "es"));

    for (const row of filasOrdenadas) {
      const t = totalesDe(row, empresa, bcvFallback);
      const elementos = elementosDePago(row, empresa.companyInfo.tasas ?? []);
      const nivel = gradeToNivel(row.hayGrade, row.capriFamily);
      const rol = capriRol(row.hayGrade);

      if (elementos.length === 0) {
        ws.addRow([
          row.departamento ?? "", row.tituloCargo ?? "", row.hayGrade ?? "", row.capriFamily ?? "", nivel, rol,
          "(sin elementos de pago cargados)", "", "", "", "", "", "", "",
          t.tem, t.temz, t.cim, t.pcta,
        ]);
        continue;
      }

      elementos.forEach((el, idx) => {
        const primera = idx === 0;
        ws.addRow([
          primera ? (row.departamento ?? "") : "",
          primera ? (row.tituloCargo ?? "") : "",
          primera ? (row.hayGrade ?? "") : "",
          primera ? (row.capriFamily ?? "") : "",
          primera ? nivel : "",
          primera ? rol : "",
          el.concepto, el.tipo, el.monto, el.cuentaMoneda, el.monedaPago, el.tasa, el.frecuencia, el.impacto,
          primera ? t.tem : "", primera ? t.temz : "", primera ? t.cim : "", primera ? t.pcta : "",
        ]);
      });
    }
  }

  return wb.xlsx.writeBuffer();
}

// ── Reporte 2: general por grados ───────────────────────────────────────────

const COLS_GRADOS = [
  { h: "Empresa", w: 36 }, { h: "Sector", w: 26 }, { h: "Subsector", w: 26 },
  { h: "Headcount", w: 12 }, { h: "Enviado", w: 10 },
  { h: "Departamento", w: 26 }, { h: "Cargo", w: 40 },
  { h: "Grado", w: 8 }, { h: "Familia", w: 9 }, { h: "Nivel CAPRI", w: 18 }, { h: "Rol CAPRI", w: 34 },
  { h: "TEM", w: 14 }, { h: "TEMz", w: 14 }, { h: "CIM", w: 14 }, { h: "PCTA", w: 16 },
];

export async function construirReportePorGrados(
  empresas: EmpresaConData[],
  etiquetaCorte: string,
  bcvFallback: number | null,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Market Analyzer";
  wb.created = new Date();

  const ws = wb.addWorksheet("Cargos por grado");
  ws.columns = COLS_GRADOS.map((c) => ({ width: c.w }));

  const titulo = ws.addRow([`Reporte general por grados — ${etiquetaCorte}`]);
  titulo.font = { bold: true, size: 14 };
  ws.addRow([`Generado el ${new Date().toLocaleString("es-VE")} · ${empresas.length} empresas`]);
  ws.addRow([]);
  estiloCabecera(ws.addRow(COLS_GRADOS.map((c) => c.h)));

  const filas: Array<(string | number)[]> = [];
  for (const empresa of empresas) {
    for (const row of empresa.filas) {
      const t = totalesDe(row, empresa, bcvFallback);
      filas.push([
        empresa.nombre, empresa.sector, empresa.subsector, empresa.headcount,
        empresa.enviado ? "Sí" : "No",
        row.departamento ?? "", row.tituloCargo ?? "",
        row.hayGrade ?? "", row.capriFamily ?? "",
        gradeToNivel(row.hayGrade, row.capriFamily), capriRol(row.hayGrade),
        t.tem, t.temz, t.cim, t.pcta,
      ]);
    }
  }

  // Por grado y después por empresa: así se comparan de una los cargos del mismo nivel.
  filas.sort((a, b) => (Number(a[7]) || 0) - (Number(b[7]) || 0) || String(a[0]).localeCompare(String(b[0]), "es"));
  filas.forEach((f) => ws.addRow(f));

  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS_GRADOS.length } };

  return wb.xlsx.writeBuffer();
}

export async function bcvActual() {
  const { rate } = await getBcvRate();
  return rate;
}
