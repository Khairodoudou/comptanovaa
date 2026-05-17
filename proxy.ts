import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { i18n } from "./i18n-config";
import { match as matchLocale } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "comptanova-secret-dev-key-change-in-production"
);

const COOKIE_NAME = "comptanova_token";

function getLocale(request: NextRequest): string {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

  let languages = new Negotiator({ headers: negotiatorHeaders }).languages(
    i18n.locales.slice()
  );

  const locales: string[] = i18n.locales.slice();
  return matchLocale(languages, locales, i18n.defaultLocale);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/uploads") ||
    // FIX #8: Use a regex to match actual static file extensions only
    /\.(?:ico|png|jpg|jpeg|svg|webp|gif|woff2?|ttf|otf|css|js|map|txt|xml|json)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 1. i18n Routing
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  let currentLocale: string = i18n.defaultLocale;

  if (pathnameIsMissingLocale) {
    currentLocale = getLocale(request);
    return NextResponse.redirect(
      new URL(
        `/${currentLocale}${pathname.startsWith("/") ? "" : "/"}${pathname}`,
        request.url
      )
    );
  } else {
    // Extract the locale from the pathname
    currentLocale = pathname.split('/')[1];
  }

  // Strip locale for auth logic
  const pathnameWithoutLocale = pathname.replace(`/${currentLocale}`, "") || "/";

  // 2. Auth Logic
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    const isProtected =
      pathnameWithoutLocale.startsWith("/client") || pathnameWithoutLocale.startsWith("/comptable");
    if (isProtected) {
      return NextResponse.redirect(new URL(`/${currentLocale}/login`, request.url));
    }
    return NextResponse.next();
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const role = payload.role as string;

    if (pathnameWithoutLocale === "/login" || pathnameWithoutLocale === "/register") {
      const dashboard =
        role === "COMPTABLE" ? `/${currentLocale}/comptable/dashboard` : `/${currentLocale}/client/dashboard`;
      return NextResponse.redirect(new URL(dashboard, request.url));
    }

    if (pathnameWithoutLocale.startsWith("/client") && role !== "CLIENT") {
      return NextResponse.redirect(new URL(`/${currentLocale}/comptable/dashboard`, request.url));
    }

    if (pathnameWithoutLocale.startsWith("/comptable") && role !== "COMPTABLE") {
      return NextResponse.redirect(new URL(`/${currentLocale}/client/dashboard`, request.url));
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.userId as string);
    requestHeaders.set("x-user-role", role);
    requestHeaders.set("x-user-email", payload.email as string);
    // BUG FIX D: Encode name as base64 — HTTP headers must be ASCII-only
    // Arabic/French chars in names would cause 500 "Invalid header value" errors
    requestHeaders.set(
      "x-user-name",
      Buffer.from(payload.name as string, "utf-8").toString("base64")
    );

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    const response = NextResponse.redirect(new URL(`/${currentLocale}/login`, request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};