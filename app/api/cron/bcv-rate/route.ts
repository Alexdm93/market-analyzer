import { prisma } from "@/lib/prisma";
import { fetchBcvFromApi } from "@/lib/bcv";

const BCV_KEY = "bcv_usd_rate";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rate = await fetchBcvFromApi();
  if (rate === null) {
    return Response.json({ ok: false, error: "No se pudo obtener la tasa BCV" });
  }

  await prisma.globalConfig.upsert({
    where: { key: BCV_KEY },
    create: { key: BCV_KEY, value: String(rate) },
    update: { value: String(rate) },
  });

  return Response.json({ ok: true, rate });
}
