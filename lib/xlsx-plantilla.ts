/**
 * Escribir valores dentro de una plantilla de Excel sin reescribir el libro.
 *
 * exceljs reconstruye el .xlsx entero al guardarlo, y en el camino pierde los
 * cuadros de texto, los gráficos y los formatos condicionales — llega a
 * escribir `formatCode="[object Object]"` y a dejar `dxfId` apuntando a
 * formatos que ya no existen, que es lo que hace que Excel "repare" el archivo
 * al abrirlo.
 *
 * Aquí se hace lo contrario: se abre el ZIP de la plantilla, se parchea SOLO el
 * XML de las hojas donde hay que poner datos, y todo lo demás se copia con sus
 * bytes intactos.
 */
import { readFile } from "node:fs/promises";

import { conContenido, contenido, escribirZip, leerZip, type EntradaZip } from "@/lib/xlsx-zip";

export type Valor = string | number | null;

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Los caracteres de control no son válidos en XML y vienen de datos pegados.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function indiceColumna(letras: string): number {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

function letrasColumna(indice: number): string {
  let n = indice, s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function partesRef(ref: string): { columna: string; fila: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!m) throw new Error(`Referencia de celda inválida: ${ref}`);
  return { columna: m[1], fila: Number(m[2]) };
}

type Celda = { atributos: string; cuerpo: string | null };
type Fila = { atributos: string; celdas: Map<string, Celda> };

function leerFilas(interior: string): Map<number, Fila> {
  const filas = new Map<number, Fila>();
  const reFila = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
  let m: RegExpExecArray | null;

  while ((m = reFila.exec(interior)) !== null) {
    const atributos = m[1];
    const numero = Number(/\br="(\d+)"/.exec(atributos)?.[1] ?? 0);
    if (!numero) continue;

    const celdas = new Map<string, Celda>();
    const cuerpoFila = m[3] ?? "";
    const reCelda = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
    let c: RegExpExecArray | null;
    while ((c = reCelda.exec(cuerpoFila)) !== null) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      if (ref) celdas.set(ref, { atributos: c[1], cuerpo: c[2] === "/>" ? null : (c[3] ?? "") });
    }
    filas.set(numero, { atributos, celdas });
  }
  return filas;
}

function escribirCelda(ref: string, atributos: string, valor: Valor): string {
  // Se conserva `s` (el estilo de la plantilla) y se recalcula `t`.
  const base = atributos
    .replace(/\s*\bt="[^"]*"/g, "")
    .replace(/\s*\br="[^"]*"/g, "")
    .trim();
  const attrs = ` r="${ref}"${base ? " " + base : ""}`;

  if (valor === null || valor === "") return `<c${attrs}/>`;
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? `<c${attrs}><v>${valor}</v></c>` : `<c${attrs}/>`;
  }
  return `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
}

function serializar(filas: Map<number, Fila>): string {
  const numeros = [...filas.keys()].sort((a, b) => a - b);
  const salida: string[] = [];

  for (const n of numeros) {
    const fila = filas.get(n)!;
    const refs = [...fila.celdas.keys()].sort(
      (a, b) => indiceColumna(partesRef(a).columna) - indiceColumna(partesRef(b).columna),
    );
    // `spans` se quita porque después de editar puede quedar mintiendo.
    const atributos = fila.atributos.replace(/\s*\bspans="[^"]*"/g, "");
    if (refs.length === 0) {
      salida.push(`<row${atributos}/>`);
      continue;
    }
    const cuerpo = refs.map((r) => {
      const c = fila.celdas.get(r)!;
      return c.cuerpo === null ? `<c${c.atributos}/>` : `<c${c.atributos}>${c.cuerpo}</c>`;
    }).join("");
    salida.push(`<row${atributos}>${cuerpo}</row>`);
  }
  return salida.join("");
}

function dimension(filas: Map<number, Fila>): string {
  let maxFila = 1, maxCol = 1;
  for (const [n, fila] of filas) {
    if (fila.celdas.size === 0) continue;
    if (n > maxFila) maxFila = n;
    for (const ref of fila.celdas.keys()) {
      const i = indiceColumna(partesRef(ref).columna);
      if (i > maxCol) maxCol = i;
    }
  }
  return `A1:${letrasColumna(maxCol)}${maxFila}`;
}

/**
 * El estilo de una celda que la plantilla no trae.
 *
 * Las tablas de la plantilla vienen con unas pocas filas ya formateadas y
 * nosotros escribimos todas las que hagan falta. Sin esto, a partir de la
 * última fila preparada los montos saldrían en formato General: sin moneda,
 * sin separadores y sin bordes. Se copia el estilo de la misma columna en la
 * fila anterior que lo tenga.
 */
function estiloHeredado(filas: Map<number, Fila>, columna: string, fila: number): string {
  for (let n = fila - 1; n >= 1 && n >= fila - 200; n--) {
    const anterior = filas.get(n);
    const celda = anterior?.celdas.get(`${columna}${n}`);
    const s = celda ? /\bs="(\d+)"/.exec(celda.atributos)?.[1] : undefined;
    if (s) return ` s="${s}"`;
  }
  return "";
}

/** Los atributos de fila (alto, estilo) de la fila previa más cercana. */
function atributosHeredados(filas: Map<number, Fila>, fila: number): string {
  for (let n = fila - 1; n >= 1 && n >= fila - 200; n--) {
    const anterior = filas.get(n);
    if (!anterior) continue;
    const limpio = anterior.atributos.replace(/\s*\br="\d+"/g, "").replace(/\s*\bspans="[^"]*"/g, "").trim();
    return ` r="${fila}"${limpio ? " " + limpio : ""}`;
  }
  return ` r="${fila}"`;
}

export class HojaPlantilla {
  private cambios = new Map<string, { valor: Valor; estiloDe?: string; sinFormato?: boolean; numFmt?: number }>();
  private combinaciones: string[] | null = null;
  private alturas = new Map<number, number>();

  constructor(
    readonly nombre: string,
    private xml: string,
    /** Del libro: clona un estilo cambiándole el formato de número. */
    private derivarEstilo?: (estiloBase: number, numFmtId: number) => number,
  ) {}

  /**
   * Las celdas combinadas de la plantilla están atadas a su contenido de
   * ejemplo, así que en las hojas que se rehacen hay que deshacerlas y volver
   * a combinar según los datos reales.
   */
  limpiarCombinaciones(): void {
    this.combinaciones = [];
  }

  combinar(rango: string): void {
    if (this.combinaciones === null) {
      this.combinaciones = [...this.xml.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"[^>]*\/>/g)].map((m) => m[1]);
    }
    const r = rango.toUpperCase();
    if (!this.combinaciones.includes(r)) this.combinaciones.push(r);
  }

  /**
   * `estiloDe` copia el formato de otra celda de la plantilla. Se usa donde la
   * plantilla trae una cabecera de ejemplo y hay que repetir su aspecto en
   * celdas que no lo tienen.
   */
  set(ref: string, valor: Valor, estiloDe?: string): void {
    this.cambios.set(ref.toUpperCase(), { valor, estiloDe: estiloDe?.toUpperCase() });
  }

  /**
   * Escribe el valor cambiándole a la celda SOLO el formato de número.
   *
   * El resto del estilo —fuente, bordes, relleno, el candado de fórmulas— se
   * conserva, porque la celda ya viene formateada de la plantilla y lo único
   * que no puede estar fijo ahí es la moneda: el mismo bloque de columnas
   * lleva montos en bolívares y en dólares según lo que declaró la empresa
   * (AC Consulting, 2026-10-18).
   */
  setConFormato(ref: string, valor: Valor, numFmtId: number): void {
    this.cambios.set(ref.toUpperCase(), { valor, numFmt: numFmtId });
  }

  /**
   * Vacía la celda y además le quita el formato.
   *
   * `set(ref, null)` deja la celda sin valor pero con los bordes y el relleno
   * de la plantilla: donde la plantilla trae una tabla larga de ejemplo, las
   * filas que sobran seguirían dibujándose vacías. Con esto la tabla termina
   * donde termina la data.
   */
  limpiar(ref: string): void {
    this.cambios.set(ref.toUpperCase(), { valor: null, sinFormato: true });
  }

  /**
   * Fija el alto de una fila, en puntos.
   *
   * Hace falta donde la plantilla trae un esqueleto con altos distintos por
   * tramo: el mapeo, por ejemplo, viene con las bandas de arriba a 20 puntos y
   * las de más abajo a 13, así que los mismos tres renglones de un cargo
   * salían holgados en un grado y apretados en el siguiente
   * (AC Consulting, 2026-10-20).
   */
  altoDeFila(fila: number, puntos: number): void {
    this.alturas.set(fila, puntos);
  }

  get tieneCambios(): boolean {
    return this.cambios.size > 0 || this.combinaciones !== null || this.alturas.size > 0;
  }

  aplicar(): string {
    if (this.cambios.size === 0 && this.combinaciones === null && this.alturas.size === 0) return this.xml;

    const m = /<sheetData\s*\/>|<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(this.xml);
    if (!m) throw new Error(`La hoja "${this.nombre}" no tiene sheetData.`);

    const filas = leerFilas(m[1] ?? "");

    // De arriba abajo y de izquierda a derecha, para que el estilo heredado
    // baje en cascada desde las filas que la plantilla sí trae formateadas.
    const ordenados = [...this.cambios.entries()].sort(([a], [b]) => {
      const pa = partesRef(a), pb = partesRef(b);
      return pa.fila - pb.fila || indiceColumna(pa.columna) - indiceColumna(pb.columna);
    });

    // Los estilos de origen se leen antes de tocar nada, para que copiar de una
    // celda que también se reescribe siga dando el formato de la plantilla.
    const estilosOriginales = new Map<string, string>();
    for (const fila of filas.values()) {
      for (const [ref, celda] of fila.celdas) {
        const s = /\bs="(\d+)"/.exec(celda.atributos)?.[1];
        if (s) estilosOriginales.set(ref, s);
      }
    }

    for (const [ref, { valor, estiloDe, sinFormato, numFmt }] of ordenados) {
      const { fila: numero } = partesRef(ref);
      const { columna } = partesRef(ref);
      // Vaciar una celda que la plantilla no trae no es nada: crearla solo
      // alargaría el rango usado de la hoja con filas en blanco.
      if (valor === null && !filas.get(numero)?.celdas.has(ref)) continue;

      let fila = filas.get(numero);
      if (!fila) {
        fila = { atributos: atributosHeredados(filas, numero), celdas: new Map() };
        filas.set(numero, fila);
      }
      const previa = fila.celdas.get(ref);
      let atributosPrevios = previa?.atributos ?? ` r="${ref}"${estiloHeredado(filas, columna, numero)}`;

      const copiado = estiloDe ? estilosOriginales.get(estiloDe) : undefined;
      if (copiado) {
        atributosPrevios = atributosPrevios.replace(/\s*\bs="\d+"/g, "") + ` s="${copiado}"`;
      } else if (sinFormato) {
        atributosPrevios = atributosPrevios.replace(/\s*\bs="\d+"/g, "");
      }

      if (numFmt !== undefined && this.derivarEstilo) {
        const base = Number(/\bs="(\d+)"/.exec(atributosPrevios)?.[1] ?? 0);
        const derivado = this.derivarEstilo(base, numFmt);
        atributosPrevios = atributosPrevios.replace(/\s*\bs="\d+"/g, "") + ` s="${derivado}"`;
      }

      // Escribir encima de la maestra de una fórmula compartida se lleva por
      // delante su declaración y deja huérfanas a todas sus hijas: el archivo
      // abre con el aviso de "recuperar contenido" de Excel y las columnas
      // salen vacías. Pasó una vez con la hoja de Competitividad y no se ve
      // hasta que alguien abre el informe, así que acá se corta (2026-10-18).
      if (previa?.cuerpo && /<f\b[^>]*\bt="shared"[^>]*>[^<]/.test(previa.cuerpo)) {
        throw new Error(
          `La celda ${ref} de la hoja "${this.nombre}" es la maestra de una fórmula compartida: `
          + "escribirle encima rompería las celdas que dependen de ella. "
          + "Cambia la plantilla para que esa celda no sea compartida.",
        );
      }

      const xmlCelda = escribirCelda(ref, atributosPrevios, valor);
      const partes = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/.exec(xmlCelda);
      if (!partes) continue;
      fila.celdas.set(ref, {
        atributos: partes[1],
        cuerpo: partes[2] === "/>" ? null : (partes[3] ?? ""),
      });
    }

    // Los altos se aplican al final, sobre las filas que ya existen: pedir el
    // alto de una fila que nadie escribió solo alargaría la hoja.
    for (const [numero, puntos] of this.alturas) {
      const fila = filas.get(numero);
      if (!fila) continue;
      fila.atributos = fila.atributos
        .replace(/\s*\bht="[^"]*"/g, "")
        .replace(/\s*\bcustomHeight="[^"]*"/g, "")
        + ` ht="${puntos}" customHeight="1"`;
    }

    let xml = this.xml.replace(m[0], `<sheetData>${serializar(filas)}</sheetData>`);
    const ref = dimension(filas);
    xml = /<dimension\b[^>]*\/>/.test(xml)
      ? xml.replace(/<dimension\b[^>]*\/>/, `<dimension ref="${ref}"/>`)
      : xml;

    if (this.combinaciones !== null) {
      const bloque = this.combinaciones.length === 0
        ? ""
        : `<mergeCells count="${this.combinaciones.length}">`
          + this.combinaciones.map((r) => `<mergeCell ref="${r}"/>`).join("")
          + "</mergeCells>";
      xml = /<mergeCells\b[^>]*>[\s\S]*?<\/mergeCells>|<mergeCells\b[^>]*\/>/.test(xml)
        ? xml.replace(/<mergeCells\b[^>]*>[\s\S]*?<\/mergeCells>|<mergeCells\b[^>]*\/>/, bloque)
        : xml.replace("</sheetData>", `</sheetData>${bloque}`);
    }

    return xml;
  }
}

/** Los `<xf>` de un bloque de estilos, enteros. */
function leerXfs(bloque: string): string[] {
  // La alternativa importa: `<xf ...>` con hijos termina en `</xf>`, y un
  // patrón perezoso que acepte `/>` corta en el primer `<alignment/>` y deja
  // styles.xml partido. Eso ya rompió los informes una vez.
  return bloque.match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) ?? [];
}

export class LibroPlantilla {
  private hojas = new Map<string, HojaPlantilla>();
  private rutaDeHoja = new Map<string, string>();
  /** Las hojas en el orden del libro, con repetidas y todo. */
  private rutasEnOrden: string[] = [];
  /** `estiloBase|numFmtId` -> índice del clon, para no repetirlos. */
  private estilosDerivados = new Map<string, number>();
  /** Los `<xf>` de cellXfs, cargados la primera vez que hace falta clonar. */
  private cellXfs: string[] | null = null;

  private constructor(private entradas: EntradaZip[]) {}

  static async abrir(ruta: string): Promise<LibroPlantilla> {
    const libro = new LibroPlantilla(leerZip(await readFile(ruta)));
    libro.indexarHojas();
    return libro;
  }

  private buscar(nombre: string): EntradaZip | undefined {
    return this.entradas.find((e) => e.nombre === nombre);
  }

  private texto(nombre: string): string {
    const e = this.buscar(nombre);
    return e ? contenido(e).toString("utf8") : "";
  }

  private reemplazar(nombre: string, datos: string): void {
    const i = this.entradas.findIndex((e) => e.nombre === nombre);
    if (i >= 0) this.entradas[i] = conContenido(nombre, Buffer.from(datos, "utf8"));
  }

  private indexarHojas(): void {
    const wb = this.texto("xl/workbook.xml");
    const rels = this.texto("xl/_rels/workbook.xml.rels");

    const destino = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
      destino.set(m[1], m[2]);
    }
    // El atributo Target puede ir antes que Id.
    for (const m of rels.matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"[^>]*\/>/g)) {
      destino.set(m[2], m[1]);
    }

    for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
      const etiqueta = m[0];
      const nombre = /name="([^"]*)"/.exec(etiqueta)?.[1];
      const rid = /r:id="([^"]+)"/.exec(etiqueta)?.[1];
      if (!nombre || !rid) continue;
      const target = destino.get(rid);
      if (!target) continue;
      const ruta = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
      // Solo la primera, si la plantilla repite nombres de hoja.
      if (!this.rutaDeHoja.has(nombre)) this.rutaDeHoja.set(nombre, ruta);
      this.rutasEnOrden.push(ruta);
    }
  }

  hoja(nombre: string): HojaPlantilla | undefined {
    const ya = this.hojas.get(nombre);
    if (ya) return ya;

    const ruta = this.rutaDeHoja.get(nombre);
    if (!ruta || !this.buscar(ruta)) return undefined;

    const hoja = new HojaPlantilla(nombre, this.texto(ruta), (base, numFmtId) =>
      this.estiloConFormato(base, numFmtId));
    this.hojas.set(nombre, hoja);
    return hoja;
  }

  /**
   * El índice de un estilo igual al base pero con otro formato de número.
   *
   * Se clona el `<xf>` entero y solo se le cambia `numFmtId`, así que el clon
   * hereda fuente, bordes, alineación y la protección que esconde las
   * fórmulas. Si ya se pidió ese par, se devuelve el mismo índice.
   */
  private estiloConFormato(estiloBase: number, numFmtId: number): number {
    const clave = `${estiloBase}|${numFmtId}`;
    const ya = this.estilosDerivados.get(clave);
    if (ya !== undefined) return ya;

    if (!this.cellXfs) {
      const bloque = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(this.texto("xl/styles.xml"));
      this.cellXfs = bloque ? leerXfs(bloque[1]) : [];
    }

    const original = this.cellXfs[estiloBase];
    // Sin estilo base del que partir no hay nada que clonar: se deja como está
    // antes que inventar un formato que no case con la hoja.
    if (!original) return estiloBase;

    const clon = (/\bnumFmtId="\d+"/.test(original)
      ? original.replace(/\bnumFmtId="\d+"/, `numFmtId="${numFmtId}"`)
      : original.replace(/^<xf\b/, `<xf numFmtId="${numFmtId}"`))
      .replace(/\s*\bapplyNumberFormat="\d"/, "")
      .replace(/^<xf\b/, `<xf applyNumberFormat="1"`);

    const indice = this.cellXfs.length;
    this.cellXfs.push(clon);
    this.estilosDerivados.set(clave, indice);
    return indice;
  }

  /** Vuelca a styles.xml los estilos que se clonaron al escribir. */
  private guardarEstilos(): void {
    if (!this.cellXfs || this.estilosDerivados.size === 0) return;
    const xml = this.texto("xl/styles.xml");
    const m = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    if (!m) return;
    const nuevo = `<cellXfs count="${this.cellXfs.length}">${this.cellXfs.join("")}</cellXfs>`;
    this.reemplazar("xl/styles.xml", xml.replace(m[0], nuevo));
  }

  /**
   * Cambia el texto de los cuadros de texto del libro.
   *
   * Los títulos de varias hojas no son celdas sino formas del dibujo, así que
   * no se pueden tocar escribiendo en una celda. Es el caso de "DATA SALARIAL:
   * <cliente>", que si no se cambia deja en el informe el nombre del cliente de
   * ejemplo de la plantilla.
   */
  reemplazarEnFormas(de: string, a: string): void {
    const destino = escapar(a);
    for (const entrada of [...this.entradas]) {
      if (!entrada.nombre.startsWith("xl/drawings/drawing") || !entrada.nombre.endsWith(".xml")) continue;
      const xml = contenido(entrada).toString("utf8");
      if (!xml.includes(de)) continue;
      this.reemplazar(entrada.nombre, xml.replace(/<a:t>([^<]*)<\/a:t>/g, (todo, texto: string) =>
        texto.includes(de) ? `<a:t>${texto.split(de).join(destino)}</a:t>` : todo));
    }
  }

  /**
   * Cambia el modelo de la línea de tendencia de los gráficos del libro.
   *
   * La curva la elige el sistema mirando cuál ajusta mejor, pero el gráfico
   * traía el modelo fijo en la plantilla: la ecuación impresa arriba de la
   * hoja y la que Excel dibujaba dentro del gráfico no eran la misma
   * (AC Consulting, 2026-10-18). Acá se le escribe al gráfico la que ganó.
   *
   * `orden` solo aplica al polinomio; en los demás modelos Excel rechaza el
   * elemento, así que se quita.
   */
  ajustarLineaDeTendencia(tipo: "exp" | "log" | "poly" | "power", orden?: number): void {
    for (const entrada of [...this.entradas]) {
      if (!entrada.nombre.startsWith("xl/charts/chart") || !entrada.nombre.endsWith(".xml")) continue;
      const xml = contenido(entrada).toString("utf8");
      if (!xml.includes("<c:trendline>")) continue;

      const nuevo = xml.replace(/<c:trendline>[\s\S]*?<\/c:trendline>/g, (bloque) => {
        // El orden de los hijos lo fija el esquema: `c:order` va justo
        // después de `c:trendlineType`.
        const sinOrden = bloque.replace(/<c:order\b[^>]*\/>/g, "");
        return sinOrden.replace(
          /<c:trendlineType\b[^>]*\/>/,
          `<c:trendlineType val="${tipo}"/>`
            + (tipo === "poly" && orden ? `<c:order val="${orden}"/>` : ""),
        );
      });
      this.reemplazar(entrada.nombre, nuevo);
    }
  }

  /** Quita el proyecto VBA para poder entregar un .xlsx sin aviso de macros. */
  sinMacros(): void {
    this.entradas = this.entradas.filter((e) => e.nombre !== "xl/vbaProject.bin");

    const tipos = this.texto("[Content_Types].xml")
      .replace(/<Override\b[^>]*PartName="\/xl\/vbaProject\.bin"[^>]*\/>/g, "")
      .replace(
        "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
      );
    this.reemplazar("[Content_Types].xml", tipos);

    const rels = this.texto("xl/_rels/workbook.xml.rels")
      .replace(/<Relationship\b[^>]*vbaProject[^>]*\/>/g, "");
    this.reemplazar("xl/_rels/workbook.xml.rels", rels);
  }

  aBuffer(): Buffer {
    for (const [nombre, hoja] of this.hojas) {
      if (!hoja.tieneCambios) continue;
      const ruta = this.rutaDeHoja.get(nombre)!;
      this.reemplazar(ruta, hoja.aplicar());
    }
    // Después de las hojas: es al aplicarlas cuando se piden los clones.
    this.guardarEstilos();

    // La cadena de cálculo puede quedar apuntando a celdas que ahora son
    // literales; Excel la reconstruye sola si no está.
    //
    // Hay que sacarla de los tres lados o el libro queda inconsistente: el
    // archivo, su tipo declarado y la relación que lo nombra. Una relación que
    // apunta a una parte que no existe es de las cosas que hacen que Excel
    // ofrezca "recuperar" el libro al abrirlo.
    this.entradas = this.entradas.filter((e) => e.nombre !== "xl/calcChain.xml");
    this.reemplazar(
      "[Content_Types].xml",
      this.texto("[Content_Types].xml").replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ""),
    );
    this.reemplazar(
      "xl/_rels/workbook.xml.rels",
      this.texto("xl/_rels/workbook.xml.rels").replace(/<Relationship\b[^>]*calcChain\.xml"[^>]*\/>/g, ""),
    );

    this.abrirEnLaPrimeraHoja();

    // Y que recalcule al abrir, para que nada quede con el valor viejo en caché.
    const wb = this.texto("xl/workbook.xml");
    this.reemplazar("xl/workbook.xml", /<calcPr\b[^>]*\/>/.test(wb)
      ? wb.replace(/<calcPr\b([^>]*?)\/>/, (_t, attrs: string) =>
          `<calcPr${attrs.replace(/\s*fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`)
      : wb.replace("</workbook>", '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'));

    return escribirZip(this.entradas);
  }

  /**
   * El informe tiene que abrirse en la portada.
   *
   * Excel guarda en el libro la pestaña en la que estaba parado quien lo
   * grabó, y las plantillas llegan de AC Consulting tal como las dejaron: una
   * venía apuntando a "Contacto", la última. Como cada revisión suya entra
   * como plantilla nueva, esto se normaliza al generar y no archivo por
   * archivo, que sería acordarse cada vez.
   */
  private abrirEnLaPrimeraHoja(): void {
    const wb = this.texto("xl/workbook.xml");
    if (wb) {
      this.reemplazar("xl/workbook.xml", wb.replace(/<workbookView\b[^>]*\/>/, (etiqueta) =>
        etiqueta
          .replace(/\s*firstSheet="[^"]*"/, "")
          .replace(/\s*activeTab="[^"]*"/, "")
          .replace(/\s*\/>$/, ' activeTab="0"/>')));
    }

    this.rutasEnOrden.forEach((ruta, i) => {
      const xml = this.texto(ruta);
      if (!xml) return;

      const sinSeleccion = xml.replace(/(<sheetView\b[^>]*?)\s*tabSelected="[^"]*"/g, "$1");
      // La primera es la única que queda seleccionada; si no tiene sheetView
      // se deja como está, que Excel igual abre en ella por el activeTab.
      const final = i === 0
        ? sinSeleccion.replace(/<sheetView\b/, '<sheetView tabSelected="1"')
        : sinSeleccion;

      if (final !== xml) this.reemplazar(ruta, final);
    });
  }
}
