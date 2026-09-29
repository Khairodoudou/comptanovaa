import { db } from "@/lib/db";

/**
 * Normalizes supplier/client names for robust memory matching.
 * e.g. "SARL CONDOR ELECTRONICS" -> "CONDOR ELECTRONICS"
 *      "Eurl Algérie Télécom" -> "ALGERIE TELECOM"
 */
export function normalizeSupplierName(name: string): string {
  if (!name) return "";
  let clean = name
    .trim()
    .toUpperCase()
    // Normalize accents
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Remove common Algerian company prefixes / suffixes
    .replace(/\b(SARL|EURL|SPA|SNC|ETS|STE|SOCIETE|ENTREPRISE|COMPAGNIE)\b/gi, "")
    // Remove punctuation
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return clean || name.trim().toUpperCase();
}

export interface AccountingMemoryMatch {
  id: string;
  supplierName: string;
  debitAccount: string;
  creditAccount: string;
  tvaRate: number | null;
  isExempt: boolean;
  suggestedDesc: string | null;
  usageCount: number;
}

/**
 * Look up learned accountant preference for a specific company + supplier.
 */
export async function findAccountingMemory(
  companyId: string,
  rawSupplierName: string,
  documentType?: string
): Promise<AccountingMemoryMatch | null> {
  if (!companyId || !rawSupplierName || rawSupplierName === "Inconnu") {
    return null;
  }

  const normalized = normalizeSupplierName(rawSupplierName);
  if (!normalized || normalized.length < 2) return null;

  try {
    // 1. Direct match on normalized name
    const exact = await db.accountingMemory.findFirst({
      where: {
        companyId,
        supplierName: normalized,
      },
    });

    if (exact) {
      return {
        id: exact.id,
        supplierName: exact.supplierName,
        debitAccount: exact.debitAccount,
        creditAccount: exact.creditAccount,
        tvaRate: exact.tvaRate,
        isExempt: exact.isExempt,
        suggestedDesc: exact.suggestedDesc,
        usageCount: exact.usageCount,
      };
    }

    // 2. Fuzzy match across all saved memories for this company
    const memories = await db.accountingMemory.findMany({
      where: { companyId },
    });

    for (const mem of memories) {
      const memNorm = mem.supplierName;
      // If either contains the other (e.g. "SONELGAZ" in "SONELGAZ DISTRIBUTION")
      if (
        (memNorm.length >= 3 && normalized.includes(memNorm)) ||
        (normalized.length >= 3 && memNorm.includes(normalized))
      ) {
        return {
          id: mem.id,
          supplierName: mem.supplierName,
          debitAccount: mem.debitAccount,
          creditAccount: mem.creditAccount,
          tvaRate: mem.tvaRate,
          isExempt: mem.isExempt,
          suggestedDesc: mem.suggestedDesc,
          usageCount: mem.usageCount,
        };
      }
    }
  } catch (err) {
    console.error("[AccountingMemory] Lookup error:", err);
  }

  return null;
}

/**
 * Record or update accountant preference when an entry is validated or corrected.
 */
export async function recordAccountingMemory(params: {
  companyId: string;
  supplierName: string;
  documentType?: string;
  debitAccount: string;
  creditAccount: string;
  tvaRate?: number | null;
  isExempt?: boolean;
  suggestedDesc?: string;
}): Promise<void> {
  const {
    companyId,
    supplierName,
    documentType,
    debitAccount,
    creditAccount,
    tvaRate,
    isExempt = false,
    suggestedDesc,
  } = params;

  if (!companyId || !supplierName || supplierName === "Inconnu") return;

  const normalized = normalizeSupplierName(supplierName);
  if (!normalized || normalized.length < 2) return;

  // Don't learn default fallback 380 if no specific customization was made,
  // but learn any 6xx charges, 21x assets, specific 38x, or customized 401/411 subaccounts.
  try {
    const existing = await db.accountingMemory.findUnique({
      where: {
        companyId_supplierName: {
          companyId,
          supplierName: normalized,
        },
      },
    });

    if (existing) {
      await db.accountingMemory.update({
        where: { id: existing.id },
        data: {
          debitAccount,
          creditAccount,
          documentType: documentType || existing.documentType,
          tvaRate: tvaRate !== undefined ? tvaRate : existing.tvaRate,
          isExempt: isExempt ?? existing.isExempt,
          suggestedDesc: suggestedDesc || existing.suggestedDesc,
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    } else {
      await db.accountingMemory.create({
        data: {
          companyId,
          supplierName: normalized,
          documentType: documentType || null,
          debitAccount,
          creditAccount,
          tvaRate: tvaRate ?? null,
          isExempt,
          suggestedDesc: suggestedDesc || null,
          usageCount: 1,
          lastUsedAt: new Date(),
        },
      });
    }
    console.log(`[AccountingMemory] Saved preference for ${normalized}: D=${debitAccount} / C=${creditAccount}`);
  } catch (err) {
    console.error("[AccountingMemory] Failed to record preference:", err);
  }
}
