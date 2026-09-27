/**
 * Informe del Estudio Especializado de una empresa.
 *
 * Los percentiles de mercado por grado los manda quien llama, sacados de
 * `/api/percentiles-by-grade`, por la misma razón que en el resto: esa es la
 * ruta canónica y recalcularlos acá abriría la puerta a que el informe y la
 * pantalla dijeran cosas distintas.
 */
import { getServerSession } from "next-auth";

import {
  CONFIG_POR_DEFECTO,
  SIMULADOR_POR_DEFECTO,
  analizarCompetitividad,
  analizarEquidad,
  analizarMapaCalor,
  compensacionDe,
  construirFilas,
  simularAjuste,
  type ConfigSimulador,
  type ConfiguracionInforme,
  type Ocupante,
  type OpcionesTcr,
  type PercentilesGrado,
} from "@/lib/analisis-especializado";
import { authOptions } from "@/lib/auth";
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import { tasasTcrDeEmpresa } from "@/lib/compensation";
import { getLibreRate } from "@/lib/tcr-config";
import { asegurarCorte, resolverAcceso } from "@/lib/estudio-cargos";
import { generarInformeEspecializado, mesYAnioEsp } from "@/lib/informe-especializado";
import { prisma } from "@/lib/prisma";
import { safeParseCompanyInfo } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";
import { construirDataEmpresa } from "@/lib/data-empresa";

export const maxDuration = 60;

type Cuerpo = {
  companyId?: string;
  snapshotId?: string;
  grupoComparacion?: string;
  tcr?: { tipo?: string } | null;
  /** Grados a analizar; vacío o ausente = todos. */
  grados?: number[];
  config?: Partial<ConfiguracionInforme>;
  configSimulador?: Partial<ConfigSimulador>;
  mercadoPorGrado?: Array<Record<string, unknown>>;
};

function numeroONulo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const session = await getServerSession(authOptions).catch(() => null);
  const acceso = resolverAcceso(session, body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el estudio." }, { status: 400 });

  const vetado = await asegurarCorte(acceso, snapshotId);
  if (vetado) return vetado;

  const config: ConfiguracionInforme = { ...CONFIG_POR_DEFECTO, ...(body?.config ?? {}) };
  const configSimulador: ConfigSimulador = { ...SIMULADOR_POR_DEFECTO, ...(body?.configSimulador ?? {}) };

  const mercadoPorGrado = new Map<number, PercentilesGrado>();
  for (const g of body?.mercadoPorGrado ?? []) {
    const grado = Number(g.grade);
    if (!Number.isFinite(grado)) continue;
    mercadoPorGrado.set(grado, {
      p90: numeroONulo(g.p90), p75: numeroONulo(g.p75), p50: numeroONulo(g.p50),
      p25: numeroONulo(g.p25), p10: numeroONulo(g.p10),
    });
  }

  const [cargos, empresa, workspace, { rate: bcvGeneral }, participantes, snapshot] = await Promise.all([
    prisma.estudioCargo.findMany({ where: { companyId: acceso.companyId } }),
    prisma.company.findUnique({
      where: { id: acceso.companyId },
      select: { name: true, minVacationDays: true, minUtilityDays: true },
    }),
    prisma.userWorkspace.findFirst({
      where: { user: { companyId: acceso.companyId } },
      select: { companyInfoJson: true },
    }),
    getBcvRate(),
    prisma.userSnapshot.findMany({
      where: { snapshotId, submittedAt: { not: null } },
      select: { company: { select: { name: true } } },
      distinct: ["companyId"],
    }),
    // processedAt manda sobre la fecha del corte: la portada dice cuándo se
    // procesó la data, no cómo se llama el corte.
    prisma.userSnapshot.findFirst({
      where: { snapshotId },
      select: { label: true, date: true, processedAt: true },
      orderBy: { processedAt: "desc" },
    }),
  ]);

  if (cargos.length === 0) {
    return Response.json({ message: "Esta empresa no tiene cargos cargados en su lista." }, { status: 400 });
  }

  const info = safeParseCompanyInfo(workspace?.companyInfoJson ?? "");
  const tasas = (info.tasas ?? []).filter((t) => !t.isSystem);
  const bcv = info.ratesAtSave?.bcvUsd ?? bcvGeneral;
  const diasVac = Number(empresa?.minVacationDays ?? info.minVacationDays) || 0;
  const diasUtil = Number(empresa?.minUtilityDays ?? info.minUtilityDays) || 0;

  // Los mismos grados que se están viendo en pantalla; si no vienen, todos.
  const gradosPedidos = Array.isArray(body?.grados)
    ? body.grados.map(Number).filter((n) => Number.isFinite(n))
    : [];
  const cargosEnFoco = gradosPedidos.length > 0
    ? cargos.filter((c) => typeof c.hayGrade === "number" && gradosPedidos.includes(c.hayGrade))
    : cargos;

  const ocupantes: Ocupante[] = cargosEnFoco.map((c) => {
    let data: Partial<ExtendedMarketPosition> = {};
    try { data = JSON.parse(c.dataJson) as Partial<ExtendedMarketPosition>; } catch { data = {}; }
    return {
      id: c.id, ocupanteId: c.ocupanteId ?? "", departamento: c.departamento,
      reportaA: c.reportaA ?? "",
      tituloCargo: c.tituloCargo, hayGrade: c.hayGrade, capriFamily: c.capriFamily, data,
    };
  });

  const nombreEmpresa = empresa?.name ?? "";

  // Si el informe va en TCR, se resuelve con las mismas tasas que la pantalla
  // y que la ruta de percentiles TCR: las que la empresa tenía al enviar.
  const tipoTcr = body?.tcr?.tipo;
  let opcionesTcr: OpcionesTcr | null = null;
  if (tipoTcr === "bcv" || tipoTcr === "euro" || tipoTcr === "libre") {
    const [bcvG, bcvEurG, binanceG, libreG] = await Promise.all([
      getBcvRate(), getBcvEuroRate(), getBinanceRate(), getLibreRate(),
    ]);
    const r = tasasTcrDeEmpresa(
      info.ratesAtSave,
      { bcv: bcvG.rate, bcvEur: bcvEurG.rate, binance: binanceG.rate, libreManual: libreG.rate },
      tipoTcr,
    );
    if (r.tcrRate > 0) {
      opcionesTcr = { tipo: tipoTcr, bcvEur: r.bcvEurRate, libre: r.libreRate, tasaTcr: r.tcrRate };
    }
  }

  const filas = construirFilas(ocupantes, nombreEmpresa, tasas, bcv, diasVac, diasUtil, config, opcionesTcr);

  const buffer = await generarInformeEspecializado({
    cliente: nombreEmpresa,
    proyecto: snapshot?.label ?? snapshotId,
    fechaInforme: mesYAnioEsp(new Date()),
    fechaData: mesYAnioEsp(snapshot?.processedAt ?? snapshot?.date ?? new Date()),
    empresasParticipantes: [...new Set(participantes.map((p) => p.company?.name).filter((n): n is string => Boolean(n)))]
      .sort((a, b) => a.localeCompare(b, "es")),
    config,
    configSimulador,
    parametros: { diasVacaciones: diasVac, diasUtilidades: diasUtil, bcv },
    tcr: opcionesTcr
      ? {
          etiqueta: opcionesTcr.tipo === "libre" ? "Libre" : opcionesTcr.tipo === "euro" ? "BCV euro" : "BCV dólar",
          tasa: opcionesTcr.tasaTcr,
        }
      : null,
    dataEmpresa: construirDataEmpresa(
      ocupantes,
      // El total de cada ocupante según la métrica elegida y, cuando el
      // estudio va en TCR, su equivalente. Antes eran fórmulas de la
      // plantilla; al rediseñarla quedaron en #REF!, así que los calcula el
      // sistema (AC Consulting, 2026-09-27).
      new Map(ocupantes.map((o) => [o.id, {
        metrica: compensacionDe(o, tasas, bcv, diasVac, diasUtil, config),
        tcr: opcionesTcr ? compensacionDe(o, tasas, bcv, diasVac, diasUtil, config, opcionesTcr) : null,
      }])),
    ),
    grupoComparacion: (body?.grupoComparacion ?? "").trim() || "Mercado general",
    dispersion: filas,
    equidad: analizarEquidad(filas, config.aperturaBandas),
    competitividad: analizarCompetitividad(filas, mercadoPorGrado),
    mapaCalor: analizarMapaCalor(filas, mercadoPorGrado),
    simulador: simularAjuste(filas, mercadoPorGrado, config.aperturaBandas, configSimulador),
    mercadoPorGrado,
    // El mapeo solo puede armarse con los ocupantes que tienen grado: la
    // cuadrícula es grado × área funcional.
    mapeo: ocupantes
      .filter((o) => o.hayGrade !== null)
      .map((o) => ({
        grado: o.hayGrade as number,
        area: o.departamento || "Sin unidad",
        tituloCargo: o.tituloCargo,
        unidadFuncional: o.departamento,
        reportaA: cargos.find((c) => c.id === o.id)?.reportaA ?? "",
      })),
  });

  const nombre = `Informe especializado - ${nombreEmpresa} - ${snapshot?.label ?? snapshotId}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
