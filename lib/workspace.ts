import { ExtendedMarketPosition } from "@/types/salary";

export type Snapshot = {
  id: string;
  label: string;
  date: string;
  rows: ExtendedMarketPosition[];
};

export type CompanyInfo = {
  companyName: string;
  sector: string;
  classification: string;
  description: string;
  headcount: string;
  revenueUSD: string;
  avgProfitPercent: string;
  hrName: string;
  hrPosition: string;
  hrEmail: string;
  hrPhone: string;
  hrCell: string;
  minVacationDays: string;
  minUtilityDays: string;
  conversionRate: string;
  locality: string;
};

export type UserWorkspacePayload = {
  inflation: number;
  snapshots: Record<string, Snapshot>;
  selectedSnapshotId: string;
  companyInfo: CompanyInfo;
};

export const EMPTY_COMPANY_INFO: CompanyInfo = {
  companyName: "",
  sector: "",
  classification: "",
  description: "",
  headcount: "",
  revenueUSD: "",
  avgProfitPercent: "",
  hrName: "",
  hrPosition: "",
  hrEmail: "",
  hrPhone: "",
  hrCell: "",
  minVacationDays: "",
  minUtilityDays: "",
  conversionRate: "",
  locality: "",
};

export const DEFAULT_WORKSPACE: UserWorkspacePayload = {
  inflation: 5,
  snapshots: {},
  selectedSnapshotId: "",
  companyInfo: EMPTY_COMPANY_INFO,
};

export function safeParseSnapshots(value: string | null | undefined): Record<string, Snapshot> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, Snapshot>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function safeParseCompanyInfo(value: string | null | undefined): CompanyInfo {
  if (!value) {
    return EMPTY_COMPANY_INFO;
  }

  try {
    const parsed = JSON.parse(value) as Partial<CompanyInfo>;
    return parsed && typeof parsed === "object" ? { ...EMPTY_COMPANY_INFO, ...parsed } : EMPTY_COMPANY_INFO;
  } catch {
    return EMPTY_COMPANY_INFO;
  }
}