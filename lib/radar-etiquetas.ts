/**
 * Cómo se nombra cada tipo de cambio donde lo lee una persona.
 *
 * Vive aparte y sin dependencias porque lo usan la pantalla y el PDF, y el
 * módulo del PDF arrastra pdfkit, que no tiene nada que hacer en el navegador.
 */
export function etiquetaTcr(tipo: string | null): string {
  if (tipo === "bcv") return "TCR BCV — dólar";
  if (tipo === "euro") return "TCR BCV — euro";
  if (tipo === "libre") return "TCR libre";
  return "";
}
