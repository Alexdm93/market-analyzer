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
import { tasasTcrDeEmpresa, type TcrType } from "@/lib/compensation";
import { getLibreRate } from "@/lib/tcr-config";
import { asegurarCorte, resolverAcceso } from "@/lib/estudio-cargos";
import {
  generarInformeEspecializado,
  mesYAnioEsp,
  type MercadoPorCargo,
  type VarianteInforme,
} from "@/lib/informe-especializado";
import { cupoAgotado } from "@/lib/cupo-informes";
import { MINIMO_EMPRESAS_DEL_GRUPO, leerFiltrosMercado, tamanoDeEmpresa } from "@/lib/filtros-mercado";
import { calcularPercentilesMercado, calcularPercentilesTcr } from "@/lib/percentiles-mercado";
import { elegirTendencia } from "@/lib/tendencia-compensacion";
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
  /**
   * Los filtros del grupo de comparación, tal como viajan en la URL de
   * `/api/estudio/mercado`. Sirven para volver a contar las empresas del
   * grupo acá: el botón deshabilitado en pantalla no es una regla.
   */
  filtrosGrupo?: string;
  /** "cargo" o "grado": forma parte de lo que define el corte de data. */
  modo?: string;
};

/**
 * El mercado contra el que se compara, calculado acá y no recibido del
 * navegador.
 *
 * Es la misma fuente que alimenta la pantalla —`lib/percentiles-mercado`—, así
 * que el Excel no puede decir algo distinto de lo que el cliente está viendo.
 * Y viene con la matriz por grado ya suavizada.
 */
async function mercadoDelInforme(snapshotId: string, filtros: string, tcrType: TcrType | null) {
  const [workspaces, bcv, bcvEur, binance, libre] = await Promise.all([
    prisma.userWorkspace.findMany({ select: { snapshotsJson: true, companyInfoJson: true } }),
    getBcvRate(), getBcvEuroRate(), getBinanceRate(), getLibreRate(),
  ]);

  const parametros = { snapshotId, filtros: leerFiltrosMercado(new URLSearchParams(filtros)), workspaces };

  return tcrType
    ? calcularPercentilesTcr({
        ...parametros,
        tcrType,
        globales: { bcv: bcv.rate, bcvEur: bcvEur.rate, binance: binance.rate, libreManual: libre.rate },
      })
    : calcularPercentilesMercado({ ...parametros, bcvGeneral: bcv.rate });
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

  const tipoTcrPedido = body?.tcr?.tipo;
  const tcrType: TcrType | null =
    tipoTcrPedido === "bcv" || tipoTcrPedido === "euro" || tipoTcrPedido === "libre" ? tipoTcrPedido : null;

  const mercado = await mercadoDelInforme(snapshotId, body?.filtrosGrupo ?? "", tcrType);

  // El grupo de comparación necesita un mínimo de empresas para que nadie
  // deduzca el sueldo de una en particular. Lo fijó AC Consulting en doce
  // (2026-10-14) y no alcanza con esconder el botón.
  if (!acceso.esAdmin && mercado.grupo.empresasEnGrupo < MINIMO_EMPRESAS_DEL_GRUPO) {
    return Response.json(
      {
        message: `El grupo de comparación tiene ${mercado.grupo.empresasEnGrupo} `
          + `${mercado.grupo.empresasEnGrupo === 1 ? "empresa" : "empresas"} y hacen falta `
          + `${MINIMO_EMPRESAS_DEL_GRUPO}. Amplía alguno de los criterios.`,
      },
      { status: 400 },
    );
  }

  // El cupo también se mira acá: si solo se controlara al guardar en el
  // historial, bastaría con no guardar para saltárselo. Un corte ya guardado
  // se puede volver a bajar siempre.
  if (!acceso.esAdmin) {
    const agotado = await cupoAgotado(acceso.companyId, {
      snapshotId,
      modo: body?.modo ?? "",
      metrica: config.concepto,
      tcr: body?.tcr?.tipo ?? null,
      comisiones: Boolean(config.incluirComisiones),
      filtros: body?.filtrosGrupo ?? "",
      grados: body?.grados ?? [],
    });
    if (agotado) {
      return Response.json(
        {
          message: `Ya configuraste los ${agotado.estado.cupo} cortes de data de este estudio. `
            + "Guarda el informe desde el historial para volver a descargarlo, o pide autorización "
            + "al administrador para armar uno nuevo.",
          cupo: agotado.estado,
        },
        { status: 409 },
      );
    }
  }

  // El informe va contra grados o contra cargos homologados, y cada variante
  // rellena su propia plantilla.
  const variante: VarianteInforme = body?.modo === "cargo" ? "cargos" : "grados";

  const mercadoPorGrado = new Map<number, PercentilesGrado>();
  for (const g of mercado.grades) {
    const m = g[config.concepto];
    mercadoPorGrado.set(g.grade, {
      p90: m.p90, p75: m.p75, p50: m.p50, p25: m.p25, p10: m.p10,
    });
  }

  const mercadoPorCargo: MercadoPorCargo[] = mercado.cargos.map((c) => {
    const m = c[config.concepto];
    return {
      tituloCargo: c.tituloCargo,
      p90: m.p90, p75: m.p75, p50: m.p50, p25: m.p25, p10: m.p10,
      promedio: m.promedio, minimo: m.min, maximo: m.max,
    };
  });

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
      select: {
        userId: true,
        company: { select: { name: true, economicSector: true, headcount: true } },
      },
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

  // Sector y tamaño de cada participante: alimentan los dos treemaps de la
  // hoja de empresas. Manda lo que la empresa declaró al enviar su data, que
  // es la fuente de los filtros de mercado; la ficha del admin queda de
  // respaldo.
  const infoPorUsuario = new Map(
    (await prisma.userWorkspace.findMany({
      where: { userId: { in: participantes.map((p) => p.userId) } },
      select: { userId: true, companyInfoJson: true },
    })).map((w) => [w.userId, safeParseCompanyInfo(w.companyInfoJson)]),
  );
  const participantesConPerfil = participantes
    .filter((p) => p.company?.name)
    .map((p) => {
      const suya = infoPorUsuario.get(p.userId);
      const tamano = tamanoDeEmpresa(suya?.headcount || p.company?.headcount || "");
      return {
        empresa: p.company!.name,
        sector: (suya?.sector || p.company?.economicSector || "").trim(),
        tamano: tamano ? tamano.charAt(0).toUpperCase() + tamano.slice(1) : "",
      };
    })
    .sort((a, b) => a.empresa.localeCompare(b.empresa, "es"));

  const filas = construirFilas(ocupantes, nombreEmpresa, tasas, bcv, diasVac, diasUtil, config, opcionesTcr);

  // La curva de la dispersión: de ella sale el punto medio de cada banda de
  // equidad, así que se calcula una vez y se usa en los dos lados.
  const tendencia = elegirTendencia(
    filas
      .filter((f) => f.grado !== null && f.compensacion > 0)
      .map((f) => ({ x: f.grado as number, y: f.compensacion })),
  );

  const buffer = await generarInformeEspecializado({
    variante,
    cliente: nombreEmpresa,
    proyecto: snapshot?.label ?? snapshotId,
    fechaInforme: mesYAnioEsp(new Date()),
    fechaData: mesYAnioEsp(snapshot?.processedAt ?? snapshot?.date ?? new Date()),
    empresasParticipantes: participantesConPerfil,
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
    tendencia,
    equidad: analizarEquidad(filas, config.aperturaBandas, tendencia),
    competitividad: analizarCompetitividad(filas, mercadoPorGrado),
    mapaCalor: analizarMapaCalor(filas, mercadoPorGrado),
    simulador: simularAjuste(filas, mercadoPorGrado, config.aperturaBandas, configSimulador),
    mercadoPorGrado,
    mercadoPorCargo,
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

  // ── Auditoría del suavizado ──
  // Cada informe deja la foto de su matriz: la cruda del mercado, la que vio
  // el cliente y qué hizo el algoritmo. Si falla, el informe igual se entrega:
  // la auditoría es para nosotros, no para el cliente.
  try {
    await prisma.auditoriaSuavizado.create({
      data: {
        companyId: acceso.companyId,
        snapshotId,
        snapshotLabel: snapshot?.label ?? "",
        grupoComparacion: (body?.grupoComparacion ?? "").trim() || "Mercado general",
        filtros: body?.filtrosGrupo ?? "",
        metrica: config.concepto,
        datosJson: JSON.stringify(mercado.suavizado),
        generadoPor: session?.user?.name ?? session?.user?.email ?? "",
      },
    });
  } catch {
    // Sin auditoría, pero con informe.
  }

  const nombre = `Informe especializado - ${nombreEmpresa} - ${snapshot?.label ?? snapshotId}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
