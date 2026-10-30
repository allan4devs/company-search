"use client";

import { useEffect, useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyCategory } from "@/lib/comp/categories";
import type { CompanyPreference } from "@/lib/comp/types";
import { validatePreference } from "@/lib/comp/types";
import { COMPANY_PREFERENCES_KEY } from "../company-directory.constants";

export function useCompanyDirectoryData(initialCompanies: CompanyCard[], initialCategories: CompanyCategory[]) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [categories, setCategories] = useState(initialCategories);
  const [preferences, setPreferences] = useState<Record<string, CompanyPreference>>({});
  const [ready, setReady] = useState(true);
  const [canSync, setCanSync] = useState(false);
  const [loading, setLoading] = useState(initialCompanies.length === 0);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    try {
      const stored = JSON.parse(localStorage.getItem(COMPANY_PREFERENCES_KEY) || "{}");
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw new Error("Invalid preferences");
      const localPreferences = Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, validatePreference(value)]));
      setPreferences(localPreferences);
    } catch {
      setNotice("Browser preferences could not be loaded. Check browser storage settings before saving changes.");
    }
    async function load() {
      setLoadError(false);
      try {
        const sessionResponse = await fetch("/api/comp/session", { cache: "no-store" });
        const data = sessionResponse.ok ? await sessionResponse.json() : { canEdit: false, preferences: {} };
        if (!active) return;
        setPreferences(data.preferences || {});
        setCanSync(!!data.canEdit);
        if (data.canEdit) {
          setNotice("");
          try {
            const stored = localStorage.getItem(COMPANY_PREFERENCES_KEY);
            if (stored && stored !== "{}") {
              const migrated = await fetch("/api/comp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: JSON.parse(stored), importOnly: true }) });
              const result = await migrated.json();
              if (!migrated.ok) throw new Error(result.error);
              if (active) setPreferences(result.preferences);
              localStorage.removeItem(COMPANY_PREFERENCES_KEY);
            }
          } catch { if (active) setNotice("Browser preferences could not be imported. They are preserved; reload to retry."); }
        } else {
          try {
            const stored = JSON.parse(localStorage.getItem(COMPANY_PREFERENCES_KEY) || "{}");
            if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw new Error("Invalid preferences");
            const localPreferences = Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, validatePreference(value)]));
            setPreferences(localPreferences);
            setNotice("Preferences are saved in this browser. Sign in as admin to sync across devices.");
          } catch {
            setNotice("Browser preferences could not be loaded. Check browser storage settings before saving changes.");
          }
        }
        if (active) setReady(true);
      } catch (error) {
        if (active) {
          setNotice(error instanceof Error ? error.message : "Admin preferences could not be loaded.");
          setReady(true);
        }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [reload]);

  return { companies, setCompanies, categories, setCategories, preferences, setPreferences, ready, setReady, canSync, loading, loadError, reload, setReload, notice, setNotice };
}

export const CompanyDirectory = useCompanyDirectoryData;
