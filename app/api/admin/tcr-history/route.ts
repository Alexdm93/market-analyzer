import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeParseCompanyInfo } from "@/lib/workspace";

export type TcrHistoryEntry = {
  date: string;
  bcvUsd: number | null;
  bcvEur: number | null;
  binance: number | null;
  libreAuto: number | null;
  companies: string[];
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const workspaces = await prisma.userWorkspace.findMany({
    select: { companyInfoJson: true },
  });

  // Group by calendar date of savedAt
  const byDate = new Map<string, { bcvUsd: number | null; bcvEur: number | null; binance: number | null; companies: Set<string> }>();

  for (const ws of workspaces) {
    const info = safeParseCompanyInfo(ws.companyInfoJson);
    if (!info.ratesAtSave?.savedAt) continue;

    const date = info.ratesAtSave.savedAt.slice(0, 10); // "yyyy-mm-dd"
    const companyName = info.companyName?.trim() || "(sin nombre)";

    const existing = byDate.get(date);
    if (existing) {
      existing.companies.add(companyName);
      // Keep the first rates recorded for this date (they represent the market on that day)
    } else {
      byDate.set(date, {
        bcvUsd:    info.ratesAtSave.bcvUsd,
        bcvEur:    info.ratesAtSave.bcvEur,
        binance:   info.ratesAtSave.binance,
        companies: new Set([companyName]),
      });
    }
  }

  const entries: TcrHistoryEntry[] = Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([date, { bcvUsd, bcvEur, binance, companies }]) => {
      const libreAuto =
        binance && bcvEur
          ? Math.round(((binance + bcvEur) / 2) * 100) / 100
          : binance ?? bcvEur ?? null;
      return {
        date,
        bcvUsd,
        bcvEur,
        binance,
        libreAuto,
        companies: Array.from(companies).sort(),
      };
    });

  return Response.json({ entries });
}
