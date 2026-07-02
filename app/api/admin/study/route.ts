import { SnapshotProcessingStatus } from "@prisma/client";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshotIds, publishSnapshot, unpublishSnapshot } from "@/lib/published-snapshots";
import { safeParseCompanyInfo } from "@/lib/workspace";
import { computeRowTotals, type RowTotals } from "@/lib/compensation";
import { getBcvRate } from "@/lib/bcv";
import type { ExtendedMarketPosition } from "@/types/salary";

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

function formatMoney(value: number) {
  if (!Number.isFinite(value)) {
    return "ND";
  }

  return `$ ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function computeRowTotal(row: Record<string, unknown>) {
  const readNumber = (key: string) => Number(row[key] ?? 0);
  let sum = 0;
  sum += readNumber("sueldoBasico");
  sum += readNumber("bonoAlimentacion");
  sum += readNumber("bonoMovilizacion");
  sum += readNumber("bonoDesempeno");
  sum += readNumber("comisiones");
  sum += readNumber("pagoVariableOtros");
  if (Array.isArray(row.additionalFixedPayments)) {
    sum += row.additionalFixedPayments.reduce((acc, item) => acc + Number((item as { amount?: number }).amount ?? 0), 0);
  }

  if (Array.isArray(row.additionalVariablePayments)) {
    sum += row.additionalVariablePayments.reduce((acc, item) => acc + Number((item as { amount?: number }).amount ?? 0), 0);
  }

  return sum;
}

function collectConceptValues(row: Record<string, unknown>) {
  const concepts = new Map<string, number>();

  const addConcept = (label: string, value: unknown) => {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
      return;
    }

    concepts.set(label, (concepts.get(label) ?? 0) + amount);
  };

  addConcept("Sueldo básico", row.sueldoBasico);
  addConcept("Bono alimentación", row.bonoAlimentacion);
  addConcept("Bono movilización", row.bonoMovilizacion);
  addConcept("Bono desempeño", row.bonoDesempeno);
  addConcept("Comisiones", row.comisiones);
  addConcept("Otros variables", row.pagoVariableOtros);

  if (Array.isArray(row.additionalFixedPayments)) {
    row.additionalFixedPayments.forEach((item) => {
      const concept = String((item as { concept?: string }).concept ?? "").trim() || "Pago fijo adicional";
      addConcept(concept, (item as { amount?: number }).amount);
    });
  }

  if (Array.isArray(row.additionalVariablePayments)) {
    row.additionalVariablePayments.forEach((item) => {
      const concept = String((item as { concept?: string }).concept ?? "").trim() || "Pago variable adicional";
      addConcept(concept, (item as { amount?: number }).amount);
    });
  }

  addConcept("Compensación total", computeRowTotal(row));

  return Object.fromEntries(concepts.entries());
}

export async function GET(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";

  const [snapshots, publishedIds] = await Promise.all([
    prisma.userSnapshot.findMany({
      select: {
        snapshotId: true,
        label: true,
        date: true,
        status: true,
        processedAt: true,
      },
      distinct: ["snapshotId"],
      orderBy: [
        { date: "desc" },
        { snapshotId: "desc" },
      ],
    }),
    getPublishedSnapshotIds(),
  ]);

  const publishedSet = new Set(publishedIds);

  const snapshotDtos = snapshots.map((snapshot) => ({
    id: snapshot.snapshotId,
    label: snapshot.label,
    date: snapshot.date.toISOString().split("T")[0],
    status: snapshot.status,
    processedAt: snapshot.processedAt?.toISOString() ?? null,
    published: publishedSet.has(snapshot.snapshotId),
  }));

  if (!snapshotId) {
    return Response.json({ snapshots: snapshotDtos, positions: [] });
  }

  const [positions, { rate: bcvRate }] = await Promise.all([
    prisma.userPosition.findMany({
      where: { snapshotId },
      select: {
        id: true,
        userId: true,
        title: true,
        dataJson: true,
        company: {
          select: {
            name: true,
            economicSector: true,
            headcount: true,
          },
        },
      },
      orderBy: [
        { companyId: "asc" },
        { title: "asc" },
      ],
    }),
    getBcvRate(),
  ]);

  // Fetch companyInfo for each user (tasas, vacation/utility days for pasivos calc)
  const userIds = [...new Set(positions.map((p) => p.userId))];
  const workspaces = await prisma.userWorkspace.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, companyInfoJson: true },
  });
  const companyInfoByUserId = new Map(
    workspaces.map((w) => [w.userId, safeParseCompanyInfo(w.companyInfoJson)]),
  );

  return Response.json({
    snapshots: snapshotDtos,
    positions: positions.map((position) => {
      const parsed = JSON.parse(position.dataJson) as ExtendedMarketPosition & Record<string, unknown>;
      const companyInfo = companyInfoByUserId.get(position.userId);
      const tasas = companyInfo?.tasas ?? [];
      const diasVacaciones = Number(companyInfo?.minVacationDays) || 0;
      const diasUtilidades = Number(companyInfo?.minUtilityDays) || 0;
      const rowTotals: RowTotals = computeRowTotals(parsed, tasas, bcvRate, diasVacaciones, diasUtilidades);

      const conceptValues = collectConceptValues(parsed);
      conceptValues["Sin pasivos — mensual"] = rowTotals.totalSinPasivosMensual;
      conceptValues["Con pasivos — mensual"] = rowTotals.totalConPasivosMensual;
      conceptValues["Con pasivos — anual"] = rowTotals.totalConPasivosAnual;
      conceptValues["Total directo mensualizado"] = rowTotals.totalDirectoMensualizado;

      return {
        id: position.id,
        companyName: position.company.name,
        sector: position.company.economicSector || "",
        headcount: position.company.headcount || "",
        title: position.title || String(parsed.tituloCargo ?? "Sin título"),
        level: String(parsed.nivelOrganizacional ?? ""),
        hayGrade: parsed.hayGrade,
        classification: String(parsed.clasificacion ?? ""),
        description: String(parsed.descripcion ?? ""),
        baseSalary: formatMoney(Number(parsed.sueldoBasico ?? 0)),
        totalCompensation: formatMoney(computeRowTotal(parsed)),
        conceptValues,
      };
    }),
  });
}

type UpdateStudyStatusBody = {
  snapshotId?: string;
  status?: SnapshotProcessingStatus;
  publish?: boolean;
};

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as UpdateStudyStatusBody | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Datos inválidos para actualizar el estado del corte." }, { status: 400 });
  }

  // Publish / unpublish action
  if (typeof body?.publish === "boolean") {
    const exists = await prisma.userSnapshot.count({ where: { snapshotId } });
    if (exists === 0) {
      return Response.json({ message: "El corte no existe." }, { status: 404 });
    }
    if (body.publish) {
      await publishSnapshot(snapshotId);
      return Response.json({ message: `Corte ${snapshotId} publicado.`, snapshotId, published: true });
    } else {
      await unpublishSnapshot(snapshotId);
      return Response.json({ message: `Corte ${snapshotId} despublicado.`, snapshotId, published: false });
    }
  }

  // Status update (IN_REVIEW / PROCESSED)
  const status = body?.status;
  if (status !== "IN_REVIEW" && status !== "PROCESSED") {
    return Response.json({ message: "Datos inválidos para actualizar el estado del corte." }, { status: 400 });
  }

  const result = await prisma.userSnapshot.updateMany({
    where: { snapshotId },
    data: {
      status,
      processedAt: status === "PROCESSED" ? new Date() : null,
    },
  });

  if (result.count === 0) {
    return Response.json({ message: "El corte no existe." }, { status: 404 });
  }

  const snapshot = await prisma.userSnapshot.findFirst({
    where: { snapshotId },
    select: { processedAt: true },
  });

  return Response.json({
    message: status === "PROCESSED" ? `Corte ${snapshotId} procesado.` : `Corte ${snapshotId} marcado en revisión.`,
    snapshotId,
    status,
    processedAt: snapshot?.processedAt?.toISOString() ?? null,
    affectedUsers: result.count,
  });
}