import type { ReactNode } from "react";

import { EstudioEmpresaProvider } from "@/contexts/EstudioEmpresaContext";

/**
 * Mantiene viva la empresa seleccionada mientras se recorre el flujo del
 * Estudio Especializado, que son tres rutas distintas pero un solo proceso.
 */
export default function EstudioLayout({ children }: { children: ReactNode }) {
  return <EstudioEmpresaProvider>{children}</EstudioEmpresaProvider>;
}
