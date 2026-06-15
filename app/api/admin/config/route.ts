import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ECONOMIC_SECTOR_OPTIONS,
  COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR,
} from "@/lib/company";

export type SectorEntry = {
  name: string;
  classifications: string[];
};

const CONFIG_KEY = "sectors";

function defaultSectors(): SectorEntry[] {
  return (ECONOMIC_SECTOR_OPTIONS as readonly string[]).map((name) => ({
    name,
    classifications: COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[name] ?? [],
  }));
}

export async function GET() {
  try {
    const row = await prisma.globalConfig.findUnique({ where: { key: CONFIG_KEY } });
    if (row?.value) {
      const parsed = JSON.parse(row.value) as SectorEntry[];
      if (Array.isArray(parsed)) {
        return Response.json({ sectors: parsed });
      }
    }
  } catch {
    // GlobalConfig table may not exist yet — fall back to hardcoded
  }
  return Response.json({ sectors: defaultSectors() });
}

type UpdateSectorsBody = {
  sectors?: SectorEntry[];
};

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json()) as UpdateSectorsBody;
  const sectors = body.sectors;

  if (!Array.isArray(sectors)) {
    return Response.json({ message: "Formato inválido." }, { status: 400 });
  }

  try {
    await prisma.globalConfig.upsert({
      where: { key: CONFIG_KEY },
      create: { key: CONFIG_KEY, value: JSON.stringify(sectors) },
      update: { value: JSON.stringify(sectors) },
    });
    return Response.json({ message: "Sectores guardados correctamente." });
  } catch {
    return Response.json(
      { message: "No se pudo guardar. Ejecuta la migración pendiente con: npx prisma migrate dev" },
      { status: 500 }
    );
  }
}
