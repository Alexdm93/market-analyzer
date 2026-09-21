/**
 * Genera el informe de cortesía de un corte, rellenando la plantilla del cliente.
 *
 * Los percentiles los manda quien llama y no se recalculan acá: vienen de
 * `/api/percentiles`, que es la ruta que alimenta el estudio de cortesía en
 * pantalla. Recalcularlos por separado abriría la puerta a que el informe y
 * Resultados dijeran cosas distintas.
 *
 * La distribución de compensación sí se calcula acá, porque no existe en
 * ninguna pantalla: es un desglose por categoría que solo usa este informe.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getBcvRate } from "@/lib/bcv";
import { CATEGORIAS, calcularDistribucion } from "@/lib/distribucion-compensacion";
import {
  generarInformeCortesia,
  mesYAnio,
  type EstadisticaMercado,
  type GrupoMercado,
} from "@/lib/informe-cortesia";
import { prisma } from "@/lib/prisma";
import { safeParseCompanyInfo } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";

export const maxDuration = 60;

/** Las secciones que el informe lleva de verdad, tras sacar las que van aparte. */
const SECCIONES = [
  "EMPRESAS PARTICIPANTES",
  "DISTRIBUCIÓN DE COMPENSACIÓN (INGRESO MENSUAL)",
  "MARKET ANALYZER",
  "ACERCA DE AC CONSULTING",
  "PORTAFOLIO DE PRODUCTOS",
];

type Cuerpo = { snapshotId?: string; cargos?: Array<Record<string, unknown>> };

function numeroONulo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function estadistica(v: unknown): EstadisticaMercado {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    p50: numeroONulo(o.p50), promedio: numeroONulo(o.promedio),
    min: numeroONulo(o.min), max: numeroONulo(o.max),
  };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });
  if (!Array.isArray(body?.cargos) || body.cargos.length === 0) {
    return Response.json({ message: "El informe no trae cargos." }, { status: 400 });
  }

  const cargos: GrupoMercado[] = body.cargos
    .map((c) => ({
      tituloCargo: String(c.tituloCargo ?? "").trim(),
      n: Number(c.n) || 0,
      tem: estadistica(c.tem), temz: estadistica(c.temz),
      cim: estadistica(c.cim), pcta: estadistica(c.pcta),
    }))
    .filter((c) => c.tituloCargo && c.n > 0);

  if (cargos.length === 0) {
    return Response.json({ message: "Ningún cargo del corte tiene observaciones." }, { status: 400 });
  }

  // Participantes: las empresas que enviaron data. Es la misma condición que
  // da derecho al informe.
  const [enviados, posiciones, { rate: bcvGeneral }] = await Promise.all([
    prisma.userSnapshot.findMany({
      where: { snapshotId, submittedAt: { not: null } },
      select: { userId: true, company: { select: { name: true } }, date: true, label: true },
      distinct: ["companyId"],
    }),
    prisma.userPosition.findMany({
      where: { snapshotId, snapshot: { submittedAt: { not: null } } },
      select: { userId: true, dataJson: true },
    }),
    getBcvRate(),
  ]);

  const empresas = [...new Set(enviados.map((e) => e.company?.name).filter((n): n is string => Boolean(n)))]
    .sort((a, b) => a.localeCompare(b, "es"));

  if (empresas.length === 0) {
    return Response.json({ message: "Ninguna empresa ha enviado data en ese corte." }, { status: 400 });
  }

  // Cada empresa convierte con la tasa que tenía al guardar, igual que el resto
  // del sistema.
  const workspaces = await prisma.userWorkspace.findMany({
    where: { userId: { in: [...new Set(posiciones.map((p) => p.userId))] } },
    select: { userId: true, companyInfoJson: true },
  });
  const infoPorUsuario = new Map(workspaces.map((w) => [w.userId, safeParseCompanyInfo(w.companyInfoJson)]));

  const paraDistribucion = posiciones.flatMap((p) => {
    try {
      const info = infoPorUsuario.get(p.userId);
      return [{
        fila: JSON.parse(p.dataJson) as ExtendedMarketPosition,
        tasas: info?.tasas ?? [],
        bcv: info?.ratesAtSave?.bcvUsd ?? bcvGeneral,
      }];
    } catch {
      return [];
    }
  });

  const distribucion = calcularDistribucion(paraDistribucion).map((f) => ({
    nivel: f.nivel.toUpperCase(),
    valores: CATEGORIAS.map((c) => f.porcentajes[c]),
  }));

  const snapshot = enviados[0];
  const etiqueta = snapshot?.label ?? snapshotId;

  const buffer = await generarInformeCortesia({
    tituloEstudio: `RESULTADOS ${etiqueta.toUpperCase()}`,
    fechaInforme: mesYAnio(new Date()),
    fechaData: mesYAnio(snapshot?.date ?? new Date()),
    empresas,
    cargos,
    distribucion,
    categoriasDistribucion: [...CATEGORIAS],
    secciones: SECCIONES,
  });

  const nombre = `Informe de cortesía - ${etiqueta}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
