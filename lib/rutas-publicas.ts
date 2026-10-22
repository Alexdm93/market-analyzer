/**
 * Las pantallas que se pueden ver sin haber iniciado sesión.
 *
 * Existe porque esto estaba escrito tres veces y en tres sitios distintos: el
 * middleware, el guardia de sesión del cliente y el menú lateral. Agregar la
 * pantalla de "Solicitar acceso" a una sola de las tres la dejó inservible —el
 * formulario se pintaba y al instante el guardia mandaba a quien no tiene
 * cuenta a la pantalla de ingreso, que es justo lo que esa pantalla no puede
 * hacer (AC Consulting, 2026-10-22).
 *
 * Quien agregue una pantalla pública la pone acá y ya.
 */
export const RUTAS_PUBLICAS = [
  "/",
  "/signin",
  "/register",
  "/market-analyzer/signin",
  "/market-analyzer/register",
  "/market-analyzer/solicitar-acceso",
] as const;

/** Si esa ruta, o algo que cuelgue de ella, es pública. */
export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((ruta) =>
    pathname === ruta || (ruta !== "/" && pathname.startsWith(`${ruta}/`)));
}
