import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeParseSnapshots, safeParseCompanyInfo } from "@/lib/workspace";
import { resolveRowTotals, computeMetricPercentiles, type MetricPercentiles } from "@/lib/compensation";
import { getBcvRate } from "@/lib/bcv";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";

export type CargoPercentiles = {
  tituloCargo: string;
  n: number;
  sinPasivosMensual: MetricPercentiles;
  conPasivosMensual: MetricPercentiles;
  conPasivosAnual: MetricPercentiles;
};

export type PercentilesResponse = {
  snapshotId: string;
  bcvRate: number | null;
  grupos: CargoPercentiles[];
};

type CargoAccum = {
  tituloCargo: string;
  sinPasivosMensual: number[];
  conPasivosMensual: number[];
  conPasivosAnual: number[];
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  // Only published snapshots are visible to users
  const publishedIds = await getPublishedSnapshotIds();
  if (!publishedIds.includes(snapshotId)) {
    return Response.json({ message: "Este corte aún no ha sido publicado." }, { status: 403 });
  }

  const [{ rate: bcvRate }, workspaces] = await Promise.all([
    getBcvRate(),
    prisma.userWorkspace.findMany({
      select: {
        userId: true,
        snapshotsJson: true,
        companyInfoJson: true,
      },
    }),
  ]);

  // Verify the requesting user participated (has at least one non-carried row for this snapshot)
  const requestingWorkspace = workspaces.find((w) => w.userId === session.user.id);
  const requestingSnapshots = safeParseSnapshots(requestingWorkspace?.snapshotsJson ?? "{}");
  const requestingSnapshot = requestingSnapshots[snapshotId];
  const userParticipated = requestingSnapshot?.rows?.some((row) => !row._carried) ?? false;
  if (!userParticipated) {
    return Response.json({ message: "No participaste en este corte." }, { status: 403 });
  }

  // Accumulate one value per (company × tituloCargo)
  const groups = new Map<string, CargoAccum>();

  for (const workspace of workspaces) {
    const snapshots = safeParseSnapshots(workspace.snapshotsJson);
    const snapshot = snapshots[snapshotId];
    if (!snapshot?.rows?.length) continue;

    // Skip workspaces that only have carried-over data (didn't actively participate)
    const hasNonCarried = snapshot.rows.some((row) => !row._carried);
    if (!hasNonCarried) continue;

    const companyInfo = safeParseCompanyInfo(workspace.companyInfoJson);
    const diasVacaciones = Number(companyInfo.minVacationDays) || 0;
    const diasUtilidades = Number(companyInfo.minUtilityDays) || 0;
    const tasas = companyInfo.tasas ?? [];

    // One entry per cargo title per company (first row wins on duplicates)
    const seenInCompany = new Set<string>();

    for (const row of snapshot.rows) {
      const normTitle = (row.tituloCargo ?? "").trim().toLowerCase();
      if (!normTitle || seenInCompany.has(normTitle)) continue;
      seenInCompany.add(normTitle);

      const totals = resolveRowTotals(row, tasas, bcvRate, diasVacaciones, diasUtilidades);

      // Skip unfilled rows
      if (totals.totalConPasivosAnual === 0 && totals.totalSinPasivosMensual === 0) continue;

      const existing = groups.get(normTitle);
      if (existing) {
        existing.sinPasivosMensual.push(totals.totalSinPasivosMensual);
        existing.conPasivosMensual.push(totals.totalConPasivosMensual);
        existing.conPasivosAnual.push(totals.totalConPasivosAnual);
      } else {
        groups.set(normTitle, {
          tituloCargo: row.tituloCargo,
          sinPasivosMensual: [totals.totalSinPasivosMensual],
          conPasivosMensual: [totals.totalConPasivosMensual],
          conPasivosAnual: [totals.totalConPasivosAnual],
        });
      }
    }
  }

  const grupos: CargoPercentiles[] = Array.from(groups.values())
    .map((g) => ({
      tituloCargo: g.tituloCargo,
      n: g.sinPasivosMensual.length,
      sinPasivosMensual: computeMetricPercentiles(g.sinPasivosMensual),
      conPasivosMensual: computeMetricPercentiles(g.conPasivosMensual),
      conPasivosAnual: computeMetricPercentiles(g.conPasivosAnual),
    }))
    .sort((a, b) => a.tituloCargo.localeCompare(b.tituloCargo, "es"));

  const response: PercentilesResponse = {
    snapshotId,
    bcvRate,
    grupos,
  };

  return Response.json(response);
}
