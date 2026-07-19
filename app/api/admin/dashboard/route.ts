import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeRowTotals } from "@/lib/compensation";
import { safeParseCompanyInfo } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}


const NIVELES = ["Operativo", "Profesional", "Supervisor", "Gerencia Media", "Gerencia Alta", "Ejecutivo"] as const;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const requestedSnapshotId = searchParams.get("snapshotId")?.trim() ?? "";

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // Step 1: global data + available snapshots (needed to resolve latestSnapshotId)
  const [allCompanies, availableSnapshotsRaw] = await Promise.all([
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        economicSector: true,
        classification: true,
        headcount: true,
        revenueUSD: true,
        avgProfitPercent: true,
        hrName: true,
        hrEmail: true,
      },
    }),
    prisma.userSnapshot.findMany({
      select: { snapshotId: true, label: true, date: true },
      distinct: ["snapshotId"],
      orderBy: [{ date: "desc" }],
    }),
  ]);

  // Available snapshots + resolve effective cut
  const availableSnapshots = availableSnapshotsRaw.map((s) => ({
    id: s.snapshotId,
    label: s.label,
    date: s.date.toISOString().split("T")[0],
  }));
  const latestSnapshotId = requestedSnapshotId || availableSnapshots[0]?.id || "";

  // Step 2: per-cut metrics
  // "Activas 60d" = companies that actually saved cargo data in this cut within the last 60 days
  // "Total empresas" = companies that have submitted (enviadas) for this cut
  // "Cargos Reportados" = positions from submitted companies only
  const [cutActivePositions, submittedSnapshots] = latestSnapshotId
    ? await Promise.all([
        prisma.userPosition.findMany({
          where: { snapshotId: latestSnapshotId, updatedAt: { gte: sixtyDaysAgo } },
          select: { companyId: true },
          distinct: ["companyId"],
        }),
        prisma.userSnapshot.findMany({
          where: { snapshotId: latestSnapshotId, submittedAt: { not: null } },
          select: { companyId: true, userId: true },
          distinct: ["companyId"],
        }),
      ])
    : [[], []] as [{ companyId: string }[], { companyId: string; userId: string }[]];

  const submittedUserIds = new Set(submittedSnapshots.map((s) => s.userId));
  const totalPositionsCount = latestSnapshotId
    ? await prisma.userPosition.count({
        where: { snapshotId: latestSnapshotId, userId: { in: [...submittedUserIds] } },
      })
    : 0;

  // Sector distribution — only companies that submitted for this cut
  const submittedCompanyIds = new Set(submittedSnapshots.map((s) => s.companyId));
  const submittedCompanies = allCompanies.filter((c) => submittedCompanyIds.has(c.id));
  const sectorMap = new Map<string, number>();
  for (const c of submittedCompanies) {
    const s = c.economicSector?.trim() || "Sin sector";
    sectorMap.set(s, (sectorMap.get(s) ?? 0) + 1);
  }
  const sectorDistribution = Array.from(sectorMap.entries())
    .map(([sector, count]) => ({ sector, count, percentage: Math.round((count / Math.max(submittedCompanies.length, 1)) * 100) }))
    .sort((a, b) => b.count - a.count);

  // Warnings: companies missing key fields
  const warnings = allCompanies
    .map((c) => {
      const missing: string[] = [];
      if (!c.headcount) missing.push("Headcount");
      if (!c.revenueUSD) missing.push("Facturación");
      if (!c.avgProfitPercent) missing.push("Utilidades %");
      if (!c.hrName) missing.push("Contacto RRHH");
      if (!c.hrEmail) missing.push("Correo RRHH");
      return { companyId: c.id, companyName: c.name, missingFields: missing };
    })
    .filter((w) => w.missingFields.length > 0);


  // Percentiles by nivel from the selected snapshot
  const percentilesByNivel: Record<string, { p25: number; p50: number; p75: number; count: number }> = {};

  if (latestSnapshotId) {
    const [positions, workspaces] = await Promise.all([
      prisma.userPosition.findMany({
        where: { snapshotId: latestSnapshotId },
        select: { userId: true, dataJson: true },
      }),
      prisma.userWorkspace.findMany({
        select: { userId: true, companyInfoJson: true },
      }),
    ]);

    const companyInfoByUserId = new Map(
      workspaces.map((w) => [w.userId, safeParseCompanyInfo(w.companyInfoJson)])
    );

    const getBcvRate = (userId: string): number | null => {
      const info = companyInfoByUserId.get(userId);
      // Primary: rate saved at the time of capture
      const saved = info?.ratesAtSave?.bcvUsd;
      if (typeof saved === "number" && saved > 0) return saved;
      // Fallback: extract from the company's tasas array (same source user view uses)
      const tasas = (info?.tasas ?? []) as Array<{ id: string; valor: string | number }>;
      const rawTasas = tasas.find((t) => t.id === "bcv-usd")?.valor;
      const fromTasas = typeof rawTasas === "string" ? parseFloat(rawTasas) : rawTasas;
      return typeof fromTasas === "number" && fromTasas > 0 ? fromTasas : null;
    };

    const totalsByNivel = new Map<string, number[]>();
    for (const pos of positions) {
      try {
        const data = JSON.parse(pos.dataJson) as ExtendedMarketPosition;
        const nivel = String(data.nivelOrganizacional ?? "").trim();
        const companyInfo = companyInfoByUserId.get(pos.userId);
        const tasas = companyInfo?.tasas ?? [];
        const diasVac = Number(companyInfo?.minVacationDays) || 0;
        const diasUtil = Number(companyInfo?.minUtilityDays) || 0;
        const totals = computeRowTotals(data, tasas, getBcvRate(pos.userId), diasVac, diasUtil);
        const total = totals.totalSinPasivosMensual;
        if (total > 0 && Number.isFinite(total)) {
          const key = NIVELES.find((n) => nivel.toLowerCase().includes(n.toLowerCase())) ?? nivel;
          if (key) {
            if (!totalsByNivel.has(key)) totalsByNivel.set(key, []);
            totalsByNivel.get(key)!.push(total);
          }
        }
      } catch {
        // skip malformed
      }
    }

    for (const nivel of NIVELES) {
      const vals = totalsByNivel.get(nivel) ?? [];
      percentilesByNivel[nivel] = {
        p25: vals.length ? Math.round(percentile(vals, 25)) : 0,
        p50: vals.length ? Math.round(percentile(vals, 50)) : 0,
        p75: vals.length ? Math.round(percentile(vals, 75)) : 0,
        count: vals.length,
      };
    }
  } else {
    for (const nivel of NIVELES) {
      percentilesByNivel[nivel] = { p25: 0, p50: 0, p75: 0, count: 0 };
    }
  }

  return Response.json({
    activeCompanies60Days: cutActivePositions.length,
    totalCompanies: submittedSnapshots.length,
    totalPositions: totalPositionsCount,
    availableSnapshots,
    latestSnapshotId,
    sectorDistribution,
    percentilesByNivel,
    warnings,
  }, { headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' } });
}
