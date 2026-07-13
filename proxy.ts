import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { ADMIN_ROLE, canAccessEmpresas } from "./lib/roles";

const BASE = "/market-analyzer";

const authPages = new Set([`${BASE}/signin`, `${BASE}/register`]);
const protectedPages = new Set([
  `${BASE}/inicio`, `${BASE}/dashboard`, `${BASE}/data`, `${BASE}/estudio`,
  `${BASE}/estudios`, `${BASE}/informacion`, `${BASE}/empresas`, `${BASE}/resultados`,
  `${BASE}/valoracion`, `${BASE}/admin`, `${BASE}/admin/anuncios`,
  `${BASE}/admin/estudio-especializado`, `${BASE}/admin/telemetry`,
]);
const adminPages = new Set([
  `${BASE}/admin`, `${BASE}/admin/anuncios`,
  `${BASE}/admin/estudio-especializado`, `${BASE}/admin/telemetry`,
  `${BASE}/register`,
]);
const empresasPages = new Set([`${BASE}/empresas`]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const sessionInvalid = !token || (typeof token.error === "string" && token.error !== "");

  if (sessionInvalid && protectedPages.has(pathname)) {
    const signInUrl = new URL(`${BASE}/signin`, request.url);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }

  if (token && adminPages.has(pathname) && token.role !== ADMIN_ROLE) {
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