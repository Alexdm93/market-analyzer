import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Sidebar from "../components/Sidebar";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Salary Intelligence",
  description: "Plataforma para captura y análisis de mercado salarial",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${manrope.variable} ${spaceGrotesk.variable}`}>
      <body className="flex min-h-screen items-start">
        <Providers>
          <Sidebar />
          <main className="app-main min-h-screen min-w-0 flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}