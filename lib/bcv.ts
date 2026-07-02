import { prisma } from "@/lib/prisma";

const BCV_KEY      = "bcv_usd_rate";
const BCV_EUR_KEY  = "bcv_eur_rate";
const BINANCE_KEY  = "binance_rate";
// Refresh if older than 23h (cron runs every 24h)
const STALE_MS = 23 * 60 * 60 * 1000;

export const BCV_TASA_ID     = "bcv-usd";
export const BCV_EUR_TASA_ID = "bcv-eur";

// ─── Fetch helpers ───────────────────────────────────────────────────────────

type DolarApiItem = { promedio?: number; promedioCopmpra?: number; promedioVenta?: number };

function extractPromedio(data: unknown): number | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as DolarApiItem;
    const v = d.promedio ?? d.promedioVenta;
    return typeof v === "number" && v > 0 ? v : null;
  }
  return null;
}

async function fetchDolarApi(path: string): Promise<number | null> {
  try {
    const res = await fetch(`https://ve.dolarapi.com/v1/dolares/${path}`, {
      headers: { "User-Agent": "salary-intelligence/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return extractPromedio(await res.json());
  } catch {
    return null;
  }
}

/** Fetches all rates at once and returns a map by slug (useful as fallback) */
async function fetchAllDolarApi(): Promise<Map<string, number>> {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares", {
      headers: { "User-Agent": "salary-intelligence/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as Array<{ fuente?: string; nombre?: string; promedio?: number; promedioVenta?: number }>;
    const map = new Map<string, number>();
    for (const item of data) {
      const v = item.promedio ?? item.promedioVenta;
      if (typeof v !== "number" || v <= 0) continue;
      const key = (item.fuente ?? item.nombre ?? "").toLowerCase();
      map.set(key, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function fetchBcvFromApi(): Promise<number | null> {
  return fetchDolarApi("oficial");
}

export async function fetchBcvEurFromApi(): Promise<number | null> {
  const direct = await fetchDolarApi("euro");
  if (direct !== null) return direct;
  // Fallback: list endpoint
  const all = await fetchAllDolarApi();
  return all.get("euro") ?? all.get("eur") ?? null;
}

export async function fetchBinanceFromApi(): Promise<number | null> {
  const direct = await fetchDolarApi("paralelo");
  if (direct !== null) return direct;
  const all = await fetchAllDolarApi();
  return all.get("paralelo") ?? all.get("binance") ?? null;
}

// ─── Cached getters ──────────────────────────────────────────────────────────

async function getCachedRate(
  key: string,
  fetcher: () => Promise<number | null>,
): Promise<{ rate: number | null; updatedAt: string | null }> {
  const config = await prisma.globalConfig.findUnique({ where: { key } });
  const isStale = !config || Date.now() - config.updatedAt.getTime() > STALE_MS;

  if (isStale) {
    const fresh = await fetcher();
    if (fresh !== null) {
      await prisma.globalConfig.upsert({
        where: { key },
        create: { key, value: String(fresh) },
        update: { value: String(fresh) },
      });
      return { rate: fresh, updatedAt: new Date().toISOString() };
    }
  }

  if (!config) return { rate: null, updatedAt: null };
  const rate = parseFloat(config.value);
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : null,
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function getBcvRate()     { return getCachedRate(BCV_KEY,     fetchBcvFromApi); }
export function getBcvEuroRate() { return getCachedRate(BCV_EUR_KEY,  fetchBcvEurFromApi); }
export function getBinanceRate() { return getCachedRate(BINANCE_KEY,  fetchBinanceFromApi); }

// ─── System tasa builders ────────────────────────────────────────────────────

export function buildBcvTasa(rate: number | null, updatedAt: string | null) {
  return {
    id: BCV_TASA_ID,
    nombre: "Tasa BCV (Bs./USD)",
    referencia: "BCV oficial",
    valor: rate !== null ? String(rate) : "",
    isSystem: true as const,
    updatedAt: updatedAt ?? undefined,
  };
}

export function buildBcvEurTasa(rate: number | null, updatedAt: string | null) {
  return {
    id: BCV_EUR_TASA_ID,
    nombre: "Tasa BCV (Bs./EUR)",
    referencia: "BCV oficial EUR",
    valor: rate !== null ? String(rate) : "",
    isSystem: true as const,
    updatedAt: updatedAt ?? undefined,
  };
}
