"use client";

import { createContext, useContext } from "react";

const DictionaryContext = createContext<any>(null);

export function DictionaryProvider({
  dictionary,
  children,
}: {
  dictionary: any;
  children: React.ReactNode;
}) {
  return (
    <DictionaryContext.Provider value={dictionary}>
      {children}
    </DictionaryContext.Provider>
  );
}

export function useDictionary() {
  const dict = useContext(DictionaryContext);
  if (!dict) {
    throw new Error("useDictionary must be used within a DictionaryProvider");
  }
  return dict;
}
