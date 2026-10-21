/**
 * El informe del Radar Salarial en PDF.
 *
 * Es el mismo informe que se ve en pantalla, dibujado para imprimir: una sola
 * página con los tres bloques de los modelos de AC Consulting —perfil,
 * composición de la muestra y posicionamiento competitivo— y el pie con la
 * web y el corte del que salió.
 *
 * Se dibuja con pdfkit sobre las fuentes estándar del PDF, así que no viaja
 * ninguna tipografía dentro del archivo. Lo que sí hay que vigilar es que las
 * métricas de esas fuentes son archivos que pdfkit lee del disco: van
 * declaradas en `outputFileTracingIncludes` o el texto sale vacío al
 * desplegar.
 */
import path from "node:path";

import PDFDocument from "pdfkit";

import type { InformeRadar } from "@/app/api/radar/route";
import { etiquetaTcr } from "@/lib/radar-etiquetas";
import { PERCENTILES_RADAR } from "@/lib/radar-mercado";

const AZUL = "#1B4965";
const GRIS = "#5B6B78";
const LINEA = "#D7DEE4";
const FONDO = "#F1F4F7";

/** Los tonos de la torta, del más oscuro al más claro. */
const TONOS = ["#1B4965", "#2E6B8F", "#5390B5", "#8FB8D4", "#C3DAE8", "#E4EEF5"];

/** Los logos del pie. Van en templates/ porque nadie los importa. */
const LOGOS = {
  ac: path.join(process.cwd(), "templates", "logos", "ac-consulting.jpg"),
  avgh: path.join(process.cwd(), "templates", "logos", "avgh.png"),
};

const MARGEN = 46;
const ANCHO = 595.28; // A4 vertical
const UTIL = ANCHO - MARGEN * 2;

const porcentaje = (v: number) => `${Math.round(v * 100)}%`;
const monto = (v: number | null) =>
  v === null ? "ND" : new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(v);

type Doc = PDFKit.PDFDocument;

/** El título de una sección, con su regla debajo. */
function seccion(doc: Doc, texto: string, y: number): number {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(AZUL).text(texto.toUpperCase(), MARGEN, y, {
    characterSpacing: 0.6,
  });
  const abajo = doc.y + 3;
  doc.moveTo(MARGEN, abajo).lineTo(MARGEN + UTIL, abajo).lineWidth(0.8).strokeColor(AZUL).stroke();
  return abajo + 12;
}

/** Un par etiqueta/valor del perfil. */
function dato(doc: Doc, etiqueta: string, valor: string, x: number, y: number, ancho: number): number {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRIS).text(etiqueta.toUpperCase(), x, y, {
    width: ancho, characterSpacing: 0.5,
  });
  doc.font("Helvetica").fontSize(9.5).fillColor("#1F2A33").text(valor || "—", x, doc.y + 1, { width: ancho });
  return doc.y + 9;
}

/**
 * La torta por tamaño de empresa.
 *
 * Cada porción se dibuja como un sector: del centro al borde, el arco, y de
 * vuelta al centro. Una sola porción se dibuja como círculo, porque un arco
 * de vuelta entera no tiene dos extremos distintos y saldría vacío.
 */
function torta(
  doc: Doc,
  rebanadas: Array<{ nombre: string; porcentaje: number }>,
  cx: number, cy: number, r: number,
): void {
  if (rebanadas.length === 0) return;
  if (rebanadas.length === 1) {
    doc.circle(cx, cy, r).fillColor(TONOS[0]).fill();
    return;
  }

  rebanadas.forEach((rebanada, i) => {
    const previo = rebanadas.slice(0, i).reduce((suma, x) => suma + x.porcentaje, 0);
    const desde = -Math.PI / 2 + previo * Math.PI * 2;
    const hasta = desde + rebanada.porcentaje * Math.PI * 2;

    doc.moveTo(cx, cy).lineTo(cx + r * Math.cos(desde), cy + r * Math.sin(desde));
    // El arco en tramos de un cuarto de vuelta como mucho: una curva de Bézier
    // deja de parecerse a un arco cuando abarca más que eso.
    const tramos = Math.max(1, Math.ceil((hasta - desde) / (Math.PI / 2)));
    const paso = (hasta - desde) / tramos;
    const k = (4 / 3) * Math.tan(paso / 4);
    for (let t = 0; t < tramos; t++) {
      const a = desde + paso * t;
      const b = a + paso;
      const [x1, y1] = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [x2, y2] = [cx + r * Math.cos(b), cy + r * Math.sin(b)];
      doc.bezierCurveTo(
        x1 - k * r * Math.sin(a), y1 + k * r * Math.cos(a),
        x2 + k * r * Math.sin(b), y2 - k * r * Math.cos(b),
        x2, y2,
      );
    }
    doc.closePath().fillColor(TONOS[i % TONOS.length]).fill();
  });
}

export function generarPdfRadar(informe: InformeRadar): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGEN, bufferPages: true });
  const trozos: Buffer[] = [];
  doc.on("data", (t: Buffer) => trozos.push(t));
  const listo = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(trozos))));

  const { perfil, muestra, posicionamiento } = informe;

  // ── Encabezado ──
  doc.font("Helvetica-Bold").fontSize(16).fillColor(AZUL)
    .text(informe.modo === "cargo" ? "REPORTE POR CARGO" : "REPORTE POR VALORACIÓN CAPRI", MARGEN, MARGEN);
  doc.font("Helvetica").fontSize(9).fillColor(GRIS)
    .text(`${informe.empresa} · ${informe.corte.label}`, MARGEN, doc.y + 2);

  let y = doc.y + 16;

  // ── Perfil ──
  y = seccion(doc, "Perfil del cargo", y);
  const media = UTIL / 2 - 8;

  if (informe.modo === "cargo") {
    y = dato(doc, "Cargo", perfil.tituloCargo, MARGEN, y, UTIL);
    y = dato(doc, "Unidad funcional típica", perfil.unidadFuncional, MARGEN, y, UTIL);
  } else {
    y = dato(doc, "Nombre del cargo", perfil.tituloCargo, MARGEN, y, UTIL);
    const yRuta = y;
    const abajoIzq = dato(doc, "Ruta CAPRI", perfil.rutaCapri, MARGEN, yRuta, media);
    const abajoDer = dato(doc, "Clasificación", perfil.clasificacion, MARGEN + UTIL / 2 + 8, yRuta, media);
    y = Math.max(abajoIzq, abajoDer);
    y = dato(doc, "Grado CAPRI – Rol CAPRI",
      perfil.grado ? `${perfil.grado} – ${perfil.rol}` : "", MARGEN, y, UTIL);
  }

  if (perfil.descripcion) y = dato(doc, "Descripción", perfil.descripcion, MARGEN, y, UTIL);

  // ── Muestra ──
  y = seccion(doc, "Composición de la muestra", y + 6);
  doc.font("Helvetica").fontSize(8.5).fillColor(GRIS).text(
    `${muestra.empresas} ${muestra.empresas === 1 ? "empresa aportó" : "empresas aportaron"} data para este `
    + `${informe.modo === "cargo" ? "cargo" : "grado"}.`,
    MARGEN, y, { width: UTIL },
  );
  y = doc.y + 10;

  const yMuestra = y;
  // Sectores, a la izquierda.
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRIS).text("POR SECTOR ECONÓMICO", MARGEN, y, { characterSpacing: 0.5 });
  let ySector = doc.y + 5;
  for (const s of muestra.sectores.slice(0, 9)) {
    doc.font("Helvetica").fontSize(8.5).fillColor("#1F2A33").text(s.nombre, MARGEN, ySector, { width: media - 44 });
    doc.font("Helvetica").fontSize(8.5).fillColor(GRIS)
      .text(porcentaje(s.porcentaje), MARGEN + media - 40, ySector, { width: 40, align: "right" });
    ySector += 13;
    doc.moveTo(MARGEN, ySector - 4).lineTo(MARGEN + media, ySector - 4).lineWidth(0.4).strokeColor(LINEA).stroke();
  }

  // Tamaños, a la derecha.
  const xDer = MARGEN + UTIL / 2 + 8;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRIS).text("POR TAMAÑO DE EMPRESA", xDer, yMuestra, { characterSpacing: 0.5 });
  const cy = doc.y + 48;
  torta(doc, muestra.tamanos, xDer + 44, cy, 40);
  let yLeyenda = cy - 22;
  muestra.tamanos.forEach((t, i) => {
    doc.rect(xDer + 96, yLeyenda, 7, 7).fillColor(TONOS[i % TONOS.length]).fill();
    doc.font("Helvetica").fontSize(8.5).fillColor("#1F2A33")
      .text(`${t.nombre}  ${porcentaje(t.porcentaje)}`, xDer + 108, yLeyenda - 1, { width: media - 108 });
    yLeyenda += 15;
  });

  y = Math.max(ySector, cy + 48, yLeyenda) + 8;

  // Composición de la compensación: una fila de ocho casillas.
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRIS)
    .text("COMPOSICIÓN DE LA COMPENSACIÓN", MARGEN, y, { characterSpacing: 0.5 });
  y = doc.y + 6;

  const anchoCasilla = UTIL / muestra.composicion.length;

  // El alto se mide, no se fija: "Otros pagos otra frecuencia con impacto"
  // ocupa tres renglones en una casilla de 60 puntos, y con un alto fijo el
  // porcentaje caía encima del título (AC Consulting, 2026-10-20).
  doc.font("Helvetica").fontSize(5.6);
  const altoTitulo = Math.max(...muestra.composicion.map((c) =>
    doc.heightOfString(c.categoria, { width: anchoCasilla - 6, align: "center" })));
  const altoCasilla = altoTitulo + 20;

  doc.rect(MARGEN, y, UTIL, altoCasilla).fillColor(FONDO).fill();
  muestra.composicion.forEach((c, i) => {
    const x = MARGEN + anchoCasilla * i;
    doc.font("Helvetica").fontSize(5.6).fillColor(GRIS)
      .text(c.categoria, x + 3, y + 4, { width: anchoCasilla - 6, align: "center" });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(AZUL)
      .text(porcentaje(c.porcentaje), x + 3, y + altoTitulo + 7, { width: anchoCasilla - 6, align: "center" });
    if (i > 0) {
      doc.moveTo(x, y).lineTo(x, y + altoCasilla).lineWidth(0.4).strokeColor("#FFFFFF").stroke();
    }
  });
  y += altoCasilla + 16;

  // ── Posicionamiento ──
  y = seccion(doc, "Posicionamiento competitivo", y);
  doc.font("Helvetica").fontSize(8.5).fillColor(GRIS).text(
    informe.tcr
      ? `Cifras expresadas en moneda dura (${etiquetaTcr(informe.tcr)}).`
      : "Cifras en la moneda en que cada empresa cargó su data.",
    MARGEN, y, { width: UTIL },
  );
  y = doc.y + 8;

  const anchoEtiqueta = UTIL * 0.42;
  const anchoColumna = (UTIL - anchoEtiqueta) / PERCENTILES_RADAR.length;

  doc.rect(MARGEN, y, UTIL, 18).fillColor(FONDO).fill();
  PERCENTILES_RADAR.forEach((p, i) => {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(AZUL).text(
      p.toUpperCase(), MARGEN + anchoEtiqueta + anchoColumna * i, y + 5,
      { width: anchoColumna - 6, align: "right" },
    );
  });
  y += 18;

  posicionamiento.forEach((fila) => {
    doc.font("Helvetica").fontSize(8.5).fillColor("#1F2A33")
      .text(fila.etiqueta, MARGEN + 2, y + 6, { width: anchoEtiqueta - 6 });
    PERCENTILES_RADAR.forEach((p, i) => {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1F2A33").text(
        monto(fila.valores[p]), MARGEN + anchoEtiqueta + anchoColumna * i, y + 6,
        { width: anchoColumna - 6, align: "right" },
      );
    });
    y += 22;
    doc.moveTo(MARGEN, y).lineTo(MARGEN + UTIL, y).lineWidth(0.4).strokeColor(LINEA).stroke();
  });

  // ── Pie ──
  const yPie = 842 - MARGEN - 34;
  doc.moveTo(MARGEN, yPie - 6).lineTo(MARGEN + UTIL, yPie - 6).lineWidth(0.8).strokeColor(AZUL).stroke();

  // Los logos no son indispensables: si faltan, el informe sale igual.
  try {
    doc.image(LOGOS.ac, MARGEN, yPie + 2, { height: 22 });
  } catch { /* sin logo */ }
  try {
    doc.image(LOGOS.avgh, MARGEN + UTIL - 76, yPie + 4, { width: 76 });
  } catch { /* sin logo */ }

  doc.font("Helvetica").fontSize(7.5).fillColor(GRIS)
    .text("www.acconsult.net/market-analyzer", MARGEN, yPie + 28, { width: UTIL / 2 });
  doc.font("Helvetica").fontSize(7.5).fillColor(GRIS)
    .text(`Emitido el ${informe.emitido}`, MARGEN + UTIL / 2, yPie + 28, { width: UTIL / 2, align: "right" });

  doc.end();
  return listo;
}
