"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  BookOpen,
  CreditCard,
  User,
  CalendarDays,
  Bell,
  LogOut,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

interface SidebarT {
  client_space: string;
  dashboard: string;
  documents: string;
  invoices?: string;
  journal: string;
  bank: string;
  profile: string;
  notifications: string;
  logout: string;
}

interface ClientSidebarProps {
  lang: string;
  dir: "ltr" | "rtl";
  user: { name: string; email: string; role: string };
  notifCount: number;
  companyName?: string;
  t: SidebarT;
}

export function ClientSidebar({
  lang,
  dir,
  user,
  notifCount,
  companyName,
  t,
}: ClientSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isRtl = dir === "rtl";

  const SECTIONS = [
    {
      title: lang === "ar" ? "المتابعة اليومية" : lang === "en" ? "DAILY TRACKING" : "SUIVI QUOTIDIEN",
      items: [
        { label: t.dashboard, href: "dashboard", icon: LayoutDashboard },
        { label: t.documents, href: "documents", icon: FileText },
      ],
    },
    {
      title: lang === "ar" ? "إدارة المؤسسة" : lang === "en" ? "MANAGEMENT" : "GESTION",
      items: [
        { label: t.journal, href: "journal", icon: BookOpen },
        { label: t.invoices ?? (lang === "ar" ? "الفواتير والمدفوعات" : "Factures & Règlements"), href: "factures", icon: Receipt },
        { label: lang === "ar" ? "المطابقة والسجل" : lang === "en" ? "Reconciliation" : "Rapprochement & Historique", href: "bank", icon: CreditCard },
      ],
    },
    {
      title: lang === "ar" ? "الإعدادات" : lang === "en" ? "SETTINGS" : "CONFIGURATION",
      items: [
        { label: lang === "ar" ? "الرزنامة الجبائية" : lang === "en" ? "Fiscal Deadlines" : "Échéances fiscales", href: "fiscal", icon: CalendarDays },
        { label: t.profile, href: "profile", icon: User },
      ],
    },
  ];

  const isActive = (href: string) => pathname.includes(`/client/${href}`);

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
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800/80 bg-slate-900/40">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0d9488] via-[#0284c7] to-[#1e3a8a] flex items-center justify-center shadow-lg shadow-teal-950/30 shrink-0">
          <span className="text-white font-black text-sm tracking-wider">TC</span>
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-white font-extrabold text-base tracking-tight block truncate">
            TAYSIR <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-sky-400">COMPTA</span>
          </span>
          <p className="text-[10px] text-teal-400/80 font-medium -mt-0.5 truncate uppercase tracking-wide">
            {companyName ?? (lang === "ar" ? "مساحة العميل" : "Espace Entreprise")}
          </p>
        </div>
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
                  href={`/${lang}/client/${item.href}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all group ${
                    active
                      ? "bg-gradient-to-r from-teal-600 to-blue-600 text-white shadow-md shadow-teal-900/20"
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
          href={`/${lang}/client/notifications`}
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
                  ? "bg-gradient-to-r from-teal-600 to-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {l.toUpperCase()}
            </Link>
          ))}
        </div>

        {/* User profile */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-slate-800/50 border border-slate-700/40">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm">
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
