import { SalaryPercentiles } from "@/types/salary";

export function projectSalary(
  base: SalaryPercentiles,
  monthlyInflation: number,
  months: number
): SalaryPercentiles {
  const factor = Math.pow(1 + monthlyInflation / 100, months);
  return {
    p25: Math.round(base.p25 * factor),
    p50: Math.round(base.p50 * factor),
    p75: Math.round(base.p75 * factor),
  };
}