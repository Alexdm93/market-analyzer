import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeRowTotal(row: Record<string, unknown>): number {
  const n = (k: string) => Number(row[k] ?? 0);
  let sum = n("sueldoBasico") + n("bonoAlimentacion") + n("bonoMovilizacion")
    + n("bonoDesempeno") + n("comisiones") + n("pagoVariableOtros")
    + n("pagoTransporte") + n("viaticos") + n("otrosPagos")
    + n("aportesSeguridadSocial") + n("prestacionesLegales");
  if (Array.isArray(row.additionalFixedPayments))
    sum += (row.additionalFixedPayments as { amount?: number }[]).reduce((a, b) => a + Number(b.amount ?? 0), 0);
  if (Array.isArray(row.additionalVariablePayments))
    sum += (row.additionalVariablePayments as { amount?: number }[]).reduce((a, b) => a + Number(b.amount ?? 0), 0);
  return sum;
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

  const [
    allCompanies,
    recentSnapshotCompanies,
    availableSnapshotsRaw,
    totalPositionsCount,
  ] = await Promise.all([
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
      where: { updatedAt: { gte: sixtyDaysAgo } },
      select: { companyId: true },
      distinct: ["companyId"],
    }),
    prisma.userSnapshot.findMany({
      select: { snapshotId: true, label: true, date: true },
      distinct: ["snapshotId"],
      orderBy: [{ date: "desc" }],
    }),
    prisma.userPosition.count(),
  ]);

  // Sector distribution
  const sectorMap = new Map<string, number>();
  for (const c of allCompanies) {
    const s = c.economicSector?.trim() || "Sin sector";
    sectorMap.set(s, (sectorMap.get(s) ?? 0) + 1);
  }
  const sectorDistribution = Array.from(sectorMap.entries())
    .map(([sector, count]) => ({ sector, count, percentage: Math.round((count / allCompanies.length) * 100) }))
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

  // Available snapshots
  const availableSnapshots = availableSnapshotsRaw.map((s) => ({
    id: s.snapshotId,
    label: s.label,
    date: s.date.toISOString().split("T")[0],
  }));
  const latestSnapshotId = requestedSnapshotId || availableSnapshots[0]?.id || "";

  // Percentiles by nivel from the selected snapshot
  const percentilesByNivel: Record<string, { p25: number; p50: number; p75: number; count: number }> = {};

  if (latestSnapshotId) {
    const positions = await prisma.userPosition.findMany({
      where: { snapshotId: latestSnapshotId },
      select: { dataJson: true },
    });

    const totalsByNivel = new Map<string, number[]>();
    for (const pos of positions) {
      try {
        const data = JSON.parse(pos.dataJson) as Record<string, unknown>;
        const nivel = String(data.nivelOrganizacional ?? "").trim();
        const total = computeRowTotal(data);
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
    activeCompanies60Days: recentSnapshotCompanies.length,
    totalCompanies: allCompanies.length,
    totalPositions: totalPositionsCount,
    availableSnapshots,
    latestSnapshotId,
    sectorDistribution,
    percentilesByNivel,
    warnings,
  });
}
