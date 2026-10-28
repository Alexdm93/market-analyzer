/**
 * Cómo se le presenta un archivo a quien lo va a descargar.
 *
 * El tipo MIME es largo e ilegible —"application/vnd.openxmlformats-
 * officedocument.spreadsheetml.sheet"— así que la tabla muestra una etiqueta
 * corta y el peso en una unidad que se entienda.
 */
const ETIQUETAS: Array<{ prueba: RegExp; etiqueta: string }> = [
  { prueba: /spreadsheet|excel|ms-excel|csv/i, etiqueta: "Excel" },
  { prueba: /pdf/i, etiqueta: "PDF" },
  { prueba: /wordprocessing|msword/i, etiqueta: "Word" },
  { prueba: /presentation|powerpoint/i, etiqueta: "PowerPoint" },
  { prueba: /^image\//i, etiqueta: "Imagen" },
  { prueba: /zip|compressed|rar|7z/i, etiqueta: "Comprimido" },
  { prueba: /^text\//i, etiqueta: "Texto" },
];

export function etiquetaDeTipo(mime: string, nombre = ""): string {
  for (const { prueba, etiqueta } of ETIQUETAS) {
    if (prueba.test(mime)) return etiqueta;
  }
  // Sin MIME útil —pasa con algunos navegadores— se cae a la extensión.
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
  if (ext && ext !== nombre.toLowerCase()) return ext.toUpperCase();
  return "Archivo";
}

/** El peso en la unidad más grande que dé un número legible. */
export function pesoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const unidades = ["B", "KB", "MB", "GB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) { valor /= 1024; i++; }
  return `${valor.toFixed(valor < 10 && i > 0 ? 1 : 0)} ${unidades[i]}`;
}
