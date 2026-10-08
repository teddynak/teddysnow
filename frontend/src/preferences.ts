import { useEffect, useState } from "react";
import type { Severity } from "./api";

export interface Preferences {
  theme: "dark" | "light" | "system";
  density: "comfortable" | "compact";
  editorFontSize: number;
  wrapLines: boolean;
  autoScanUploads: boolean;
  defaultSeverity: "ALL" | Severity;
  defaultExport: "sarif" | "markdown" | "json";
}
export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark", density: "comfortable", editorFontSize: 13,
  wrapLines: true, autoScanUploads: true, defaultSeverity: "ALL", defaultExport: "sarif",
};
const KEY = "teddysnow.preferences.v1";
function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!saved || typeof saved !== "object") return { ...DEFAULT_PREFERENCES };
    return {
      theme: ["dark", "light", "system"].includes(saved.theme) ? saved.theme : DEFAULT_PREFERENCES.theme,
      density: ["comfortable", "compact"].includes(saved.density) ? saved.density : DEFAULT_PREFERENCES.density,
      editorFontSize: [12, 13, 14, 16].includes(saved.editorFontSize) ? saved.editorFontSize : DEFAULT_PREFERENCES.editorFontSize,
      wrapLines: typeof saved.wrapLines === "boolean" ? saved.wrapLines : DEFAULT_PREFERENCES.wrapLines,
      autoScanUploads: typeof saved.autoScanUploads === "boolean" ? saved.autoScanUploads : DEFAULT_PREFERENCES.autoScanUploads,
      defaultSeverity: ["ALL", "ERROR", "WARNING", "INFO"].includes(saved.defaultSeverity) ? saved.defaultSeverity : DEFAULT_PREFERENCES.defaultSeverity,
      defaultExport: ["sarif", "markdown", "json"].includes(saved.defaultExport) ? saved.defaultExport : DEFAULT_PREFERENCES.defaultExport,
    };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [storageError, setStorageError] = useState<string | null>(null);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(preferences)); setStorageError(null); }
    catch { setStorageError("Browser storage is unavailable. These preferences will apply until you close this page."); }
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = preferences.theme === "system" ? (media.matches ? "dark" : "light") : preferences.theme;
      document.documentElement.dataset.density = preferences.density;
      document.documentElement.dataset.wrap = String(preferences.wrapLines);
      document.documentElement.style.setProperty("--editor-font-size", `${preferences.editorFontSize}px`);
    };
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences]);
  const updatePreferences = (patch: Partial<Preferences>) => setPreferences(current => ({ ...current, ...patch }));
  return { preferences, updatePreferences, storageError };
}
