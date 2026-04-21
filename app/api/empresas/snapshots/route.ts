import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { canAccessEmpresas } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

function forbiddenResponse() {
  return Response.json({ message: "Acceso restringido a administradores y managers." }, { status: 403 });
}

async function requireEmpresasSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  }

  if (!canAccessEmpresas(session.user.role)) {
    return { ok: false as const, response: forbiddenResponse() };
  }

  return { ok: true as const, session };
}

export async function GET(request: Request) {
  const auth = await requireEmpresasSession();

  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const requestedSnapshotId = searchParams.get("snapshotId")?.trim() ?? "";

  const snapshots = await prisma.userSnapshot.findMany({
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

  const selectedSnapshotId = snapshots.some((snapshot) => snapshot.snapshotId === requestedSnapshotId)
    ? requestedSnapshotId
    : snapshots[0]?.snapshotId ?? "";

  if (!selectedSnapshotId) {
    return Response.json({ snapshots: [], selectedSnapshotId: "", companies: [] });
  }

  const groupedCompanies = await prisma.userPosition.groupBy({
    by: ["companyId"],
    where: {
      snapshotId: selectedSnapshotId,
    },
    _count: {
      _all: true,
    },
    _max: {
      updatedAt: true,
    },
    orderBy: {
      companyId: "asc",
    },
  });

  const companies = groupedCompanies.length === 0
    ? []
    : await prisma.company.findMany({
        where: {
          id: {
            in: groupedCompanies.map((entry) => entry.companyId),
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

  const companyNameById = new Map(companies.map((company) => [company.id, company.name]));

  return Response.json({
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.snapshotId,
      label: snapshot.label,
      date: snapshot.date.toISOString().split("T")[0],
    })),
    selectedSnapshotId,
    companies: groupedCompanies
      .map((entry) => ({
        companyId: entry.companyId,
        companyName: companyNameById.get(entry.companyId) ?? "Empresa sin nombre",
        positionsCount: entry._count._all,
        lastSavedAt: entry._max.updatedAt?.toISOString() ?? null,
      }))
      .sort((left, right) => {
        const leftTime = left.lastSavedAt ? new Date(left.lastSavedAt).getTime() : 0;
        const rightTime = right.lastSavedAt ? new Date(right.lastSavedAt).getTime() : 0;

        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }

        return left.companyName.localeCompare(right.companyName);
      }),
  });
}