/**
 * Lo que la pantalla del Radar Salarial necesita saber antes de empezar.
 *
 * Devuelve de una sola vez si la empresa lo tiene habilitado, qué le falta en
 * la ficha, de qué corte sale, cuánto cupo le queda en el trimestre y el
 * catálogo de cargos con su descripción.
 *
 * Las descripciones salen de `position-descriptions`, el mapa cargo →
 * descripción que mantiene el admin y que ya alimenta la pantalla de Data. El
 * catálogo del corte solo guarda departamento y título, así que la
 * descripción se busca por el nombre del cargo.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { catalogoDelCorte } from "@/lib/estudio-cargos";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";
import { prisma } from "@/lib/prisma";
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import { CAPRI_ROLES, gradeToNivel } from "@/lib/capri";
import { RUTAS } from "@/lib/capri-evaluacion";
import type { TcrType } from "@/lib/compensation";
import {
  calcularPercentilesMercado,
  calcularPercentilesTcr,
  workspacesDelCorte,
  type ObservacionMercado,
} from "@/lib/percentiles-mercado";
import {
  MINIMO_EMPRESAS_RADAR,
  cargosConDatos,
  corteDelRadar,
  estadoDelCupo,
  faltaEnLaFicha,
  type EstadoCupoRadar,
} from "@/lib/radar";
import {
  METRICAS_DEL_CLIENTE,
  METRICAS_RADAR,
  PERCENTILES_RADAR,
  describirMuestra,
  type FilaPosicionamiento,
  type MuestraDelRadar,
  type PercentilRadar,
} from "@/lib/radar-mercado";
import { leerFiltrosMercado, type FiltrosMercado } from "@/lib/filtros-mercado";
import { getLibreRate } from "@/lib/tcr-config";
import { safeParseCompanyInfo } from "@/lib/workspace";

export type CargoDelRadar = { tituloCargo: string; descripcion: string };
export type UnidadDelRadar = { unidad: string; cargos: CargoDelRadar[] };
export type CorteDisponible = { id: string; label: string; date: string };

export type ContextoRadar = {
  habilitado: boolean;
  /** Qué le falta a la empresa en su ficha para poder bajar un informe. */
  falta: string[];
  corte: { id: string; label: string; date: string } | null;
  cupo: EstadoCupoRadar | null;
  unidades: UnidadDelRadar[];
  /** El tramo de facturación: limita las rutas CAPRI si se valora un cargo. */
  facturacion: string;
  empresa: string;
  /**
   * El administrador no tiene tope y elige de qué corte sale cada reporte.
   *
   * Para una empresa el corte es uno solo —el que fijó el admin— pero el admin
   * necesita poder mirar cualquier corte publicado, igual que en el Estudio de
   * Competitividad (AC Consulting, 2026-10-20).
   */
  ilimitado: boolean;
  cortes: CorteDisponible[];
  /** Con qué se puede recortar el mercado. Solo se llena para el admin. */
  recorte: {
    sectores: string[];
    clasificaciones: string[];
    localidades: string[];
    empresas: string[];
    /** Cuántas empresas quedan con el recorte que vino en la consulta. */
    empresasEnGrupo: number;
  } | null;
};

const VACIO: ContextoRadar = {
  habilitado: false, falta: [], corte: null, cupo: null,
  unidades: [], facturacion: "", empresa: "",
  ilimitado: false, cortes: [], recorte: null,
};

/**
 * El corte del que sale el reporte.
 *
 * Para una empresa, siempre el que fijó el admin. El admin puede pedir otro,
 * pero solo de los publicados: el Radar no sale de data que todavía se mueve.
 */
async function corteElegido(esAdmin: boolean, pedido: string): Promise<string> {
  if (!esAdmin || !pedido) return corteDelRadar();
  const publicados = await getPublishedSnapshotIds();
  return publicados.includes(pedido) ? pedido : corteDelRadar();
}

/** Los cortes publicados, con su etiqueta, para el selector del admin. */
async function cortesPublicados(): Promise<CorteDisponible[]> {
  const publicados = await getPublishedSnapshotIds();
  if (publicados.length === 0) return [];
  const filas = await prisma.userSnapshot.findMany({
    where: { snapshotId: { in: publicados } },
    select: { snapshotId: true, label: true, date: true },
    distinct: ["snapshotId"],
    orderBy: { date: "desc" },
  });
  return filas.map((c) => ({ id: c.snapshotId, label: c.label, date: c.date.toISOString().slice(0, 10) }));
}

async function descripciones(): Promise<Record<string, string>> {
  const fila = await prisma.globalConfig.findUnique({
    where: { key: "position-descriptions" },
    select: { value: true },
  });
  try {
    const parsed = JSON.parse(fila?.value ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const esAdmin = session.user.role === "ADMIN";
  const parametros = new URL(request.url).searchParams;
  const companyId = esAdmin
    ? (parametros.get("companyId")?.trim() || session.user.companyId || "")
    : (session.user.companyId ?? "");

  if (!companyId) return Response.json(VACIO satisfies ContextoRadar);

  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true, radarEnabled: true, economicSector: true, headcount: true,
      revenueUSD: true, hrName: true, hrEmail: true, hrPhone: true,
    },
  });

  // El admin entra siempre, para poder revisar lo que ve el cliente.
  const habilitado = esAdmin || Boolean(empresa?.radarEnabled);
  if (!empresa || !habilitado) {
    return Response.json({ ...VACIO, empresa: empresa?.name ?? "" } satisfies ContextoRadar);
  }

  const snapshotId = await corteElegido(esAdmin, parametros.get("corte")?.trim() ?? "");
  const [corte, catalogo, textos, cupo, workspace, cortes, conDatos] = await Promise.all([
    snapshotId
      ? prisma.userSnapshot.findFirst({
          where: { snapshotId },
          select: { label: true, date: true },
          orderBy: { date: "desc" },
        })
      : Promise.resolve(null),
    snapshotId ? catalogoDelCorte(snapshotId) : Promise.resolve([]),
    descripciones(),
    estadoDelCupo(companyId),
    prisma.userWorkspace.findFirst({
      where: { user: { companyId } },
      select: { companyInfoJson: true },
    }),
    esAdmin ? cortesPublicados() : Promise.resolve([]),
    cargosConDatos(snapshotId),
  ]);

  // El admin recorta el mercado como en el Estudio de Competitividad, así que
  // necesita las listas de sectores, clasificaciones, ubicaciones y empresas
  // del corte, y cuántas quedan con el recorte que trae puesto. Salen del
  // mismo recorrido que los percentiles, que es el único que sabe qué empresa
  // participó de verdad en este corte (AC Consulting, 2026-10-21).
  let recorte: ContextoRadar["recorte"] = null;
  if (esAdmin && snapshotId) {
    const [{ workspaces, enviaron }, bcvGeneral] = await Promise.all([
      workspacesDelCorte(snapshotId),
      getBcvRate(),
    ]);
    const { grupo } = calcularPercentilesMercado({
      snapshotId, filtros: leerFiltrosMercado(parametros), workspaces, enviaron, bcvGeneral: bcvGeneral.rate,
    });
    recorte = {
      sectores: grupo.sectores,
      clasificaciones: grupo.clasificaciones,
      localidades: grupo.localidades,
      empresas: grupo.empresas,
      empresasEnGrupo: grupo.empresasEnGrupo,
    };
  }

  // Agrupado por unidad funcional, que es como lo pide la pantalla: primero la
  // unidad, después el cargo.
  //
  // Solo entran los cargos que este corte puede responder. El catálogo es el
  // diccionario de la encuesta y trae cargos que nadie reportó, o que reportaron
  // menos empresas de las que la metodología exige para calcular siquiera la
  // mediana; ofrecerlos terminaba en "el estudio no tiene data de mercado para
  // X" después de que el cliente ya había elegido. Una unidad que se queda sin
  // cargos desaparece sola, porque nunca llega a crearse
  // (AC Consulting, 2026-10-30).
  const porUnidad = new Map<string, CargoDelRadar[]>();
  for (const c of catalogo) {
    const empresas = conDatos[c.tituloCargo.trim().toLowerCase()] ?? 0;
    if (empresas < MINIMO_EMPRESAS_RADAR) continue;
    const unidad = c.departamento || "Sin unidad";
    const lista = porUnidad.get(unidad) ?? [];
    lista.push({ tituloCargo: c.tituloCargo, descripcion: textos[c.tituloCargo] ?? "" });
    porUnidad.set(unidad, lista);
  }

  const info = safeParseCompanyInfo(workspace?.companyInfoJson ?? null);

  return Response.json({
    habilitado: true,
    falta: faltaEnLaFicha(empresa),
    corte: corte && snapshotId
      ? { id: snapshotId, label: corte.label, date: corte.date.toISOString().slice(0, 10) }
      : null,
    cupo,
    unidades: [...porUnidad.entries()]
      .map(([unidad, cargos]) => ({
        unidad,
        cargos: cargos.sort((a, b) => a.tituloCargo.localeCompare(b.tituloCargo, "es")),
      }))
      .sort((a, b) => a.unidad.localeCompare(b.unidad, "es")),
    facturacion: (empresa.revenueUSD || info.revenueUSD || "").trim(),
    empresa: empresa.name,
    ilimitado: esAdmin,
    cortes,
    recorte,
  } satisfies ContextoRadar);
}

// ── Emisión del informe ─────────────────────────────────────────────────────

export type InformeRadar = {
  /** Cómo se armó: del catálogo del corte, o valorando con CAPRI. */
  modo: "cargo" | "grado";
  corte: { id: string; label: string; date: string };
  empresa: string;
  emitido: string;
  tcr: string | null;
  /** El recorte del mercado, en una frase. Null = el corte entero. */
  grupo: string | null;
  perfil: {
    tituloCargo: string;
    unidadFuncional: string;
    descripcion: string;
    /** Solo en el modo grado. */
    rutaCapri: string;
    clasificacion: string;
    grado: number | null;
    rol: string;
  };
  muestra: MuestraDelRadar;
  posicionamiento: FilaPosicionamiento[];
};

type CuerpoEmision = {
  companyId?: string;
  modo?: string;
  /** El cargo del catálogo, o el nombre que le puso la empresa. */
  tituloCargo?: string;
  unidad?: string;
  grado?: number;
  familia?: string;
  tcr?: { tipo?: string } | null;
  /** Solo el admin: de qué corte publicado sale el reporte. */
  corte?: string;
  /** Solo el admin: el recorte del mercado, como query string. */
  filtrosGrupo?: string;
};

function esTcr(v: string): v is TcrType {
  return v === "bcv" || v === "euro" || v === "libre";
}

const SIN_FILTROS: FiltrosMercado = {
  sectores: [], clasificaciones: [], empresas: [], localidades: [], tamanos: [],
};

/** En una frase, contra quién se comparó. Vacío = el corte entero. */
function describirGrupo(f: FiltrosMercado): string {
  const resumir = (xs: string[], uno: string, varios: string) =>
    xs.length === 1 ? `${uno} ${xs[0]}` : xs.length > 1 ? `${xs.length} ${varios}` : "";
  return [
    resumir(f.sectores, "Sector", "sectores"),
    resumir(f.clasificaciones, "Clasificación", "clasificaciones"),
    resumir(f.localidades, "Ubicación", "ubicaciones"),
    resumir(f.tamanos, "Tamaño", "tamaños"),
    resumir(f.empresas, "Empresa", "empresas"),
  ].filter(Boolean).join(" · ");
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as CuerpoEmision | null;
  const esAdmin = session.user.role === "ADMIN";
  const companyId = esAdmin
    ? (body?.companyId?.trim() || session.user.companyId || "")
    : (session.user.companyId ?? "");
  if (!companyId) return Response.json({ message: "Tu usuario no tiene empresa asignada." }, { status: 400 });

  const modo = body?.modo === "grado" ? "grado" : "cargo";
  const tituloCargo = (body?.tituloCargo ?? "").replace(/\s+/g, " ").trim();
  if (!tituloCargo) return Response.json({ message: "Indica el cargo." }, { status: 400 });

  const grado = modo === "grado" ? Math.round(Number(body?.grado)) : null;
  if (modo === "grado" && (!Number.isFinite(grado) || grado! < 8 || grado! > 25)) {
    return Response.json({ message: "La valoración CAPRI va del grado 8 al 25." }, { status: 400 });
  }

  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true, radarEnabled: true, economicSector: true, headcount: true,
      revenueUSD: true, hrName: true, hrEmail: true, hrPhone: true,
    },
  });
  if (!empresa) return Response.json({ message: "No se encontró la empresa." }, { status: 404 });
  if (!esAdmin && !empresa.radarEnabled) {
    return Response.json({ message: "Tu empresa no tiene el Radar Salarial habilitado." }, { status: 403 });
  }

  const falta = faltaEnLaFicha(empresa);
  if (falta.length > 0) {
    return Response.json(
      { message: `Para bajar un Radar falta completar ${falta.join(", ")} en Información de la empresa.` },
      { status: 400 },
    );
  }

  const cupo = await estadoDelCupo(companyId);
  if (!esAdmin && cupo.restantes <= 0) {
    return Response.json(
      { message: `Ya usaste los ${cupo.cupo} informes de este trimestre. Se reponen el ${cupo.seRepone}.`, cupo },
      { status: 409 },
    );
  }

  const snapshotId = await corteElegido(esAdmin, (body?.corte ?? "").trim());
  if (!snapshotId) {
    return Response.json({ message: "El administrador todavía no eligió el estudio del Radar." }, { status: 400 });
  }

  const tipoTcr = (body?.tcr?.tipo ?? "").trim();
  if (tipoTcr && !esTcr(tipoTcr)) {
    return Response.json({ message: "Ese tipo de cambio no existe." }, { status: 400 });
  }

  const [corte, catalogo, textos, delCorte, bcv, bcvEur, binance, libre] = await Promise.all([
    prisma.userSnapshot.findFirst({
      where: { snapshotId }, select: { label: true, date: true }, orderBy: { date: "desc" },
    }),
    catalogoDelCorte(snapshotId),
    descripciones(),
    workspacesDelCorte(snapshotId),
    getBcvRate(), getBcvEuroRate(), getBinanceRate(), getLibreRate(),
  ]);
  const { workspaces, enviaron } = delCorte;

  // Las observaciones que el mercado cuenta, para describir la misma muestra
  // con la que se calcularon los percentiles.
  const observaciones: ObservacionMercado[] = [];
  const clave = modo === "cargo" ? tituloCargo.toLowerCase() : grado!;
  const observar = (o: ObservacionMercado) => {
    if (o.tipo === modo && o.clave === clave) observaciones.push(o);
  };

  // Una empresa siempre se compara contra el corte entero; el admin puede
  // recortarlo igual que en el Estudio de Competitividad.
  const filtros = esAdmin && body?.filtrosGrupo
    ? leerFiltrosMercado(new URLSearchParams(body.filtrosGrupo))
    : SIN_FILTROS;

  const mercado = tipoTcr && esTcr(tipoTcr)
    ? calcularPercentilesTcr({
        snapshotId, tcrType: tipoTcr, filtros, workspaces, enviaron,
        globales: { bcv: bcv.rate, bcvEur: bcvEur.rate, binance: binance.rate, libreManual: libre.rate },
        observar,
      })
    : calcularPercentilesMercado({
        snapshotId, filtros, workspaces, enviaron, bcvGeneral: bcv.rate, observar,
      });

  const fuente = modo === "cargo"
    ? mercado.cargos.find((c) => c.tituloCargo.trim().toLowerCase() === clave)
    : mercado.grades.find((g) => g.grade === grado);

  if (!fuente) {
    return Response.json({
      message: modo === "cargo"
        ? `El estudio no tiene data de mercado para "${tituloCargo}".`
        : `El estudio no tiene data de mercado para el grado ${grado}.`,
    }, { status: 400 });
  }

  // La pantalla ya no ofrece cargos por debajo del mínimo, pero la ruta no se
  // fía de la pantalla: con menos empresas que las que pide la mediana el
  // informe saldría entero en ND, y eso no es un informe. Solo aplica al modo
  // "cargo": los grados pasan por el suavizado, que es otra regla.
  if (modo === "cargo" && fuente.n < MINIMO_EMPRESAS_RADAR) {
    return Response.json({
      message: `"${tituloCargo}" no tiene suficientes empresas en este estudio para calcular percentiles.`,
    }, { status: 400 });
  }

  // El informe de una empresa publica TEM y PCTA; el del admin, las cuatro.
  const posicionamiento: FilaPosicionamiento[] = METRICAS_RADAR
    .filter((m) => esAdmin || METRICAS_DEL_CLIENTE.includes(m.clave))
    .map((m) => ({
      etiqueta: m.etiqueta,
      valores: Object.fromEntries(
        PERCENTILES_RADAR.map((p) => [p, fuente[m.clave][p]]),
      ) as Record<PercentilRadar, number | null>,
    }));

  const delCatalogo = catalogo.find((c) => c.tituloCargo.trim().toLowerCase() === tituloCargo.toLowerCase());
  const familia = (body?.familia ?? "").trim().toUpperCase();

  const informe: InformeRadar = {
    modo,
    corte: {
      id: snapshotId,
      label: corte?.label ?? snapshotId,
      date: (corte?.date ?? new Date()).toISOString().slice(0, 10),
    },
    empresa: empresa.name,
    emitido: new Date().toISOString().slice(0, 10),
    tcr: tipoTcr || null,
    grupo: describirGrupo(filtros) || null,
    perfil: {
      tituloCargo,
      unidadFuncional: delCatalogo?.departamento || (body?.unidad ?? "").trim(),
      descripcion: textos[tituloCargo] ?? "",
      rutaCapri: modo === "grado" ? (RUTAS.find((r) => r.familia === familia)?.etiqueta ?? "") : "",
      clasificacion: modo === "grado" ? gradeToNivel(grado ?? undefined, familia || undefined) : "",
      grado: modo === "grado" ? grado : null,
      rol: modo === "grado" && grado ? (CAPRI_ROLES[grado]?.rol ?? "") : "",
    },
    muestra: describirMuestra(observaciones, bcv.rate),
    posicionamiento,
  };

  // El informe se guarda entero y consume cupo. El admin que entra a revisar
  // no guarda nada: su vista previa no es un informe de la empresa ni puede
  // gastarle el trimestre (AC Consulting, 2026-10-20).
  if (esAdmin) return Response.json({ informe, cupo, id: null });

  const guardado = await prisma.radarInforme.create({
    data: {
      companyId,
      generadoPor: session.user.email ?? session.user.id,
      snapshotId,
      snapshotLabel: informe.corte.label,
      modo,
      trimestre: cupo.trimestre,
      titulo: tituloCargo,
      datosJson: JSON.stringify(informe),
    },
    select: { id: true },
  });

  return Response.json({ informe, id: guardado.id, cupo: await estadoDelCupo(companyId) });
}
