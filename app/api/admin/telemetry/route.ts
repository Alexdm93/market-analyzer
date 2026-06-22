import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CompanyTelemetry = {
  companyId: string;
  companyName: string;
  economicSector: string;
  userCount: number;
  // Latest login across all users in the company
  lastLoginAt: string | null;
  lastLoginUserName: string | null;
  // Latest workspace save (updatedAt of UserWorkspace, indicates data was saved)
  lastDataSavedAt: string | null;
  // Latest export across all users in the company
  lastExportAt: string | null;
  // Total positions saved
  totalPositions: number;
  // Latest position activity
  lastPositionAt: string | null;
};

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      economicSector: true,
      users: {
        select: {
          id: true,
          name: true,
          lastLoginAt: true,
          workspace: {
            select: {
              updatedAt: true,
              lastExportAt: true,
            },
          },
        },
      },
      positions: {
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      _count: {
        select: { positions: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const telemetry: CompanyTelemetry[] = companies.map((company) => {
    // Find the user with the most recent login
    let lastLoginAt: Date | null = null;
    let lastLoginUserName: string | null = null;
    let lastDataSavedAt: Date | null = null;
    let lastExportAt: Date | null = null;

    for (const user of company.users) {
      if (user.lastLoginAt) {
        if (!lastLoginAt || user.lastLoginAt > lastLoginAt) {
          lastLoginAt = user.lastLoginAt;
          lastLoginUserName = user.name;
        }
      }
      if (user.workspace?.updatedAt) {
        if (!lastDataSavedAt || user.workspace.updatedAt > lastDataSavedAt) {
          lastDataSavedAt = user.workspace.updatedAt;
        }
      }
      if (user.workspace?.lastExportAt) {
        if (!lastExportAt || user.workspace.lastExportAt > lastExportAt) {
          lastExportAt = user.workspace.lastExportAt;
        }
      }
    }

    const lastPositionUpdatedAt = company.positions[0]?.updatedAt ?? null;

    return {
      companyId: company.id,
      companyName: company.name,
      economicSector: company.economicSector || "—",
      userCount: company.users.length,
      lastLoginAt: lastLoginAt ? lastLoginAt.toISOString() : null,
      lastLoginUserName,
      lastDataSavedAt: lastDataSavedAt ? lastDataSavedAt.toISOString() : null,
      lastExportAt: lastExportAt ? lastExportAt.toISOString() : null,
      totalPositions: company._count.positions,
      lastPositionAt: lastPositionUpdatedAt ? lastPositionUpdatedAt.toISOString() : null,
    };
  });

  return Response.json({ telemetry });
}
