import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { ADMIN_ROLE, canAccessEmpresas } from "./lib/roles";

const BASE = "/market-analyzer";

const authPages = new Set([`${BASE}/signin`, `${BASE}/register`]);

/**
 * Todo lo que cuelga de /admin es del administrador, por regla y no por lista.
 *
 * Antes cada pantalla de administración había que acordarse de anotarla en las
 * dos listas de abajo, y varias se quedaron fuera: la de aprobaciones, la de
 * importar, la de reportes, la de respaldos, la de control de calidad y la de
 * informe general. Sus datos nunca estuvieron expuestos —cada ruta de API
 * comprueba el rol por su cuenta— pero el armazón de la pantalla sí cargaba
 * para cualquiera. Con una regla por prefijo, la próxima pantalla que se
 * agregue queda protegida sola (AC Consulting, 2026-10-22).
 */
function esDeAdmin(pathname: string): boolean {
  return pathname === `${BASE}/admin` || pathname.startsWith(`${BASE}/admin/`);
}

/** Las que piden sesión pero no rol de admin. */
const protectedPages = new Set([
  `${BASE}/inicio`, `${BASE}/dashboard`, `${BASE}/data`, `${BASE}/estudio`,
  `${BASE}/estudio/cargos`, `${BASE}/estudio/comparacion`, `${BASE}/estudio/informes`,
  `${BASE}/estudios`, `${BASE}/informacion`, `${BASE}/empresas`, `${BASE}/resultados`,
  `${BASE}/valoracion`, `${BASE}/radar`, `${BASE}/informe-general`,
  `${BASE}/centro-de-ayuda`, `${BASE}/academia`, `${BASE}/biblioteca`,
]);

/**
 * Las de admin que NO cuelgan de /admin. `solicitar-acceso` no está en ninguna
 * lista a propósito: es pública, que para eso existe.
 */
const adminPages = new Set([`${BASE}/register`]);
const empresasPages = new Set([`${BASE}/empresas`]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const sessionInvalid = !token || (typeof token.error === "string" && token.error !== "");

  if (sessionInvalid && (protectedPages.has(pathname) || esDeAdmin(pathname))) {
    const signInUrl = new URL(`${BASE}/signin`, request.url);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }

  if (token && (adminPages.has(pathname) || esDeAdmin(pathname)) && token.role !== ADMIN_ROLE) {
    return NextResponse.redirect(new URL(`${BASE}/inicio`, request.url));
  }

  if (token && empresasPages.has(pathname) && !canAccessEmpresas(typeof token.role === "string" ? token.role : undefined)) {
    return NextResponse.redirect(new URL(`${BASE}/inicio`, request.url));
  }

  if (token && !sessionInvalid && authPages.has(pathname)) {
    return NextResponse.redirect(new URL(`${BASE}/inicio`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/market-analyzer/:path*",
  ],
};