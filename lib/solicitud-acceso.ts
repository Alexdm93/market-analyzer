/**
 * Por dónde llegó quien pide acceso.
 *
 * La lista la fijó AC Consulting (2026-10-22) y se valida en el servidor: el
 * formulario es público, así que lo que llegue en ese campo y no esté acá se
 * descarta en vez de guardarse. Cambiarla no rompe nada ya guardado —es texto,
 * no un enum de la base— pero conviene no renombrar las opciones viejas si se
 * quiere seguir contando por canal.
 */
export const CANALES_ACCESO = [
  "Redes sociales",
  "Grupos de WhatsApp o Telegram",
  "Referido",
  "Correo electrónico",
  "Eventos",
  "Otros",
] as const;

export type CanalAcceso = (typeof CANALES_ACCESO)[number];

export function esCanalConocido(valor: string): valor is CanalAcceso {
  return (CANALES_ACCESO as readonly string[]).includes(valor);
}
