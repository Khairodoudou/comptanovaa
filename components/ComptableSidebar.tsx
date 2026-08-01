"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  BookOpen,
  BookMarked,
  GitMerge,
  Building2,
  Settings,
  Bell,
  LogOut,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
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
  user: { name: string; email: string; role: string };
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

  const NAV_ITEMS = [
    { label: t.dashboard, href: "dashboard", icon: LayoutDashboard },
    { label: t.clients, href: "clients", icon: Users },
    { label: t.validate, href: "validate", icon: CheckSquare },
    { label: t.journal, href: "journal", icon: BookOpen },
    { label: t.grand_livre, href: "grand-livre", icon: BookMarked },
    { label: t.rapprochement, href: "rapprochement", icon: GitMerge },
    { label: lang === "ar" ? "الحسابات البنكية" : lang === "en" ? "Bank Accounts" : "Coordonnées Bancaires", href: "bank", icon: Building2 },
    { label: t.settings, href: "settings", icon: Settings },
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
      className={`fixed inset-y-0 z-40 w-64 bg-[#0f172a] flex flex-col shadow-xl ${
        isRtl ? "right-0" : "left-0"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-[#1a6fbf] flex items-center justify-center shadow-lg shrink-0">
          <TrendingUp size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <span className="text-white font-bold text-base tracking-tight block truncate">
            ComptaNova
          </span>
          <p className="text-[10px] text-slate-400 -mt-0.5">{t.accountant_space}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={`/${lang}/comptable/${item.href}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                active
                  ? "bg-[#1a6fbf] text-white shadow-sm"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon
                size={18}
                className={active ? "text-white" : "text-slate-500 group-hover:text-white"}
              />
              <span className="flex-1">{item.label}</span>
              {active && <Chevron size={14} className="opacity-70 shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 p-3 space-y-2">
        {/* Notifications */}
        <Link
          href={`/${lang}/comptable/notifications`}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-all group"
        >
          <div className="relative shrink-0">
            <Bell size={18} className="text-slate-500 group-hover:text-white" />
            {notifCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </div>
          <span className="flex-1">{t.notifications}</span>
          {notifCount > 0 && (
            <span className="ml-auto text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full shrink-0">
              {notifCount}
            </span>
          )}
        </Link>

        {/* Language Switcher */}
        <div className="flex items-center gap-1 px-3 py-1">
          {(["fr", "en", "ar"] as const).map((l) => (
            <Link
              key={l}
              href={pathname.replace(`/${lang}/`, `/${l}/`)}
              className={`flex-1 text-center text-xs py-1 rounded-md font-medium transition-all ${
                lang === l
                  ? "bg-white/10 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {l.toUpperCase()}
            </Link>
          ))}
        </div>

        {/* User profile */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5">
          <div className="w-8 h-8 rounded-full bg-[#1a6fbf] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user.name}</p>
            <p className="text-slate-500 text-[10px] truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title={t.logout}
            className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
