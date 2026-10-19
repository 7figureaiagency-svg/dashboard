import { useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  setStoredTheme,
  type Theme,
} from "@/lib/theme";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme(getStoredTheme()),
  );

  useEffect(() => {
    // Initial sync
    applyTheme(theme);
    setResolvedTheme(resolveTheme(theme));

    // Media query listener for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      const current = getStoredTheme();
      if (current === "system") {
        applyTheme("system");
        setResolvedTheme(resolveTheme("system"));
      }
    };

    // Custom event listener for cross-component state sync
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<Theme>;
      const newTheme = customEvent.detail || getStoredTheme();
      setThemeState(newTheme);
      setResolvedTheme(resolveTheme(newTheme));
    };

    // Storage listener for cross-tab sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "nextgen_crm_theme") {
        const newTheme = (e.newValue as Theme) || "system";
        setThemeState(newTheme);
        applyTheme(newTheme);
        setResolvedTheme(resolveTheme(newTheme));
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    window.addEventListener("nextgen_theme_changed", handleThemeChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
      window.removeEventListener("nextgen_theme_changed", handleThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);
    setResolvedTheme(resolveTheme(newTheme));
  };

  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  return {
    theme,
    resolvedTheme,
    isDark: resolvedTheme === "dark",
    setTheme,
    toggleTheme,
  };
}
