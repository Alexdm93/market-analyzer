/**
 * Lista de cargos propia de la empresa para el Estudio Especializado.
 *
 * La empresa maneja la suya; el admin puede operar en nombre de cualquiera
 * pasando `companyId`, igual que ya hace la pantalla de Data.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  limpiarEquivalenciasHuerfanas,
  listarCargos,
  ocupanteYaExiste,
  resolverAcceso,
  validarCargo,
  type EntradaCargo,
} from "@/lib/estudio-cargos";
import { prisma } from "@/lib/prisma";

async function sesion() {
  return getServerSession(authOptions).catch(() => null);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const acceso = resolverAcceso(await sesion(), searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const [cargos, empresa] = await Promise.all([
    listarCargos(acceso.companyId),
    prisma.company.findUnique({ where: { id: acceso.companyId }, select: { name: true } }),
  ]);

  return Response.json({ cargos, empresa: empresa?.name ?? "", esAdmin: acceso.esAdmin });
}

type CuerpoCrear = EntradaCargo & { companyId?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CuerpoCrear | null;
  const acceso = resolverAcceso(await sesion(), body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const validacion = validarCargo(body ?? {});
  if (!validacion.ok) return Response.json({ message: validacion.mensaje }, { status: 400 });

  if (await ocupanteYaExiste(acceso.companyId, validacion.valor.ocupanteId)) {
    return Response.json(
      { message: `Ya usaste el identificador "${validacion.valor.ocupanteId}" en otro ocupante.` },
      { status: 409 },
    );
  }

  const creado = await prisma.estudioCargo.create({
    data: {
      companyId: acceso.companyId,
      ocupanteId: validacion.valor.ocupanteId || null,
      departamento: validacion.valor.departamento,
      tituloCargo: validacion.valor.tituloCargo,
      descripcion: validacion.valor.descripcion,
      hayGrade: validacion.valor.hayGrade,
      capriFamily: validacion.valor.capriFamily,
      dataJson: JSON.stringify(validacion.valor.data),
      origen: "manual",
    },
    select: { id: true },
  });

  return Response.json({ id: creado.id, message: "Cargo creado." });
}

type CuerpoEditar = CuerpoCrear & { id?: string };

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as CuerpoEditar | null;
  const acceso = resolverAcceso(await sesion(), body?.companyId?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const id = body?.id?.trim() ?? "";
  if (!id) return Response.json({ message: "Indica el cargo a editar." }, { status: 400 });

  // Se comprueba la pertenencia antes de escribir: el id viene del cliente.
  const actual = await prisma.estudioCargo.findUnique({ where: { id }, select: { companyId: true } });
  if (!actual || actual.companyId !== acceso.companyId) {
    return Response.json({ message: "Ese cargo no existe en esta empresa." }, { status: 404 });
  }

  const validacion = validarCargo(body ?? {});
  if (!validacion.ok) return Response.json({ message: validacion.mensaje }, { status: 400 });

  if (await ocupanteYaExiste(acceso.companyId, validacion.valor.ocupanteId, id)) {
    return Response.json(
      { message: `Ya usaste el identificador "${validacion.valor.ocupanteId}" en otro ocupante.` },
      { status: 409 },
    );
  }

  await prisma.estudioCargo.update({
    where: { id },
    data: {
      ocupanteId: validacion.valor.ocupanteId || null,
      departamento: validacion.valor.departamento,
      tituloCargo: validacion.valor.tituloCargo,
      descripcion: validacion.valor.descripcion,
      hayGrade: validacion.valor.hayGrade,
      capriFamily: validacion.valor.capriFamily,
      dataJson: JSON.stringify(validacion.valor.data),
    },
  });

  return Response.json({ message: "Cargo guardado." });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const acceso = resolverAcceso(await sesion(), searchParams.get("companyId")?.trim() ?? "");
  if (!acceso.ok) return acceso.response;

  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ message: "Indica el cargo a borrar." }, { status: 400 });

  const actual = await prisma.estudioCargo.findUnique({
    where: { id },
    select: { companyId: true, tituloCargo: true },
  });
  if (!actual || actual.companyId !== acceso.companyId) {
    return Response.json({ message: "Ese ocupante no existe en esta empresa." }, { status: 404 });
  }

  await prisma.estudioCargo.delete({ where: { id } });

  // La homologación es del cargo, no de la persona: solo se pierde si este era
  // el último ocupante de ese cargo.
  const equivalenciasPerdidas = await limpiarEquivalenciasHuerfanas(acceso.companyId, actual.tituloCargo);

  return Response.json({ message: "Ocupante eliminado.", equivalenciasPerdidas });
}
