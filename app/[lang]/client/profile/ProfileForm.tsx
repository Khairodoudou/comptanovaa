"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, CheckCircle } from "lucide-react";

interface ProfileT {
  form_title: string;
  fullname: string;
  email: string;
  email_readonly: string;
  phone: string;
  lang: string;
  save: string;
  saving: string;
  success: string;
  lang_fr: string;
  lang_ar: string;
  lang_en: string;
}

interface ProfileFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    preferredLang: string;
  };
  t: ProfileT;
}

export function ProfileForm({ user, t }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [preferredLang, setPreferredLang] = useState(user.preferredLang);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      const res = await fetch("/api/client/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, preferredLang }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Save error");
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="profile-form"
      onSubmit={handleSave}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5"
    >
      <h2 className="font-semibold text-[#0f172a] text-sm">{t.form_title}</h2>

      <div className="grid gap-5">
        {/* Name */}
        <div>
          <label htmlFor="profile-name" className="block text-xs font-medium text-[#64748b] mb-1.5">
            {t.fullname}
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2d8f5e]/30"
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-xs font-medium text-[#64748b] mb-1.5">{t.email}</label>
          <input
            type="email"
            value={user.email}
            readOnly
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#64748b] bg-[#f8fafc] cursor-not-allowed"
          />
          <p className="text-[11px] text-[#64748b] mt-1">{t.email_readonly}</p>
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="profile-phone" className="block text-xs font-medium text-[#64748b] mb-1.5">
            {t.phone}
          </label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+213 5XX XXX XXX"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2d8f5e]/30 placeholder:text-[#94a3b8]"
          />
        </div>

        {/* Language */}
        <div>
          <label htmlFor="profile-lang" className="block text-xs font-medium text-[#64748b] mb-1.5">
            {t.lang}
          </label>
          <select
            id="profile-lang"
            value={preferredLang}
            onChange={(e) => setPreferredLang(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2d8f5e]/30"
          >
            <option value="fr">{t.lang_fr}</option>
            <option value="ar">{t.lang_ar}</option>
            <option value="en">{t.lang_en}</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <CheckCircle size={15} />
          {t.success}
        </div>
      )}

      <button
        id="profile-save-btn"
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-[#2d8f5e] hover:bg-[#27805a] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-60"
      >
        {saving ? (
          <><Loader2 size={14} className="animate-spin" /> {t.saving}</>
        ) : (
          <><Save size={14} /> {t.save}</>
        )}
      </button>
    </form>
  );
}
