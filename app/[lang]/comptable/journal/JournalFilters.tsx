"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

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
}: {
  clients: { id: string; name: string }[];
  t: FiltersT;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value); else params.delete(key);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const hasFilters = searchParams.get("client") || searchParams.get("from") || searchParams.get("to");

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex flex-wrap gap-3">
        <select id="filter-client" defaultValue={searchParams.get("client") ?? ""}
          onChange={(e) => updateFilter("client", e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30">
          <option value="">{t.all_clients}</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <input id="filter-from" type="date" defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) => updateFilter("from", e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30" />

        <input id="filter-to" type="date" defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) => updateFilter("to", e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30" />

        {hasFilters && (
          <button onClick={() => router.push(pathname)}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-all">
            × {t.clear}
          </button>
        )}
      </div>
    </div>
  );
}
