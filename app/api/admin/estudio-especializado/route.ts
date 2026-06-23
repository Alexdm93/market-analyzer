import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type EstudioCompany = {
  id: string;
  name: string;
  economicSector: string;
  estudioEnabled: boolean;
  estudioSnapshotIds: string[];
  userCount: number;
};

export type GlobalSnapshot = {
  snapshotId: string;
  label: string;
  date: string;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const [companies, rawSnapshots] = await Promise.all([
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        economicSector: true,
        estudioEnabled: true,
        estudioSnapshotIds: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.userSnapshot.findMany({
      select: { snapshotId: true, label: true, date: true },
      distinct: ["snapshotId"],
      orderBy: { date: "desc" },
    }),
  ]);

  const result: EstudioCompany[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    economicSector: c.economicSector || "—",
    estudioEnabled: c.estudioEnabled,
    estudioSnapshotIds: (() => {
      try { return JSON.parse(c.estudioSnapshotIds) as string[]; } catch { return []; }
    })(),
    userCount: c._count.users,
  }));

  const snapshots: GlobalSnapshot[] = rawSnapshots.map((s) => ({
    snapshotId: s.snapshotId,
    label: s.label,
    date: s.date.toISOString(),
  }));

  return Response.json({ companies: result, snapshots });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });
  if (session.user.role !== "ADMIN") return Response.json({ message: "Acceso restringido." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    companyId?: string;
    enabled?: boolean;
    snapshotIds?: string[];
  } | null;

  if (!body?.companyId || typeof body.enabled !== "boolean") {
    return Response.json({ message: "Formato inválido." }, { status: 400 });
  }

  await prisma.company.update({
    where: { id: body.companyId },
    data: {
      estudioEnabled: body.enabled,
      estudioSnapshotIds: JSON.stringify(Array.isArray(body.snapshotIds) ? body.snapshotIds : []),
    },
  });

  return Response.json({ ok: true });
}
