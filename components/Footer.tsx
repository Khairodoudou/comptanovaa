import Link from "next/link";

export default function Footer({ dict, lang }: { dict: any; lang: string }) {
  return (
    <footer className="border-t border-gray-100 py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">CN</span>
          </div>
          <span className="font-semibold text-gray-900">
            Compta<span className="text-blue-600">Nova</span>
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