/**
 * Lo que la pantalla del Radar Salarial necesita saber antes de empezar.
 *
 * Devuelve de una sola vez si la empresa lo tiene habilitado, qué le falta en
 * la ficha, de qué corte sale, cuánto cupo le queda en el trimestre y el
 * catálogo de cargos con su descripción.
 *
 * Las descripciones salen de `position-descriptions`, el mapa cargo →
 * descripción que mantiene el admin y que ya alimenta la pantalla de Data. El
 * catálogo del corte solo guarda departamento y título, así que la
 * descripción se busca por el nombre del cargo.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { catalogoDelCorte } from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";
import { corteDelRadar, estadoDelCupo, faltaEnLaFicha, type EstadoCupoRadar } from "@/lib/radar";
import { safeParseCompanyInfo } from "@/lib/workspace";

export type CargoDelRadar = { tituloCargo: string; descripcion: string };
export type UnidadDelRadar = { unidad: string; cargos: CargoDelRadar[] };

export type ContextoRadar = {
  habilitado: boolean;
  /** Qué le falta a la empresa en su ficha para poder bajar un informe. */
  falta: string[];
  corte: { id: string; label: string; date: string } | null;
  cupo: EstadoCupoRadar | null;
  unidades: UnidadDelRadar[];
  /** El tramo de facturación: limita las rutas CAPRI si se valora un cargo. */
  facturacion: string;
  empresa: string;
};

const VACIO: ContextoRadar = {
  habilitado: false, falta: [], corte: null, cupo: null,
  unidades: [], facturacion: "", empresa: "",
};

async function descripciones(): Promise<Record<string, string>> {
  const fila = await prisma.globalConfig.findUnique({
    where: { key: "position-descriptions" },
    select: { value: true },
  });
  try {
    const parsed = JSON.parse(fila?.value ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const esAdmin = session.user.role === "ADMIN";
  const companyId = esAdmin
    ? (new URL(request.url).searchParams.get("companyId")?.trim() || session.user.companyId || "")
    : (session.user.companyId ?? "");

  if (!companyId) return Response.json(VACIO satisfies ContextoRadar);

  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true, radarEnabled: true, economicSector: true, headcount: true,
      revenueUSD: true, hrName: true, hrEmail: true, hrPhone: true,
    },
  });

  // El admin entra siempre, para poder revisar lo que ve el cliente.
  const habilitado = esAdmin || Boolean(empresa?.radarEnabled);
  if (!empresa || !habilitado) {
    return Response.json({ ...VACIO, empresa: empresa?.name ?? "" } satisfies ContextoRadar);
  }

  const snapshotId = await corteDelRadar();
  const [corte, catalogo, textos, cupo, workspace] = await Promise.all([
    snapshotId
      ? prisma.userSnapshot.findFirst({
          where: { snapshotId },
          select: { label: true, date: true },
          orderBy: { date: "desc" },
        })
      : Promise.resolve(null),
    snapshotId ? catalogoDelCorte(snapshotId) : Promise.resolve([]),
    descripciones(),
    estadoDelCupo(companyId),
    prisma.userWorkspace.findFirst({
      where: { user: { companyId } },
      select: { companyInfoJson: true },
    }),
  ]);

  // Agrupado por unidad funcional, que es como lo pide la pantalla: primero la
  // unidad, después el cargo.
  const porUnidad = new Map<string, CargoDelRadar[]>();
  for (const c of catalogo) {
    const unidad = c.departamento || "Sin unidad";
    const lista = porUnidad.get(unidad) ?? [];
    lista.push({ tituloCargo: c.tituloCargo, descripcion: textos[c.tituloCargo] ?? "" });
    porUnidad.set(unidad, lista);
  }

  const info = safeParseCompanyInfo(workspace?.companyInfoJson ?? null);

  return Response.json({
    habilitado: true,
    falta: faltaEnLaFicha(empresa),
    corte: corte && snapshotId
      ? { id: snapshotId, label: corte.label, date: corte.date.toISOString().slice(0, 10) }
      : null,
    cupo,
    unidades: [...porUnidad.entries()]
      .map(([unidad, cargos]) => ({
        unidad,
        cargos: cargos.sort((a, b) => a.tituloCargo.localeCompare(b.tituloCargo, "es")),
      }))
      .sort((a, b) => a.unidad.localeCompare(b.unidad, "es")),
    facturacion: (empresa.revenueUSD || info.revenueUSD || "").trim(),
    empresa: empresa.name,
  } satisfies ContextoRadar);
}
