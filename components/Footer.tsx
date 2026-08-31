import Link from "next/link";

export default function Footer({ dict, lang }: { dict: any; lang: string }) {
  return (
    <footer className="border-t border-gray-100 py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0d9488] flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-xs">TC</span>
          </div>
          <span className="font-bold text-gray-900">
            TAYSIR <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-600">COMPTA</span>
          </span>
        </div>
        <p className="text-sm text-gray-400">
          {dict.rights}
        </p>
        <div className="flex items-center gap-6">
          <Link href={`/${lang}/about`} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            {dict.about}
          </Link>
          <Link href={`/${lang}/contact`} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            {dict.contact}
          </Link>
          <Link href={`/${lang}/login`} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            {dict.login || "Connexion"}
          </Link>
        </div>
      </div>
    </footer>
  );
}