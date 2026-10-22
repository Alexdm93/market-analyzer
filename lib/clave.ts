/**
 * Una contraseña inicial decente, para no tener que inventarla a mano.
 *
 * Doce caracteres con al menos una mayúscula, una minúscula, un dígito y un
 * símbolo. Quedan fuera las letras y números que se confunden al dictar o al
 * copiar de un mensaje —I, l, 1, O, 0— porque estas claves se entregan a mano
 * y alguien las va a transcribir.
 *
 * Vivía dentro de la pantalla de administración y solo servía para cambiarle
 * la clave a un usuario existente; también la usa el alta
 * (AC Consulting, 2026-10-22).
 */
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const DIGITOS = "23456789";
const SIMBOLOS = "!@#$%&*";

export function generarClave(): string {
  const todos = MAYUSCULAS + MINUSCULAS + DIGITOS + SIMBOLOS;
  const elegir = (s: string) => s[Math.floor(Math.random() * s.length)];
  const nucleo = [elegir(MAYUSCULAS), elegir(MINUSCULAS), elegir(DIGITOS), elegir(SIMBOLOS)];
  for (let i = 0; i < 8; i++) nucleo.push(elegir(todos));
  return nucleo.sort(() => Math.random() - 0.5).join("");
}
