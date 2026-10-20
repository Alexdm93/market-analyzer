/**
 * Alta masiva de ocupantes desde la planilla del Estudio de Competitividad.
 *
 * El archivo lo lee el navegador —ahí ya está la librería de Excel— y acá
 * llegan las filas ya interpretadas. El servidor vuelve a validarlas de todos
 * modos: lo que manda el navegador nunca es la última palabra. En particular,
 * el grado CAPRI se recalcula acá a partir de la ruta y las variables, porque
 * en la planilla ese número es una fórmula y una fórmula se puede pisar.
 *
 * Si viene el corte, las homologaciones que traiga la planilla se guardan en
 * el mismo viaje: la columna existe en el archivo y hacer que el cliente las
 * repita a mano en pantalla no tendría sentido.
 *
 * Importar desde un corte es la otra forma de llenar la lista y vive en
 * `../corte`, no acá.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { gradoDesdeLaPlanilla } from "@/lib/capri-evaluacion";
import {
  asegurarCorte,
  catalogoDelCorte,
  normalizarTitulo,
  resolverAcceso,
  validarCargo,
  type EntradaCargo,
} from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";
import { safeParseCompanyInfo } from "@/lib/workspace";

export const maxDuration = 60;

/** Tope por archivo. Más que esto no es una carga, es una migración. */
const MAX_FILAS = 1000;

type FilaDeLaPlanilla = EntradaCargo & {
  /** El cargo del catálogo del corte con el que equivale, si lo trajo. */
  homologado?: string;
  ruta?: string;
  variables?: string[];
};

type Cuerpo = {
  companyId?: string;
  snapshotId?: string;
  filas?: FilaDeLaPlanilla[];
  /** Las tasas como quedaron en la hoja de configuración del archivo. */
  tasas?: Array<{ nombre: string; valor: string }>;
  /** Cuando es true, la lista actual se borra antes de cargar la nueva. */
  reemplazar?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const acceso = resolverAcceso(await getServerSession(authOptions).catch(() => null), body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const entrada = Array.isArray(body?.filas) ? body.filas : [];
  if (entrada.length === 0) return Response.json({ message: "El archivo no trae ninguna fila." }, { status: 400 });
  if (entrada.length > MAX_FILAS) {
    return Response.json({ message: `El archivo trae ${entrada.length} filas y el tope son ${MAX_FILAS}.` }, { status: 400 });
  }

  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (snapshotId) {
    const vedado = await asegurarCorte(acceso, snapshotId);
    if (vedado) return vedado;
  }

  const [empresa, workspace, catalogo] = await Promise.all([
    prisma.company.findUnique({ where: { id: acceso.companyId }, select: { revenueUSD: true } }),
    prisma.userWorkspace.findFirst({
      where: { user: { companyId: acceso.companyId } },
      select: { companyInfoJson: true },
    }),
    snapshotId ? catalogoDelCorte(snapshotId) : Promise.resolve([]),
  ]);

  const revenueUSD = (empresa?.revenueUSD || safeParseCompanyInfo(workspace?.companyInfoJson ?? null).revenueUSD || "").trim();
  const delCatalogo = new Map(catalogo.map((c) => [normalizarTitulo(c.tituloCargo), c]));

  const rechazadas: Array<{ fila: number; motivo: string }> = [];
  const aCrear: Array<{
    ocupanteId: string | null; departamento: string; tituloCargo: string; descripcion: string;
    reportaA: string; hayGrade: number | null; capriFamily: string | null; dataJson: string;
  }> = [];
  /** Las equivalencias que trajo el archivo, una por cargo. */
  const equivalencias = new Map<string, { tituloCatalogo: string; departamento: string }>();

  // Los identificadores ya usados: los del archivo y, si no se reemplaza, los
  // que la empresa ya tenía.
  const usados = new Set<string>();
  if (!body?.reemplazar) {
    const previos = await prisma.estudioCargo.findMany({
      where: { companyId: acceso.companyId, ocupanteId: { not: null } },
      select: { ocupanteId: true },
    });
    for (const p of previos) if (p.ocupanteId) usados.add(p.ocupanteId.toLowerCase());
  }

  entrada.forEach((cruda, i) => {
    const validacion = validarCargo(cruda);
    if (!validacion.ok) {
      rechazadas.push({ fila: i + 1, motivo: validacion.mensaje });
      return;
    }

    const { ocupanteId } = validacion.valor;
    if (ocupanteId) {
      if (usados.has(ocupanteId.toLowerCase())) {
        rechazadas.push({ fila: i + 1, motivo: `El identificador "${ocupanteId}" ya está en uso.` });
        return;
      }
      usados.add(ocupanteId.toLowerCase());
    }

    // El grado del archivo no se usa: vale el que sale de las respuestas.
    const capri = gradoDesdeLaPlanilla(cruda.ruta ?? "", cruda.variables ?? [], revenueUSD);
    const hayGrade = capri ? capri.grado : validacion.valor.hayGrade;
    const capriFamily = capri ? capri.familia : validacion.valor.capriFamily;

    const data = { ...validacion.valor.data };
    if (hayGrade !== null && capri) { data.hayGrade = hayGrade; data.capriFamily = capri.familia; }
    else if (hayGrade === null) { delete data.hayGrade; delete data.capriFamily; }

    const homologado = (cruda.homologado ?? "").replace(/\s+/g, " ").trim();
    if (snapshotId && homologado) {
      const encontrado = delCatalogo.get(normalizarTitulo(homologado));
      if (encontrado) {
        equivalencias.set(normalizarTitulo(validacion.valor.tituloCargo), {
          tituloCatalogo: encontrado.tituloCargo,
          departamento: encontrado.departamento,
        });
      }
    }

    aCrear.push({
      ocupanteId: ocupanteId || null,
      departamento: validacion.valor.departamento,
      tituloCargo: validacion.valor.tituloCargo,
      descripcion: validacion.valor.descripcion,
      reportaA: validacion.valor.reportaA,
      hayGrade,
      capriFamily,
      dataJson: JSON.stringify(data),
    });
  });

  if (aCrear.length === 0) {
    return Response.json(
      { message: "Ninguna fila del archivo se pudo cargar.", creados: 0, rechazadas },
      { status: 400 },
    );
  }

  // Reemplazar, cargar y homologar van juntos: si la carga falla a mitad de
  // camino, la empresa no puede quedarse sin su lista anterior.
  await prisma.$transaction(async (tx) => {
    if (body?.reemplazar) {
      await tx.estudioCargo.deleteMany({ where: { companyId: acceso.companyId } });
    }
    await tx.estudioCargo.createMany({
      data: aCrear.map((c) => ({ ...c, companyId: acceso.companyId, origen: "importado" })),
    });
    for (const [tituloCargoKey, eq] of equivalencias) {
      await tx.estudioEquivalencia.upsert({
        where: { companyId_tituloCargoKey_snapshotId: { companyId: acceso.companyId, tituloCargoKey, snapshotId } },
        create: { companyId: acceso.companyId, tituloCargoKey, snapshotId, ...eq },
        update: { ...eq },
      });
    }
  });

  // Si la empresa corrigió el valor de una de sus tasas en la planilla, el
  // cambio vuelve a su ficha: de otro modo el informe se calcularía con una
  // tasa y la pantalla mostraría otra (AC Consulting, 2026-10-20).
  const actualizadas = await actualizarTasas(acceso.companyId, body?.tasas ?? []);

  const conGrado = aCrear.filter((c) => c.hayGrade !== null).length;

  return Response.json({
    creados: aCrear.length,
    homologados: equivalencias.size,
    rechazadas,
    tasasActualizadas: actualizadas,
    message: `Se cargaron ${aCrear.length} ${aCrear.length === 1 ? "ocupante" : "ocupantes"}`
      + (conGrado > 0 ? `, ${conGrado} con grado CAPRI calculado` : "")
      + (equivalencias.size > 0 ? ` y ${equivalencias.size} ${equivalencias.size === 1 ? "cargo homologado" : "cargos homologados"}` : "")
      + "."
      + (actualizadas > 0 ? ` Se actualizó el valor de ${actualizadas} ${actualizadas === 1 ? "tasa" : "tasas"}.` : "")
      + (rechazadas.length > 0 ? ` ${rechazadas.length} ${rechazadas.length === 1 ? "fila quedó" : "filas quedaron"} fuera.` : ""),
  });
}

/**
 * Lleva a la ficha de la empresa los valores de tasa que venían en el archivo.
 *
 * Solo toca las tasas PROPIAS: las del BCV las mantiene el sistema y lo que
 * alguien escriba sobre ellas en el Excel no debe pisarlas. Devuelve cuántas
 * cambiaron.
 */
async function actualizarTasas(
  companyId: string,
  delArchivo: Array<{ nombre: string; valor: string }>,
): Promise<number> {
  if (delArchivo.length === 0) return 0;

  const workspace = await prisma.userWorkspace.findFirst({
    where: { user: { companyId } },
    select: { userId: true, companyInfoJson: true },
  });
  if (!workspace) return 0;

  const info = safeParseCompanyInfo(workspace.companyInfoJson);
  const porNombre = new Map(
    delArchivo
      .filter((t) => t.nombre.trim() && t.valor.trim())
      .map((t) => [normalizarTitulo(t.nombre), t.valor.trim()]),
  );

  let cambiadas = 0;
  const tasas = (info.tasas ?? []).map((t) => {
    if (t.isSystem) return t;
    const nuevo = porNombre.get(normalizarTitulo(t.nombre ?? ""));
    if (!nuevo || nuevo === t.valor) return t;
    cambiadas += 1;
    return { ...t, valor: nuevo, updatedAt: new Date().toISOString() };
  });

  if (cambiadas === 0) return 0;

  await prisma.userWorkspace.update({
    where: { userId: workspace.userId },
    data: { companyInfoJson: JSON.stringify({ ...info, tasas }) },
  });
  return cambiadas;
}
