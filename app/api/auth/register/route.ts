import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";
import { generateFiscalDeadlinesForCompany } from "@/lib/fiscal-generator";

const RegisterSchema = z.discriminatedUnion("role", [
  // ─── COMPTABLE SCHEMA ───
  z.object({
    role: z.literal("COMPTABLE"),
    name: z.string().min(2, "Nom et prénom requis"),
    email: z.string().email("Email professionnel invalide"),
    password: z.string().min(8, "Mot de passe d'au moins 8 caractères"),
    phone: z.string().min(6, "Numéro de téléphone requis"),
    // Obligatoires pour comptable
    cabinetName: z.string().min(2, "Nom du cabinet requis"),
    agrementNumber: z.string().min(2, "Numéro d'agrément / inscription requis"),
    wilaya: z.string().min(2, "Wilaya requise"),
    commune: z.string().min(2, "Commune requise"),
    adresseCabinet: z.string().min(3, "Adresse du cabinet requise"),
    // Optionnels
    specialisation: z.string().optional(),
    secteurActivite: z.string().optional(),
    nbCollaborateurs: z.coerce.number().optional(),
    logoCabinet: z.string().optional(),
  }),

  // ─── CLIENT SCHEMA ───
  z.object({
    role: z.literal("CLIENT"),
    name: z.string().min(2, "Nom du dirigeant/responsable requis"),
    email: z.string().email("Email invalide"),
    password: z.string().min(8, "Mot de passe d'au moins 8 caractères"),
    phone: z.string().min(6, "Numéro de téléphone requis"),
    // Obligatoires pour l'entreprise
    raisonSociale: z.string().min(2, "Raison sociale requise"),
    formeJuridique: z.enum(["SARL", "EURL", "SPA", "SNC", "Personne physique", "Autre"]),
    nrc: z.string().min(2, "Numéro de Registre de Commerce (NRC) requis"),
    nif: z.string().min(2, "Numéro d'Identification Fiscale (NIF) requis"),
    regimeFiscal: z.enum(["FORFAITAIRE", "REEL"]),
    secteurActivite: z.string().min(2, "Secteur d'activité requis"),
    // Optionnels
    adresseSiege: z.string().optional(),
    wilayaEntreprise: z.string().optional(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const result = RegisterSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Données d'inscription invalides", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = result.data;

    // Check unique email
    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 409 });
    }

    const passwordHash = await hashPassword(data.password);

    if (data.role === "COMPTABLE") {
      const user = await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          phone: data.phone,
          role: "COMPTABLE",
          cabinetName: data.cabinetName,
          agrementNumber: data.agrementNumber,
          wilaya: data.wilaya,
          commune: data.commune,
          adresseCabinet: data.adresseCabinet,
          specialisation: data.specialisation || null,
          secteurActivite: data.secteurActivite || null,
          nbCollaborateurs: data.nbCollaborateurs ? Number(data.nbCollaborateurs) : null,
          logoCabinet: data.logoCabinet || null,
        },
      });

      const token = await signToken({
        userId: user.id,
        email: user.email,
        role: "COMPTABLE",
        name: user.name,
      });
      await setAuthCookie(token);

      return NextResponse.json(
        { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
        { status: 201 }
      );
    } else {
      // CLIENT registration
      const user = await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          phone: data.phone,
          role: "CLIENT",
        },
      });

      const company = await db.company.create({
        data: {
          name: data.raisonSociale,
          raisonSociale: data.raisonSociale,
          formeJuridique: data.formeJuridique,
          nrc: data.nrc,
          nif: data.nif,
          regimeFiscal: data.regimeFiscal,
          secteurActivite: data.secteurActivite,
          adresseSiege: data.adresseSiege || null,
          wilayaEntreprise: data.wilayaEntreprise || null,
          clientId: user.id,
        },
      });

      // Automatically generate fiscal deadlines for this new enterprise
      try {
        await generateFiscalDeadlinesForCompany(company.id, new Date().getFullYear());
      } catch (err) {
        console.error("Auto-generate deadlines on registration error:", err);
      }

      const token = await signToken({
        userId: user.id,
        email: user.email,
        role: "CLIENT",
        name: user.name,
      });
      await setAuthCookie(token);

      return NextResponse.json(
        {
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          company: { id: company.id, name: company.name, regimeFiscal: company.regimeFiscal },
        },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error("[REGISTER ERROR]", error);
    return NextResponse.json(
      { error: "Erreur serveur, réessayez plus tard" },
      { status: 500 }
    );
  }
}