/**
 * Percentiles del corte expresados en TCR.
 *
 * El cálculo vive en `lib/percentiles-tcr` porque el informe de cortesía lo
 * necesita del lado del servidor. Acá quedan los permisos, los parámetros y
 * las tasas globales.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import { promedioLibre, type TcrType } from "@/lib/compensation";
import { leerFiltrosMercado } from "@/lib/filtros-mercado";
import { calcularPercentilesTcr, type TcrPercentilesResponse } from "@/lib/percentiles-tcr";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";
import { getLibreRate } from "@/lib/tcr-config";
import { safeParseSnapshots } from "@/lib/workspace";

export type { TcrCargoPercentiles, TcrGradePercentiles, TcrPercentilesResponse } from "@/lib/percentiles-tcr";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const snapshotId   = searchParams.get("snapshotId")?.trim() ?? "";
  const tcrTypeParam = searchParams.get("tcrType")?.trim() ?? "bcv";
  const filtros = leerFiltrosMercado(searchParams);

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const tcrType: TcrType = tcrTypeParam === "euro" ? "euro" : tcrTypeParam === "libre" ? "libre" : "bcv";

  const isAdmin = session.user.role === "ADMIN";

  const [publishedIds, globalRates, workspaces] = await Promise.all([
    getPublishedSnapshotIds(),
    Promise.all([getBcvRate(), getBcvEuroRate(), getBinanceRate(), getLibreRate()]),
    prisma.userWorkspace.findMany({
      select: { userId: true, snapshotsJson: true, companyInfoJson: true },
    }),
  ]);
  const [{ rate: globalBcvRate }, { rate: globalBcvEurRate }, { rate: globalBinanceRate }, { rate: libreOverride }] = globalRates;

  // Non-admins can only access published snapshots they participated in
  if (!isAdmin) {
    if (!publishedIds.includes(snapshotId)) {
      return Response.json({ message: "Este corte aún no ha sido publicado." }, { status: 403 });
    }
    const requestingWorkspace = workspaces.find((w) => w.userId === session.user.id);
    const requestingSnapshots = safeParseSnapshots(requestingWorkspace?.snapshotsJson ?? "{}");
    const requestingSnapshot  = requestingSnapshots[snapshotId];
    const userParticipated    = requestingSnapshot?.rows?.some((row) => !row._carried) ?? false;
    if (!userParticipated) {
      return Response.json({ message: "No participaste en este corte." }, { status: 403 });
    }
  }

  // Fallback global libre (used only when a company has no ratesAtSave)
  const globalLibreRate = libreOverride ?? promedioLibre(globalBinanceRate, globalBcvEurRate);

  if (!globalLibreRate && !globalBcvRate) {
    return Response.json({ message: "No hay tasas de mercado disponibles para calcular TCR. Intenta más tarde." }, { status: 422 });
  }

  const { cargos, grades } = calcularPercentilesTcr({
    snapshotId,
    tcrType,
    filtros,
    workspaces,
    globales: {
      bcv: globalBcvRate,
      bcvEur: globalBcvEurRate,
      binance: globalBinanceRate,
      libreManual: libreOverride,
    },
  });

  return Response.json({
    snapshotId,
    bcvRate:   globalBcvRate,
    tcrType,
    tcrRate:   globalBcvRate ?? 1,
    libreRate: globalLibreRate ?? 1,
    cargos,
    grades,
  } satisfies TcrPercentilesResponse);
}
