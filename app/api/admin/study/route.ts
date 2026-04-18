import { SnapshotProcessingStatus } from "@prisma/client";
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
  sum += readNumber("pagoTransporte");
  sum += readNumber("viaticos");
  sum += readNumber("otrosPagos");
  sum += readNumber("aportesSeguridadSocial");
  sum += readNumber("prestacionesLegales");

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
  addConcept("Horas extras", row.horasExtras);
  addConcept("Nocturnidad", row.nocturnidad);
  addConcept("Pago transporte", row.pagoTransporte);
  addConcept("Viáticos", row.viaticos);
  addConcept("Otros pagos", row.otrosPagos);
  addConcept("Bono desempeño", row.bonoDesempeno);
  addConcept("Comisiones", row.comisiones);
  addConcept("Otros variables", row.pagoVariableOtros);
  addConcept("Aportes seguridad social", row.aportesSeguridadSocial);
  addConcept("Prestaciones legales", row.prestacionesLegales);

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

  const snapshots = await prisma.userSnapshot.findMany({
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
  });

  if (!snapshotId) {
    return Response.json({
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.snapshotId,
        label: snapshot.label,
        date: snapshot.date.toISOString().split("T")[0],
        status: snapshot.status,
        processedAt: snapshot.processedAt?.toISOString() ?? null,
      })),
      positions: [],
    });
  }

  const positions = await prisma.userPosition.findMany({
    where: { snapshotId },
    select: {
      id: true,
      title: true,
      dataJson: true,
      company: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { companyId: "asc" },
      { title: "asc" },
    ],
  });

  return Response.json({
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.snapshotId,
      label: snapshot.label,
      date: snapshot.date.toISOString().split("T")[0],
      status: snapshot.status,
      processedAt: snapshot.processedAt?.toISOString() ?? null,
    })),
    positions: positions.map((position) => {
      const parsed = JSON.parse(position.dataJson) as Record<string, unknown>;

      return {
        id: position.id,
        companyName: position.company.name,
        title: position.title || String(parsed.tituloCargo ?? "Sin título"),
        level: String(parsed.nivelOrganizacional ?? ""),
        classification: String(parsed.clasificacion ?? ""),
        description: String(parsed.descripcion ?? ""),
        baseSalary: formatMoney(Number(parsed.sueldoBasico ?? 0)),
        totalCompensation: formatMoney(computeRowTotal(parsed)),
        conceptValues: collectConceptValues(parsed),
      };
    }),
  });
}

type UpdateStudyStatusBody = {
  snapshotId?: string;
  status?: SnapshotProcessingStatus;
};

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as UpdateStudyStatusBody | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  const status = body?.status;

  if (!snapshotId || (status !== "IN_REVIEW" && status !== "PROCESSED")) {
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
    select: {
      processedAt: true,
    },
  });

  return Response.json({
    message: status === "PROCESSED" ? `Corte ${snapshotId} procesado.` : `Corte ${snapshotId} marcado en revisión.`,
    snapshotId,
    status,
    processedAt: snapshot?.processedAt?.toISOString() ?? null,
    affectedUsers: result.count,
  });
}