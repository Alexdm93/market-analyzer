import bcrypt from "bcryptjs";
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

type BulkUserUpdate = {
  userId?: string;
  role?: "USER" | "ADMIN";
  password?: string;
  companyId?: string;
};

type BulkUpdateUsersBody = {
  updates?: BulkUserUpdate[];
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

export async function PUT(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as BulkUpdateUsersBody;
  const updates = Array.isArray(body.updates) ? body.updates : [];

  if (updates.length === 0) {
    return Response.json({ message: "No hay cambios para guardar." }, { status: 400 });
  }

  const normalizedUpdates = updates.map((update) => ({
    userId: update.userId?.trim() ?? "",
    role: update.role,
    password: update.password ?? "",
    companyId: update.companyId?.trim() ?? "",
  }));

  const invalidUpdate = normalizedUpdates.find(
    (update) => !update.userId || !update.companyId || ((update.role !== "USER" && update.role !== "ADMIN") && update.password.trim().length === 0)
  );

  if (invalidUpdate) {
    return Response.json({ message: "Hay cambios inválidos en la actualización de usuarios." }, { status: 400 });
  }

  const tooShortPassword = normalizedUpdates.find(
    (update) => update.password.trim().length > 0 && update.password.trim().length < 8
  );

  if (tooShortPassword) {
    return Response.json({ message: "La nueva contrasena debe tener al menos 8 caracteres." }, { status: 400 });
  }

  const selfDemotion = normalizedUpdates.find(
    (update) => update.userId === auth.session.user.id && update.role === "USER"
  );

  if (selfDemotion) {
    return Response.json({ message: "No puedes quitarte tu propio acceso admin desde aquí." }, { status: 400 });
  }

  const companyIds = Array.from(new Set(normalizedUpdates.map((update) => update.companyId)));
  const companies = await prisma.company.findMany({
    where: {
      id: {
        in: companyIds,
      },
    },
    select: { id: true },
  });

  if (companies.length !== companyIds.length) {
    return Response.json({ message: "Una de las empresas seleccionadas no existe." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    for (const update of normalizedUpdates) {
      const data: {
        role?: "USER" | "ADMIN";
        passwordHash?: string;
        companyId?: string;
      } = {};

      if (update.role === "USER" || update.role === "ADMIN") {
        data.role = update.role;
      }

      if (update.password.trim().length > 0) {
        data.passwordHash = await bcrypt.hash(update.password.trim(), 12);
      }

      data.companyId = update.companyId;

      await tx.user.update({
        where: { id: update.userId },
        data,
      });

      await tx.userSnapshot.updateMany({
        where: { userId: update.userId },
        data: { companyId: update.companyId },
      });

      await tx.userPosition.updateMany({
        where: { userId: update.userId },
        data: { companyId: update.companyId },
      });
    }
  }).catch(() => null);

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