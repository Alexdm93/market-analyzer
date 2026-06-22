import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ECONOMIC_SECTOR_OPTIONS,
  COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR,
} from "@/lib/company";
import { JOB_TITLES_BY_DEPARTMENT } from "@/data/jobTitles";

export type SectorEntry = {
  name: string;
  classifications: string[];
};

export type CargoEntry = {
  departamento: string;
  cargos: string[];
};

const SECTORS_KEY = "sectors";
const CARGOS_KEY = "cargos";

function defaultSectors(): SectorEntry[] {
  return (ECONOMIC_SECTOR_OPTIONS as readonly string[]).map((name) => ({
    name,
    classifications: COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[name] ?? [],
  }));
}

function defaultCargos(): CargoEntry[] {
  return Object.entries(JOB_TITLES_BY_DEPARTMENT).map(([departamento, cargos]) => ({
    departamento,
    cargos,
  }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  let sectors: SectorEntry[] = defaultSectors();
  let cargos: CargoEntry[] = defaultCargos();

  try {
    const [sectorsRow, cargosRow] = await Promise.all([
      prisma.globalConfig.findUnique({ where: { key: SECTORS_KEY } }),
      prisma.globalConfig.findUnique({ where: { key: CARGOS_KEY } }),
    ]);

    if (sectorsRow?.value) {
      const parsed = JSON.parse(sectorsRow.value) as SectorEntry[];
      if (Array.isArray(parsed)) sectors = parsed;
    }

    if (cargosRow?.value) {
      const parsed = JSON.parse(cargosRow.value) as CargoEntry[];
      if (Array.isArray(parsed)) cargos = parsed;
    }
  } catch {
    // GlobalConfig table may not exist yet — fall back to hardcoded
  }

  return Response.json({ sectors, cargos });
}

type UpdateConfigBody = {
  sectors?: SectorEntry[];
  cargos?: CargoEntry[];
};

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
  }

  const body = (await request.json()) as UpdateConfigBody;

  if (!Array.isArray(body.sectors) && !Array.isArray(body.cargos)) {
    return Response.json({ message: "Nada que guardar." }, { status: 400 });
  }

  try {
    const operations: Promise<unknown>[] = [];

    if (Array.isArray(body.sectors)) {
      operations.push(
        prisma.globalConfig.upsert({
          where: { key: SECTORS_KEY },
          create: { key: SECTORS_KEY, value: JSON.stringify(body.sectors) },
          update: { value: JSON.stringify(body.sectors) },
        })
      );
    }

    if (Array.isArray(body.cargos)) {
      operations.push(
        prisma.globalConfig.upsert({
          where: { key: CARGOS_KEY },
          create: { key: CARGOS_KEY, value: JSON.stringify(body.cargos) },
          update: { value: JSON.stringify(body.cargos) },
        })
      );
    }

    await Promise.all(operations);

    const messages: string[] = [];
    if (body.sectors) messages.push("Sectores guardados");
    if (body.cargos) messages.push("Cargos guardados");

    return Response.json({ message: `${messages.join(" y ")} correctamente.` });
  } catch {
    return Response.json(
      { message: "No se pudo guardar. Ejecuta la migración pendiente con: npx prisma migrate dev" },
      { status: 500 }
    );
  }
}
