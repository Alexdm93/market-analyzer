import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeParseSnapshots, safeParseCompanyInfo } from "@/lib/workspace";
import { resolveRowTotals, computeMetricPercentiles, type MetricPercentiles } from "@/lib/compensation";
import { getBcvRate } from "@/lib/bcv";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";

export type GradePercentiles = {
  grade: number;
  n: number;
  sinPasivosMensual: MetricPercentiles;
  conPasivosMensual: MetricPercentiles;
  conPasivosAnual: MetricPercentiles;
  directoMensualizado: MetricPercentiles;
};

export type PercentilesGradeResponse = {
  snapshotId: string;
  bcvRate: number | null;
  grupos: GradePercentiles[];
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
  const snapshotId       = searchParams.get("snapshotId")?.trim() ?? "";
  const filterSectors    = searchParams.get("sectors")?.split(",").filter(Boolean) ?? [];
  const filterSizes      = searchParams.get("sizes")?.split(",").filter(Boolean) ?? [];
  const filterCompanies  = searchParams.get("companies")?.split(",").filter(Boolean) ?? [];

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  const publishedIds = await getPublishedSnapshotIds();
  if (!publishedIds.includes(snapshotId)) {
    return Response.json({ message: "Este corte aún no ha sido publicado." }, { status: 403 });
  }

  const [{ rate: bcvRate }, workspaces] = await Promise.all([
    getBcvRate(),
    prisma.userWorkspace.findMany({
      select: { userId: true, snapshotsJson: true, companyInfoJson: true },
    }),
  ]);

  // Verify the requesting user participated
  const requestingWorkspace = workspaces.find((w) => w.userId === session.user.id);
  const requestingSnapshots = safeParseSnapshots(requestingWorkspace?.snapshotsJson ?? "{}");
  const requestingSnapshot  = requestingSnapshots[snapshotId];
  const userParticipated    = requestingSnapshot?.rows?.some((row) => !row._carried) ?? false;
  if (!userParticipated) {
    return Response.json({ message: "No participaste en este corte." }, { status: 403 });
  }

  const groups = new Map<number, GradeAccum>();

  for (const workspace of workspaces) {
    const snapshots   = safeParseSnapshots(workspace.snapshotsJson);
    const snapshot    = snapshots[snapshotId];
    if (!snapshot?.rows?.length) continue;

    const hasNonCarried = snapshot.rows.some((row) => !row._carried);
    if (!hasNonCarried) continue;

    const companyInfo = safeParseCompanyInfo(workspace.companyInfoJson);

    // Apply user-selected filters
    if (filterSectors.length   > 0 && (!companyInfo.sector         || !filterSectors.includes(companyInfo.sector)))                 continue;
    if (filterSizes.length     > 0 && (!companyInfo.classification || !filterSizes.includes(companyInfo.classification)))           continue;
    if (filterCompanies.length > 0 && (!companyInfo.companyName    || !filterCompanies.includes(companyInfo.companyName)))          continue;

    const diasVacaciones = Number(companyInfo.minVacationDays) || 0;
    const diasUtilidades = Number(companyInfo.minUtilityDays)  || 0;
    const tasas          = companyInfo.tasas ?? [];

    // One entry per (grade × company) — first row of that grade wins per company
    const seenGradeInCompany = new Set<number>();

    for (const row of snapshot.rows) {
      const grade = row.hayGrade;
      if (!grade || seenGradeInCompany.has(grade)) continue;
      seenGradeInCompany.add(grade);

      const totals = resolveRowTotals(row, tasas, bcvRate, diasVacaciones, diasUtilidades);
      if (totals.totalConPasivosAnual === 0 && totals.totalSinPasivosMensual === 0) continue;

      const existing = groups.get(grade);
      if (existing) {
        existing.sinPasivosMensual.push(totals.totalSinPasivosMensual);
        existing.conPasivosMensual.push(totals.totalConPasivosMensual);
        existing.conPasivosAnual.push(totals.totalConPasivosAnual);
        existing.directoMensualizado.push(totals.totalDirectoMensualizado);
      } else {
        groups.set(grade, {
          grade,
          sinPasivosMensual:   [totals.totalSinPasivosMensual],
          conPasivosMensual:   [totals.totalConPasivosMensual],
          conPasivosAnual:     [totals.totalConPasivosAnual],
          directoMensualizado: [totals.totalDirectoMensualizado],
        });
      }
    }
  }

  const grupos: GradePercentiles[] = Array.from(groups.values())
    .map((g) => ({
      grade: g.grade,
      n: g.sinPasivosMensual.length,
      sinPasivosMensual:   computeMetricPercentiles(g.sinPasivosMensual),
      conPasivosMensual:   computeMetricPercentiles(g.conPasivosMensual),
      conPasivosAnual:     computeMetricPercentiles(g.conPasivosAnual),
      directoMensualizado: computeMetricPercentiles(g.directoMensualizado),
    }))
    .sort((a, b) => a.grade - b.grade);

  return Response.json({ snapshotId, bcvRate, grupos } satisfies PercentilesGradeResponse);
}
