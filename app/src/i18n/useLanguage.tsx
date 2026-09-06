import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dictionaries, type Dictionary, type Language } from "./translations";

const STORAGE_KEY = "za-edno-language";

function loadLanguage(): Language {
  // Български по подразбиране - нарочно, независимо от езика на браузъра.
  // Приложението се прави за българска организация; английският е превключвател
  // за гости, а не поведение по подразбиране.
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "bg" || saved === "en") return saved;
  } catch {
    /* localStorage недостъпен - остава българският */
  }
  return "bg";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(loadLanguage);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      t: dictionaries[language],
      setLanguage(lang: Language) {
        setLanguageState(lang);
        document.documentElement.lang = lang;
        try {
          localStorage.setItem(STORAGE_KEY, lang);
        } catch {
          /* localStorage недостъпен - езикът важи само за тази сесия */
        }
      },
    }),
    [language],
  );

  // Заглавието на раздела и езикът на документа следват избора - иначе
  // екранните четци и историята на браузъра остават на грешния език.
  useEffect(() => {
    const dict = dictionaries[language];
    document.title = `${dict.appName} — ${dict.appTagline}`;
    document.documentElement.lang = language;
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage трябва да се ползва вътре в <LanguageProvider>");
  return ctx;
}

/** Кратък достъп само до речника. */
export function useT(): Dictionary {
  return useLanguage().t;
}
