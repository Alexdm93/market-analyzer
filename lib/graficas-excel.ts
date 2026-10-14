/**
 * Gráficas de líneas nativas de Excel, inyectadas en un libro ya armado.
 *
 * La librería con la que se construyen los reportes de admin no sabe crear
 * gráficas. Y acá no sirve rellenar una plantilla con la gráfica ya dibujada:
 * la curva que se grafica depende de la data de cada corte, así que tiene que
 * salir del sistema cada vez (AC Consulting, 2026-10-14).
 *
 * Entonces se escribe el XML de la gráfica a mano y se mete en el .xlsx, que
 * es un zip: la misma técnica con la que se parchean las plantillas de los
 * informes. Nada de imágenes: queda una gráfica de verdad, con sus series
 * apuntando a las celdas, que el usuario puede tocar.
 */
import { conContenido, contenido, escribirZip, leerZip, type EntradaZip } from "@/lib/xlsx-zip";

/** Una línea de la gráfica: su nombre y de qué celdas sale. */
export type SerieGrafica = {
  nombre: string;
  /** Rango de los valores, sin el nombre de la hoja. Ej. "$B$11:$B$28". */
  rango: string;
  /** Color en hexadecimal, sin almohadilla. */
  color: string;
  /** Las crudas van punteadas para distinguirlas de las suavizadas. */
  punteada?: boolean;
};

export type Grafica = {
  titulo: string;
  /** La hoja donde se dibuja y de donde salen los datos. */
  hoja: string;
  /** Rango de las etiquetas del eje X, sin el nombre de la hoja. */
  categorias: string;
  series: SerieGrafica[];
  /** Esquina superior izquierda, en columna y fila (base 0). */
  ancla: { col: number; fila: number };
  /** Tamaño en celdas. */
  tamano: { cols: number; filas: number };
};

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
function x(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Una referencia completa, con la hoja entrecomillada si hace falta. */
function ref(hoja: string, rango: string): string {
  const necesitaComillas = /[^A-Za-z0-9_]/.test(hoja);
  return x(`${necesitaComillas ? `'${hoja.replace(/'/g, "''")}'` : hoja}!${rango}`);
}

function serieXml(s: SerieGrafica, i: number, g: Grafica): string {
  const guiones = s.punteada ? '<a:prstDash val="dash"/>' : "";
  return `<c:ser>`
    + `<c:idx val="${i}"/><c:order val="${i}"/>`
    + `<c:tx><c:v>${x(s.nombre)}</c:v></c:tx>`
    + `<c:spPr><a:ln w="19050" cap="rnd">`
    + `<a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill>${guiones}<a:round/>`
    + `</a:ln><a:effectLst/></c:spPr>`
    + `<c:marker><c:symbol val="none"/></c:marker>`
    + `<c:cat><c:numRef><c:f>${ref(g.hoja, g.categorias)}</c:f></c:numRef></c:cat>`
    + `<c:val><c:numRef><c:f>${ref(g.hoja, s.rango)}</c:f></c:numRef></c:val>`
    + `<c:smooth val="0"/>`
    + `</c:ser>`;
}

function chartXml(g: Grafica): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"`
    + ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<c:chart>`
    + `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${x(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    + `<c:autoTitleDeleted val="0"/>`
    + `<c:plotArea><c:layout/>`
    + `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>`
    + g.series.map((s, i) => serieXml(s, i, g)).join("")
    + `<c:marker val="0"/><c:axId val="111111111"/><c:axId val="222222222"/>`
    + `</c:lineChart>`
    + `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling>`
    + `<c:delete val="0"/><c:axPos val="b"/>`
    + `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Grado</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    + `<c:crossAx val="222222222"/></c:catAx>`
    + `<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling>`
    + `<c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/>`
    + `<c:numFmt formatCode="#,##0" sourceLinked="0"/>`
    + `<c:crossAx val="111111111"/></c:valAx>`
    + `</c:plotArea>`
    + `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>`
    + `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>`
    + `</c:chart></c:chartSpace>`;
}

function anclaXml(g: Grafica, idRelacion: string): string {
  const { col, fila } = g.ancla;
  return `<xdr:twoCellAnchor>`
    + `<xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff>`
    + `<xdr:row>${fila}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    + `<xdr:to><xdr:col>${col + g.tamano.cols}</xdr:col><xdr:colOff>0</xdr:colOff>`
    + `<xdr:row>${fila + g.tamano.filas}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
    + `<xdr:graphicFrame macro="">`
    + `<xdr:nvGraphicFramePr>`
    + `<xdr:cNvPr id="${2 + Number(idRelacion.replace(/\D/g, ""))}" name="${x(g.titulo)}"/>`
    + `<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
    + `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">`
    + `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${idRelacion}"/>`
    + `</a:graphicData></a:graphic></xdr:graphicFrame>`
    + `<xdr:clientData/></xdr:twoCellAnchor>`;
}

/**
 * Mete las gráficas en el libro y devuelve el .xlsx resultante.
 *
 * Todas van a la misma hoja, que es la que tiene las series. `indiceHoja` es
 * su posición en el libro, empezando en 1 — el nombre del archivo que usa
 * exceljs es `xl/worksheets/sheet<indice>.xml`.
 */
export function inyectarGraficas(libro: Buffer, indiceHoja: number, graficas: Grafica[]): Buffer {
  if (graficas.length === 0) return libro;

  const entradas = leerZip(libro);
  const texto = (nombre: string) => {
    const e = entradas.find((x) => x.nombre === nombre);
    return e ? contenido(e).toString("utf8") : "";
  };
  const reemplazar = (nombre: string, datos: string) => {
    const i = entradas.findIndex((e) => e.nombre === nombre);
    const entrada = conContenido(nombre, Buffer.from(datos, "utf8"));
    if (i >= 0) entradas[i] = entrada; else entradas.push(entrada);
  };

  const rutaHoja = `xl/worksheets/sheet${indiceHoja}.xml`;
  const hoja = texto(rutaHoja);
  if (!hoja) return libro;

  // ── Las gráficas, una parte por cada una ──
  graficas.forEach((g, i) => reemplazar(`xl/charts/chart${i + 1}.xml`, chartXml(g)));

  // ── El dibujo que las ancla a la hoja ──
  const dibujo = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"`
    + ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
    + graficas.map((g, i) => anclaXml(g, `rId${i + 1}`)).join("")
    + `</xdr:wsDr>`;
  reemplazar("xl/drawings/drawing1.xml", dibujo);

  reemplazar("xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + graficas.map((_, i) =>
        `<Relationship Id="rId${i + 1}"`
        + ` Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"`
        + ` Target="../charts/chart${i + 1}.xml"/>`).join("")
    + `</Relationships>`);

  // ── La hoja apunta al dibujo ──
  const rutaRels = `xl/worksheets/_rels/sheet${indiceHoja}.xml.rels`;
  const relsHoja = texto(rutaRels);
  const ID_DIBUJO = "rIdGrafico1";
  const relacion = `<Relationship Id="${ID_DIBUJO}"`
    + ` Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"`
    + ` Target="../drawings/drawing1.xml"/>`;

  reemplazar(rutaRels, relsHoja
    ? relsHoja.replace("</Relationships>", `${relacion}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + relacion + `</Relationships>`);

  // El elemento <drawing> va al final de la hoja, que es donde lo ubica el
  // esquema: si se mete antes de <pageMargins>, Excel rechaza el archivo.
  reemplazar(rutaHoja, hoja.replace("</worksheet>", `<drawing r:id="${ID_DIBUJO}"/></worksheet>`));

  // ── Y el libro declara los tipos de las partes nuevas ──
  let tipos = texto("[Content_Types].xml");
  const overrides = [
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
    ...graficas.map((_, i) =>
      `<Override PartName="/xl/charts/chart${i + 1}.xml"`
      + ` ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`),
  ].filter((o) => !tipos.includes(o.slice(0, o.indexOf('" Content'))));
  tipos = tipos.replace("</Types>", `${overrides.join("")}</Types>`);
  reemplazar("[Content_Types].xml", tipos);

  return escribirZip(entradas as EntradaZip[]);
}
