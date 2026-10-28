/**
 * Las dos secciones de video: Centro de Ayuda y Academia C&B.
 *
 * Comparten tabla, ruta y componente; lo único que las separa es la categoría
 * y dónde aparecen en el menú. Tenerlas acá evita que cada pantalla invente su
 * propio título o su propia bajada (AC Consulting, 2026-10-27).
 */
export const CATEGORIAS_RECURSO = ["ayuda", "academia"] as const;

export type CategoriaRecurso = (typeof CATEGORIAS_RECURSO)[number];

export const SECCIONES: Record<CategoriaRecurso, {
  titulo: string;
  bajada: string;
  vacio: string;
}> = {
  ayuda: {
    titulo: "Centro de Ayuda",
    bajada: "Tutoriales para sacarle provecho al Market Analyzer: cómo cargar tu data, "
      + "armar un estudio y leer los informes.",
    vacio: "Todavía no hay tutoriales publicados.",
  },
  academia: {
    titulo: "Academia C&B",
    bajada: "Cápsulas de formación en Compensación y Beneficios: conceptos, metodología y "
      + "buenas prácticas del mercado.",
    vacio: "Todavía no hay cápsulas publicadas.",
  },
};

export function esCategoriaRecurso(v: string): v is CategoriaRecurso {
  return (CATEGORIAS_RECURSO as readonly string[]).includes(v);
}

export type RecursoFila = {
  id: string;
  categoria: CategoriaRecurso;
  titulo: string;
  descripcion: string;
  videoUrl: string;
  publicado: boolean;
  orden: number;
};

/**
 * El id de un video de YouTube, venga como watch, como youtu.be o como embed.
 *
 * Es la misma lectura que ya hacía la pantalla de Inicio con los anuncios; se
 * trae acá para no tener dos copias que se desincronicen.
 */
export function idDeYouTube(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}
