import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { comparePassword, signToken, setAuthCookie } from "@/lib/auth";

// FIX #5: Zod v4 changed the error customisation API.
// Use plain z.enum() — field-level messages are handled on the client.
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(["COMPTABLE", "CLIENT"]),
});

export async function POST(request: NextRequest) {
  try {
    // FIX #9 pattern: wrap body parse in try/catch (empty body = crash)
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const result = LoginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Données invalides", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, password, role } = result.data;

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "Email ou mot de passe incorrect" },
        { status: 401 }
      );
    }

    if (user.role !== role) {
      return NextResponse.json(
        { error: `Ce compte n'est pas un compte ${role === "CLIENT" ? "client" : "comptable"}` },
        { status: 401 }
      );
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Email ou mot de passe incorrect" },
        { status: 401 }
      );
    }

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    await setAuthCookie(token);

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("[LOGIN ERROR]", error);
    return NextResponse.json(
      { error: "Erreur serveur, réessayez plus tard" },
      { status: 500 }
    );
  }
}