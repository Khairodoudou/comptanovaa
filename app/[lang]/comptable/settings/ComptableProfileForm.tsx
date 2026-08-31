"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Loader2,
  CheckCircle2,
  Building2,
  ShieldCheck,
} from "lucide-react";

interface ComptableProfileFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    preferredLang: string;
    cabinetName: string | null;
    agrementNumber: string | null;
    wilaya: string | null;
    commune: string | null;
    adresseCabinet: string | null;
    specialisation: string | null;
    secteurActivite: string | null;
    nbCollaborateurs: number | null;
  };
  lang: string;
}

export function ComptableProfileForm({ user, lang }: ComptableProfileFormProps) {
  const router = useRouter();

  // Personal
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [preferredLang, setPreferredLang] = useState(user.preferredLang);

  // Cabinet & Credentials
  const [cabinetName, setCabinetName] = useState(user.cabinetName ?? "");
  const [agrementNumber, setAgrementNumber] = useState(user.agrementNumber ?? "");
  const [wilaya, setWilaya] = useState(user.wilaya ?? "");
  const [commune, setCommune] = useState(user.commune ?? "");
  const [adresseCabinet, setAdresseCabinet] = useState(user.adresseCabinet ?? "");
  const [specialisation, setSpecialisation] = useState(user.specialisation ?? "");
  const [secteurActivite, setSecteurActivite] = useState(user.secteurActivite ?? "");
  const [nbCollaborateurs, setNbCollaborateurs] = useState(user.nbCollaborateurs?.toString() ?? "");

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      const res = await fetch("/api/comptable/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          preferredLang,
          cabinetName,
          agrementNumber,
          wilaya,
          commune,
          adresseCabinet,
          specialisation,
          secteurActivite,
          nbCollaborateurs: nbCollaborateurs ? parseInt(nbCollaborateurs, 10) : null,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erreur d'enregistrement");
      }

      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-extrabold text-slate-900 text-base">
            {lang === "ar"
              ? "تعديل بيانات الملف المهني ومكتب المحاسبة"
              : "Modifier les informations de l'expert & du cabinet"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lang === "ar"
              ? "الاعتماد المهني، عنوان المكتب، وسائل الاتصال، والتخصصات"
              : "Agrément ONEC, localisation, coordonnées officielles et spécialisation"}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 rounded-xl p-3.5">
          <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
          <span>{lang === "ar" ? "تم تحديث وحفظ البيانات بنجاح !" : "Informations enregistrées avec succès !"}</span>
        </div>
      )}

      {/* 1. Informations de l'Expert */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck size={14} className="text-teal-600" />
          <span>{lang === "ar" ? "1. الخبير المحاسب المسؤول" : "1. Identité de l'expert-comptable"}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "الاسم واللقب" : "Nom complet"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "البريد الإلكتروني (الحساب)" : "Email professionnel"}
            </label>
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-500 bg-slate-50 cursor-not-allowed font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "رقم الهاتف المحمول (WhatsApp)" : "Téléphone direct (WhatsApp)"}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XX XX XX"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "لغة الواجهة" : "Langue préférée"}
            </label>
            <select
              value={preferredLang}
              onChange={(e) => setPreferredLang(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            >
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Informations du Cabinet & Agrément */}
      <div className="space-y-4 pt-4 border-t border-slate-100">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Building2 size={14} className="text-teal-600" />
          <span>{lang === "ar" ? "2. بيانات مكتب المحاسبة والاعتماد" : "2. Cabinet & Agrément officiel"}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "اسم المكتب / Cabinet" : "Nom du Cabinet d'expertise"}
            </label>
            <input
              type="text"
              value={cabinetName}
              onChange={(e) => setCabinetName(e.target.value)}
              placeholder="Ex: Cabinet d'Expertise Comptable Al-Baraka"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "رقم الاعتماد (N° d'Agrément)" : "Numéro d'Agrément ONEC"}
            </label>
            <input
              type="text"
              value={agrementNumber}
              onChange={(e) => setAgrementNumber(e.target.value)}
              placeholder="Ex: ONEC/2023/1234"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "الولاية" : "Wilaya"}
            </label>
            <input
              type="text"
              value={wilaya}
              onChange={(e) => setWilaya(e.target.value)}
              placeholder="Ex: 16 - Alger"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "البلدية" : "Commune"}
            </label>
            <input
              type="text"
              value={commune}
              onChange={(e) => setCommune(e.target.value)}
              placeholder="Ex: Sidi M'Hamed"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "عدد المتعاونين / الفريق" : "Nombre de collaborateurs"}
            </label>
            <input
              type="number"
              min={1}
              value={nbCollaborateurs}
              onChange={(e) => setNbCollaborateurs(e.target.value)}
              placeholder="Ex: 5"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "العنوان الكامل للمكتب" : "Adresse complète du Cabinet"}
            </label>
            <input
              type="text"
              value={adresseCabinet}
              onChange={(e) => setAdresseCabinet(e.target.value)}
              placeholder="Ex: 45 Boulevard Colonel Amirouche, Alger"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "التخصص والأنشطة" : "Spécialisation"}
            </label>
            <input
              type="text"
              value={specialisation}
              onChange={(e) => setSpecialisation(e.target.value)}
              placeholder="Ex: Commissariat aux comptes, Conseil fiscal, SCF..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>
        </div>
      </div>

      <div className="pt-3 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>Enregistrement...</span>
            </>
          ) : (
            <>
              <Save size={15} />
              <span>{lang === "ar" ? "حفظ التعديلات" : "Enregistrer les modifications"}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
