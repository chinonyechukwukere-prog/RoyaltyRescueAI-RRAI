import { CheckCircleIcon } from "lucide-react";

interface SubmissionConfirmationProps {
  referenceNumber: string;
  strings: {
    title: string;
    message: string;
    referenceLabel: string;
    referenceNote: string;
    nextSteps: string;
    nextStep1: string;
    nextStep2: string;
    nextStep3: string;
    agentNote: string;
    submitAnother: string;
  };
  onReset: () => void;
}

export function SubmissionConfirmation({
  referenceNumber,
  strings,
  onReset,
}: SubmissionConfirmationProps) {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-4">
        <CheckCircleIcon
          className="h-14 w-14 text-green-600"
          aria-hidden="true"
        />
      </div>
      <h2 className="text-2xl font-bold text-foreground">{strings.title}</h2>
      <p className="mt-2 text-muted-foreground">{strings.message}</p>

      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-6 py-4">
        <p className="text-sm font-medium text-green-800">{strings.referenceLabel}</p>
        <p className="mt-1 text-3xl font-bold tracking-widest text-green-700">
          {referenceNumber}
        </p>
        <p className="mt-2 text-xs text-green-600">{strings.referenceNote}</p>
      </div>

      <div className="mt-6 text-left rounded-lg border border-border bg-secondary/40 px-5 py-4">
        <p className="font-semibold text-sm text-foreground mb-2">{strings.nextSteps}</p>
        <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
          <li>{strings.nextStep1}</li>
          <li>{strings.nextStep2}</li>
          <li>{strings.nextStep3}</li>
        </ol>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">{strings.agentNote}</p>

      <button
        type="button"
        onClick={onReset}
        className="mt-6 text-sm text-primary underline underline-offset-2 hover:opacity-70"
      >
        {strings.submitAnother}
      </button>
    </div>
  );
}
