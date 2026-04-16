import { ExtendedMarketPosition } from "@/types/salary";

export const mockMarketData: ExtendedMarketPosition[] = [
  {
    id: "1",
    tituloCargo: "Gerente de Planta",
    nivelOrganizacional: "Senior",
    clasificacion: "Gerencia",
    descripcion: "Responsable de operaciones y producción",

    sueldoBasico: 3500,
    bonoAlimentacion: 150,
    bonoMovilizacion: 120,
    additionalFixedPayments: [
      { id: 'a1', concept: 'Otros', amount: 50, freq: 'monthly' }
    ],

    horasExtras: 0,
    nocturnidad: 0,
    pagoTransporte: 80,
    viaticos: 200,
    otrosPagos: 0,

    bonoDesempeno: 300,
    comisiones: 0,
    pagoVariableOtros: 0,

    aportesSeguridadSocial: 400,
    prestacionesLegales: 200,
    beneficiosNoMonetarios: "Seguro médico",
  
  },
  {
    id: "2",
    tituloCargo: "Ingeniero de Procesos",
    nivelOrganizacional: "Mid",
    clasificacion: "Técnico",
    descripcion: "Soporte en mejora de procesos",

    sueldoBasico: 1900,
    bonoAlimentacion: 80,
    bonoMovilizacion: 60,
    additionalFixedPayments: [
      { id: 'a2', concept: 'Otros', amount: 20, freq: 'monthly' }
    ],

    horasExtras: 0,
    nocturnidad: 0,
    pagoTransporte: 50,
    viaticos: 0,
    otrosPagos: 0,

    bonoDesempeno: 150,
    comisiones: 0,
    pagoVariableOtros: 0,

    aportesSeguridadSocial: 180,
    prestacionesLegales: 90,
    beneficiosNoMonetarios: "Capacitación",
  
  }
];

// Legacy dataset used by the landing page / projections
import { LegacyMarketPosition } from "@/types/salary";

export const legacyMockMarketData: LegacyMarketPosition[] = [
  {
    id: "1",
    jobTitle: "Gerente de Planta",
    category: "Operaciones",
    basePercentiles: { p25: 2800, p50: 3500, p75: 4200 },
    currency: "USD",
  },
  {
    id: "2",
    jobTitle: "Ingeniero de Procesos",
    category: "Ingeniería",
    basePercentiles: { p25: 1500, p50: 1900, p75: 2400 },
    currency: "USD",
  },
];