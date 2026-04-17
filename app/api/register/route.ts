import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

type RegisterBody = {
  name?: string;
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterBody;
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (name.length < 2) {
    return Response.json({ message: "El nombre debe tener al menos 2 caracteres." }, { status: 400 });
  }

  if (!email.includes("@")) {
    return Response.json({ message: "Ingresa un correo valido." }, { status: 400 });
  }

  if (password.length < 8) {
    return Response.json({ message: "La contrasena debe tener al menos 8 caracteres." }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return Response.json({ message: "Ya existe una cuenta con ese correo." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return Response.json({ user }, { status: 201 });
}