import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function forbiddenResponse() {
  return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
}

async function requireAdminSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }

  if (session.user.role !== "ADMIN") {
    return { ok: false as const, response: forbiddenResponse() };
  }

  return { ok: true as const, session };
}

export async function GET() {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { role: "desc" },
      { createdAt: "asc" },
    ],
  });

  return Response.json({ users });
}

type UpdateUserRoleBody = {
  userId?: string;
  role?: "USER" | "ADMIN";
};

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as UpdateUserRoleBody;
  const userId = body.userId?.trim() ?? "";
  const role = body.role;

  if (!userId || (role !== "USER" && role !== "ADMIN")) {
    return Response.json({ message: "Datos inválidos para actualizar el rol." }, { status: 400 });
  }

  if (auth.session.user.id === userId && role !== "ADMIN") {
    return Response.json({ message: "No puedes quitarte tu propio acceso admin desde aquí." }, { status: 400 });
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  }).catch(() => null);

  if (!updatedUser) {
    return Response.json({ message: "El usuario no existe." }, { status: 404 });
  }

  return Response.json({ user: updatedUser });
}