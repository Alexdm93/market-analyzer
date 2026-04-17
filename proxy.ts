import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const authPages = new Set(["/signin", "/register"]);
const protectedPages = new Set(["/", "/data", "/estudio", "/informacion"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token && protectedPages.has(pathname)) {
    const signInUrl = new URL("/signin", request.url);
    const callbackUrl = `${pathname}${search}`;

    if (callbackUrl !== "/") {
      signInUrl.searchParams.set("callbackUrl", callbackUrl);
    }

    return NextResponse.redirect(signInUrl);
  }

  if (token && authPages.has(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/data", "/estudio", "/informacion", "/signin", "/register"],
};