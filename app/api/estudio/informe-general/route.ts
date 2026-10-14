/**
 * Genera el Informe General de Tendencias Salariales de un corte.
 *
 * A diferencia del de cortesía, los percentiles NO los manda quien llama: se
 * calculan acá con `lib/percentiles-mercado`. No hay ninguna pantalla que
 * muestre lo mismo, así que no hay nada con lo que tuviera que coincidir, y
 * depender del navegador para las cifras ya nos costó una columna en "ND".
 *
 * Quién puede bajarlo lo decide el admin empresa por empresa y corte por
 * corte: no hace falta haber enviado data (AC Consulting, 2026-10-12).
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { CATEGORIAS } from "@/lib/distribucion-compensacion";
import { CorteSinDatos, reunirDatosDelCorte } from "@/lib/datos-del-corte";
import {
  METRICAS,
  generarInformeGeneral,
  type GrupoMercadoGeneral,
  type MetricaInforme,
} from "@/lib/informe-general";
import { mesYAnio } from "@/lib/informe-hojas-comunes";
import { calcularPercentilesMercado, calcularPercentilesTcr } from "@/lib/percentiles-mercado";
import { prisma } from "@/lib/prisma";
import type { TcrType } from "@/lib/compensation";

export const maxDuration = 60;

type Cuerpo = {
  snapshotId?: string;
  companyId?: string;
  metrica?: string;
  /** Null o ausente deja el informe en la moneda base del corte. */
  tcr?: { tipo?: string } | null;
};

const SIN_FILTROS = { sectores: [], clasificaciones: [], empresas: [], localidades: [], tamanos: [] };

function esMetrica(v: string): v is MetricaInforme {
  return v in METRICAS;
}

function esTcr(v: string): v is TcrType {
  return v === "bcv" || v === "euro" || v === "libre";
}

function listaDeIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Los cortes del informe general que el admin le habilitó a una empresa. */
async function cortesDelInformeGeneral(companyId: string): Promise<string[]> {
  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: { generalEnabled: true, generalSnapshotIds: true },
  });
  if (!empresa?.generalEnabled) return [];
  try {
    const parsed = JSON.parse(empresa.generalSnapshotIds) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Qué puede bajar quien pregunta: los cortes habilitados y si tiene un
 * informe de beneficios autorizado. El admin ve todos los cortes del sistema.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const esAdmin = session.user.role === "ADMIN";
  const companyId = esAdmin
    ? (new URL(request.url).searchParams.get("companyId")?.trim() ?? "")
    : (session.user.companyId ?? "");

  const permitidos = esAdmin || !companyId ? null : new Set(await cortesDelInformeGeneral(companyId));

  const todos = await prisma.userSnapshot.findMany({
    select: { snapshotId: true, label: true, date: true },
    distinct: ["snapshotId"],
    orderBy: { date: "desc" },
  });

  const cortes = todos
    .filter((s) => !permitidos || permitidos.has(s.snapshotId))
    .map((s) => ({ id: s.snapshotId, label: s.label, date: s.date.toISOString().slice(0, 10) }));

  const empresa = companyId
    ? await prisma.company.findUnique({
        where: { id: companyId },
        select: { beneficiosInformeIds: true },
      })
    : null;

  const autorizados = listaDeIds(empresa?.beneficiosInformeIds ?? "[]");
  const beneficios = autorizados.length === 0 ? [] : await prisma.informeBeneficios.findMany({
    where: { id: { in: autorizados } },
    select: { id: true, titulo: true },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ cortes, beneficios });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  const metricaPedida = body?.metrica?.trim() ?? "conPasivosMensual";
  if (!esMetrica(metricaPedida)) {
    return Response.json({ message: "Esa métrica no existe." }, { status: 400 });
  }

  const tipoTcrPedido = body?.tcr?.tipo?.trim() ?? "";
  if (tipoTcrPedido && !esTcr(tipoTcrPedido)) {
    return Response.json({ message: "Ese tipo de cambio no existe." }, { status: 400 });
  }
  const tcrType: TcrType | null = tipoTcrPedido && esTcr(tipoTcrPedido) ? tipoTcrPedido : null;

  const esAdmin = session.user.role === "ADMIN";
  const companyIdCliente = esAdmin ? (body?.companyId?.trim() ?? "") : (session.user.companyId ?? "");

  if (!esAdmin) {
    if (!companyIdCliente) {
      return Response.json({ message: "Tu usuario no tiene empresa asignada." }, { status: 400 });
    }
    const permitidos = await cortesDelInformeGeneral(companyIdCliente);
    if (!permitidos.includes(snapshotId)) {
      return Response.json(
        { message: "Tu empresa no tiene habilitado el informe general de ese corte." },
        { status: 403 },
      );
    }
  }

  let datos;
  try {
    datos = await reunirDatosDelCorte(snapshotId);
  } catch (e) {
    if (e instanceof CorteSinDatos) return Response.json({ message: e.message }, { status: 400 });
    throw e;
  }

  const mercado = tcrType
    ? calcularPercentilesTcr({
        snapshotId,
        tcrType,
        filtros: SIN_FILTROS,
        workspaces: datos.workspaces,
        enviaron: datos.enviaron,
        globales: datos.tasas,
      })
    : calcularPercentilesMercado({
        snapshotId,
        filtros: SIN_FILTROS,
        workspaces: datos.workspaces,
        enviaron: datos.enviaron,
        bcvGeneral: datos.tasas.bcv,
      });

  // Un cargo sin los cuatro participantes que exigen la mediana y el promedio
  // no entra al informe. Con cuatro o más entra, y el percentil que no alcance
  // su propio mínimo sale "ND" (AC Consulting, 2026-10-12).
  const cargos: GrupoMercadoGeneral[] = mercado.cargos
    .map((c) => {
      const v = c[metricaPedida];
      return {
        tituloCargo: c.tituloCargo,
        unidadFuncional: datos.unidadFuncionalDe(c.tituloCargo),
        n: c.n,
        valores: {
          p90: v.p90, p75: v.p75, p50: v.p50, p25: v.p25, p10: v.p10,
          promedio: v.promedio, min: v.min, max: v.max,
        },
      };
    })
    .filter((c) => c.tituloCargo && c.valores.p50 !== null && c.valores.promedio !== null)
    .sort(datos.compararCargos);

  if (cargos.length === 0) {
    return Response.json(
      { message: "Ningún cargo del corte reúne las observaciones mínimas para publicarse." },
      { status: 400 },
    );
  }

  const cliente = companyIdCliente
    ? (await prisma.company.findUnique({ where: { id: companyIdCliente }, select: { name: true } }))?.name ?? ""
    : "";

  const buffer = await generarInformeGeneral({
    tituloEstudio: `RESULTADOS ${datos.etiqueta.toUpperCase()}`,
    cliente,
    fechaInforme: mesYAnio(new Date()),
    fechaData: mesYAnio(datos.fechaData),
    metrica: metricaPedida,
    participantes: datos.participantes,
    cargos,
    distribucion: datos.distribucion,
    categoriasDistribucion: [...CATEGORIAS],
    moneda: datos.moneda,
  });

  const nombre = cliente
    ? `Informe general - ${cliente} - ${datos.etiqueta}.xlsx`
    : `Informe general - ${datos.etiqueta}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
