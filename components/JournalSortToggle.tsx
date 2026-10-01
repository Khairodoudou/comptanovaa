"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Calendar } from "lucide-react";

export function JournalSortToggle({
  lang = "fr",
  variant = "segmented",
  className = "",
}: {
  lang?: string;
  variant?: "segmented" | "badge";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // "desc" is the modern default (most recent first), "asc" is chronological (oldest first)
  const currentSort = searchParams.get("sort") === "asc" ? "asc" : "desc";

  const handleSort = (target: "asc" | "desc") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", target);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const toggleSort = () => {
    handleSort(currentSort === "desc" ? "asc" : "desc");
  };

  const isAr = lang === "ar";
  const isEn = lang === "en";

  if (variant === "badge") {
    return (
      <button
        type="button"
        onClick={toggleSort}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-xs transition-all cursor-pointer group hover:border-teal-300 ${className}`}
        title={
          isAr
            ? "انقر لتبديل الترتيب بين الأحدث والأقدم"
            : isEn
            ? "Click to toggle date sort order"
            : "Cliquer pour basculer le tri par date"
        }
      >
        <span className="text-teal-600 font-black group-hover:scale-110 transition-transform">
          {currentSort === "desc" ? "↓" : "↑"}
        </span>
        <span className="text-slate-800">
          {isAr
            ? currentSort === "desc"
              ? "مرتب: الأحدث أولاً"
              : "مرتب: الأقدم أولاً"
            : isEn
            ? currentSort === "desc"
              ? "Sorted: Newest first"
              : "Sorted: Oldest first"
            : currentSort === "desc"
            ? "Trié : Plus récent d'abord"
            : "Trié : Plus ancien d'abord"}
        </span>
        <ArrowUpDown size={12} className="text-slate-400 group-hover:text-teal-600 transition-colors ml-0.5" />
      </button>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
        <Calendar size={13} className="text-teal-600" />
        <span>
          {isAr ? "الترتيب حسب التاريخ :" : isEn ? "Sort by date:" : "Trier par date :"}
        </span>
      </span>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/90 shadow-inner">
        <button
          type="button"
          onClick={() => handleSort("desc")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            currentSort === "desc"
              ? "bg-white text-teal-800 shadow-sm border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900"
          }`}
          title={
            isAr
              ? "من الأحدث إلى الأقدم"
              : isEn
              ? "Newest to oldest date"
              : "Du plus récent au plus ancien"
          }
        >
          <ArrowDown
            size={13}
            className={currentSort === "desc" ? "text-teal-600 stroke-[2.5]" : "text-slate-400"}
          />
          <span>{isAr ? "الأحدث أولاً" : isEn ? "Newest" : "Plus récent"}</span>
        </button>

        <button
          type="button"
          onClick={() => handleSort("asc")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            currentSort === "asc"
              ? "bg-white text-teal-800 shadow-sm border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900"
          }`}
          title={
            isAr
              ? "من الأقدم إلى الأحدث (الترتيب الزمني المحاسبي)"
              : isEn
              ? "Oldest to newest date (Chronological)"
              : "Du plus ancien au plus récent (Ordre chronologique)"
          }
        >
          <ArrowUp
            size={13}
            className={currentSort === "asc" ? "text-teal-600 stroke-[2.5]" : "text-slate-400"}
          />
          <span>{isAr ? "الأقدم أولاً" : isEn ? "Oldest" : "Plus ancien"}</span>
        </button>
      </div>
    </div>
  );
}
