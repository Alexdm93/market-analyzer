import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  await prisma.userWorkspace.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, lastExportAt: new Date() },
    update: { lastExportAt: new Date() },
  });

  return Response.json({ ok: true });
}
