/**
 * Descarga del informe de beneficios no salariales.
 *
 * La empresa no elige cuál: baja el que el admin le autorizó. El admin puede
 * pedir cualquiera por `id`, para revisarlo antes de repartirlo.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) return Response.json({ message: "No autorizado." }, { status: 401 });

  const esAdmin = session.user.role === "ADMIN";
  const idPedido = new URL(request.url).searchParams.get("id")?.trim() ?? "";

  let informeId = idPedido;

  if (!esAdmin) {
    const companyId = session.user.companyId ?? "";
    if (!companyId) return Response.json({ message: "Tu usuario no tiene empresa asignada." }, { status: 400 });

    const empresa = await prisma.company.findUnique({
      where: { id: companyId },
      select: { beneficiosInformeId: true },
    });
    if (!empresa?.beneficiosInformeId) {
      return Response.json({ message: "Tu empresa no tiene un informe de beneficios autorizado." }, { status: 403 });
    }
    // Lo que pida el cliente no cuenta: baja el suyo.
    informeId = empresa.beneficiosInformeId;
  }

  if (!informeId) return Response.json({ message: "Indica el informe." }, { status: 400 });

  const informe = await prisma.informeBeneficios.findUnique({
    where: { id: informeId },
    select: { nombreArchivo: true, archivo: true },
  });
  if (!informe) return Response.json({ message: "Ese informe ya no existe." }, { status: 404 });

  const pdf = Buffer.from(informe.archivo, "base64");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(informe.nombreArchivo || "Informe de beneficios.pdf")}`,
      "Cache-Control": "no-store",
    },
  });
}
