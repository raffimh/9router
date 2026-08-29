"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { THEME_CONFIG } from "@/shared/constants/config";

const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: THEME_CONFIG.defaultTheme,

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },

      toggleTheme: () => {
        const currentTheme = get().theme;
        // Cycle light -> dark -> dracula -> light
        const order = ["light", "dark", "dracula"];
        const nextIdx = (order.indexOf(currentTheme) + 1) % order.length;
        const newTheme = order[nextIdx >= 0 ? nextIdx : 0];
        set({ theme: newTheme });
        applyTheme(newTheme);
      },

      initTheme: () => {
        const theme = get().theme;
        applyTheme(theme);
      },
    }),
    {
      name: THEME_CONFIG.storageKey,
    }
  )
);

// Apply theme to document
function applyTheme(theme) {
  if (typeof window === "undefined") return;

  const root = document.documentElement;
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

  const effectiveTheme = theme === "system" ? systemTheme : theme;

  root.classList.remove("dark", "dracula");
  root.removeAttribute("data-theme");

  if (effectiveTheme === "dark") {
    root.classList.add("dark");
  } else if (effectiveTheme === "dracula") {
    root.classList.add("dark", "dracula");
    root.setAttribute("data-theme", "dracula");
  }
}

export default useThemeStore;

