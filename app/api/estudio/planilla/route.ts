/**
 * La planilla de carga del Estudio de Competitividad, armada para una empresa
 * y un corte.
 *
 * No es una plantilla en blanco: trae la estructura de compensación de la
 * empresa, sus tasas, el catálogo del corte y los ocupantes que ya tenga
 * cargados. Por eso exige que la ficha de la empresa esté completa — si falta
 * algo, se dice qué falta en vez de entregar un archivo a medias
 * (AC Consulting, 2026-10-17).
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getBcvRate, getBcvEuroRate } from "@/lib/bcv";
import { FREQUENCY_OPTIONS, SYSTEM_FIXED_CONCEPTS, VARIABLE_BONUS_TYPES } from "@/lib/compensation-options";
import { asegurarCorte, catalogoDelCorte, normalizarTitulo, resolverAcceso } from "@/lib/estudio-cargos";
import {
  FILAS_PLANILLA,
  generarPlanilla,
  pagosDelOcupante,
  type ConceptoPlanilla,
  type OcupantePrecargado,
  type TasaPlanilla,
} from "@/lib/planilla-competitividad";
import { prisma } from "@/lib/prisma";
import { safeParseCompanyInfo, type CompensationTemplateConcept } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";

export const maxDuration = 60;

function frecuencia(valor: string | undefined): string {
  return FREQUENCY_OPTIONS.find((f) => f.value === valor)?.label ?? "Mensual";
}

function tipoDeVariable(valor: string | undefined): string {
  return VARIABLE_BONUS_TYPES.find((t) => t.value === valor)?.label ?? "-";
}

/**
 * Los elementos de pago de la empresa, con el sueldo básico y el bono de
 * alimentación por delante: los dos existen siempre, aunque la plantilla
 * guardada venga de antes de que se agregaran.
 */
function conceptosDeLaEmpresa(
  fijos: CompensationTemplateConcept[],
  variables: CompensationTemplateConcept[],
): ConceptoPlanilla[] {
  const vistos = new Set(fijos.map((c) => normalizarTitulo(c.concept ?? "")));
  const completos = [
    ...SYSTEM_FIXED_CONCEPTS.filter((c) => !vistos.has(normalizarTitulo(c.concept))),
    ...fijos,
  ];

  return [
    ...completos.map((c): ConceptoPlanilla => ({
      nombre: (c.concept ?? "").trim(),
      clase: "Fijo",
      tipoVariable: "-",
      frecuencia: frecuencia(c.freq),
      impacto: c.impacto ? "Sí" : "No",
    })),
    ...variables.map((c): ConceptoPlanilla => ({
      nombre: (c.concept ?? "").trim(),
      clase: "Variable",
      tipoVariable: tipoDeVariable(c.variableType),
      frecuencia: frecuencia(c.freq),
      impacto: c.impacto ? "Sí" : "No",
    })),
  ].filter((c) => c.nombre);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await getServerSession(authOptions).catch(() => null);
  const acceso = resolverAcceso(session, searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const snapshotId = searchParams.get("snapshotId")?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte de referencia." }, { status: 400 });

  const vedado = await asegurarCorte(acceso, snapshotId);
  if (vedado) return vedado;

  const [empresa, workspace, catalogo, cargos, equivalencias, corte, bcv, bcvEur] = await Promise.all([
    prisma.company.findUnique({
      where: { id: acceso.companyId },
      select: { name: true, revenueUSD: true, minVacationDays: true, minUtilityDays: true },
    }),
    prisma.userWorkspace.findFirst({
      where: { user: { companyId: acceso.companyId } },
      select: { companyInfoJson: true },
    }),
    catalogoDelCorte(snapshotId),
    prisma.estudioCargo.findMany({
      where: { companyId: acceso.companyId },
      orderBy: [{ departamento: "asc" }, { tituloCargo: "asc" }],
      take: FILAS_PLANILLA,
    }),
    prisma.estudioEquivalencia.findMany({
      where: { companyId: acceso.companyId, snapshotId },
      select: { tituloCargoKey: true, tituloCatalogo: true },
    }),
    prisma.userSnapshot.findFirst({
      where: { snapshotId },
      select: { label: true },
      orderBy: { date: "desc" },
    }),
    getBcvRate(),
    getBcvEuroRate(),
  ]);

  const info = safeParseCompanyInfo(workspace?.companyInfoJson ?? null);
  const plantilla = info.compensationTemplate ?? { fixed: [], variable: [] };
  const conceptos = conceptosDeLaEmpresa(plantilla.fixed ?? [], plantilla.variable ?? []);
  const facturacion = (empresa?.revenueUSD || info.revenueUSD || "").trim();

  const faltan: string[] = [];
  if (!empresa?.name?.trim()) faltan.push("el nombre de la empresa");
  if (!facturacion) faltan.push("la facturación anual");
  if (!(empresa?.minVacationDays || info.minVacationDays)) faltan.push("los días de bono vacacional");
  if (!(empresa?.minUtilityDays || info.minUtilityDays)) faltan.push("los días de utilidades");
  if (conceptos.length === 0) faltan.push("la estructura de compensación");

  if (faltan.length > 0) {
    return Response.json({
      message: `Para armar la planilla falta completar ${faltan.join(", ")} en la sección Empresas. `
        + "La planilla se arma con esos datos, así que sin ellos saldría vacía.",
    }, { status: 400 });
  }

  if (catalogo.length === 0) {
    return Response.json({ message: "Ese corte todavía no tiene cargado su catálogo de cargos." }, { status: 400 });
  }

  const tasas: TasaPlanilla[] = [
    { nombre: "Tasa BCV (Bs./USD)", referencia: "BCV oficial", valor: bcv.rate !== null ? String(bcv.rate) : "" },
    { nombre: "Tasa BCV (Bs./EUR)", referencia: "BCV oficial EUR", valor: bcvEur.rate !== null ? String(bcvEur.rate) : "" },
    ...(info.tasas ?? [])
      .filter((t) => !t.isSystem && t.nombre.trim())
      .map((t) => ({ nombre: t.nombre.trim(), referencia: t.referencia ?? "", valor: t.valor ?? "" })),
  ];

  const nombreDeLaTasa = (id: string | undefined): string =>
    (info.tasas ?? []).find((t) => t.id === id)?.nombre?.trim() ?? "";

  const homologado = new Map(equivalencias.map((e) => [e.tituloCargoKey, e.tituloCatalogo]));

  const ocupantes: OcupantePrecargado[] = cargos.map((c) => {
    let data: Partial<ExtendedMarketPosition> = {};
    try { data = JSON.parse(c.dataJson) as Partial<ExtendedMarketPosition>; } catch { /* fila sin compensación */ }
    return {
      ocupanteId: c.ocupanteId ?? "",
      departamento: c.departamento,
      tituloCargo: c.tituloCargo,
      reportaA: c.reportaA,
      homologado: homologado.get(normalizarTitulo(c.tituloCargo)) ?? "",
      grado: c.hayGrade ?? null,
      pagos: pagosDelOcupante(data, nombreDeLaTasa),
    };
  });

  const etiqueta = corte?.label ?? snapshotId;
  const buffer = await generarPlanilla({
    empresa: empresa!.name,
    corte: etiqueta,
    diasBonoVacacional: empresa?.minVacationDays || info.minVacationDays || "",
    diasUtilidades: empresa?.minUtilityDays || info.minUtilityDays || "",
    facturacion,
    conceptos,
    tasas,
    catalogo: catalogo.map((c) => ({ departamento: c.departamento, tituloCargo: c.tituloCargo })),
    ocupantes,
  });

  const nombre = `Planilla de carga - ${empresa!.name} - ${etiqueta}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
