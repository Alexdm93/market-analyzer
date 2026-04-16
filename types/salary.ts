export interface MarketPosition {
  id: string;
  jobTitle: string;
  category?: string;
  currency: 'USD' | 'VES';
}

// Mantener compatibilidad con módulos que usan percentiles
export interface SalaryPercentiles {
  p25: number;
  p50: number;
  p75: number;
}

export type PaymentFrequency = 'biweekly' | 'monthly' | 'bimonthly' | 'semiannual' | 'quarterly' | 'annual';

export interface CompensationConcept {
  id: string;
  concept: string;
  amount?: number;
  freq?: PaymentFrequency;
  accountCurrency?: 'USD' | 'VES';
  paymentCurrency?: 'USD' | 'VES';
  impacto?: boolean;
  variableType?: 'performance' | 'commission';
  commissionType?: 'simple' | 'tiered' | 'product' | 'service' | 'other';
  calculationDetail?: 'sale_value' | 'profit_margin' | 'units_sold' | 'other';
  goalsTarget?: 'sales_quota' | 'units_sold' | 'new_clients' | 'client_retention' | 'profit_margin' | 'mixed';
}

export interface LegacyMarketPosition {
  id: string;
  jobTitle: string;
  category?: string;
  basePercentiles: SalaryPercentiles;
  currency: 'USD' | 'VES';
}

// Campos fijos que vienen en el Excel (por cada cargo)
export interface ExtendedMarketPosition {
  id: string;
  tituloCargo: string;
  nivelOrganizacional?: string;
  clasificacion?: string;
  descripcion?: string;

  // Compensación fija garantizada
  sueldoBasico?: number;
  bonoAlimentacion?: number;
  // bonoSalud removed per request
  bonoMovilizacion?: number;
  // otrosPagosFijos removed per request
  // Frecuencias asociadas a pagos fijos
  sueldoBasicoFreq?: PaymentFrequency;
  bonoAlimentacionFreq?: PaymentFrequency;
  bonoMovilizacionFreq?: PaymentFrequency;

  // Monedas y flags para pagos fijos principales
  sueldoBasicoCuentaMoneda?: 'USD' | 'VES';
  sueldoBasicoMonedaPago?: 'USD' | 'VES';
  sueldoBasicoImpacto?: boolean;

  bonoAlimentacionCuentaMoneda?: 'USD' | 'VES';
  bonoAlimentacionMonedaPago?: 'USD' | 'VES';
  bonoAlimentacionImpacto?: boolean;

  bonoMovilizacionCuentaMoneda?: 'USD' | 'VES';
  bonoMovilizacionMonedaPago?: 'USD' | 'VES';
  bonoMovilizacionImpacto?: boolean;

  // Pagos fijos adicionales: pares (concepto, monto, frecuencia)
  additionalFixedPayments?: CompensationConcept[];

  // Otros pagos / asignaciones
  horasExtras?: number;
  nocturnidad?: number;
  pagoTransporte?: number;
  viaticos?: number;
  otrosPagos?: number;

  // Pagos variables
  bonoDesempeno?: number;
  bonoDesempenoFreq?: PaymentFrequency;
  bonoDesempenoCuentaMoneda?: 'USD' | 'VES';
  bonoDesempenoMonedaPago?: 'USD' | 'VES';
  bonoDesempenoImpacto?: boolean;

  comisiones?: number;
  comisionesFreq?: PaymentFrequency;
  comisionesCuentaMoneda?: 'USD' | 'VES';
  comisionesMonedaPago?: 'USD' | 'VES';
  comisionesImpacto?: boolean;

  pagoVariableOtros?: number;
  pagoVariableOtrosFreq?: PaymentFrequency;
  pagoVariableOtrosCuentaMoneda?: 'USD' | 'VES';
  pagoVariableOtrosMonedaPago?: 'USD' | 'VES';
  pagoVariableOtrosImpacto?: boolean;

  additionalVariablePayments?: CompensationConcept[];

  // Pagos laborales / beneficios
  aportesSeguridadSocial?: number;
  prestacionesLegales?: number;
  beneficiosNoMonetarios?: string;

  // (Totales y metadatos removidos: moneda, totalCompensacion, observaciones)
}