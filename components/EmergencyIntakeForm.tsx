"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { submitIncident, type IncidentSubmitResponse } from "@/lib/api";

// ---------------------------------------------------------------------------
// Zod schema — mirrors Architecture §4 POST /api/incidents request shape
// ---------------------------------------------------------------------------
const incidentSchema = z.object({
  caller_name: z.string().min(1, "Please enter your name"),
  caller_phone: z.string().min(5, "Please enter a valid contact number"),
  location_description: z.string().min(3, "Please describe the location"),
  lga: z.string().min(1, "Please enter the LGA"),
  presenting_complaint: z.string().min(5, "Please describe what is happening"),
  emergency_type: z.string().min(1, "Please select an emergency type"),
  // HTML number inputs provide strings; validate as string then cast at submit
  persons_affected: z
    .string()
    .refine((v) => !isNaN(parseInt(v, 10)) && parseInt(v, 10) >= 1, {
      message: "Minimum 1 person",
    }),
  preferred_language: z.string().min(1, "Please select a language"),
  consent_given: z.literal(true, {
    errorMap: () => ({ message: "You must provide consent to submit this request" }),
  }),
});

type IncidentFormData = z.infer<typeof incidentSchema>;

interface EmergencyIntakeFormProps {
  onSuccess: (result: IncidentSubmitResponse) => void;
}

// ---------------------------------------------------------------------------
// Reusable inline error
// ---------------------------------------------------------------------------
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-center gap-1 text-sm text-red-600 mt-1">
      <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Main form component
// ---------------------------------------------------------------------------
export function EmergencyIntakeForm({ onSuccess }: EmergencyIntakeFormProps) {
  const t = useTranslations("form");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IncidentFormData>({
    resolver: zodResolver(incidentSchema),
  });

  const onSubmit = async (data: IncidentFormData) => {
    setSubmitError(null);
    try {
      const result = await submitIncident({
        ...data,
        persons_affected: parseInt(data.persons_affected, 10),
      });
      onSuccess(result);
    } catch {
      setSubmitError(t("submitError"));
    }
  };

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-8">

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — Caller Information                                       */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="section-caller">
        <div className="mb-4">
          <h2
            id="section-caller"
            className="text-base font-semibold text-foreground"
          >
            {t("sectionCallerInfo")}
          </h2>
          {/* Human-reviewed Nigerian Pidgin phrase — see messages/README.md */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("sectionCallerInfoPidgin")}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Caller Name */}
          <div className="space-y-1.5">
            <Label htmlFor="caller_name">{t("callerName.label")}</Label>
            <Input
              id="caller_name"
              type="text"
              placeholder={t("callerName.placeholder")}
              autoComplete="name"
              aria-invalid={!!errors.caller_name}
              aria-describedby={errors.caller_name ? "caller_name_error" : undefined}
              {...register("caller_name")}
            />
            <FieldError message={errors.caller_name?.message} />
          </div>

          {/* Contact Number */}
          <div className="space-y-1.5">
            <Label htmlFor="caller_phone">{t("callerPhone.label")}</Label>
            <Input
              id="caller_phone"
              type="tel"
              placeholder={t("callerPhone.placeholder")}
              autoComplete="tel"
              aria-invalid={!!errors.caller_phone}
              aria-describedby={
                errors.caller_phone ? "caller_phone_error" : "caller_phone_desc"
              }
              {...register("caller_phone")}
            />
            <p id="caller_phone_desc" className="text-xs text-muted-foreground">
              {t("callerPhone.description")}
            </p>
            <FieldError message={errors.caller_phone?.message} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Emergency Details                                        */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="section-emergency">
        <div className="mb-4">
          <h2
            id="section-emergency"
            className="text-base font-semibold text-foreground"
          >
            {t("sectionEmergencyDetails")}
          </h2>
          {/* Human-reviewed Nigerian Pidgin phrase — see messages/README.md */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("sectionEmergencyDetailsPidgin")}
          </p>
        </div>

        <div className="space-y-5">
          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="location_description">
              {t("locationDescription.label")}
            </Label>
            <Input
              id="location_description"
              type="text"
              placeholder={t("locationDescription.placeholder")}
              aria-invalid={!!errors.location_description}
              aria-describedby="location_desc"
              {...register("location_description")}
            />
            {/* Human-reviewed Pidgin + English description */}
            <p id="location_desc" className="text-xs text-muted-foreground">
              {t("locationDescription.description")} —{" "}
              <span className="italic">{t("locationDescription.descriptionPidgin")}</span>
            </p>
            <FieldError message={errors.location_description?.message} />
          </div>

          {/* LGA */}
          <div className="space-y-1.5">
            <Label htmlFor="lga">{t("lga.label")}</Label>
            <Input
              id="lga"
              type="text"
              placeholder={t("lga.placeholder")}
              aria-invalid={!!errors.lga}
              {...register("lga")}
            />
            <FieldError message={errors.lga?.message} />
          </div>

          {/* Emergency Type + Persons Affected */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Emergency Type */}
            <div className="space-y-1.5">
              <Label htmlFor="emergency_type">{t("emergencyType.label")}</Label>
              <select
                id="emergency_type"
                aria-invalid={!!errors.emergency_type}
                className={cn(inputClass, "appearance-none")}
                defaultValue=""
                {...register("emergency_type")}
              >
                <option value="" disabled>
                  {t("emergencyType.placeholder")}
                </option>
                <option value="cardiac">{t("emergencyType.options.cardiac")}</option>
                <option value="trauma">{t("emergencyType.options.trauma")}</option>
                <option value="obstetric">{t("emergencyType.options.obstetric")}</option>
                <option value="pediatric">{t("emergencyType.options.pediatric")}</option>
                <option value="neurological">
                  {t("emergencyType.options.neurological")}
                </option>
                <option value="burns">{t("emergencyType.options.burns")}</option>
                <option value="general_medical">
                  {t("emergencyType.options.general_medical")}
                </option>
              </select>
              <FieldError message={errors.emergency_type?.message} />
            </div>

            {/* Persons Affected */}
            <div className="space-y-1.5">
              <Label htmlFor="persons_affected">
                {t("personsAffected.label")}
              </Label>
              <Input
                id="persons_affected"
                type="number"
                min={1}
                placeholder={t("personsAffected.placeholder")}
                aria-invalid={!!errors.persons_affected}
                {...register("persons_affected")}
              />
              <FieldError message={errors.persons_affected?.message} />
            </div>
          </div>

          {/* Presenting Complaint */}
          <div className="space-y-1.5">
            <Label htmlFor="presenting_complaint">
              {t("presentingComplaint.label")}
            </Label>
            <Textarea
              id="presenting_complaint"
              rows={4}
              placeholder={t("presentingComplaint.placeholder")}
              aria-invalid={!!errors.presenting_complaint}
              aria-describedby="complaint_desc"
              {...register("presenting_complaint")}
            />
            {/* Human-reviewed Pidgin phrase — see messages/README.md */}
            <p id="complaint_desc" className="text-xs text-muted-foreground italic">
              {t("presentingComplaint.descriptionPidgin")}
            </p>
            <FieldError message={errors.presenting_complaint?.message} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Language Preference                                      */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="section-language">
        <h2
          id="section-language"
          className="text-base font-semibold text-foreground mb-4"
        >
          {t("sectionLanguagePreference")}
        </h2>

        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="preferred_language">{t("preferredLanguage.label")}</Label>
          <select
            id="preferred_language"
            aria-invalid={!!errors.preferred_language}
            aria-describedby="lang_desc"
            className={cn(inputClass, "appearance-none")}
            defaultValue=""
            {...register("preferred_language")}
          >
            <option value="" disabled>
              — Select —
            </option>
            <option value="en">{t("preferredLanguage.options.en")}</option>
            <option value="pcm">{t("preferredLanguage.options.pcm")}</option>
            <option value="ha">{t("preferredLanguage.options.ha")}</option>
            <option value="yo">{t("preferredLanguage.options.yo")}</option>
            <option value="ig">{t("preferredLanguage.options.ig")}</option>
            <option value="other">{t("preferredLanguage.options.other")}</option>
          </select>
          <p id="lang_desc" className="text-xs text-muted-foreground">
            {t("preferredLanguage.description")}
          </p>
          <FieldError message={errors.preferred_language?.message} />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Consent                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="section-consent">
        <div className="rounded-lg border border-border bg-secondary/30 px-4 py-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="consent_given"
              aria-invalid={!!errors.consent_given}
              aria-describedby={errors.consent_given ? "consent_error" : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring"
              {...register("consent_given")}
            />
            <span className="text-sm text-foreground leading-relaxed">
              {t("consent.label")}
            </span>
          </label>
          {errors.consent_given && (
            <p id="consent_error" role="alert" className="flex items-center gap-1 text-sm text-red-600 mt-2 ml-7">
              <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {errors.consent_given?.message}
            </p>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Submit error                                                         */}
      {/* ------------------------------------------------------------------ */}
      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {submitError}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Submit button                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              {t("submitting")}
            </>
          ) : (
            t("submit")
          )}
        </button>
      </div>
    </form>
  );
}
