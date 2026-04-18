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

export const COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR: Record<string, string[]> = {
  "Comercio / Retail": [
    "Retail especializado",
    "Retail masivo",
    "Distribución comercial",
    "Marketplace / comercio digital",
  ],
  "Construcción / Ingeniería": [
    "Contratista general",
    "Ingeniería consultiva",
    "Servicios de obra",
    "Proyectos industriales",
  ],
  "Consumo Masivo": [
    "Alimentos y bebidas",
    "Cuidado personal",
    "Hogar y consumo recurrente",
    "Distribución FMCG",
  ],
  Educación: [
    "Institución educativa",
    "Servicios académicos",
    "Capacitación corporativa",
    "Edtech",
  ],
  Energía: [
    "Generación",
    "Distribución",
    "Servicios petroleros",
    "Energías renovables",
  ],
  Entretenimiento: [
    "Producción de contenido",
    "Eventos y experiencias",
    "Streaming / digital",
    "Operación de venues",
  ],
  "Farmacéutico / Salud": [
    "Servicios de salud",
    "Laboratorio farmacéutico",
    "Dispositivos médicos",
    "Distribución sanitaria",
  ],
  "Hotelería / Turismo / Viajes": [
    "Hotelería",
    "Turismo receptivo",
    "Agencia de viajes",
    "Servicios aeroportuarios",
  ],
  "Industrial / Manufactura": [
    "Manufactura ligera",
    "Manufactura pesada",
    "Producción por procesos",
    "Cadena de suministro industrial",
  ],
  "Logística / Transporte": [
    "Transporte terrestre",
    "Operador logístico",
    "Almacenamiento y distribución",
    "Última milla",
  ],
  "Publicidad / Medios Digitales": [
    "Agencia creativa",
    "Performance marketing",
    "Medios digitales",
    "Tecnología publicitaria",
  ],
  "Banca / Seguros": [
    "Banca universal",
    "Banca de inversión",
    "Aseguradora",
    "Corretaje / intermediación",
  ],
};

export type CompanyCatalogEntry = {
  id: string;
  name: string;
  description: string;
  economicSector: string;
  classification: string;
};