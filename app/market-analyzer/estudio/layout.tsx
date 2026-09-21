import type { ReactNode } from "react";

import { EstudioProvider } from "@/contexts/EstudioContext";

/**
 * Mantiene viva la empresa y el corte elegidos mientras se recorre el Estudio
 * Especializado, que son rutas distintas pero un solo trabajo.
 */
export default function EstudioLayout({ children }: { children: ReactNode }) {
  return <EstudioProvider>{children}</EstudioProvider>;
}
