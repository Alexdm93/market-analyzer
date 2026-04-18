import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

const USER_DELETED_ERROR = "UserDeleted";
const DEFAULT_USER_ROLE = "USER";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
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
      async authorize(credentials) {
        const companyId = credentials?.companyId?.trim();
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";

        if (!companyId || !email || !password) {
          return null;
        }

        const user = await prisma.user.findFirst({
          where: {
            companyId,
            email,
          },
        });

        if (!user) {
          return null;
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = typeof user.role === "string" ? user.role : DEFAULT_USER_ROLE;
      }

      if (typeof token.id === "string") {
        const existingUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { id: true, name: true, email: true, role: true },
        });

        if (!existingUser) {
          token.id = undefined;
          token.name = undefined;
          token.email = undefined;
          token.role = undefined;
          token.error = USER_DELETED_ERROR;
          return token;
        }

        token.name = existingUser.name;
        token.email = existingUser.email;
        token.role = existingUser.role;
        token.error = undefined;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : undefined;
        session.user.name = typeof token.name === "string" ? token.name : session.user.name;
        session.user.email = typeof token.email === "string" ? token.email : session.user.email;
        session.user.role = typeof token.role === "string" ? token.role : DEFAULT_USER_ROLE;
      }

      session.error = typeof token.error === "string" ? token.error : undefined;

      return session;
    },
  },
};