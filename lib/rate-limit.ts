/**
 * Límite de intentos por IP, persistido en la base.
 *
 * Antes vivía en un Map en memoria, o sea por instancia de Vercel: cada arranque
 * en frío o despliegue lo reiniciaba, y con varias instancias el atacante tenía
 * un cupo por cada una. Contra fuerza bruta servía poco.
 *
 * Se guarda en `GlobalConfig`, que ya existe, con el prefijo `ratelimit:`.
 */
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 10;
const PREFIJO = "ratelimit:";

type Entrada = { count: number; resetAt: number };

function clave(id: string) {
  return `${PREFIJO}${id}`;
}

function parse(valor: string): Entrada | null {
  try {
    const p = JSON.parse(valor) as Entrada;
    return typeof p?.count === "number" && typeof p?.resetAt === "number" ? p : null;
  } catch {
    return null;
  }
}

/**
 * Borra de vez en cuando las entradas vencidas para que la tabla no crezca sin
 * control. Se hace al azar y no en cada llamada porque no hace falta que sea
 * inmediato y no vale la pena pagar un DELETE en cada intento de login.
 */
async function podarDeVezEnCuando() {
  if (Math.random() > 0.05) return;
  try {
    await prisma.globalConfig.deleteMany({
      where: { key: { startsWith: PREFIJO }, updatedAt: { lt: new Date(Date.now() - WINDOW_MS) } },
    });
  } catch { /* la poda es best-effort */ }
}

export async function checkRateLimit(id: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = clave(id);
  const ahora = Date.now();

  try {
    const fila = await prisma.globalConfig.findUnique({ where: { key }, select: { value: true } });
    const entrada = fila?.value ? parse(fila.value) : null;

    if (!entrada || ahora > entrada.resetAt) {
      const nueva: Entrada = { count: 1, resetAt: ahora + WINDOW_MS };
      await prisma.globalConfig.upsert({
        where: { key },
        update: { value: JSON.stringify(nueva) },
        create: { key, value: JSON.stringify(nueva) },
      });
      void podarDeVezEnCuando();
      return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
    }

    if (entrada.count >= MAX_ATTEMPTS) {
      return { allowed: false, remaining: 0 };
    }

    const siguiente: Entrada = { count: entrada.count + 1, resetAt: entrada.resetAt };
    await prisma.globalConfig.update({ where: { key }, data: { value: JSON.stringify(siguiente) } });
    return { allowed: true, remaining: MAX_ATTEMPTS - siguiente.count };
  } catch {
    // Si la base falla, se deja pasar: dejar a todo el mundo fuera del login
    // por un problema del limitador sería peor que no limitar un rato.
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }
}

export async function resetRateLimit(id: string) {
  try {
    await prisma.globalConfig.deleteMany({ where: { key: clave(id) } });
  } catch { /* no es crítico */ }
}
