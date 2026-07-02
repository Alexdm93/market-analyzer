import { prisma } from "@/lib/prisma";

const LIBRE_KEY = "tcr_libre_rate";

export async function getLibreRate(): Promise<{ rate: number | null; updatedAt: string | null }> {
  const config = await prisma.globalConfig.findUnique({ where: { key: LIBRE_KEY } });
  if (!config || !config.value) return { rate: null, updatedAt: null };
  const rate = parseFloat(config.value);
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : null,
    updatedAt: config.updatedAt.toISOString(),
  };
}

export async function setLibreRate(rate: number): Promise<void> {
  await prisma.globalConfig.upsert({
    where: { key: LIBRE_KEY },
    create: { key: LIBRE_KEY, value: String(rate) },
    update: { value: String(rate) },
  });
}

export async function clearLibreRate(): Promise<void> {
  await prisma.globalConfig.deleteMany({ where: { key: LIBRE_KEY } });
}
