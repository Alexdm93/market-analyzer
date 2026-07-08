import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeParseCompanyInfo } from "@/lib/workspace";

export type TcrHistoryEntry = {
  company: string;
  date: string;
  bcvUsd: number | null;
  bcvEur: number | null;
  binance: number | null;
  libreAuto: number | null;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const workspaces = await prisma.userWorkspace.findMany({
    select: { companyInfoJson: true },
  });

  const entries: TcrHistoryEntry[] = [];

  for (const ws of workspaces) {
    const info = safeParseCompanyInfo(ws.companyInfoJson);
    if (!info.ratesAtSave?.savedAt) continue;

    const { bcvUsd, bcvEur, binance, savedAt } = info.ratesAtSave;
    const libreAuto =
      binance && bcvEur
        ? Math.round(((binance + bcvEur) / 2) * 100) / 100
        : binance ?? bcvEur ?? null;

    entries.push({
      company:   info.companyName?.trim() || "(sin nombre)",
      date:      savedAt.slice(0, 10),
      bcvUsd,
      bcvEur,
      binance,
      libreAuto,
    });
  }

  // Newest save date first, then alphabetically by company
  entries.sort((a, b) => b.date.localeCompare(a.date) || a.company.localeCompare(b.company));

  return Response.json({ entries });
}
