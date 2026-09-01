"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useDictionary } from "@/components/DictionaryProvider";

type Role = "COMPTABLE" | "CLIENT";

export default function LoginPage() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const dict = useDictionary();
  const [role, setRole] = useState<Role>("CLIENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur de connexion");
        return;
      }

      router.push(
        role === "COMPTABLE" ? "/comptable/dashboard" : "/client/dashboard"
      );
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
      <div className="flex-1 flex pt-16">
        {/* Left panel */}
        <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#0b132b] via-[#1e3a8a] to-[#0d9488] flex-col justify-center p-12">
          <div className="max-w-md mx-auto">
          <div className="mb-8">
            <Link href={`/${lang}`} className="inline-block bg-white px-5 py-3 rounded-2xl shadow-2xl border border-white/90 hover:scale-105 transition-transform">
              <Image
                src="/logo.png"
                alt="TAYSIR COMPTA"
                width={220}
                height={66}
                className="h-12 w-auto object-contain"
                priority
              />
            </Link>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
            {dict.login.welcome}
          </h2>
          <p className="text-blue-100 text-base leading-relaxed">
            {dict.login.description}
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { value: "OCR", label: dict.login.features.ocr },
              { value: "JWT", label: dict.login.features.security },
              { value: "2", label: dict.login.features.roles },
              { value: "3", label: dict.login.features.languages },
            ].map((s) => (
              <div key={s.label} className="bg-white/10 rounded-xl p-4">
                <div className="text-white font-bold text-lg">{s.value}</div>
                <div className="text-blue-200 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <div className="flex justify-center mb-8">
              <Link href={`/${lang}`} className="inline-block hover:opacity-90 transition-opacity">
                <Image
                  src="/logo.png"
                  alt="TAYSIR COMPTA"
                  width={200}
                  height={60}
                  className="h-12 w-auto object-contain"
                  priority
                />
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {dict.login.title}
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            {dict.login.noAccount}{" "}
            <Link href={`/${lang}/register`} className="text-blue-600 hover:underline font-medium">
              {dict.login.createAccount}
            </Link>
          </p>

          {/* Role selector */}
          <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl">
            {(["CLIENT", "COMPTABLE"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  role === r
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {r === "CLIENT" ? dict.login.client : dict.login.accountant}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {dict.login.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {dict.login.password}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {dict.login.submit} <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            {dict.login.terms}
          </p>
        </div>
      </div>
      </div>
  );
}