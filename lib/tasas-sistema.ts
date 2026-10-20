/**
 * Las tasas que mantiene el sistema: su identificador y su nombre.
 *
 * Viven sueltas y sin dependencias porque las necesitan los dos lados. El
 * editor de compensación corre en el navegador y `lib/bcv` habla con Prisma:
 * importar las constantes de allá metería el cliente de base de datos en el
 * bundle del cliente y la pantalla no abriría (2026-10-20).
 */
export const BCV_TASA_ID = "bcv-usd";
export const BCV_EUR_TASA_ID = "bcv-eur";

/**
 * Son texto visible —salen en la ficha de la empresa, en el desplegable de
 * tasas y en la planilla de carga— así que una sola definición para todos.
 */
export const BCV_TASA_NOMBRE = "Tasa BCV (Bs./USD)";
export const BCV_EUR_TASA_NOMBRE = "Tasa BCV (Bs./EUR)";
