import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBcvRate, getBcvEuroRate, getBinanceRate } from "@/lib/bcv";
import { getLibreRate, setLibreRate, clearLibreRate } from "@/lib/tcr-config";

function forbiddenResponse() {
  return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { ok: false as const, response: forbiddenResponse() };
  return { ok: true as const };
}

/** Computes the auto libre rate as the average of Binance and BCV EUR. */
function autoLibre(binance: number | null, bcvEur: number | null): number | null {
  if (binance && bcvEur) return Math.round(((binance + bcvEur) / 2) * 100) / 100;
  return binance ?? bcvEur ?? null;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

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

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as { libreRate?: number | null } | null;

  if (body?.libreRate === null) {
    // Reset to auto-computed
    await clearLibreRate();
    return Response.json({ message: "Tasa libre restablecida a cálculo automático." });
  }

  const rate = Number(body?.libreRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return Response.json({ message: "Indica un valor válido para la tasa libre." }, { status: 400 });
  }

  await setLibreRate(rate);
  return Response.json({ message: `Tasa libre actualizada a ${rate}.`, libreRate: rate, updatedAt: new Date().toISOString() });
}
