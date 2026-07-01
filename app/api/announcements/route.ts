import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const announcements = await prisma.announcement.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, title: true, content: true, type: true, publishedAt: true },
  });

  return Response.json({ announcements });
}
