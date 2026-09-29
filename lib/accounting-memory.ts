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
 * Checks if a supplier name corresponds to a known telecom operator.
 * Only telecom operators should have 626 as debit account.
 */
function isTelecomSupplierName(name: string): boolean {
  return /mobilis|djezzy|ooredoo|alg[eé]rie\s*t[eé]l[eé]com|algerie\s*telecom|\bat\b/i.test(name);
}

/**
 * Checks if a supplier name corresponds to a known utility provider.
 * Only utility suppliers should have 607 as debit account.
 */
function isUtilitySupplierName(name: string): boolean {
  return /sonelgaz|seaal|\bade\b|\bona\b|alg[eé]rienne des eaux|distribution de l['']electricite/i.test(name);
}

/**
 * Look up learned accountant preference for a specific company + supplier.
 */
export async function findAccountingMemory(
  companyId: string,
  rawSupplierName: string,
  documentType?: string
): Promise<AccountingMemoryMatch | null> {
  // Non-invoice types have strict deterministic SCF accounting rules: never use charge memory
  if (
    documentType === "CHEQUE" ||
    documentType === "BON_RECEPTION" ||
    documentType === "BON_LIVRAISON" ||
    documentType === "RELEVE_BANCAIRE"
  ) {
    return null;
  }

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
      // Safety: Never apply stock accounts (30/380) or bank accounts (512, 53, 5xx) to an invoice credit
      if (exact.debitAccount === "30" || exact.creditAccount === "380" || exact.creditAccount.startsWith("5")) {
        return null;
      }
      // Safety: Never apply 626 (telecom charges) to a non-telecom supplier
      // This prevents wrong memories from polluting purchase invoice entries
      if (exact.debitAccount.startsWith("626") && !isTelecomSupplierName(rawSupplierName)) {
        console.warn(`[AccountingMemory] Rejected 626 memory for non-telecom supplier: ${rawSupplierName}`);
        return null;
      }
      // Safety: Never apply 607 (utility charges) to a non-utility supplier
      if (exact.debitAccount.startsWith("607") && !isUtilitySupplierName(rawSupplierName)) {
        console.warn(`[AccountingMemory] Rejected 607 memory for non-utility supplier: ${rawSupplierName}`);
        return null;
      }
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
        if (mem.debitAccount === "30" || mem.creditAccount === "380" || mem.creditAccount.startsWith("5")) {
          continue;
        }
        // Skip 626/607 memory for non-matching supplier types
        if (mem.debitAccount.startsWith("626") && !isTelecomSupplierName(rawSupplierName)) continue;
        if (mem.debitAccount.startsWith("607") && !isUtilitySupplierName(rawSupplierName)) continue;
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

  // Never record stock movements, bank payments or cheques into supplier charge memory
  if (
    documentType === "CHEQUE" ||
    documentType === "BON_RECEPTION" ||
    documentType === "BON_LIVRAISON" ||
    documentType === "RELEVE_BANCAIRE" ||
    debitAccount === "30" ||
    creditAccount === "380" ||
    creditAccount === "512" ||
    debitAccount.startsWith("401")
  ) {
    return;
  }

  // CRITICAL: Never save telecom/utility accounts for non-matching suppliers.
  // This prevents a single wrong OCR run from poisoning the memory for all future invoices.
  if (debitAccount.startsWith("626") && !isTelecomSupplierName(supplierName)) {
    console.warn(`[AccountingMemory] Blocked saving 626 for non-telecom supplier: ${supplierName}`);
    return;
  }
  if (debitAccount.startsWith("607") && !isUtilitySupplierName(supplierName)) {
    console.warn(`[AccountingMemory] Blocked saving 607 for non-utility supplier: ${supplierName}`);
    return;
  }

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
