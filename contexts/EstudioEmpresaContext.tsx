"use client";

/**
 * La empresa sobre la que se está trabajando en el Estudio Especializado.
 *
 * Vive en el layout de `/estudio`, que no se desmonta al pasar de "Mis cargos"
 * a "Comparación" o a "Informes". Antes cada pantalla tenía su propio estado y
 * el admin tenía que volver a elegir la empresa en cada paso.
 *
 * Para una empresa normal no hace nada: siempre trabaja sobre la suya.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type EstudioEmpresa = { companyId: string; setCompanyId: (valor: string) => void };

const Contexto = createContext<EstudioEmpresa | null>(null);

export function EstudioEmpresaProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState("");
  const valor = useMemo(() => ({ companyId, setCompanyId }), [companyId]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstudioEmpresa(): EstudioEmpresa {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useEstudioEmpresa necesita estar dentro de EstudioEmpresaProvider.");
  return valor;
}
