"use client";

/**
 * Lo que el Estudio Especializado arrastra de un paso al siguiente: la empresa
 * sobre la que se trabaja y el corte contra el que se compara.
 *
 * Vive en el layout de `/estudio`, que no se desmonta al pasar de "Mis cargos"
 * a "Comparación". Antes cada pantalla tenía su propio estado, así que el
 * mismo corte se preguntaba dos veces y las dos pantallas parecían dos
 * herramientas sueltas en vez de un recorrido.
 *
 * La empresa solo la elige el admin; una empresa normal siempre trabaja sobre
 * la suya.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Estudio = {
  companyId: string;
  setCompanyId: (valor: string) => void;
  snapshotId: string;
  setSnapshotId: (valor: string) => void;
};

const Contexto = createContext<Estudio | null>(null);

export function EstudioProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState("");
  const [snapshotId, setSnapshotId] = useState("");
  const valor = useMemo(
    () => ({ companyId, setCompanyId, snapshotId, setSnapshotId }),
    [companyId, snapshotId],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstudio(): Estudio {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useEstudio necesita estar dentro de EstudioProvider.");
  return valor;
}
