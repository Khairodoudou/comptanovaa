import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { z } from "zod";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  preferredLang: z.enum(["fr", "ar", "en"]).optional(),
  // Company fields
  raisonSociale: z.string().optional(),
  formeJuridique: z.string().optional(),
  nrc: z.string().optional(),
  nif: z.string().optional(),
  secteurActivite: z.string().optional(),
  adresseSiege: z.string().optional(),
  wilayaEntreprise: z.string().optional(),
  bankName: z.string().optional(),
  rib: z.string().optional(),
  ccp: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;

  // Update user
  const updatedUser = await db.user.update({
    where: { id: user.userId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
      ...(data.preferredLang && { preferredLang: data.preferredLang }),
    },
    select: { id: true, name: true, email: true, phone: true, preferredLang: true },
  });

  // Update company if any company field provided
  const companyData: any = {};
  if (data.raisonSociale !== undefined) {
    companyData.raisonSociale = data.raisonSociale;
    companyData.name = data.raisonSociale;
  }
  if (data.formeJuridique !== undefined) companyData.formeJuridique = data.formeJuridique;
  if (data.nrc !== undefined) companyData.nrc = data.nrc;
  if (data.nif !== undefined) companyData.nif = data.nif;
  if (data.secteurActivite !== undefined) companyData.secteurActivite = data.secteurActivite;
  if (data.adresseSiege !== undefined) companyData.adresseSiege = data.adresseSiege;
  if (data.wilayaEntreprise !== undefined) companyData.wilayaEntreprise = data.wilayaEntreprise;
  if (data.bankName !== undefined) companyData.bankName = data.bankName;
  if (data.rib !== undefined) companyData.rib = data.rib;
  if (data.ccp !== undefined) companyData.ccp = data.ccp;

  if (Object.keys(companyData).length > 0) {
    const existingCompany = await db.company.findFirst({
      where: { clientId: user.userId },
      select: { id: true },
    });

    if (existingCompany) {
      await db.company.update({
        where: { id: existingCompany.id },
        data: companyData,
      });
    }
  }

  return Response.json({ user: updatedUser, success: true });
}
