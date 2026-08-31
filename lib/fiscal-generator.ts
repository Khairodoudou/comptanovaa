import { db } from "@/lib/db";
import { DEFAULT_FISCAL_RULES } from "@/lib/fiscal-rules";

/**
 * Ensures standard fiscal rules exist in database, then creates/updates
 * FiscalDeadline records for a company and year.
 */
export async function generateFiscalDeadlinesForCompany(
  companyId: string,
  year: number = new Date().getFullYear()
) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { id: true, regimeFiscal: true, name: true },
  });

  if (!company) return [];

  const regime = company.regimeFiscal === "FORFAITAIRE" ? "FORFAITAIRE" : "REEL";

  // 1. Seed or retrieve DB rules for this regime
  const rules = await Promise.all(
    DEFAULT_FISCAL_RULES.filter((r) => r.regimeFiscal === regime).map(async (r) => {
      const existing = await db.fiscalRule.findFirst({
        where: { regimeFiscal: r.regimeFiscal, taxType: r.taxType },
      });
      if (existing) return existing;
      return await db.fiscalRule.create({
        data: {
          regimeFiscal: r.regimeFiscal,
          taxType: r.taxType,
          label: r.label,
          form: r.form,
          frequency: r.frequency,
          description: r.description,
          dueDay: r.dueDay ?? 20,
          dueMonth: r.dueMonth ?? null,
          offsetMonths: r.offsetMonths ?? null,
        },
      });
    })
  );

  const deadlinesToCreate: Array<{
    companyId: string;
    fiscalRuleId?: string;
    fiscalYear: number;
    period: string;
    taxType: string;
    label: string;
    form: string;
    dueDate: Date;
    status: "UPCOMING" | "COMPLETED" | "OVERDUE";
  }> = [];

  const now = new Date();

  const getStatus = (dueDate: Date): "UPCOMING" | "OVERDUE" => {
    return dueDate < now ? "OVERDUE" : "UPCOMING";
  };

  if (regime === "REEL") {
    // A. Monthly TVA G50 & IRG Salaires (12 months)
    for (let m = 1; m <= 12; m++) {
      const opMonthStr = m.toString().padStart(2, "0");
      const periodLabel = `${year}-${opMonthStr}`;

      // Due on 20th of the next month
      // e.g. for month 12, due Jan 20 of year + 1
      const dueYear = m === 12 ? year + 1 : year;
      const dueMonth = m === 12 ? 0 : m; // 0-indexed month: 0=Jan
      const dueDate = new Date(Date.UTC(dueYear, dueMonth, 20, 23, 59, 59));

      const tvaRule = rules.find((r) => r.taxType === "G50_TVA_MENSUEL");
      deadlinesToCreate.push({
        companyId,
        fiscalRuleId: tvaRule?.id,
        fiscalYear: year,
        period: `Opérations ${periodLabel}`,
        taxType: "G50_TVA_MENSUEL",
        label: `G50 — TVA (${opMonthStr}/${year})`,
        form: "G50",
        dueDate,
        status: getStatus(dueDate),
      });

      const irgRule = rules.find((r) => r.taxType === "G50_IRG_MENSUEL");
      deadlinesToCreate.push({
        companyId,
        fiscalRuleId: irgRule?.id,
        fiscalYear: year,
        period: `Salaires ${periodLabel}`,
        taxType: "G50_IRG_MENSUEL",
        label: `G50 — IRG Salaires (${opMonthStr}/${year})`,
        form: "G50",
        dueDate,
        status: getStatus(dueDate),
      });
    }

    // B. IBS Acomptes & Déclarations Annuelles
    // 1. Acompte 1: 20 Mars
    const dMarch20 = new Date(Date.UTC(year, 2, 20, 23, 59, 59));
    const acompte1Rule = rules.find((r) => r.taxType === "IBS_ACOMPTE1");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: acompte1Rule?.id,
      fiscalYear: year,
      period: `Exercice ${year}`,
      taxType: "IBS_ACOMPTE1",
      label: `IBS — Acompte n°1 (${year})`,
      form: "G50 / Bordereau",
      dueDate: dMarch20,
      status: getStatus(dMarch20),
    });

    // 2. G4 Liasse Fiscale: 30 Avril
    const dApril30 = new Date(Date.UTC(year, 3, 30, 23, 59, 59));
    const g4Rule = rules.find((r) => r.taxType === "IBS_G4_LIASSE");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: g4Rule?.id,
      fiscalYear: year,
      period: `Exercice ${year - 1}`,
      taxType: "IBS_G4_LIASSE",
      label: `G4 — Déclaration annuelle & Liasse (${year})`,
      form: "G4 + Liasse",
      dueDate: dApril30,
      status: getStatus(dApril30),
    });

    // 3. Solde de liquidation: 20 Mai
    const dMay20 = new Date(Date.UTC(year, 4, 20, 23, 59, 59));
    const soldeRule = rules.find((r) => r.taxType === "IBS_SOLDE");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: soldeRule?.id,
      fiscalYear: year,
      period: `Solde Exercice ${year - 1}`,
      taxType: "IBS_SOLDE",
      label: `IBS — Solde de liquidation (${year})`,
      form: "Bordereau",
      dueDate: dMay20,
      status: getStatus(dMay20),
    });

    // 4. Acompte 2: 20 Juin
    const dJune20 = new Date(Date.UTC(year, 5, 20, 23, 59, 59));
    const acompte2Rule = rules.find((r) => r.taxType === "IBS_ACOMPTE2");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: acompte2Rule?.id,
      fiscalYear: year,
      period: `Exercice ${year}`,
      taxType: "IBS_ACOMPTE2",
      label: `IBS — Acompte n°2 (${year})`,
      form: "Bordereau",
      dueDate: dJune20,
      status: getStatus(dJune20),
    });

    // 5. Acompte 3: 20 Novembre
    const dNov20 = new Date(Date.UTC(year, 10, 20, 23, 59, 59));
    const acompte3Rule = rules.find((r) => r.taxType === "IBS_ACOMPTE3");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: acompte3Rule?.id,
      fiscalYear: year,
      period: `Exercice ${year}`,
      taxType: "IBS_ACOMPTE3",
      label: `IBS — Acompte n°3 (${year})`,
      form: "Bordereau",
      dueDate: dNov20,
      status: getStatus(dNov20),
    });
  } else {
    // ──────────────── FORFAITAIRE — IFU ────────────────
    // 1. G12 Prévisionnelle: 30 Juin
    const dJune30 = new Date(Date.UTC(year, 5, 30, 23, 59, 59));
    const g12Rule = rules.find((r) => r.taxType === "G12_PREVISIONNELLE");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: g12Rule?.id,
      fiscalYear: year,
      period: `Exercice ${year}`,
      taxType: "G12_PREVISIONNELLE",
      label: `G12 — Déclaration prévisionnelle IFU (50%)`,
      form: "G12",
      dueDate: dJune30,
      status: getStatus(dJune30),
    });

    // 2. Tranche 2 (25%): 15 Septembre
    const dSept15 = new Date(Date.UTC(year, 8, 15, 23, 59, 59));
    const ifu2Rule = rules.find((r) => r.taxType === "IFU_TRANCHE2");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: ifu2Rule?.id,
      fiscalYear: year,
      period: `Exercice ${year}`,
      taxType: "IFU_TRANCHE2",
      label: `IFU — 2ème tranche (25%)`,
      form: "G12",
      dueDate: dSept15,
      status: getStatus(dSept15),
    });

    // 3. Tranche 3 (25%): 15 Décembre
    const dDec15 = new Date(Date.UTC(year, 11, 15, 23, 59, 59));
    const ifu3Rule = rules.find((r) => r.taxType === "IFU_TRANCHE3");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: ifu3Rule?.id,
      fiscalYear: year,
      period: `Exercice ${year}`,
      taxType: "IFU_TRANCHE3",
      label: `IFU — 3ème tranche (25%)`,
      form: "G12",
      dueDate: dDec15,
      status: getStatus(dDec15),
    });

    // 4. G12 Bis Définitive: 20 Janvier N+1
    const dJan20Next = new Date(Date.UTC(year + 1, 0, 20, 23, 59, 59));
    const g12BisRule = rules.find((r) => r.taxType === "G12_BIS_DEFINITIVE");
    deadlinesToCreate.push({
      companyId,
      fiscalRuleId: g12BisRule?.id,
      fiscalYear: year,
      period: `Exercice ${year}`,
      taxType: "G12_BIS_DEFINITIVE",
      label: `G12 Bis — Déclaration définitive CA (${year})`,
      form: "G12 Bis",
      dueDate: dJan20Next,
      status: getStatus(dJan20Next),
    });

    // 5. G50 IRG Salaires Trimestriel
    const quarters = [
      { q: "T1", label: "T1 (Janvier - Mars)", due: new Date(Date.UTC(year, 3, 20, 23, 59, 59)) },
      { q: "T2", label: "T2 (Avril - Juin)", due: new Date(Date.UTC(year, 6, 20, 23, 59, 59)) },
      { q: "T3", label: "T3 (Juillet - Septembre)", due: new Date(Date.UTC(year, 9, 20, 23, 59, 59)) },
      { q: "T4", label: "T4 (Octobre - Décembre)", due: new Date(Date.UTC(year + 1, 0, 20, 23, 59, 59)) },
    ];
    const irgTrimRule = rules.find((r) => r.taxType === "G50_IRG_TRIMESTRIEL");
    for (const q of quarters) {
      deadlinesToCreate.push({
        companyId,
        fiscalRuleId: irgTrimRule?.id,
        fiscalYear: year,
        period: `${q.q} ${year}`,
        taxType: "G50_IRG_TRIMESTRIEL",
        label: `G50 — IRG Salaires ${q.label}`,
        form: "G50",
        dueDate: q.due,
        status: getStatus(q.due),
      });
    }
  }

  // Insert deadlines without duplicates
  const created: any[] = [];
  for (const item of deadlinesToCreate) {
    const existing = await db.fiscalDeadline.findFirst({
      where: {
        companyId: item.companyId,
        fiscalYear: item.fiscalYear,
        taxType: item.taxType,
        period: item.period,
      },
    });

    if (!existing) {
      const c = await db.fiscalDeadline.create({ data: item });
      created.push(c);
    } else {
      created.push(existing);
    }
  }

  return created;
}
