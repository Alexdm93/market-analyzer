import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  // Endpoint público (sin sesión) que revela si un correo existe y a qué empresa
  // pertenece — limitar por IP para evitar scraping masivo del mapeo correo→empresa.
  const xForwardedFor = request.headers.get("x-forwarded-for") ?? undefined;
  const ip =
    request.headers.get("x-real-ip") ??
    xForwardedFor?.split(",").map((part) => part.trim()).filter(Boolean).pop() ??
    "unknown";

  // Prefijo distinto al que usa el login — esta búsqueda se dispara automáticamente
  // (autofill, onBlur) y no debe consumir el mismo cupo que los intentos de login real.
  const { allowed } = checkRateLimit(`lookup:${ip}`);
  if (!allowed) {
    return Response.json({ message: "Demasiadas solicitudes. Intenta de nuevo en unos minutos." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";

  if (!email) return Response.json({ companies: [] });

  const users = await prisma.user.findMany({
    where: { email },
    select: {
      company: { select: { id: true, name: true } },
    },
  });

  const seen = new Set<string>();
  const companies = users
    .map((u) => u.company)
    .filter((c): c is { id: string; name: string } => c !== null)
    .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

  return Response.json({ companies });
}
