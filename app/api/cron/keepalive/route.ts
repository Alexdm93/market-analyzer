import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  await prisma.globalConfig.count();

  return Response.json({ ok: true });
}
