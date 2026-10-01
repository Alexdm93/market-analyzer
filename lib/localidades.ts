/**
 * Las regiones en las que una empresa declara operar.
 *
 * AC Consulting trabaja por región, no por estado: una empresa marca "Central"
 * y eso cubre Aragua, Carabobo y Cojedes. Los estados se listan para que al
 * llenar la ficha no haya que adivinar en qué región cae cada uno.
 *
 * El nombre de la región es lo que se guarda en `CompanyInfo.locality`, varias
 * separadas por coma, y lo que filtra `lib/filtros-mercado.ts`. Cambiar un
 * nombre deja huérfanas las empresas que ya lo tenían guardado.
 */
export type Localidad = {
  nombre: string;
  estados: string[];
};

export const LOCALIDADES: Localidad[] = [
  { nombre: "Capital", estados: ["Distrito Capital", "Miranda", "La Guaira"] },
  { nombre: "Central", estados: ["Aragua", "Carabobo", "Cojedes"] },
  { nombre: "Centroccidental", estados: ["Falcón", "Lara", "Portuguesa", "Yaracuy"] },
  { nombre: "Guayana", estados: ["Amazonas", "Bolívar", "Delta Amacuro"] },
  { nombre: "Insular", estados: ["Nueva Esparta", "Dependencias Federales"] },
  { nombre: "Los Andes", estados: ["Barinas", "Mérida", "Táchira", "Trujillo"] },
  { nombre: "Los Llanos", estados: ["Apure", "Guárico"] },
  { nombre: "Nororiental", estados: ["Anzoátegui", "Monagas", "Sucre"] },
  { nombre: "Zuliana", estados: ["Zulia"] },
];

/** "Aragua, Carabobo y Cojedes", para mostrarlo debajo del nombre. */
export function estadosDe(nombre: string): string {
  const estados = LOCALIDADES.find((l) => l.nombre === nombre)?.estados ?? [];
  if (estados.length === 0) return "";
  if (estados.length === 1) return estados[0];
  return `${estados.slice(0, -1).join(", ")} y ${estados[estados.length - 1]}`;
}
