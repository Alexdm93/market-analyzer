import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { ok: false as const, response: Response.json({ message: "Acceso restringido." }, { status: 403 }) };
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ announcements });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as { title?: string; content?: string; type?: string } | null;
  const title = body?.title?.trim() ?? "";
  const content = body?.content?.trim() ?? "";
  const type = body?.type?.trim() ?? "aviso";

  if (!title || !content) {
    return Response.json({ message: "Título y contenido son obligatorios." }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: { title, content, type },
  });
  return Response.json({ announcement }, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as { id?: string; title?: string; content?: string; type?: string; published?: boolean } | null;
  const id = body?.id?.trim() ?? "";
  if (!id) return Response.json({ message: "ID requerido." }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body?.title === "string") data.title = body.title.trim();
  if (typeof body?.content === "string") data.content = body.content.trim();
  if (typeof body?.type === "string") data.type = body.type.trim();
  if (typeof body?.published === "boolean") {
    data.published = body.published;
    data.publishedAt = body.published ? new Date() : null;
  }

  const announcement = await prisma.announcement.update({ where: { id }, data });
  return Response.json({ announcement });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ message: "ID requerido." }, { status: 400 });

  await prisma.announcement.delete({ where: { id } });
  return Response.json({ message: "Eliminado." });
}
