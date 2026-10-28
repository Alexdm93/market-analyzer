/**
 * El bucket privado de Supabase Storage donde viven los documentos.
 *
 * Se habla con la API REST de Storage y no con `@supabase/supabase-js` a
 * propósito: son tres llamadas —firmar una subida, firmar una descarga,
 * borrar— y no justifican sumar una dependencia a un proyecto donde instalar
 * ya ha dado problemas con el store de pnpm (AC Consulting, 2026-10-27).
 *
 * La clave de servicio se salta todas las reglas de la base, así que este
 * módulo solo puede importarse desde el servidor. Nunca devuelve una URL
 * permanente: todo lo que sale de acá vence.
 */
const BUCKET = "biblioteca";

/** Cuánto vive un enlace de descarga. Lo justo para que el navegador lo siga. */
const SEGUNDOS_DESCARGA = 60;

function configuracion(): { url: string; clave: string } | null {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const clave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !clave) return null;
  return { url, clave };
}

/** Si el almacén está configurado. Las pantallas lo dicen en vez de fallar. */
export function almacenListo(): boolean {
  return configuracion() !== null;
}

/**
 * `conCuerpo` decide si va el `Content-Type`.
 *
 * No es un detalle: Supabase rechaza con un 400 cualquier petición que se
 * declare JSON y llegue sin cuerpo —"Body cannot be empty"—, que es lo que
 * pasaba al borrar (AC Consulting, 2026-10-27).
 */
function cabeceras(clave: string, conCuerpo: boolean): HeadersInit {
  const base: Record<string, string> = { Authorization: `Bearer ${clave}`, apikey: clave };
  if (conCuerpo) base["Content-Type"] = "application/json";
  return base;
}

/**
 * Una ruta única e imposible de adivinar.
 *
 * Lleva el nombre original al final solo para que el admin se oriente cuando
 * mire el bucket; lo que la hace única es el prefijo aleatorio. Aunque alguien
 * supiera el nombre del archivo, sin el token firmado no lo baja.
 */
export function rutaNueva(nombreArchivo: string): string {
  const limpio = nombreArchivo
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "documento";
  return `${crypto.randomUUID()}/${limpio}`;
}

/**
 * Un permiso de subida de un solo uso, para que el navegador le mande el
 * archivo directo a Supabase.
 *
 * No pasa por nuestro servidor porque en Vercel el cuerpo de una petición no
 * puede pasar de unos 4,5 MB, y un informe en PDF los supera sin esfuerzo.
 */
export async function firmarSubida(ruta: string): Promise<{ url: string } | { error: string }> {
  const cfg = configuracion();
  if (!cfg) return { error: "El almacén de archivos no está configurado." };

  const res = await fetch(`${cfg.url}/storage/v1/object/upload/sign/${BUCKET}/${ruta}`, {
    method: "POST",
    headers: cabeceras(cfg.clave, true),
    body: "{}",
  });

  if (!res.ok) return { error: `Supabase rechazó la subida (${res.status}).` };
  const d = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!d?.url) return { error: "Supabase no devolvió el enlace de subida." };
  // Viene relativo a /storage/v1.
  return { url: `${cfg.url}/storage/v1${d.url}` };
}

/** Un enlace de descarga que vence en un minuto. */
export async function firmarDescarga(ruta: string, nombre: string): Promise<{ url: string } | { error: string }> {
  const cfg = configuracion();
  if (!cfg) return { error: "El almacén de archivos no está configurado." };

  const res = await fetch(`${cfg.url}/storage/v1/object/sign/${BUCKET}/${ruta}`, {
    method: "POST",
    headers: cabeceras(cfg.clave, true),
    body: JSON.stringify({ expiresIn: SEGUNDOS_DESCARGA }),
  });

  if (!res.ok) return { error: `No se pudo preparar la descarga (${res.status}).` };
  const d = (await res.json().catch(() => null)) as { signedURL?: string } | null;
  if (!d?.signedURL) return { error: "Supabase no devolvió el enlace de descarga." };

  // `download` hace que el navegador lo guarde con su nombre real en vez de
  // abrirlo con el nombre aleatorio de la ruta.
  const sep = d.signedURL.includes("?") ? "&" : "?";
  return { url: `${cfg.url}/storage/v1${d.signedURL}${sep}download=${encodeURIComponent(nombre)}` };
}

/** Borra el objeto. Si falla, el llamador decide: no romper por un huérfano. */
export async function borrarArchivo(ruta: string): Promise<boolean> {
  const cfg = configuracion();
  if (!cfg) return false;
  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: cabeceras(cfg.clave, true),
    body: JSON.stringify({ prefixes: [ruta] }),
  });
  return res.ok;
}
