/**
 * El formulario público de "Solicitar acceso".
 *
 * Es la única ruta del sistema que escribe en la base SIN sesión, así que se
 * trata con la desconfianza que eso merece: tope por IP, longitudes acotadas y
 * nada más que texto. No crea ni usuarios ni empresas —solo deja constancia de
 * que alguien pidió entrar— y el admin decide después desde su bandeja
 * (AC Consulting, 2026-10-21).
 *
 * La respuesta es siempre la misma aunque el correo ya tenga cuenta: decirle a
 * un desconocido "ese correo ya existe" es regalarle el padrón de clientes.
 */
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

/** Lo que puede medir cada campo. Lo que pase se recorta, no se rechaza. */
const LARGO = {
  nombre: 120, correo: 160, cargo: 120, telefono: 40,
  empresa: 160, sector: 120, clasificacion: 120, headcount: 40,
  localidad: 120, mensaje: 1000,
} as const;

type Cuerpo = Partial<Record<keyof typeof LARGO, string>>;

/** Un correo con forma de correo. No se verifica que exista. */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texto(valor: string | undefined, maximo: number): string {
  return (valor ?? "").replace(/\s+/g, " ").trim().slice(0, maximo);
}

export async function POST(request: Request) {
  // El último de la cadena es el que puso el proxy de Vercel; los anteriores
  // los puede escribir el cliente.
  const ip = request.headers.get("x-forwarded-for")
    ?.split(",").map((p) => p.trim()).filter(Boolean).pop() ?? "unknown";

  const { allowed } = await checkRateLimit(`acceso:${ip}`);
  if (!allowed) {
    return Response.json(
      { message: "Recibimos varias solicitudes desde esta conexión. Intenta de nuevo en unos minutos." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  if (!body) return Response.json({ message: "Petición vacía." }, { status: 400 });

  const nombre = texto(body.nombre, LARGO.nombre);
  const correo = texto(body.correo, LARGO.correo).toLowerCase();
  const empresa = texto(body.empresa, LARGO.empresa);

  if (nombre.length < 3) {
    return Response.json({ message: "Escribe tu nombre y apellido." }, { status: 400 });
  }
  if (!CORREO.test(correo)) {
    return Response.json({ message: "Ese correo no parece válido." }, { status: 400 });
  }
  if (empresa.length < 2) {
    return Response.json({ message: "Escribe el nombre de tu empresa." }, { status: 400 });
  }

  // Dos envíos iguales seguidos son el mismo pedido, no dos: suele ser un
  // doble clic o alguien que vuelve a mandar porque no vio el aviso.
  const repetida = await prisma.solicitudAcceso.findFirst({
    where: { correo, status: "PENDING" },
    select: { id: true },
  });

  if (!repetida) {
    await prisma.solicitudAcceso.create({
      data: {
        nombre, correo, empresa,
        cargo: texto(body.cargo, LARGO.cargo),
        telefono: texto(body.telefono, LARGO.telefono),
        sector: texto(body.sector, LARGO.sector),
        clasificacion: texto(body.clasificacion, LARGO.clasificacion),
        headcount: texto(body.headcount, LARGO.headcount),
        localidad: texto(body.localidad, LARGO.localidad),
        mensaje: texto(body.mensaje, LARGO.mensaje),
      },
    });
  }

  return Response.json({
    message: "Recibimos tu solicitud. El equipo de AC Consulting te contactará por correo.",
  }, { status: 201 });
}
