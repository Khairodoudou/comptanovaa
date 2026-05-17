import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";

// FIX #6: Same Zod v4 enum issue as login route — use plain z.enum()
const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  role: z.enum(["COMPTABLE", "CLIENT"]),
});

export async function POST(request: NextRequest) {
  try {
    // FIX: wrap body parse in try/catch
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const result = RegisterSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Données invalides", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, password, phone, role } = result.data;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { name, email, passwordHash, phone, role },
    });

    if (role === "CLIENT") {
      await db.company.create({
        data: { name: `Entreprise de ${name}`, clientId: user.id },
      });
    }

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: user.role as "COMPTABLE" | "CLIENT",
      name: user.name,
    });
    await setAuthCookie(token);

    return NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { status: 201 }
    );
  } catch (error) {
    console.error("[REGISTER ERROR]", error);
    return NextResponse.json(
      { error: "Erreur serveur, réessayez plus tard" },
      { status: 500 }
    );
  }
}