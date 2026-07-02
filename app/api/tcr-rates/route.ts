import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import { getLibreRate } from "@/lib/tcr-config";

function autoLibre(binance: number | null, bcvEur: number | null): number | null {
  if (binance && bcvEur) return Math.round(((binance + bcvEur) / 2) * 100) / 100;
  return binance ?? bcvEur ?? null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const [bcvUsd, bcvEur, binance, libreOverride] = await Promise.all([
    getBcvRate(), getBcvEuroRate(), getBinanceRate(), getLibreRate(),
  ]);

  const isManual  = libreOverride.rate !== null;
  const libreRate = isManual ? libreOverride.rate : autoLibre(binance.rate, bcvEur.rate);

  return Response.json({
    bcvUsd,
    bcvEur,
    binance,
    libre: {
      rate:      libreRate,
      updatedAt: isManual ? libreOverride.updatedAt : (binance.updatedAt ?? bcvEur.updatedAt),
      isManual,
    },
  });
}
