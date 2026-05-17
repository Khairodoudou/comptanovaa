"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { useDictionary } from "@/components/DictionaryProvider";

type Role = "COMPTABLE" | "CLIENT";

export default function RegisterPage() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const dict = useDictionary();
  const [role, setRole] = useState<Role>("CLIENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordStrength = password.length === 0
    ? 0
    : password.length < 6
    ? 1
    : password.length < 10
    ? 2
    : 3;

  const strengthLabel = ["", dict.register.strength.weak, dict.register.strength.medium, dict.register.strength.strong];
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-green-500"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, phone, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur d'inscription");
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
        <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-green-600 to-green-800 flex-col justify-center p-12">
          <div className="max-w-md mx-auto">
            <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
              {dict.register.welcome}
            </h2>
            <p className="text-green-100 text-base leading-relaxed mb-10">
              {dict.register.description}
            </p>

            <div className="space-y-4">
              {[
                dict.register.features.no_card,
                dict.register.features.instant,
                dict.register.features.languages,
                dict.register.features.secure,
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Check size={13} className="text-white" />
                  </div>
                  <span className="text-green-100 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {dict.register.title}
            </h1>
            <p className="text-gray-500 text-sm mb-8">
              {dict.register.hasAccount}{" "}
              <Link href={`/${lang}/login`} className="text-blue-600 hover:underline font-medium">
                {dict.register.login}
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
                  {r === "CLIENT" ? dict.register.client : dict.register.accountant}
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
                  {dict.register.fullName}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Votre nom"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {dict.register.email}
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
                  {dict.register.phone}{" "}
                  <span className="text-gray-400 font-normal">{dict.register.optional}</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+213 6XX XX XX XX"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {dict.register.password}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={dict.register.passwordPlaceholder}
                    required
                    minLength={8}
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
                {/* Password strength */}
                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all ${
                            i <= passwordStrength
                              ? strengthColor[passwordStrength]
                              : "bg-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-500">
                      {dict.register.strength.label} {strengthLabel[passwordStrength]}
                    </p>
                  </div>
                )}
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
                    {dict.register.submit} <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-6">
              {dict.register.terms}
            </p>
          </div>
        </div>
        
      </div>
  );
}