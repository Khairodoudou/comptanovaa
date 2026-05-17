/**
 * POST /api/auth/logout
 * BUG FIX: Replaced Next.js `redirect()` (throws exception — wrong in API routes)
 * with a proper NextResponse that clears the cookie and returns a 200 JSON response.
 * The client (sidebar logout button) handles the redirect to /{lang}/login.
 */
import { NextResponse } from "next/server";
import { deleteAuthCookie } from "@/lib/auth";

export async function POST() {
  await deleteAuthCookie();
  return NextResponse.json({ success: true }, { status: 200 });
}