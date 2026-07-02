import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setLibreRate } from "@/lib/tcr-config";
import { getBcvRate, getBcvEuroRate } from "@/lib/bcv";
import { getLibreRate } from "@/lib/tcr-config";

function forbiddenResponse() {
  return Response.json({ message: "Acceso restringido a administradores." }, { status: 403 });
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false as const, response: Response.json({ message: "No autorizado." }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { ok: false as const, response: forbiddenResponse() };
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const [bcvUsd, bcvEur, libre] = await Promise.all([getBcvRate(), getBcvEuroRate(), getLibreRate()]);
  return Response.json({ bcvUsd, bcvEur, libre });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as { libreRate?: number } | null;
  const rate = Number(body?.libreRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return Response.json({ message: "Indica un valor válido para la tasa libre." }, { status: 400 });
  }

  await setLibreRate(rate);
  return Response.json({ message: `Tasa libre actualizada a ${rate}.`, libreRate: rate, updatedAt: new Date().toISOString() });
}
