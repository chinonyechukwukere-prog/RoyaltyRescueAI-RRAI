import { PhoneIcon } from "lucide-react";

interface FallbackBannerProps {
  title: string;
  message: string;
  contacts: { label: string; number: string }[];
  syntheticNotice: string;
}

export function FallbackBanner({
  title,
  message,
  contacts,
  syntheticNotice,
}: FallbackBannerProps) {
  return (
    <div
      role="complementary"
      aria-label="Emergency fallback contacts"
      className="w-full border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm"
    >
      <p className="font-semibold text-red-800">{title}</p>
      <p className="mt-0.5 text-red-700">{message}</p>
      <ul className="mt-2 space-y-1">
        {contacts.map((c) => (
          <li key={c.number} className="flex items-center gap-2 text-red-800">
            <PhoneIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="font-medium">{c.label}:</span>
            <a
              href={`tel:${c.number}`}
              className="underline underline-offset-2 hover:text-red-600"
            >
              {c.number}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-red-500 italic">{syntheticNotice}</p>
    </div>
  );
}
