import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id?: string;
      role?: string;
      companyId?: string;
      companyName?: string;
      estudioEnabled?: boolean;
      generalEnabled?: boolean;
    };
    error?: string;
  }

  interface User {
    id: string;
    role?: string;
    companyId?: string;
    companyName?: string;
    estudioEnabled?: boolean;
    generalEnabled?: boolean;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    companyId?: string;
    companyName?: string;
    estudioEnabled?: boolean;
    generalEnabled?: boolean;
    sessionVersion?: number;
    error?: string;
  }
}