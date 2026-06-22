import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CompanyTelemetry = {
  companyId: string;
  companyName: string;
  economicSector: string;
  userCount: number;
  lastLoginAt: string | null;
  lastLoginUserName: string | null;
  lastDataSavedAt: string | null;
  lastExportAt: string | null;
  totalPositions: number;
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

  // Base query — works even before migration is applied
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      economicSector: true,
      users: {
        select: {
          id: true,
          name: true,
          workspace: {
            select: { updatedAt: true },
          },
        },
      },
      positions: {
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      _count: { select: { positions: true } },
    },
    orderBy: { name: "asc" },
  });

  // Try to fetch telemetry columns added by migration — gracefully degrade if not applied yet
  let loginMap = new Map<string, { lastLoginAt: Date; name: string }>();
  let exportMap = new Map<string, Date>();

  try {
    const usersWithLogin = await prisma.user.findMany({
      select: { id: true, name: true, lastLoginAt: true },
    });
    for (const u of usersWithLogin) {
      if (u.lastLoginAt) loginMap.set(u.id, { lastLoginAt: u.lastLoginAt, name: u.name });
    }
  } catch {
    // Migration not applied yet — lastLoginAt column missing, skip
  }

  try {
    const workspaces = await prisma.userWorkspace.findMany({
      select: { userId: true, lastExportAt: true },
    });
    for (const w of workspaces) {
      if (w.lastExportAt) exportMap.set(w.userId, w.lastExportAt);
    }
  } catch {
    // Migration not applied yet — lastExportAt column missing, skip
  }

  const telemetry: CompanyTelemetry[] = companies.map((company) => {
    let lastLoginAt: Date | null = null;
    let lastLoginUserName: string | null = null;
    let lastDataSavedAt: Date | null = null;
    let lastExportAt: Date | null = null;

    for (const user of company.users) {
      const loginInfo = loginMap.get(user.id);
      if (loginInfo) {
        if (!lastLoginAt || loginInfo.lastLoginAt > lastLoginAt) {
          lastLoginAt = loginInfo.lastLoginAt;
          lastLoginUserName = loginInfo.name;
        }
      }

      if (user.workspace?.updatedAt) {
        if (!lastDataSavedAt || user.workspace.updatedAt > lastDataSavedAt) {
          lastDataSavedAt = user.workspace.updatedAt;
        }
      }

      const exportDate = exportMap.get(user.id);
      if (exportDate && (!lastExportAt || exportDate > lastExportAt)) {
        lastExportAt = exportDate;
      }
    }

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
      lastPositionAt: company.positions[0]?.updatedAt.toISOString() ?? null,
    };
  });

  return Response.json({ telemetry });
}
