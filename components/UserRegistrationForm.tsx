"use client";

import { Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { generarClave } from "@/lib/clave";
import {
  COMPANY_CLASSIFICATION_OPTIONS_BY_SECTOR,
  ECONOMIC_SECTOR_OPTIONS,
  type CompanyCatalogEntry,
} from "@/lib/company";
import { ROLE_OPTIONS, type AppUserRole } from "@/lib/roles";
import { SelectorBuscador } from "@/components/SelectorBuscador";

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
  role: AppUserRole;
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
  secondaryAction?: React.ReactNode;
  /**
   * Con qué arranca el formulario.
   *
   * Lo usa la bandeja de solicitudes de acceso para no hacerle retipear al
   * admin el nombre y el correo que la persona ya escribió
   * (AC Consulting, 2026-10-21).
   */
  valoresIniciales?: Partial<UserRegistrationValues>;
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
  secondaryAction,
  valoresIniciales,
}: UserRegistrationFormProps) {
  const [values, setValues] = useState<UserRegistrationValues>({ ...DEFAULT_VALUES, ...valoresIniciales });
  const [mostrarClave, setMostrarClave] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [localError, setLocalError] = useState("");

  const isBootstrap = !forceExistingCompanySelector && !isLoadingCompanies && (bootstrapRequired || companies.length === 0);
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
            // Si quien abre el formulario ya dijo con qué empresa arranca, se
            // respeta —aunque sea vacío—. Cayendo a la primera de la lista, el
            // alta desde una solicitud cuya empresa no está en el catálogo
            // salía preseleccionada con una empresa que no tiene nada que ver
            // (AC Consulting, 2026-10-22).
            companyId: valoresIniciales
              ? current.companyId
              : current.companyId || nextCompanies[0]?.id || "",
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
    // `valoresIniciales` se lee solo para saber si hay una preferencia; no se
    // vuelve a aplicar, así que no entra en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-3">
      <div className="md:grid md:grid-cols-2 md:gap-3">
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
      </div>
      <div className="md:grid md:grid-cols-2 md:gap-3">
        <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="registrationPassword" className="field-label mb-0">Contrasena</label>
          {/* La clave se entrega a mano, así que conviene que sea una buena y
              no "Empresa2026". El botón la pone en los dos campos y la deja a
              la vista, que para eso hay que copiarla (AC Consulting, 2026-10-22). */}
          <button
            type="button"
            onClick={() => {
              const nueva = generarClave();
              setValues((current) => ({ ...current, password: nueva, confirmPassword: nueva }));
              setMostrarClave(true);
            }}
            className="btn btn-secondary btn-xs"
          >
            <Wand2 className="h-3.5 w-3.5" /> Generar
          </button>
        </div>
        <input
          id="registrationPassword"
          type={mostrarClave ? "text" : "password"}
          value={values.password}
          onChange={(event) => updateValue("password", event.target.value)}
          className="field mt-1.5"
          placeholder="Minimo 8 caracteres"
          autoComplete="new-password"
          required
        />
        </div>
        <div>
        <label htmlFor="registrationConfirmPassword" className="field-label">Confirmar contrasena</label>
        <input
          id="registrationConfirmPassword"
          type={mostrarClave ? "text" : "password"}
          value={values.confirmPassword}
          onChange={(event) => updateValue("confirmPassword", event.target.value)}
          className="field"
          placeholder="Repite la contrasena"
          autoComplete="new-password"
          required
        />
        </div>
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
          {/* El envío ya exige la empresa, así que no hace falta el `required`
              nativo que traía el <select>. */}
          <SelectorBuscador
            id="registrationCompanyId"
            value={values.companyId}
            onChange={(v) => updateValue("companyId", v)}
            opciones={companies.map((company) => ({ value: company.id, label: company.name }))}
            placeholder={
              isLoadingCompanies ? "Cargando empresas..."
              : companies.length === 0 ? "No hay empresas registradas"
              : "Selecciona una empresa"
            }
            disabled={isLoadingCompanies || companies.length === 0}
          />
        </div>
      )}
      <div>
        <label htmlFor="registrationCompanyDescription" className="field-label">Descripcion de la empresa</label>
        <textarea
          id="registrationCompanyDescription"
          value={needsNewCompany ? values.companyDescription : selectedCompany?.description ?? ""}
          onChange={(event) => updateValue("companyDescription", event.target.value)}
          className="field min-h-28 resize-y md:min-h-24"
          placeholder="Descripcion general de la empresa"
          readOnly={!needsNewCompany}
        />
      </div>
      <div className="md:grid md:grid-cols-2 md:gap-3">
        <div>
          <label htmlFor="registrationEconomicSector" className="field-label">Sector economico</label>
          {needsNewCompany ? (
            <SelectorBuscador
              id="registrationEconomicSector"
              value={values.companyEconomicSector}
              onChange={updateEconomicSector}
              opciones={[{ value: "", label: "Seleccionar sector económico" }, ...ECONOMIC_SECTOR_OPTIONS.map((option) => ({ value: option, label: option }))]}
              placeholder="Seleccionar sector económico"
            />
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
            <SelectorBuscador
              id="registrationClassification"
              value={values.companyClassification}
              onChange={(v) => updateValue("companyClassification", v)}
              opciones={classificationOptions.map((option) => ({ value: option, label: option }))}
              placeholder={values.companyEconomicSector ? "Seleccionar clasificación" : "Selecciona primero un sector"}
              disabled={!values.companyEconomicSector}
            />
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
      </div>
      {allowRoleSelection ? (
        <div>
          <label htmlFor="registrationRole" className="field-label">Rol inicial</label>
          <select
            id="registrationRole"
            value={values.role}
            onChange={(event) => updateValue("role", event.target.value as AppUserRole)}
            className="field-select"
          >
            {ROLE_OPTIONS.map((roleOption) => (
              <option key={roleOption.value} value={roleOption.value}>{roleOption.label}</option>
            ))}
          </select>
        </div>
      ) : null}

      {errorMessage ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p> : null}

      <div className={`flex gap-3 ${secondaryAction ? "" : ""}`}>
        {secondaryAction}
        <button type="submit" className="btn btn-primary flex-1" disabled={isSubmitting || isLoadingCompanies}>
          {isSubmitting ? submitLabel : submitLabel}
          <span className="sr-only">{submittingLabel}</span>
        </button>
      </div>
    </form>
  );
}