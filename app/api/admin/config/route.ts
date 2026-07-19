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

type SnapshotCargoEntry = { departamento: string; tituloCargo: string };

function propagateMasterToSnapshot(
  oldMaster: CargoEntry[],
  newMaster: CargoEntry[],
  snapshot: SnapshotCargoEntry[]
): SnapshotCargoEntry[] {
  const oldDeptMap = new Map(oldMaster.map((d) => [d.departamento, new Set(d.cargos)]));
  const newDeptMap = new Map(newMaster.map((d) => [d.departamento, new Set(d.cargos)]));

  // Detect dept renames: old dept not in new + new dept not in old, with >50% cargo overlap
  const removedDepts = oldMaster.filter((d) => !newDeptMap.has(d.departamento));
  const addedDepts   = newMaster.filter((d) => !oldDeptMap.has(d.departamento));
  const deptRenameMap = new Map<string, string>();
  for (const oldDept of removedDepts) {
    let best: { name: string; score: number } | null = null;
    for (const newDept of addedDepts) {
      const oldSet = oldDeptMap.get(oldDept.departamento)!;
      const overlap = newDept.cargos.filter((c) => oldSet.has(c)).length;
      const union   = new Set([...oldDept.cargos, ...newDept.cargos]).size;
      const score   = union > 0 ? overlap / union : 0;
      if (score > 0.5 && (!best || overlap > best.score)) {
        best = { name: newDept.departamento, score: overlap };
      }
    }
    if (best) deptRenameMap.set(oldDept.departamento, best.name);
  }

  // Rebuild snapshot: apply renames, remove deleted depts/cargos, keep valid entries
  const kept: SnapshotCargoEntry[] = [];
  const seenDepts = new Set<string>();
  for (const entry of snapshot) {
    const resolvedDept = deptRenameMap.get(entry.departamento) ?? entry.departamento;
    const deptCargos   = newDeptMap.get(resolvedDept);
    if (!deptCargos) continue; // dept deleted
    if (!deptCargos.has(entry.tituloCargo)) continue; // cargo deleted from dept
    kept.push({ departamento: resolvedDept, tituloCargo: entry.tituloCargo });
    seenDepts.add(resolvedDept);
  }

  // Add new cargos to depts already present in this snapshot
  const keptByDept = new Map<string, Set<string>>();
  for (const e of kept) {
    if (!keptByDept.has(e.departamento)) keptByDept.set(e.departamento, new Set());
    keptByDept.get(e.departamento)!.add(e.tituloCargo);
  }
  for (const newDept of newMaster) {
    const existing = keptByDept.get(newDept.departamento);
    if (!existing) continue; // dept not in this snapshot — don't auto-add
    for (const cargo of newDept.cargos) {
      if (!existing.has(cargo)) {
        kept.push({ departamento: newDept.departamento, tituloCargo: cargo });
      }
    }
  }

  return kept;
}

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
      // Read old master + all snapshot-cargos rows before saving
      const [oldMasterRow, snapshotRows] = await Promise.all([
        prisma.globalConfig.findUnique({ where: { key: CARGOS_KEY } }),
        prisma.globalConfig.findMany({ where: { key: { startsWith: "snapshot-cargos-" } } }),
      ]);

      const oldMaster: CargoEntry[] = (() => {
        try { return oldMasterRow?.value ? (JSON.parse(oldMasterRow.value) as CargoEntry[]) : []; }
        catch { return []; }
      })();

      // Propagate changes to every snapshot-cargos row
      const snapshotUpdates = snapshotRows.map((row) => {
        const current: SnapshotCargoEntry[] = (() => {
          try { return JSON.parse(row.value) as SnapshotCargoEntry[]; }
          catch { return []; }
        })();
        const updated = propagateMasterToSnapshot(oldMaster, body.cargos!, current);
        return prisma.globalConfig.update({
          where: { key: row.key },
          data: { value: JSON.stringify(updated) },
        });
      });

      operations.push(
        prisma.globalConfig.upsert({
          where: { key: CARGOS_KEY },
          create: { key: CARGOS_KEY, value: JSON.stringify(body.cargos) },
          update: { value: JSON.stringify(body.cargos) },
        }),
        ...snapshotUpdates
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
