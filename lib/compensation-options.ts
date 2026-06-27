import type { PaymentFrequency } from "@/types/salary";
import type { CompensationTemplateConcept } from "@/lib/workspace";

export const SYSTEM_FIXED_CONCEPTS: CompensationTemplateConcept[] = [
  {
    id: "sys-sueldo-basico",
    concept: "Sueldo Básico",
    freq: "monthly",
    accountCurrency: "USD",
    paymentCurrency: "USD",
    impacto: true,
    tasaId: "",
    locked: true,
  },
  {
    id: "sys-bono-alimentacion",
    concept: "Bono Alimentación",
    freq: "monthly",
    accountCurrency: "USD",
    paymentCurrency: "USD",
    impacto: false,
    tasaId: "",
    locked: true,
  },
];

export const FREQUENCY_OPTIONS: Array<{ value: PaymentFrequency; label: string }> = [
  { value: "biweekly", label: "Quincenal" },
  { value: "monthly", label: "Mensual" },
  { value: "bimonthly", label: "Bimensual" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];

export const VARIABLE_BONUS_TYPES = [
  { value: "performance", label: "Por desempeño" },
  { value: "commission", label: "Por comisiones" },
] as const;

export const VARIABLE_COMMISSION_TYPES = [
  { value: "simple", label: "Simple" },
  { value: "tiered", label: "Escalonada" },
  { value: "product", label: "Por Producto" },
  { value: "service", label: "Servicio" },
  { value: "other", label: "Otro" },
] as const;

export const VARIABLE_CALCULATION_DETAILS = [
  { value: "sale_value", label: "Valor de la venta" },
  { value: "profit_margin", label: "Margen de la ganancia" },
  { value: "units_sold", label: "Unidades vendidas" },
  { value: "other", label: "Otro" },
] as const;

export const VARIABLE_GOALS_TARGETS = [
  { value: "sales_quota", label: "Cuotas de ventas monetaria" },
  { value: "units_sold", label: "Numero de unidades vendidas" },
  { value: "new_clients", label: "Numero de nuevos clientes" },
  { value: "client_retention", label: "Retencion de clientes" },
  { value: "profit_margin", label: "Margen de ganancias" },
  { value: "mixed", label: "Mixto" },
] as const;
