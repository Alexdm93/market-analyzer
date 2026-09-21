/**
 * Lectura y escritura de ZIP, lo justo para un .xlsx.
 *
 * Existe para poder editar una plantilla de Excel sin reescribirla: las
 * entradas que no se tocan se copian con sus bytes comprimidos tal cual, así
 * que gráficos, cuadros de texto, formatos condicionales e imágenes llegan
 * idénticos al archivo final.
 *
 * No se usa una librería porque exceljs —la única que hay en el proyecto— es
 * precisamente la que corrompe esas partes al reescribir el libro.
 */
import { deflateRawSync, inflateRawSync } from "node:zlib";

export type EntradaZip = {
  nombre: string;
  /** Bytes tal como están en el archivo, sin descomprimir. */
  comprimido: Buffer;
  metodo: number;
  crc32: number;
  tamanoSinComprimir: number;
};

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export function leerZip(datos: Buffer): EntradaZip[] {
  // El directorio central manda: sus tamaños son fiables aunque la entrada
  // local use descriptor de datos.
  let fin = datos.length - 22;
  while (fin >= 0 && datos.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error("El archivo no es un ZIP válido.");

  const cuantas = datos.readUInt16LE(fin + 10);
  let p = datos.readUInt32LE(fin + 16);

  const entradas: EntradaZip[] = [];
  for (let i = 0; i < cuantas; i++) {
    if (datos.readUInt32LE(p) !== 0x02014b50) throw new Error("Directorio central corrupto.");
    const metodo    = datos.readUInt16LE(p + 10);
    const crc       = datos.readUInt32LE(p + 16);
    const compLen   = datos.readUInt32LE(p + 20);
    const sinCompLen= datos.readUInt32LE(p + 24);
    const nombreLen = datos.readUInt16LE(p + 28);
    const extraLen  = datos.readUInt16LE(p + 30);
    const comentLen = datos.readUInt16LE(p + 32);
    const offset    = datos.readUInt32LE(p + 42);
    const nombre    = datos.toString("utf8", p + 46, p + 46 + nombreLen);

    const nombreLocal = datos.readUInt16LE(offset + 26);
    const extraLocal  = datos.readUInt16LE(offset + 28);
    const inicio = offset + 30 + nombreLocal + extraLocal;

    entradas.push({
      nombre,
      comprimido: datos.subarray(inicio, inicio + compLen),
      metodo,
      crc32: crc,
      tamanoSinComprimir: sinCompLen,
    });

    p += 46 + nombreLen + extraLen + comentLen;
  }
  return entradas;
}

export function contenido(entrada: EntradaZip): Buffer {
  if (entrada.metodo === 0) return Buffer.from(entrada.comprimido);
  if (entrada.metodo === 8) return inflateRawSync(entrada.comprimido);
  throw new Error(`Método de compresión no soportado: ${entrada.metodo}`);
}

/** Reemplaza el contenido de una entrada, recomprimiéndola. */
export function conContenido(nombre: string, datos: Buffer): EntradaZip {
  const comprimido = deflateRawSync(datos, { level: 6 });
  return {
    nombre,
    comprimido,
    metodo: 8,
    crc32: crc32(datos),
    tamanoSinComprimir: datos.length,
  };
}

export function escribirZip(entradas: EntradaZip[]): Buffer {
  const piezas: Buffer[] = [];
  const directorio: Buffer[] = [];
  let offset = 0;

  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // versión necesaria
    local.writeUInt16LE(0x0800, 6);        // nombres en UTF-8
    local.writeUInt16LE(e.metodo, 8);
    local.writeUInt16LE(0, 10);            // hora
    local.writeUInt16LE(0x21, 12);         // fecha (1 ene 1980)
    local.writeUInt32LE(e.crc32, 14);
    local.writeUInt32LE(e.comprimido.length, 18);
    local.writeUInt32LE(e.tamanoSinComprimir, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);

    piezas.push(local, nombre, e.comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.metodo, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(e.crc32, 16);
    central.writeUInt32LE(e.comprimido.length, 20);
    central.writeUInt32LE(e.tamanoSinComprimir, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    directorio.push(central, nombre);
    offset += local.length + nombre.length + e.comprimido.length;
  }

  const cuerpoDirectorio = Buffer.concat(directorio);
  const cierre = Buffer.alloc(22);
  cierre.writeUInt32LE(0x06054b50, 0);
  cierre.writeUInt16LE(entradas.length, 8);
  cierre.writeUInt16LE(entradas.length, 10);
  cierre.writeUInt32LE(cuerpoDirectorio.length, 12);
  cierre.writeUInt32LE(offset, 16);

  return Buffer.concat([...piezas, cuerpoDirectorio, cierre]);
}
