import { prisma } from "@/lib/prisma";

const BCV_KEY = "bcv_usd_rate";
// Refresh if older than 23h (cron runs every 24h)
const STALE_MS = 23 * 60 * 60 * 1000;

export const BCV_TASA_ID = "bcv-usd";

export async function fetchBcvFromApi(): Promise<number | null> {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", {
      headers: { "User-Agent": "salary-intelligence/1.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { promedio?: number };
    return typeof data.promedio === "number" ? data.promedio : null;
  } catch {
    return null;
  }
}

export async function getBcvRate(): Promise<{ rate: number | null; updatedAt: string | null }> {
  const config = await prisma.globalConfig.findUnique({ where: { key: BCV_KEY } });

  const isStale = !config || Date.now() - config.updatedAt.getTime() > STALE_MS;

  if (isStale) {
    const fresh = await fetchBcvFromApi();
    if (fresh !== null) {
      await prisma.globalConfig.upsert({
        where: { key: BCV_KEY },
        create: { key: BCV_KEY, value: String(fresh) },
        update: { value: String(fresh) },
      });
      return { rate: fresh, updatedAt: new Date().toISOString() };
    }
  }

  if (!config) return { rate: null, updatedAt: null };
  const rate = parseFloat(config.value);
  return {
    rate: Number.isFinite(rate) ? rate : null,
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function buildBcvTasa(rate: number | null, updatedAt: string | null) {
  return {
    id: BCV_TASA_ID,
    nombre: "Tasa BCV $",
    referencia: "BCV oficial",
    valor: rate !== null ? String(rate) : "",
    isSystem: true as const,
    updatedAt: updatedAt ?? undefined,
  };
}
