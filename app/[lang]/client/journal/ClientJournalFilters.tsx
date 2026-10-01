"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { JournalSortToggle } from "@/components/JournalSortToggle";

interface FiltersT {
  filter_account: string;
  clear: string;
}

export function ClientJournalFilters({
  filterAccountPlaceholder,
  clearLabel,
  tStatuses,
  lang = "fr",
}: {
  filterAccountPlaceholder: string;
  clearLabel: string;
  tStatuses: { all: string; proposed: string; validated: string; rejected: string };
  lang?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const hasFilters =
    searchParams.get("from") ||
    searchParams.get("to") ||
    searchParams.get("status") ||
    searchParams.get("sort");

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="client-journal-filter-status"
            defaultValue={searchParams.get("status") ?? ""}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2d8f5e]/30"
          >
            <option value="">{tStatuses.all}</option>
            <option value="VALIDATED">{tStatuses.validated}</option>
            <option value="PROPOSED">{tStatuses.proposed}</option>
            <option value="REJECTED">{tStatuses.rejected}</option>
          </select>
          <input
            id="client-journal-filter-from"
            type="date"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(e) => updateFilter("from", e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2d8f5e]/30"
          />
          <input
            id="client-journal-filter-to"
            type="date"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(e) => updateFilter("to", e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2d8f5e]/30"
          />
          {hasFilters && (
            <button
              onClick={() => router.push(pathname, { scroll: false })}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer font-medium"
            >
              × {clearLabel}
            </button>
          )}
        </div>

        <div className="flex items-center pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <JournalSortToggle lang={lang} />
        </div>
      </div>
    </div>
  );
}
