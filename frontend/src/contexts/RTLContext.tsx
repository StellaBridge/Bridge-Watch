import { createContext, useContext, useEffect, useState } from "react";
import i18n from "./config";

interface RTLContextType {
  isRTL: boolean;
  dir: "ltr" | "rtl";
}

const RTLContext = createContext<RTLContextType>({
  isRTL: false,
  dir: "ltr",
});

export function RTLProvider({ children }: { children: React.ReactNode }) {
  const [isRTL, setIsRTL] = useState(false);

  useEffect(() => {
    const updateDirection = () => {
      const lang = i18n.language || "en";
      const baseCode = lang.split("-")[0];
      const rtlLanguages = ["ar", "he", "fa"];
      const rtl = rtlLanguages.includes(baseCode);
      setIsRTL(rtl);
    };

    updateDirection();
    const handleLanguageChange = () => updateDirection();
    i18n.on("languageChanged", handleLanguageChange);

    return () => {
      i18n.off("languageChanged", handleLanguageChange);
    };
  }, []);

  return (
    <RTLContext.Provider value={{ isRTL, dir: isRTL ? "rtl" : "ltr" }}>
      {children}
    </RTLContext.Provider>
  );
}

export function useRTL() {
  return useContext(RTLContext);
}