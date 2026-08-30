"use client";

import * as React from "react";

type UIScale = "compacto" | "normal" | "ampliado";

interface UISettingsContextValue {
  scale: UIScale;
  setScale: (scale: UIScale) => void;
}

const UISettingsContext = React.createContext<UISettingsContextValue>({
  scale: "normal",
  setScale: () => {},
});

const STORAGE_KEY = "pf-ui-scale";
const VALID_SCALES: UIScale[] = ["compacto", "normal", "ampliado"];

function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = React.useState<UIScale>("normal");

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && VALID_SCALES.includes(saved as UIScale)) {
        setScaleState(saved as UIScale);
        document.documentElement.setAttribute("data-ui-scale", saved);
      }
    } catch {}
  }, []);

  const setScale = React.useCallback((s: UIScale) => {
    setScaleState(s);
    document.documentElement.setAttribute("data-ui-scale", s);
    try {
      localStorage.setItem(STORAGE_KEY, s);
    } catch {}
  }, []);

  return (
    <UISettingsContext.Provider value={{ scale, setScale }}>
      {children}
    </UISettingsContext.Provider>
  );
}

function useUISettings() {
  return React.useContext(UISettingsContext);
}

export { UISettingsProvider, useUISettings, type UIScale };
