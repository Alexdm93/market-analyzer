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
  construirFilas,
  simularAjuste,
  type ConfigSimulador,
  type ConfiguracionInforme,
  type Ocupante,
  type PercentilesGrado,
} from "@/lib/analisis-especializado";
import { authOptions } from "@/lib/auth";
import { getBcvRate } from "@/lib/bcv";
import { resolverAcceso } from "@/lib/estudio-cargos";
import { generarInformeEspecializado, mesYAnioEsp } from "@/lib/informe-especializado";
import { prisma } from "@/lib/prisma";
import { safeParseCompanyInfo } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";

export const maxDuration = 60;

type Cuerpo = {
  companyId?: string;
  snapshotId?: string;
  version?: string;
  grupoComparacion?: string;
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
    prisma.userSnapshot.findFirst({ where: { snapshotId }, select: { label: true, date: true } }),
  ]);

  if (cargos.length === 0) {
    return Response.json({ message: "Esta empresa no tiene cargos cargados en su lista." }, { status: 400 });
  }

  const info = safeParseCompanyInfo(workspace?.companyInfoJson ?? "");
  const tasas = (info.tasas ?? []).filter((t) => !t.isSystem);
  const bcv = info.ratesAtSave?.bcvUsd ?? bcvGeneral;
  const diasVac = Number(empresa?.minVacationDays ?? info.minVacationDays) || 0;
  const diasUtil = Number(empresa?.minUtilityDays ?? info.minUtilityDays) || 0;

  const ocupantes: Ocupante[] = cargos.map((c) => {
    let data: Partial<ExtendedMarketPosition> = {};
    try { data = JSON.parse(c.dataJson) as Partial<ExtendedMarketPosition>; } catch { data = {}; }
    return {
      id: c.id, ocupanteId: c.ocupanteId ?? "", departamento: c.departamento,
      tituloCargo: c.tituloCargo, hayGrade: c.hayGrade, capriFamily: c.capriFamily, data,
    };
  });

  const nombreEmpresa = empresa?.name ?? "";
  const filas = construirFilas(ocupantes, nombreEmpresa, tasas, bcv, diasVac, diasUtil, config);

  const buffer = await generarInformeEspecializado({
    cliente: nombreEmpresa,
    proyecto: snapshot?.label ?? snapshotId,
    fechaInforme: mesYAnioEsp(new Date()),
    fechaData: mesYAnioEsp(snapshot?.date ?? new Date()),
    version: (body?.version ?? "V1R1").trim() || "V1R1",
    empresasParticipantes: [...new Set(participantes.map((p) => p.company?.name).filter((n): n is string => Boolean(n)))]
      .sort((a, b) => a.localeCompare(b, "es")),
    config,
    configSimulador,
    grupoComparacion: (body?.grupoComparacion ?? "").trim() || "Transversales",
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

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
