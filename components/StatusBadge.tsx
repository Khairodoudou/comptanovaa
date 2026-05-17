import React from "react";

type StatusType =
  | "PROPOSED"
  | "VALIDATED"
  | "REJECTED"
  | "UPLOADED"
  | "PROCESSING"
  | "REVIEWED";

const STATUS_STYLES: Record<StatusType, string> = {
  PROPOSED:   "bg-amber-50 text-amber-700 border border-amber-200",
  VALIDATED:  "bg-green-50 text-green-700 border border-green-200",
  REJECTED:   "bg-red-50 text-red-700 border border-red-200",
  UPLOADED:   "bg-blue-50 text-blue-700 border border-blue-200",
  PROCESSING: "bg-purple-50 text-purple-700 border border-purple-200",
  REVIEWED:   "bg-sky-50 text-sky-700 border border-sky-200",
};

// Fallback French labels (used when no `label` prop is passed — comptable space)
const STATUS_FALLBACK: Record<StatusType, string> = {
  PROPOSED:   "En attente",
  VALIDATED:  "Validée",
  REJECTED:   "Rejetée",
  UPLOADED:   "Reçu",
  PROCESSING: "Traitement",
  REVIEWED:   "Vérifié",
};

export function StatusBadge({
  status,
  label,
}: {
  status: StatusType;
  label?: string;
}) {
  const className =
    STATUS_STYLES[status] ?? "bg-gray-50 text-gray-600 border border-gray-200";
  const text = label ?? STATUS_FALLBACK[status] ?? status;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {text}
    </span>
  );
}
