"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronDown, AlertCircle } from "lucide-react";

interface Comptable {
  id: string;
  name: string;
  email: string;
}

interface ComptableSelectorProps {
  comptables: Comptable[];
  currentId: string | null;
  lang: string;
  isRtl: boolean;
}

const LABELS = {
  fr: {
    select_placeholder: "Sélectionner un comptable...",
    confirm_btn: "Confirmer l'assignation",
    change_btn: "Changer de comptable",
    saving: "Enregistrement...",
    success: "Comptable assigné avec succès !",
    error_generic: "Une erreur est survenue. Réessayez.",
    no_comptables: "Aucun comptable disponible.",
  },
  en: {
    select_placeholder: "Select an accountant...",
    confirm_btn: "Confirm assignment",
    change_btn: "Change accountant",
    saving: "Saving...",
    success: "Accountant assigned successfully!",
    error_generic: "An error occurred. Please try again.",
    no_comptables: "No accountant available.",
  },
  ar: {
    select_placeholder: "اختر محاسباً...",
    confirm_btn: "تأكيد التعيين",
    change_btn: "تغيير المحاسب",
    saving: "جارٍ الحفظ...",
    success: "تم تعيين المحاسب بنجاح!",
    error_generic: "حدث خطأ. يرجى المحاولة مجدداً.",
    no_comptables: "لا يوجد محاسب متاح.",
  },
} as const;

export function ComptableSelector({
  comptables,
  currentId,
  lang,
  isRtl,
}: ComptableSelectorProps) {
  const router = useRouter();
  const l = LABELS[lang as keyof typeof LABELS] ?? LABELS.fr;

  const [selectedId, setSelectedId] = useState<string>(currentId ?? "");
  const [showSelector, setShowSelector] = useState(!currentId);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState(""); // BUG FIX #5: Missing error state

  // BUG FIX #6: Sync internal state when parent prop updates after router.refresh()
  useEffect(() => {
    setSelectedId(currentId ?? "");
    setShowSelector(!currentId);
    setSuccessMsg("");
    setErrorMsg("");
  }, [currentId]);

  async function handleAssign() {
    if (!selectedId || selectedId === currentId) return;
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/client/assign-comptable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comptableId: selectedId }),
      });

      if (res.ok) {
        setSuccessMsg(l.success);
        setShowSelector(false);
        router.refresh();
      } else {
        // BUG FIX #5: Handle non-ok responses instead of silently failing
        const data = await res.json().catch(() => ({}));
        setErrorMsg((data as { error?: string }).error ?? l.error_generic);
      }
    } catch {
      // BUG FIX #5: Handle network errors
      setErrorMsg(l.error_generic);
    } finally {
      setLoading(false);
    }
  }

  if (comptables.length === 0) {
    return <p className="text-sm text-[#64748b] italic">{l.no_comptables}</p>;
  }

  return (
    <div className="space-y-3">
      {/* Success message */}
      {successMsg && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle size={14} className="shrink-0" />
          {successMsg}
        </div>
      )}

      {/* BUG FIX #5: Error message */}
      {errorMsg && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Toggle to show selector */}
      {currentId && !showSelector && (
        <button
          id="change-comptable-btn"
          onClick={() => setShowSelector(true)}
          className="text-sm text-[#1a6fbf] hover:underline font-medium"
        >
          {l.change_btn}
        </button>
      )}

      {/* Selector panel */}
      {showSelector && (
        <div className="space-y-3 pt-1">
          <div className="relative">
            <select
              id="comptable-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              dir={isRtl ? "rtl" : "ltr"}
              className={`w-full appearance-none border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-[#0f172a] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30 ${isRtl ? "pl-10" : "pr-10"}`}
            >
              <option value="">{l.select_placeholder}</option>
              {comptables.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.email}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? "left-3" : "right-3"} text-[#64748b] pointer-events-none`}
            />
          </div>

          <div className="flex gap-2">
            <button
              id="confirm-assign-btn"
              onClick={handleAssign}
              disabled={!selectedId || selectedId === currentId || loading}
              className="flex-1 py-2.5 bg-[#1a6fbf] hover:bg-[#185fa5] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all"
            >
              {loading ? l.saving : l.confirm_btn}
            </button>
            {currentId && (
              <button
                onClick={() => {
                  setShowSelector(false);
                  setSelectedId(currentId);
                  setErrorMsg("");
                }}
                className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-[#64748b] hover:bg-gray-50 transition-all"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
