import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    // Si el token tiene error (sesión inválida, usuario eliminado, sesión concurrente), redirigir al login
    if (token?.error) {
      const url = req.nextUrl.clone();
      url.pathname = "/signin";
      url.searchParams.set("error", String(token.error));
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized({ token }) {
        return !!token?.id;
      },
    },
    pages: {
      signIn: "/signin",
    },
  },
);

export const config = {
  matcher: [
    "/((?!signin|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
