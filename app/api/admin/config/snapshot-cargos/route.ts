import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SnapshotCargoItem = {
  departamento: string;
  tituloCargo: string;
};

function configKey(snapshotId: string) {
  return `snapshot-cargos-${snapshotId}`;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId") ?? "";

  if (!snapshotId) {
    return Response.json({ message: "Indica el corte." }, { status: 400 });
  }

  try {
    const row = await prisma.globalConfig.findUnique({ where: { key: configKey(snapshotId) } });
    if (row?.value) {
      const parsed = JSON.parse(row.value) as SnapshotCargoItem[];
      if (Array.isArray(parsed)) {
        return Response.json({ cargos: parsed });
      }
    }
  } catch {
    // GlobalConfig table may not exist yet
  }

  return Response.json({ cargos: [] });
}

type PutBody = {
  snapshotId?: string;
  cargos?: SnapshotCargoItem[];
};

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as PutBody | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  const cargos = body?.cargos;

  if (!snapshotId || !Array.isArray(cargos)) {
    return Response.json({ message: "Formato inválido." }, { status: 400 });
  }

  try {
    const key = configKey(snapshotId);
    await prisma.globalConfig.upsert({
      where: { key },
      create: { key, value: JSON.stringify(cargos) },
      update: { value: JSON.stringify(cargos) },
    });
    return Response.json({ message: "Cargos del corte guardados correctamente." });
  } catch {
    return Response.json(
      { message: "No se pudo guardar. Verifica que la migración de base de datos esté aplicada." },
      { status: 500 }
    );
  }
}
