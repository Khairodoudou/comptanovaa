"use client";

import { useState } from "react";
import { UserCheck, UserX, Clock, Building2, Phone, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface ClientRequest {
  id: string;
  createdAt: string;
  message?: string | null;
  sender: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    companies: Array<{
      id: string;
      name: string;
      formeJuridique?: string | null;
      regimeFiscal?: string | null;
      nrc?: string | null;
      nif?: string | null;
    }>;
  };
}

export function PendingRequests({
  initialRequests,
  lang,
}: {
  initialRequests: ClientRequest[];
  lang: string;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<ClientRequest[]>(initialRequests);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (requests.length === 0) return null;

  async function handleAction(id: string, action: "accept" | "reject") {
    setProcessingId(id);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/comptable/requests/${id}/${action}`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors du traitement de la demande");
        return;
      }

      setSuccess(
        action === "accept"
          ? lang === "ar"
            ? "تم قبول العميل وربطه بمكتبك بنجاح"
            : "Client accepté et rattaché avec succès"
          : lang === "ar"
          ? "تم رفض الطلب"
          : "Demande refusée"
      );

      // Remove from list
      setRequests((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch {
      setError("Erreur réseau");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200/80 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center font-bold">
            <Clock size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">
              {lang === "ar" ? "طلبات الانضمام في الانتظار" : "Demandes de collaboration en attente"}
            </h3>
            <p className="text-xs text-slate-500">
              {requests.length} {lang === "ar" ? "طلب يتطلب موافقتك" : "demande(s) nécessitant votre validation"}
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
          {lang === "ar" ? "في الانتظار" : "En attente"}
        </span>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-3 p-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 size={14} />
          <span>{success}</span>
        </div>
      )}

      <div className="space-y-3">
        {requests.map((req) => {
          const company = req.sender.companies[0];
          return (
            <div
              key={req.id}
              className="bg-white rounded-xl p-4 border border-amber-200/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-slate-900">{req.sender.name}</span>
                  {company && (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold">
                      {company.name} ({company.formeJuridique || "SARL"})
                    </span>
                  )}
                  {company?.regimeFiscal && (
                    <span className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-md text-[10px] font-bold">
                      {company.regimeFiscal}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Mail size={13} className="text-slate-400" />
                    {req.sender.email}
                  </span>
                  {req.sender.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={13} className="text-slate-400" />
                      {req.sender.phone}
                    </span>
                  )}
                </div>

                {req.message && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg italic mt-1">
                    "{req.message}"
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={processingId === req.id}
                  onClick={() => handleAction(req.id, "reject")}
                  className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <UserX size={14} />
                  <span>{lang === "ar" ? "رفض" : "Refuser"}</span>
                </button>

                <button
                  type="button"
                  disabled={processingId === req.id}
                  onClick={() => handleAction(req.id, "accept")}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <UserCheck size={14} />
                  <span>{lang === "ar" ? "قبول وربط" : "Accepter"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
