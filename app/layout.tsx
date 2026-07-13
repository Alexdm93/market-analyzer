import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Sidebar from "../components/Sidebar";
import ClientFooter from "../components/ClientFooter";
import NavigationProgress from "@/components/NavigationProgress";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Market Analyzer",
  description: "Plataforma para captura y análisis de mercado salarial",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${manrope.variable} ${spaceGrotesk.variable}`}>
      <body className="flex min-h-screen flex-col items-stretch md:flex-row md:items-start">
        <Providers>
          <NavigationProgress>
            <Sidebar />
            <div className="app-main min-h-screen min-w-0 flex-1 w-full flex flex-col">
              <div className="flex-1">{children}</div>
              <ClientFooter />
            </div>
          </NavigationProgress>
        </Providers>
      </body>
    </html>
  );
}