import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { conCupoCambiado, cupoDelCorte } from "@/lib/cupo-informes";
import { prisma } from "@/lib/prisma";

export type EstudioCompany = {
  id: string;
  name: string;
  economicSector: string;
  estudioEnabled: boolean;
  estudioSnapshotIds: string[];
  /** Cupo de cortes de data por estudio. Lo que no esté vale el por defecto. */
  estudioCupos: Record<string, number>;
  /** Cuántos cortes distintos ya configuró en cada estudio. */
  estudioUsados: Record<string, number>;
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

  const [companies, rawSnapshots, informes] = await Promise.all([
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        economicSector: true,
        estudioEnabled: true,
        estudioSnapshotIds: true,
        estudioCuposJson: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.userSnapshot.findMany({
      select: { snapshotId: true, label: true, date: true },
      distinct: ["snapshotId"],
      orderBy: { date: "desc" },
    }),
    prisma.estudioInforme.findMany({ select: { companyId: true, snapshotId: true, configHash: true } }),
  ]);

  // Cuántos cortes DISTINTOS configuró cada empresa en cada estudio. Dos
  // informes con la misma huella son el mismo corte visto dos veces.
  const usados = new Map<string, Set<string>>();
  informes.forEach((i, n) => {
    const clave = `${i.companyId}|${i.snapshotId}`;
    const set = usados.get(clave) ?? new Set<string>();
    set.add(i.configHash || `sin-huella-${n}`);
    usados.set(clave, set);
  });

  const result: EstudioCompany[] = companies.map((c) => {
    const cortes = (() => {
      try { return JSON.parse(c.estudioSnapshotIds) as string[]; } catch { return []; }
    })();

    const cupos: Record<string, number> = {};
    const yaUsados: Record<string, number> = {};
    for (const corte of cortes) {
      cupos[corte] = cupoDelCorte(c.estudioCuposJson, corte);
      yaUsados[corte] = usados.get(`${c.id}|${corte}`)?.size ?? 0;
    }

    return {
      id: c.id,
      name: c.name,
      economicSector: c.economicSector || "—",
      estudioEnabled: c.estudioEnabled,
      estudioSnapshotIds: cortes,
      estudioCupos: cupos,
      estudioUsados: yaUsados,
      userCount: c._count.users,
    };
  });

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
    /** Cupo de un estudio puntual, sin tocar los demás. */
    cupo?: { snapshotId: string; valor: number };
  } | null;

  if (!body?.companyId) {
    return Response.json({ message: "Indica la empresa." }, { status: 400 });
  }

  if (body.cupo?.snapshotId) {
    const empresa = await prisma.company.findUnique({
      where: { id: body.companyId },
      select: { estudioCuposJson: true },
    });
    await prisma.company.update({
      where: { id: body.companyId },
      data: {
        estudioCuposJson: conCupoCambiado(
          empresa?.estudioCuposJson ?? "{}",
          body.cupo.snapshotId,
          Number(body.cupo.valor) || 0,
        ),
      },
    });
    return Response.json({ ok: true });
  }

  if (typeof body.enabled !== "boolean") {
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
