"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  BookOpen,
  BookMarked,
  GitMerge,
  CalendarDays,
  Settings,
  Bell,
  LogOut,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
} from "lucide-react";

interface SidebarT {
  accountant_space: string;
  dashboard: string;
  clients: string;
  validate: string;
  journal: string;
  grand_livre: string;
  rapprochement: string;
  settings: string;
  notifications: string;
  logout: string;
}

interface ComptableSidebarProps {
  lang: string;
  dir: "ltr" | "rtl";
  user: { name: string; email: string; role: string; phone?: string };
  notifCount: number;
  t: SidebarT;
}

export function ComptableSidebar({
  lang,
  dir,
  user,
  notifCount,
  t,
}: ComptableSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isRtl = dir === "rtl";

  const SECTIONS = [
    {
      title: lang === "ar" ? "المتابعة اليومية" : lang === "en" ? "DAILY TRACKING" : "SUIVI QUOTIDIEN",
      items: [
        { label: t.dashboard, href: "dashboard", icon: LayoutDashboard },
        { label: t.validate, href: "validate", icon: CheckSquare },
      ],
    },
    {
      title: lang === "ar" ? "إدارة المحاسبة" : lang === "en" ? "MANAGEMENT" : "GESTION",
      items: [
        { label: t.clients, href: "clients", icon: Users },
        { label: t.journal, href: "journal", icon: BookOpen },
        { label: t.grand_livre, href: "grand-livre", icon: BookMarked },
        { label: t.rapprochement, href: "rapprochement", icon: GitMerge },
        { label: lang === "ar" ? "الرزنامة الجبائية" : lang === "en" ? "Fiscal Calendar" : "Suivi fiscal", href: "fiscal", icon: CalendarDays },
      ],
    },
    {
      title: lang === "ar" ? "الإعدادات" : lang === "en" ? "SETTINGS" : "CONFIGURATION",
      items: [
        { label: t.settings, href: "settings", icon: Settings },
      ],
    },
  ];

  const isActive = (href: string) => pathname.includes(`/comptable/${href}`);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(`/${lang}/login`);
    router.refresh();
  }

  const Chevron = isRtl ? ChevronLeft : ChevronRight;

  return (
    <aside
      className={`fixed inset-y-0 z-40 w-64 bg-[#0b132b] flex flex-col shadow-2xl ${
        isRtl ? "right-0 border-l border-slate-800" : "left-0 border-r border-slate-800"
      }`}
    >
      {/* Brand Header */}
      <div className="flex flex-col items-center gap-1.5 px-5 py-4 border-b border-slate-800/80 bg-slate-900/40">
        <Link href={`/${lang}/comptable/dashboard`} className="block">
          <Image
            src="/logo.png"
            alt="TAYSIR COMPTA"
            width={160}
            height={48}
            className="h-10 w-auto object-contain brightness-0 invert opacity-90 hover:opacity-100 transition-opacity"
            priority
          />
        </Link>
        <p className="text-[9px] text-teal-400/70 font-semibold tracking-widest uppercase">
          {t.accountant_space || (lang === "ar" ? "مساحة المحاسب" : "Espace Comptable")}
        </p>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto custom-scrollbar">
        {SECTIONS.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            <p className="px-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              {section.title}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={`/${lang}/comptable/${item.href}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all group ${
                    active
                      ? "bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-md shadow-blue-900/20"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <Icon
                    size={17}
                    className={active ? "text-white" : "text-slate-400 group-hover:text-teal-400 transition-colors"}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {active && <Chevron size={14} className="opacity-80 shrink-0" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-slate-800/80 p-3 space-y-2 bg-slate-900/40">
        {/* Notifications */}
        <Link
          href={`/${lang}/comptable/notifications`}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800/60 hover:text-white transition-all group"
        >
          <div className="relative shrink-0">
            <Bell size={16} className="text-slate-400 group-hover:text-teal-400" />
            {notifCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </div>
          <span className="flex-1">{t.notifications}</span>
          {notifCount > 0 && (
            <span className="ml-auto text-[10px] bg-rose-500/20 text-rose-400 font-bold px-1.5 py-0.5 rounded-full shrink-0">
              {notifCount}
            </span>
          )}
        </Link>

        {/* Language Switcher */}
        <div className="flex items-center gap-1 px-1 py-0.5 bg-slate-950/60 rounded-lg border border-slate-800/60">
          {(["fr", "ar", "en"] as const).map((l) => (
            <Link
              key={l}
              href={pathname.replace(`/${lang}`, `/${l}`)}
              className={`flex-1 text-center text-[10px] py-1 rounded-md font-bold transition-all ${
                lang === l
                  ? "bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {l.toUpperCase()}
            </Link>
          ))}
        </div>

        {/* User profile */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-slate-800/50 border border-slate-700/40">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate">{user.name}</p>
            <p className="text-slate-400 text-[10px] truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title={t.logout}
            className="text-slate-400 hover:text-rose-400 transition-colors p-1 rounded-md hover:bg-slate-700/50 shrink-0"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
