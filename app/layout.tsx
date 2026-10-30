import type { Metadata, Viewport } from "next";
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
  title: "AC Consulting",
  description: "Asesoría y consultoría en Gestión Humana — Market Analyzer",
  icons: {
    icon: [
      { url: "/ac-favicon.svg", type: "image/svg+xml" },
    ],
    // iOS no lee el manifiesto para el ícono de la pantalla de inicio: usa este.
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  // Al instalarla en iPhone abre sin la barra de Safari.
  appleWebApp: {
    capable: true,
    title: "Market Analyzer",
    statusBarStyle: "default",
  },
};

/**
 * Color con el que Chrome en Android tiñe la barra superior. Es el mismo azul
 * del sidebar, para que la app instalada no muestre una franja blanca encima.
 */
export const viewport: Viewport = {
  themeColor: "#1B4965",
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