"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { JournalSortToggle } from "@/components/JournalSortToggle";

interface FiltersT {
  all_statuses: string;
  all_clients: string;
  clear: string;
  proposed: string;
  validated: string;
  rejected: string;
}

export function JournalFilters({
  clients,
  t,
  lang = "fr",
}: {
  clients: { id: string; name: string }[];
  t: FiltersT;
  lang?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value); else params.delete(key);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const hasFilters =
    searchParams.get("client") ||
    searchParams.get("from") ||
    searchParams.get("to") ||
    searchParams.get("sort");

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="filter-client"
            defaultValue={searchParams.get("client") ?? ""}
            onChange={(e) => updateFilter("client", e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30"
          >
            <option value="">{t.all_clients}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            id="filter-from"
            type="date"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(e) => updateFilter("from", e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30"
          />

          <input
            id="filter-to"
            type="date"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(e) => updateFilter("to", e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30"
          />

          {hasFilters && (
            <button
              onClick={() => router.push(pathname, { scroll: false })}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer font-medium"
            >
              × {t.clear}
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
