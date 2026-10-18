/**
 * Normalización de títulos, compartida.
 *
 * Vive sola y sin dependencias porque la necesitan tanto el servidor como el
 * navegador: `lib/estudio-cargos` la reexporta para quien ya la importaba de
 * ahí, pero ese módulo habla con Prisma y no puede entrar al bundle del
 * cliente (2026-10-17).
 */
export function normalizarTitulo(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
