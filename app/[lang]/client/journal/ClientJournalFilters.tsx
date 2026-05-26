"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface FiltersT {
  filter_account: string;
  clear: string;
}

export function ClientJournalFilters({
  filterAccountPlaceholder,
  clearLabel,
  tStatuses,
}: {
  filterAccountPlaceholder: string;
  clearLabel: string;
  tStatuses: { all: string; proposed: string; validated: string; rejected: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const hasFilters =
    searchParams.get("from") || searchParams.get("to") || searchParams.get("status");

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex flex-wrap gap-3">
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
            onClick={() => router.push(pathname)}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            × {clearLabel}
          </button>
        )}
      </div>
    </div>
  );
}
