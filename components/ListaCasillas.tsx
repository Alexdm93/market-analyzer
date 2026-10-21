"use client";

/**
 * Una lista de casillas para elegir varias opciones.
 *
 * La usan el Estudio de Competitividad y el Radar del administrador para
 * recortar el mercado: sectores, clasificaciones, ubicaciones, tamaños y
 * empresas. Son listas cortas pero de largo muy variable —un corte puede traer
 * cuatro sectores y ciento veintiocho empresas—, así que a partir de doce
 * opciones aparece un buscador.
 */
import { useState } from "react";

/** A partir de acá la lista no se puede recorrer con la vista y lleva buscador. */
const LISTA_LARGA = 12;

export function ListaCasillas({
  titulo, vacio, opciones, elegidas, onToggle, onLimpiar, etiquetas,
}: {
  titulo: string;
  vacio: string;
  opciones: string[];
  elegidas: string[];
  onToggle: (valor: string) => void;
  onLimpiar: () => void;
  /** Para listas con valor interno distinto del que se muestra. */
  etiquetas?: Record<string, string>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const conBuscador = opciones.length > LISTA_LARGA;
  const q = busqueda.trim().toLowerCase();
  const visibles = q ? opciones.filter((o) => (etiquetas?.[o] ?? o).toLowerCase().includes(q)) : opciones;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="field-label mb-0">{titulo}</span>
        <span className="text-xs text-slate-500">
          {elegidas.length === 0 ? vacio : `${elegidas.length} ${elegidas.length === 1 ? "elegido" : "elegidos"}`}
        </span>
      </div>
      {elegidas.length > 0 && (
        <button type="button" onClick={onLimpiar} className="btn btn-secondary btn-xs mt-2">
          Quitar selección
        </button>
      )}
      {conBuscador && (
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar en ${opciones.length}…`}
          aria-label={`Buscar en ${titulo}`}
          className="field mt-2 py-1.5 text-sm"
        />
      )}
      <div className="mt-2 max-h-40 overflow-y-auto rounded-2xl border border-slate-200 p-3">
        <div className="grid gap-1.5">
          {visibles.map((o) => (
            <label key={o} className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={elegidas.includes(o)} onChange={() => onToggle(o)} className="mt-1" />
              <span className="truncate" title={etiquetas?.[o] ?? o}>{etiquetas?.[o] ?? o}</span>
            </label>
          ))}
          {opciones.length === 0 && <p className="text-xs text-slate-500">Sin opciones que listar todavía.</p>}
          {opciones.length > 0 && visibles.length === 0 && (
            <p className="text-xs text-slate-500">Nada coincide con «{busqueda}».</p>
          )}
        </div>
      </div>
    </div>
  );
}
