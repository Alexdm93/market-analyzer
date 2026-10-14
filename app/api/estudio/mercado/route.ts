/**
 * El mercado de un corte para el Estudio Especializado.
 *
 * Existe aparte de `/api/percentiles` porque las dos pantallas tienen reglas
 * de acceso distintas. Esa ruta es la del estudio de cortesía: exige que el
 * corte esté publicado y que la empresa haya participado, porque el informe
 * de cortesía es la contraprestación por participar.
 *
 * El Especializado se vende, y AC Consulting pidió que una empresa que no
 * participó también pueda contratarlo (2026-10-14). Acá la única puerta es la
 * que abre el admin: qué cortes le incluyó en el estudio.
 *
 * Devuelve además con qué se puede recortar el mercado y cuántas empresas
 * quedaron dentro del recorte, que es lo que mira el mínimo de doce.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import type { TcrType } from "@/lib/compensation";
import { asegurarCorte, resolverAcceso } from "@/lib/estudio-cargos";
import { leerFiltrosMercado } from "@/lib/filtros-mercado";
import {
  calcularPercentilesMercado,
  calcularPercentilesTcr,
  usuariosQueEnviaron,
  type MercadoDelCorte,
} from "@/lib/percentiles-mercado";
import { prisma } from "@/lib/prisma";
import { getLibreRate } from "@/lib/tcr-config";

export const maxDuration = 60;

export type MercadoDelEstudio = MercadoDelCorte & { snapshotId: string };

function esTcr(v: string): v is TcrType {
  return v === "bcv" || v === "euro" || v === "libre";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await getServerSession(authOptions).catch(() => null);
  const acceso = resolverAcceso(session, searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  const corteVedado = await asegurarCorte(acceso, snapshotId);
  if (corteVedado) return corteVedado;

  const tipoPedido = searchParams.get("tcrType")?.trim() ?? "";
  if (tipoPedido && !esTcr(tipoPedido)) {
    return Response.json({ message: "Ese tipo de cambio no existe." }, { status: 400 });
  }

  const filtros = leerFiltrosMercado(searchParams);

  const [workspaces, enviaron, bcv, bcvEur, binance, libreManual] = await Promise.all([
    prisma.userWorkspace.findMany({ select: { userId: true, snapshotsJson: true, companyInfoJson: true } }),
    usuariosQueEnviaron(snapshotId),
    getBcvRate(),
    getBcvEuroRate(),
    getBinanceRate(),
    getLibreRate(),
  ]);

  const mercado = tipoPedido && esTcr(tipoPedido)
    ? calcularPercentilesTcr({
        snapshotId,
        tcrType: tipoPedido,
        filtros,
        workspaces,
        enviaron,
        globales: { bcv: bcv.rate, bcvEur: bcvEur.rate, binance: binance.rate, libreManual: libreManual.rate },
      })
    : calcularPercentilesMercado({ snapshotId, filtros, workspaces, enviaron, bcvGeneral: bcv.rate });

  return Response.json({ snapshotId, ...mercado } satisfies MercadoDelEstudio);
}
