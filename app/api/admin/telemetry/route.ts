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
  /** Cuándo envió el corte. Nulo fuera del modo corte o si todavía no lo envió. */
  submittedAt: string | null;
  /** En qué quedó el envío del corte. Nulo fuera del modo corte. */
  processingStatus: "IN_REVIEW" | "PROCESSED" | null;
};

/**
 * Lo que la empresa hizo **en un corte**.
 *
 * `UserSnapshot.updatedAt` no sirve para esto: al guardar, el cliente manda el
 * mapa completo de cortes y el servidor borra y recrea las filas de todos, así
 * que la marca de tiempo termina siendo la misma en todos. La única marca que
 * sí distingue un corte de otro es `_lastModified`, que el guardado conserva
 * fila por fila cuando la data no cambió (ver app/api/workspace/route.ts).
 */
async function actividadDelCorte(snapshotId: string) {
  const [snapshots, posiciones] = await Promise.all([
    prisma.userSnapshot.findMany({
      where: { snapshotId },
      select: { companyId: true, submittedAt: true, status: true },
    }),
    prisma.userPosition.findMany({
      where: { snapshotId },
      select: { companyId: true, dataJson: true, updatedAt: true },
    }),
  ]);

  // Una empresa puede tener varios usuarios: vale el envío más viejo —el
  // primero que respondió— y el estado más avanzado.
  const envios = new Map<string, { submittedAt: Date | null; status: "IN_REVIEW" | "PROCESSED" }>();
  for (const s of snapshots) {
    const previo = envios.get(s.companyId);
    const anterior = previo?.submittedAt ?? null;
    const primero =
      anterior && s.submittedAt ? (s.submittedAt < anterior ? s.submittedAt : anterior) : anterior ?? s.submittedAt;

    envios.set(s.companyId, {
      submittedAt: primero,
      status: previo?.status === "PROCESSED" || s.status === "PROCESSED" ? "PROCESSED" : "IN_REVIEW",
    });
  }

  const cargos = new Map<string, number>();
  const guardados = new Map<string, Date>();
  for (const p of posiciones) {
    cargos.set(p.companyId, (cargos.get(p.companyId) ?? 0) + 1);

    let marca = p.updatedAt;
    try {
      const fila = JSON.parse(p.dataJson) as { _lastModified?: unknown };
      if (typeof fila._lastModified === "string") {
        const fecha = new Date(fila._lastModified);
        if (!Number.isNaN(fecha.getTime())) marca = fecha;
      }
    } catch {
      // fila corrupta: queda la marca de la fila, que igual es del último guardado
    }

    const previo = guardados.get(p.companyId);
    if (!previo || marca > previo) guardados.set(p.companyId, marca);
  }

  return { envios, cargos, guardados };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  // Sin corte se ve la actividad de la cuenta, que es como estaba antes.
  const snapshotId = new URL(request.url).searchParams.get("snapshotId")?.trim() ?? "";
  const corte = snapshotId ? await actividadDelCorte(snapshotId) : null;

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
  const loginMap = new Map<string, { lastLoginAt: Date; name: string }>();
  const exportMap = new Map<string, Date>();

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

    const envio = corte?.envios.get(company.id) ?? null;
    // El acceso y la descarga son de la cuenta, no del corte: no hay forma de
    // atribuirlos a uno, así que se dejan como están aunque haya corte elegido.
    const guardadoDelCorte = corte ? corte.guardados.get(company.id) ?? null : lastDataSavedAt;

    return {
      companyId: company.id,
      companyName: company.name,
      economicSector: company.economicSector || "—",
      userCount: company.users.length,
      lastLoginAt: lastLoginAt ? lastLoginAt.toISOString() : null,
      lastLoginUserName,
      lastDataSavedAt: guardadoDelCorte ? guardadoDelCorte.toISOString() : null,
      lastExportAt: lastExportAt ? lastExportAt.toISOString() : null,
      totalPositions: corte ? corte.cargos.get(company.id) ?? 0 : company._count.positions,
      lastPositionAt: company.positions[0]?.updatedAt.toISOString() ?? null,
      submittedAt: envio?.submittedAt?.toISOString() ?? null,
      processingStatus: envio?.status ?? null,
    };
  });

  return Response.json({ telemetry });
}
