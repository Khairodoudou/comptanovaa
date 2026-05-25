"use client";

import { useState } from "react";
import { Edit2, Check, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function EditableReference({ documentId, initialReference }: { documentId: string, initialReference: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialReference);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSave() {
    if (value === initialReference) {
      setIsEditing(false);
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`/api/comptable/documents/${documentId}/reference`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: value || null })
      });
      if (res.ok) {
        setIsEditing(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-1.5 ml-1">
        <input 
          autoFocus
          className="border border-blue-300 rounded px-1.5 py-0.5 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setValue(initialReference); setIsEditing(false); }
          }}
          disabled={loading}
        />
        {loading ? <Loader2 size={14} className="animate-spin text-blue-500" /> : (
          <>
            <button onClick={handleSave} className="text-green-600 hover:text-green-700 bg-green-50 p-1 rounded"><Check size={14} strokeWidth={3} /></button>
            <button onClick={() => { setValue(initialReference); setIsEditing(false); }} className="text-red-500 hover:text-red-600 bg-red-50 p-1 rounded"><X size={14} strokeWidth={3} /></button>
          </>
        )}
      </span>
    );
  }

  return (
    <span 
      className="group relative inline-flex items-center gap-1.5 cursor-pointer ml-1 hover:bg-blue-50 rounded px-1 transition-colors" 
      onClick={() => setIsEditing(true)}
      title="Modifier la référence"
    >
      <span className="font-semibold">{initialReference || '.......'}</span>
      <Edit2 size={12} className="text-[#1a6fbf] opacity-0 group-hover:opacity-100 transition-opacity" />
    </span>
  );
}
