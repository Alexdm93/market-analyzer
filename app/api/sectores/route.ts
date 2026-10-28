/**
 * El catálogo de sectores y clasificaciones, sin sesión.
 *
 * Lo consume el formulario público de "Solicitar acceso". Es una taxonomía, no
 * data de nadie: no dice qué empresas hay ni cuántas, solo con qué etiquetas
 * trabaja la plataforma. Así quien pide acceso elige de la misma lista que el
 * admin mantiene, y no de una copia congelada en el código
 * (AC Consulting, 2026-10-27).
 */
import { leerSectores } from "@/lib/sectores";

export async function GET() {
  return Response.json({ sectores: await leerSectores() });
}
