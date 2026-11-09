"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EmergencyIntakeForm } from "@/components/EmergencyIntakeForm";
import { SubmissionConfirmation } from "@/components/SubmissionConfirmation";
import { FallbackBanner } from "@/components/FallbackBanner";
import type { IncidentSubmitResponse } from "@/lib/api";

export default function ReportPage() {
  const tForm = useTranslations("form");
  const tConfirm = useTranslations("confirmation");
  const tFallback = useTranslations("fallback");
  const tNav = useTranslations("nav");

  const [submission, setSubmission] = useState<IncidentSubmitResponse | null>(
    null
  );

  const fallbackContacts = [
    {
      label: tFallback("contact1Label"),
      number: tFallback("contact1Number"),
    },
    {
      label: tFallback("contact2Label"),
      number: tFallback("contact2Number"),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-primary">
              {tNav("siteName")}
            </span>
            <span className="text-xs text-muted-foreground">
              — {tNav("portalName")}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground italic">
            {tNav("tagline")}
          </p>
        </div>
      </header>

      {/* Always-visible fallback banner */}
      <div className="mx-auto max-w-2xl px-4 pt-4">
        <FallbackBanner
          title={tFallback("bannerTitle")}
          message={tFallback("bannerMessage")}
          contacts={fallbackContacts}
          syntheticNotice={tFallback("syntheticNotice")}
        />
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        {submission ? (
          <div className="rounded-xl border border-border bg-white p-8 shadow-sm">
            <SubmissionConfirmation
              referenceNumber={submission.reference_number}
              strings={{
                title: tConfirm("title"),
                message: tConfirm("message"),
                referenceLabel: tConfirm("referenceLabel"),
                referenceNote: tConfirm("referenceNote"),
                nextSteps: tConfirm("nextSteps"),
                nextStep1: tConfirm("nextStep1"),
                nextStep2: tConfirm("nextStep2"),
                nextStep3: tConfirm("nextStep3"),
                agentNote: tConfirm("agentNote"),
                submitAnother: tConfirm("submitAnother"),
              }}
              onReset={() => setSubmission(null)}
            />
            {/* Keep the fallback banner visible on confirmation too */}
            <div className="mt-8">
              <FallbackBanner
                title={tFallback("bannerTitle")}
                message={tFallback("bannerMessage")}
                contacts={fallbackContacts}
                syntheticNotice={tFallback("syntheticNotice")}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-white p-8 shadow-sm">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-foreground">
                {tForm("pageTitle")}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {tForm("pageSubtitle")}
              </p>
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                {tForm("syntheticDataNotice")}
              </p>
            </div>

            <EmergencyIntakeForm onSuccess={(result) => setSubmission(result)} />
          </div>
        )}
      </main>
    </div>
  );
}
