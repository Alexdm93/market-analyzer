import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

const USER_DELETED_ERROR = "UserDeleted";
const DEFAULT_USER_ROLE = "USER";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 horas
  },
  pages: {
    signIn: "/signin",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        companyId: { label: "Empresa", type: "text" },
        email: { label: "Correo", type: "email" },
        password: { label: "Contrasena", type: "password" },
      },
      async authorize(credentials, req) {
        const ip =
          (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
          (req?.headers?.["x-real-ip"] as string | undefined) ??
          "unknown";

        const { allowed } = checkRateLimit(ip);
        if (!allowed) {
          throw new Error("Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.");
        }

        const companyId = credentials?.companyId?.trim();
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";

        if (!companyId || !email || !password) {
          return null;
        }

        const user = await prisma.user.findFirst({
          where: { companyId, email },
          select: { id: true, name: true, email: true, role: true, passwordHash: true },
        });

        if (!user) {
          return null;
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
          return null;
        }

        // Login exitoso — liberar rate limit de este IP e invalidar sesiones anteriores
        resetRateLimit(ip);

        const updated = await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), sessionVersion: { increment: 1 } },
          select: { sessionVersion: true },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: updated.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = typeof user.role === "string" ? user.role : DEFAULT_USER_ROLE;
        token.sessionVersion = typeof user.sessionVersion === "number" ? user.sessionVersion : undefined;
      }

      if (typeof token.id === "string") {
        const existingUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { id: true, name: true, email: true, role: true, companyId: true, sessionVersion: true },
        });

        if (!existingUser) {
          token.id = undefined;
          token.name = undefined;
          token.email = undefined;
          token.role = undefined;
          token.companyId = undefined;
          token.estudioEnabled = undefined;
          token.sessionVersion = undefined;
          token.error = USER_DELETED_ERROR;
          return token;
        }

        // Si sessionVersion del token no coincide con DB, otra sesión inició después — invalidar
        if (token.sessionVersion !== existingUser.sessionVersion) {
          token.id = undefined;
          token.name = undefined;
          token.email = undefined;
          token.role = undefined;
          token.companyId = undefined;
          token.estudioEnabled = undefined;
          token.sessionVersion = undefined;
          token.error = "SessionExpired";
          return token;
        }

        token.name = existingUser.name;
        token.email = existingUser.email;
        token.role = existingUser.role;
        token.companyId = existingUser.companyId;
        token.error = undefined;

        // Fetch estudioEnabled separately — resilient if column not yet migrated
        try {
          const company = await prisma.company.findUnique({
            where: { id: existingUser.companyId },
            select: { estudioEnabled: true },
          });
          token.estudioEnabled = company?.estudioEnabled ?? false;
        } catch {
          token.estudioEnabled = false;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : undefined;
        session.user.name = typeof token.name === "string" ? token.name : session.user.name;
        session.user.email = typeof token.email === "string" ? token.email : session.user.email;
        session.user.role = typeof token.role === "string" ? token.role : DEFAULT_USER_ROLE;
        session.user.companyId = typeof token.companyId === "string" ? token.companyId : undefined;
        session.user.estudioEnabled = typeof token.estudioEnabled === "boolean" ? token.estudioEnabled : false;
      }

      session.error = typeof token.error === "string" ? token.error : undefined;

      return session;
    },
  },
};
