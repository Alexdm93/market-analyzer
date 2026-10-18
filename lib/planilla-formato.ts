/**
 * La forma de la planilla de carga: qué hoja es cuál y qué columna va dónde.
 *
 * Lo escriben dos módulos que no se pueden ver entre sí: el generador
 * (`lib/planilla-competitividad`, que usa exceljs y corre en el servidor) y el
 * lector (`lib/import-ocupantes`, que usa xlsx y corre en el navegador). Si
 * cada uno llevara su copia de estas constantes, el día que se mueva una
 * columna el archivo se generaría de una forma y se leería de otra.
 */

/** Hasta dónde llegan las fórmulas y las listas de la hoja de carga. */
export const FILAS_PLANILLA = 500;
/** La primera fila de datos: arriba van dos filas de encabezado. */
export const PRIMERA_FILA = 3;

export const HOJA_INSTRUCCIONES = "Instrucciones";
export const HOJA_CONFIG = "Configuracion";
export const HOJA_CATALOGO = "Catalogo cargo del corte";
export const HOJA_METODOLOGIA = "Metodologia CAPRI";
export const HOJA_SYS = "sysCAPRI";

/** Las trece columnas que no dependen de la empresa. */
export const CABECERAS_BASE = [
  "ID / Ocupante",
  "Departamento o Unidad Funcional",
  "Nombre del Cargo",
  "Supervisor Inmediato",
  "Cargo Homologado (Opcional)",
  "Ruta CAPRI",
  "Variable 1", "Variable 2", "Variable 3", "Variable 4", "Variable 5",
  "Grado CAPRI", "Rol CAPRI",
] as const;

/** Las cuatro columnas que lleva cada elemento de pago. */
export const SUBCOLUMNAS_PAGO = ["Monto", "Moneda Cta.", "Moneda Pago", "Tasa de Cambio"] as const;

/** Lo que la plataforma sabe guardar; no se ofrece lo que no se puede leer. */
export const MONEDAS = ["USD", "Bs."] as const;

export const COL_GRADO = 12;   // L
export const COL_ROL = 13;     // M
export const PRIMERA_COL_PAGO = 14; // N
