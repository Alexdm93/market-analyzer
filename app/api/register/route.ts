import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE } from "@/lib/workspace";

type RegisterBody = {
  companyId?: string;
  companyName?: string;
  companyDescription?: string;
  companyEconomicSector?: string;
  companyClassification?: string;
  name?: string;
  email?: string;
  password?: string;
  role?: "USER" | "ADMIN";
};

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterBody;
  const companyId = body.companyId?.trim() ?? "";
  const companyName = body.companyName?.trim() ?? "";
  const companyDescription = body.companyDescription?.trim() ?? "";
  const companyEconomicSector = body.companyEconomicSector?.trim() ?? "";
  const companyClassification = body.companyClassification?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const requestedRole = body.role === "ADMIN" ? UserRole.ADMIN : UserRole.USER;

  if (!companyId && companyName.length < 2) {
    return Response.json({ message: "Selecciona una empresa válida." }, { status: 400 });
  }

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
  const session = await getServerSession(authOptions);

  const user = await prisma.$transaction(async (tx) => {
    const company = companyId
      ? await tx.company.findUnique({
          where: { id: companyId },
          select: { id: true, name: true, description: true, economicSector: true, classification: true },
        })
      : await tx.company.upsert({
          where: { name: companyName },
          update: {},
          create: {
            name: companyName,
            description: companyDescription,
            economicSector: companyEconomicSector,
            classification: companyClassification,
          },
          select: { id: true, name: true, description: true, economicSector: true, classification: true },
        });

    if (!company) {
      throw new Error("COMPANY_NOT_FOUND");
    }

    const globalSnapshots = await tx.userSnapshot.findMany({
      select: {
        snapshotId: true,
        label: true,
        date: true,
      },
      distinct: ["snapshotId"],
      orderBy: [
        { date: "desc" },
        { snapshotId: "desc" },
      ],
    });

    const snapshots = Object.fromEntries(
      globalSnapshots.map((snapshot) => {
        const snapshotDate = snapshot.date.toISOString().split("T")[0];

        return [
          snapshot.snapshotId,
          {
            id: snapshot.snapshotId,
            label: snapshot.label,
            date: snapshotDate,
            rows: [],
          },
        ];
      })
    );

    const userCount = await tx.user.count();
    const role = userCount === 0 ? UserRole.ADMIN : session?.user?.role === "ADMIN" ? requestedRole : UserRole.USER;

    const createdUser = await tx.user.create({
      data: {
        companyId: company.id,
        role,
        name,
        email,
        passwordHash,
        workspace: {
          create: {
            inflation: DEFAULT_WORKSPACE.inflation,
            selectedSnapshotId: globalSnapshots[0]?.snapshotId ?? DEFAULT_WORKSPACE.selectedSnapshotId,
            snapshotsJson: JSON.stringify(snapshots),
            companyInfoJson: JSON.stringify({
              ...DEFAULT_WORKSPACE.companyInfo,
              companyName: company.name,
              sector: company.economicSector,
              classification: company.classification,
              description: company.description,
            }),
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        companyId: true,
      },
    });

    if (globalSnapshots.length > 0) {
      await tx.userSnapshot.createMany({
        data: globalSnapshots.map((snapshot) => ({
          userId: createdUser.id,
          companyId: company.id,
          snapshotId: snapshot.snapshotId,
          label: snapshot.label,
          date: snapshot.date,
        })),
      });
    }

    return createdUser;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "COMPANY_NOT_FOUND") {
      return null;
    }

    throw error;
  });

  if (!user) {
    return Response.json({ message: "La empresa seleccionada no existe." }, { status: 404 });
  }

  return Response.json({ user }, { status: 201 });
}