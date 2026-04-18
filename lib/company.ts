export const ECONOMIC_SECTOR_OPTIONS = [
  "Comercio / Retail",
  "Construcción / Ingeniería",
  "Consumo Masivo",
  "Educación",
  "Energía",
  "Entretenimiento",
  "Farmacéutico / Salud",
  "Hotelería / Turismo / Viajes",
  "Industrial / Manufactura",
  "Logística / Transporte",
  "Publicidad / Medios Digitales",
  "Banca / Seguros",
] as const;

export type CompanyCatalogEntry = {
  id: string;
  name: string;
  description: string;
  economicSector: string;
  classification: string;
};