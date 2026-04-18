"use client";

import { useEffect, useState } from "react";
import {
  COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR,
  ECONOMIC_SECTOR_OPTIONS,
  type CompanyCatalogEntry,
} from "@/lib/company";

export type CompanyOption = CompanyCatalogEntry;

export type UserRegistrationValues = {
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  companyDescription: string;
  companyEconomicSector: string;
  companyClassification: string;
  password: string;
  confirmPassword: string;
  role: "USER" | "ADMIN";
};

type CompaniesPayload = {
  companies?: CompanyOption[];
  bootstrapRequired?: boolean;
  message?: string;
};

type UserRegistrationFormProps = {
  allowRoleSelection?: boolean;
  forceExistingCompanySelector?: boolean;
  submitLabel: string;
  submittingLabel: string;
  isSubmitting?: boolean;
  externalError?: string;
  onSubmit: (values: UserRegistrationValues) => Promise<void> | void;
};

const DEFAULT_VALUES: UserRegistrationValues = {
  name: "",
  email: "",
  companyId: "",
  companyName: "",
  companyDescription: "",
  companyEconomicSector: "",
  companyClassification: "",
  password: "",
  confirmPassword: "",
  role: "USER",
};

export default function UserRegistrationForm({
  allowRoleSelection = false,
  forceExistingCompanySelector = false,
  submitLabel,
  submittingLabel,
  isSubmitting = false,
  externalError,
  onSubmit,
}: UserRegistrationFormProps) {
  const [values, setValues] = useState<UserRegistrationValues>(DEFAULT_VALUES);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [localError, setLocalError] = useState("");

  const isBootstrap = !forceExistingCompanySelector && !isLoadingCompanies && bootstrapRequired;
  const needsNewCompany = isBootstrap;
  const selectedCompany = companies.find((company) => company.id === values.companyId) ?? null;
  const classificationOptions = needsNewCompany
    ? COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[values.companyEconomicSector] ?? []
    : COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[selectedCompany?.economicSector ?? ""] ?? [];

  useEffect(() => {
    let ignore = false;

    async function loadCompanies() {
      try {
        const response = await fetch("/api/companies", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as CompaniesPayload | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "No fue posible cargar las empresas.");
        }

        if (!ignore) {
          const nextCompanies = Array.isArray(payload?.companies) ? payload.companies : [];
          setCompanies(nextCompanies);
          setBootstrapRequired(Boolean(payload?.bootstrapRequired));
          setValues((current) => ({
            ...current,
            companyId: current.companyId || nextCompanies[0]?.id || "",
            role: !allowRoleSelection && Boolean(payload?.bootstrapRequired) ? "ADMIN" : current.role,
          }));
        }
      } catch (error) {
        if (!ignore) {
          setLocalError(error instanceof Error ? error.message : "No fue posible cargar las empresas.");
        }
      } finally {
        if (!ignore) {
          setIsLoadingCompanies(false);
        }
      }
    }

    void loadCompanies();

    return () => {
      ignore = true;
    };
  }, [allowRoleSelection]);

  function updateValue<Key extends keyof UserRegistrationValues>(key: Key, value: UserRegistrationValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateEconomicSector(sector: string) {
    setValues((current) => {
      const allowedClassifications = COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR[sector] ?? [];
      return {
        ...current,
        companyEconomicSector: sector,
        companyClassification: allowedClassifications.includes(current.companyClassification) ? current.companyClassification : "",
      };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    if (!needsNewCompany && !values.companyId) {
      setLocalError("Selecciona una empresa.");
      return;
    }

    if (needsNewCompany && values.companyName.trim().length < 2) {
      setLocalError("Ingresa el nombre de la empresa inicial.");
      return;
    }

    if (values.password !== values.confirmPassword) {
      setLocalError("Las contraseñas no coinciden.");
      return;
    }

    await onSubmit({
      ...values,
      companyName: needsNewCompany ? values.companyName : "",
      companyDescription: needsNewCompany ? values.companyDescription : selectedCompany?.description ?? "",
      companyEconomicSector: needsNewCompany ? values.companyEconomicSector : selectedCompany?.economicSector ?? "",
      companyClassification: needsNewCompany ? values.companyClassification : selectedCompany?.classification ?? "",
      role: allowRoleSelection ? values.role : isBootstrap ? "ADMIN" : "USER",
    });
  }

  const errorMessage = externalError || localError;
  const isResolvingBootstrap = isLoadingCompanies;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="registrationName" className="field-label">Nombre</label>
        <input
          id="registrationName"
          type="text"
          value={values.name}
          onChange={(event) => updateValue("name", event.target.value)}
          className="field"
          placeholder="Nombre del usuario"
          autoComplete="name"
          required
        />
      </div>
      <div>
        <label htmlFor="registrationEmail" className="field-label">Correo</label>
        <input
          id="registrationEmail"
          type="email"
          value={values.email}
          onChange={(event) => updateValue("email", event.target.value)}
          className="field"
          placeholder="equipo@empresa.com"
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label htmlFor="registrationPassword" className="field-label">Contrasena</label>
        <input
          id="registrationPassword"
          type="password"
          value={values.password}
          onChange={(event) => updateValue("password", event.target.value)}
          className="field"
          placeholder="Minimo 8 caracteres"
          autoComplete="new-password"
          required
        />
      </div>
      <div>
        <label htmlFor="registrationConfirmPassword" className="field-label">Confirmar contrasena</label>
        <input
          id="registrationConfirmPassword"
          type="password"
          value={values.confirmPassword}
          onChange={(event) => updateValue("confirmPassword", event.target.value)}
          className="field"
          placeholder="Repite la contrasena"
          autoComplete="new-password"
          required
        />
      </div>
      {isResolvingBootstrap ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Cargando configuracion inicial...
        </div>
      ) : needsNewCompany ? (
        <div>
          <label htmlFor="registrationCompanyName" className="field-label">Empresa inicial</label>
          <input
            id="registrationCompanyName"
            type="text"
            value={values.companyName}
            onChange={(event) => updateValue("companyName", event.target.value)}
            className="field"
            placeholder="Nombre de la empresa"
            required
          />
        </div>
      ) : (
        <div>
          <label htmlFor="registrationCompanyId" className="field-label">Empresa</label>
          <select
            id="registrationCompanyId"
            value={values.companyId}
            onChange={(event) => updateValue("companyId", event.target.value)}
            className="field-select"
            disabled={isLoadingCompanies || companies.length === 0}
            required
          >
            {isLoadingCompanies ? <option value="">Cargando empresas...</option> : null}
            {!isLoadingCompanies && companies.length === 0 ? <option value="">No hay empresas registradas</option> : null}
            {!isLoadingCompanies && companies.length > 0 ? <option value="">Selecciona una empresa</option> : null}
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="registrationCompanyDescription" className="field-label">Descripcion de la empresa</label>
        <textarea
          id="registrationCompanyDescription"
          value={needsNewCompany ? values.companyDescription : selectedCompany?.description ?? ""}
          onChange={(event) => updateValue("companyDescription", event.target.value)}
          className="field min-h-28 resize-y"
          placeholder="Descripcion general de la empresa"
          readOnly={!needsNewCompany}
        />
      </div>
      <div>
        <label htmlFor="registrationEconomicSector" className="field-label">Sector economico</label>
        {needsNewCompany ? (
          <select
            id="registrationEconomicSector"
            value={values.companyEconomicSector}
            onChange={(event) => updateEconomicSector(event.target.value)}
            className="field-select"
          >
            <option value="">Seleccionar sector económico</option>
            {ECONOMIC_SECTOR_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            id="registrationEconomicSector"
            type="text"
            value={selectedCompany?.economicSector ?? ""}
            className="field"
            placeholder="Sin sector registrado"
            readOnly
          />
        )}
      </div>
      <div>
        <label htmlFor="registrationClassification" className="field-label">Clasificacion</label>
        {needsNewCompany ? (
          <select
            id="registrationClassification"
            value={values.companyClassification}
            onChange={(event) => updateValue("companyClassification", event.target.value)}
            className="field-select"
            disabled={!values.companyEconomicSector}
          >
            <option value="">{values.companyEconomicSector ? "Seleccionar clasificación" : "Selecciona primero un sector"}</option>
            {classificationOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            id="registrationClassification"
            type="text"
            value={selectedCompany?.classification ?? ""}
            className="field"
            placeholder="Sin clasificación registrada"
            readOnly
          />
        )}
      </div>
      {allowRoleSelection ? (
        <div>
          <label htmlFor="registrationRole" className="field-label">Rol inicial</label>
          <select
            id="registrationRole"
            value={values.role}
            onChange={(event) => updateValue("role", event.target.value as "USER" | "ADMIN")}
            className="field-select"
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
      ) : null}

      {errorMessage ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p> : null}

      <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting || isLoadingCompanies}>
        {isSubmitting ? submitLabel : submitLabel}
        <span className="sr-only">{submittingLabel}</span>
      </button>
    </form>
  );
}