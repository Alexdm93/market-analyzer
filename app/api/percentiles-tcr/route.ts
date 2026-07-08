import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeParseSnapshots, safeParseCompanyInfo } from "@/lib/workspace";
import { computeTCRTotals, computeMetricPercentiles, type MetricPercentiles, type TcrType } from "@/lib/compensation";
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import { getLibreRate } from "@/lib/tcr-config";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";

export type TcrCargoPercentiles = {
  tituloCargo: string;
  n: number;
  sinPasivosMensual: MetricPercentiles;
  conPasivosMensual: MetricPercentiles;
  conPasivosAnual: MetricPercentiles;
  directoMensualizado: MetricPercentiles;
};

export type TcrGradePercentiles = {
  grade: number;
  n: number;
  sinPasivosMensual: MetricPercentiles;
  conPasivosMensual: MetricPercentiles;
  conPasivosAnual: MetricPercentiles;
  directoMensualizado: MetricPercentiles;
};

export type TcrPercentilesResponse = {
  snapshotId: string;
  bcvRate: number | null;
  tcrType: TcrType;
  tcrRate: number;
  libreRate: number;
  cargos: TcrCargoPercentiles[];
  grades: TcrGradePercentiles[];
};

type CargoAccum = {
  tituloCargo: string;
  sinPasivosMensual: number[];
  conPasivosMensual: number[];
  conPasivosAnual: number[];
  directoMensualizado: number[];
};

type GradeAccum = {
  grade: number;
  sinPasivosMensual: number[];
  conPasivosMensual: number[];
  conPasivosAnual: number[];
  directoMensualizado: number[];
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const snapshotId      = searchParams.get("snapshotId")?.trim() ?? "";
  const tcrTypeParam    = searchParams.get("tcrType")?.trim() ?? "bcv";
  const libreRateParam  = searchParams.get("libreRate")?.trim() ?? "";
  const filterSectors   = searchParams.get("sectors")?.split(",").filter(Boolean) ?? [];
  const filterSizes     = searchParams.get("sizes")?.split(",").filter(Boolean) ?? [];
  const filterCompanies = searchParams.get("companies")?.split(",").filter(Boolean) ?? [];

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const tcrType: TcrType = tcrTypeParam === "euro" ? "euro" : tcrTypeParam === "libre" ? "libre" : "bcv";

  const publishedIds = await getPublishedSnapshotIds();
  if (!publishedIds.includes(snapshotId)) {
    return Response.json({ message: "Este corte aún no ha sido publicado." }, { status: 403 });
  }

  const [{ rate: globalBcvRate }, { rate: globalBcvEurRate }, { rate: globalBinanceRate }, { rate: libreOverride }, workspaces] = await Promise.all([
    getBcvRate(),
    getBcvEuroRate(),
    getBinanceRate(),
    getLibreRate(),
    prisma.userWorkspace.findMany({
      select: { userId: true, snapshotsJson: true, companyInfoJson: true },
    }),
  ]);

  // Fallback global libre (used only when a company has no ratesAtSave)
  const globalLibreRate = libreOverride
    ?? (globalBinanceRate && globalBcvEurRate
      ? Math.round(((globalBinanceRate + globalBcvEurRate) / 2) * 100) / 100
      : globalBinanceRate ?? globalBcvEurRate ?? null);

  if (!globalLibreRate && !globalBcvRate) {
    return Response.json({ message: "No hay tasas de mercado disponibles para calcular TCR. Intenta más tarde." }, { status: 422 });
  }

  // Admins can view TCR for any snapshot without being a participant themselves
  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin) {
    const requestingWorkspace = workspaces.find((w) => w.userId === session.user.id);
    const requestingSnapshots = safeParseSnapshots(requestingWorkspace?.snapshotsJson ?? "{}");
    const requestingSnapshot  = requestingSnapshots[snapshotId];
    const userParticipated    = requestingSnapshot?.rows?.some((row) => !row._carried) ?? false;
    if (!userParticipated) {
      return Response.json({ message: "No participaste en este corte." }, { status: 403 });
    }
  }

  const cargoGroups = new Map<string, CargoAccum>();
  const gradeGroups = new Map<number, GradeAccum>();

  for (const workspace of workspaces) {
    const snapshots  = safeParseSnapshots(workspace.snapshotsJson);
    const snapshot   = snapshots[snapshotId];
    if (!snapshot?.rows?.length) continue;

    const hasNonCarried = snapshot.rows.some((row) => !row._carried);
    if (!hasNonCarried) continue;

    const companyInfo = safeParseCompanyInfo(workspace.companyInfoJson);

    if (filterSectors.length   > 0 && (!companyInfo.sector         || !filterSectors.includes(companyInfo.sector)))                continue;
    if (filterSizes.length     > 0 && (!companyInfo.classification || !filterSizes.includes(companyInfo.classification)))          continue;
    if (filterCompanies.length > 0 && (!companyInfo.companyName    || !filterCompanies.includes(companyInfo.companyName)))         continue;

    // Use rates from when this company last saved — fall back to global rates for legacy data
    const saved      = companyInfo.ratesAtSave;
    const bcvRate    = saved?.bcvUsd   ?? globalBcvRate;
    const bcvEurRate = saved?.bcvEur   ?? globalBcvEurRate;
    const binRate    = saved?.binance  ?? globalBinanceRate;
    const libreRate  = libreOverride
      ?? (binRate && bcvEurRate
        ? Math.round(((binRate + bcvEurRate) / 2) * 100) / 100
        : binRate ?? bcvEurRate ?? globalLibreRate ?? 1);

    // tcrRate uses this company's contemporaneous reference rate as denominator
    const tcrRate = tcrType === "libre" ? libreRate
      : tcrType === "euro" ? (bcvEurRate ?? libreRate)
      : (bcvRate ?? libreRate);

    const diasVacaciones = Number(companyInfo.minVacationDays) || 0;
    const diasUtilidades = Number(companyInfo.minUtilityDays)  || 0;
    const tasas          = companyInfo.tasas ?? [];

    for (const row of snapshot.rows) {
      const totals = computeTCRTotals(row, tasas, bcvRate, bcvEurRate, libreRate, tcrRate, tcrType, diasVacaciones, diasUtilidades);
      if (totals.totalSinPasivosMensual === 0 && totals.totalDirectoMensualizado === 0) continue;

      // Accumulate by cargo title
      const titulo = String(row.tituloCargo ?? "").trim();
      if (titulo) {
        const existing = cargoGroups.get(titulo);
        if (existing) {
          existing.sinPasivosMensual.push(totals.totalSinPasivosMensual);
          existing.conPasivosMensual.push(totals.totalConPasivosMensual);
          existing.conPasivosAnual.push(totals.totalConPasivosAnual);
          existing.directoMensualizado.push(totals.totalDirectoMensualizado);
        } else {
          cargoGroups.set(titulo, {
            tituloCargo: titulo,
            sinPasivosMensual:   [totals.totalSinPasivosMensual],
            conPasivosMensual:   [totals.totalConPasivosMensual],
            conPasivosAnual:     [totals.totalConPasivosAnual],
            directoMensualizado: [totals.totalDirectoMensualizado],
          });
        }
      }

      // Accumulate by grade (one entry per company×grade)
      const grade = row.hayGrade;
      if (grade) {
        const existing = gradeGroups.get(grade);
        if (existing) {
          existing.sinPasivosMensual.push(totals.totalSinPasivosMensual);
          existing.conPasivosMensual.push(totals.totalConPasivosMensual);
          existing.conPasivosAnual.push(totals.totalConPasivosAnual);
          existing.directoMensualizado.push(totals.totalDirectoMensualizado);
        } else {
          gradeGroups.set(grade, {
            grade,
            sinPasivosMensual:   [totals.totalSinPasivosMensual],
            conPasivosMensual:   [totals.totalConPasivosMensual],
            conPasivosAnual:     [totals.totalConPasivosAnual],
            directoMensualizado: [totals.totalDirectoMensualizado],
          });
        }
      }
    }
  }

  const cargos: TcrCargoPercentiles[] = Array.from(cargoGroups.values())
    .map((g) => ({
      tituloCargo: g.tituloCargo,
      n: g.sinPasivosMensual.length,
      sinPasivosMensual:   computeMetricPercentiles(g.sinPasivosMensual),
      conPasivosMensual:   computeMetricPercentiles(g.conPasivosMensual),
      conPasivosAnual:     computeMetricPercentiles(g.conPasivosAnual),
      directoMensualizado: computeMetricPercentiles(g.directoMensualizado),
    }))
    .sort((a, b) => a.tituloCargo.localeCompare(b.tituloCargo, "es"));

  const grades: TcrGradePercentiles[] = Array.from(gradeGroups.values())
    .map((g) => ({
      grade: g.grade,
      n: g.sinPasivosMensual.length,
      sinPasivosMensual:   computeMetricPercentiles(g.sinPasivosMensual),
      conPasivosMensual:   computeMetricPercentiles(g.conPasivosMensual),
      conPasivosAnual:     computeMetricPercentiles(g.conPasivosAnual),
      directoMensualizado: computeMetricPercentiles(g.directoMensualizado),
    }))
    .sort((a, b) => a.grade - b.grade);

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
