"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Globe, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";

export default function Navbar({ dict, lang }: { dict: any; lang: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const getAnchorHref = (hash: string) => {
    return pathname === `/${lang}` || pathname === `/${lang}/` ? hash : `/${lang}${hash}`;
  };

  const switchLang = (newLang: string) => {
    if (!pathname) return `/${newLang}`;
    const segments = pathname.split("/");
    segments[1] = newLang;
    return segments.join("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
              <span className="text-white font-bold text-sm">CN</span>
            </div>
            <span className="font-semibold text-gray-900 text-lg tracking-tight">
              Compta<span className="text-blue-600">Nova</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {(pathname === `/${lang}` || pathname === `/${lang}/`) && (
              <>
                <Link
                  href={getAnchorHref("#features")}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {dict.features}
                </Link>
                <Link
                  href={getAnchorHref("#how")}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {dict.how}
                </Link>
              </>
            )}
            <Link
              href={`/${lang}/about`}
              className={`text-sm transition-colors ${pathname.includes('/about') ? 'text-blue-600 font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {dict.about}
            </Link>
            <Link
              href={`/${lang}/contact`}
              className={`text-sm transition-colors ${pathname.includes('/contact') ? 'text-blue-600 font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {dict.contact}
            </Link>
          </div>

          {/* CTA buttons */}
          <div className="hidden md:flex items-center gap-3">
            {/* Language Switcher */}
            <div className="relative group mr-2">
              <button className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors py-2 px-1">
                <Globe size={16} />
                <span className="font-medium">{lang.toUpperCase()}</span>
                <ChevronDown size={14} className="text-gray-400 group-hover:rotate-180 transition-transform" />
              </button>
              <div className="absolute top-full right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right scale-95 group-hover:scale-100">
                <div className="p-2 flex flex-col gap-1">
                  <Link href={switchLang('fr')} className={`text-left flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors font-medium ${lang === 'fr' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'}`}>
                    Français
                    <span className={`text-xs ${lang === 'fr' ? 'text-blue-600' : 'text-gray-400'}`}>FR</span>
                  </Link>
                  <Link href={switchLang('ar')} className={`text-left flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors font-medium ${lang === 'ar' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'}`}>
                    العربية
                    <span className={`text-xs ${lang === 'ar' ? 'text-blue-600' : 'text-gray-400'}`}>AR</span>
                  </Link>
                  <Link href={switchLang('en')} className={`text-left flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors font-medium ${lang === 'en' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'}`}>
                    English
                    <span className={`text-xs ${lang === 'en' ? 'text-blue-600' : 'text-gray-400'}`}>EN</span>
                  </Link>
                </div>
              </div>
            </div>

            <Link
              href={`/${lang}/login`}
              className={`text-sm font-medium transition-colors px-4 py-2 ${pathname.includes('/login') ? 'text-blue-600' : 'text-gray-700 hover:text-gray-900'}`}
            >
              {dict.login}
            </Link>
            <Link
              href={`/${lang}/register`}
              className="text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {dict.register}
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-3">
          {(pathname === `/${lang}` || pathname === `/${lang}/`) && (
            <>
              <Link href={getAnchorHref("#features")} className="text-sm text-gray-700 py-2" onClick={() => setOpen(false)}>
                {dict.features}
              </Link>
              <Link href={getAnchorHref("#how")} className="text-sm text-gray-700 py-2" onClick={() => setOpen(false)}>
                {dict.how}
              </Link>
            </>
          )}
          <Link href={`/${lang}/about`} className={`text-sm py-2 ${pathname.includes('/about') ? 'text-blue-600 font-semibold' : 'text-gray-700'}`} onClick={() => setOpen(false)}>
            {dict.about}
          </Link>
          <Link href={`/${lang}/contact`} className={`text-sm py-2 ${pathname.includes('/contact') ? 'text-blue-600 font-semibold' : 'text-gray-700'}`} onClick={() => setOpen(false)}>
            {dict.contact}
          </Link>
          <hr className="border-gray-100 my-1" />
          
          {/* Mobile Language Switcher */}
          <div className="py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Globe size={16} />
              <span>{dict.language}</span>
            </div>
            <div className="flex bg-gray-100/80 rounded-lg p-1">
              <Link href={switchLang('fr')} className={`px-3 py-1.5 text-xs font-semibold rounded-md shadow-sm transition-colors ${lang === 'fr' ? 'bg-white text-blue-600 border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'}`}>FR</Link>
              <Link href={switchLang('ar')} className={`px-3 py-1.5 text-xs font-semibold rounded-md shadow-sm transition-colors ${lang === 'ar' ? 'bg-white text-blue-600 border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'}`}>AR</Link>
              <Link href={switchLang('en')} className={`px-3 py-1.5 text-xs font-semibold rounded-md shadow-sm transition-colors ${lang === 'en' ? 'bg-white text-blue-600 border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'}`}>EN</Link>
            </div>
          </div>

          <hr className="border-gray-100 my-1" />
          <Link
            href={`/${lang}/login`}
            className={`text-sm font-medium py-2 ${pathname.includes('/login') ? 'text-blue-600' : 'text-gray-700'}`}
            onClick={() => setOpen(false)}
          >
            {dict.login}
          </Link>
          <Link
            href={`/${lang}/register`}
            className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg text-center"
            onClick={() => setOpen(false)}
          >
            {dict.register}
          </Link>
        </div>
      )}
    </nav>
  );
}