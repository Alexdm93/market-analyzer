/**
 * Descarga de un informe de beneficios no salariales.
 *
 * La empresa solo puede pedir uno de los que el admin le autorizó, que pueden
 * ser varios. El admin puede pedir cualquiera, para revisarlo antes de
 * repartirlo.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

function autorizadosDe(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

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
      select: { beneficiosInformeIds: true },
    });
    const autorizados = autorizadosDe(empresa?.beneficiosInformeIds ?? "[]");
    if (autorizados.length === 0) {
      return Response.json({ message: "Tu empresa no tiene informes de beneficios autorizados." }, { status: 403 });
    }
    // Sin pedir nada se baja el primero; pedir uno que no le toca, no.
    if (!idPedido) {
      informeId = autorizados[0];
    } else if (!autorizados.includes(idPedido)) {
      return Response.json({ message: "Ese informe de beneficios no está autorizado para tu empresa." }, { status: 403 });
    }
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
