"use client";

import { useEffect, useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyCategory } from "@/lib/comp/categories";
import type { CompanyPreference } from "@/lib/comp/types";
import { validatePreference } from "@/lib/comp/types";
import { COMPANY_PREFERENCES_CACHE_KEY, COMPANY_PREFERENCES_KEY } from "../company-directory.constants";

function readPreferences(key: string): Record<string, CompanyPreference> {
  const stored = localStorage.getItem(key);
  if (!stored) return {};
  const parsed = JSON.parse(stored) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid preferences");
  return Object.fromEntries(Object.entries(parsed).map(([companyKey, value]) => [companyKey, validatePreference(value)]));
}

function readCachedPreferences(): { ownerId: string; preferences: Record<string, CompanyPreference> } | null {
  const stored = localStorage.getItem(COMPANY_PREFERENCES_CACHE_KEY);
  if (!stored) return null;
  const parsed = JSON.parse(stored) as { ownerId?: unknown; preferences?: unknown };
  if (!parsed || typeof parsed !== "object" || typeof parsed.ownerId !== "string" || !parsed.preferences || typeof parsed.preferences !== "object" || Array.isArray(parsed.preferences)) {
    throw new Error("Invalid preference cache");
  }
  const preferences = Object.fromEntries(Object.entries(parsed.preferences).map(([key, value]) => [key, validatePreference(value)]));
  return { ownerId: parsed.ownerId, preferences };
}

function hasPreferences(preferences: Record<string, CompanyPreference>) {
  return Object.keys(preferences).length > 0;
}

export function useCompanyDirectoryData(initialCompanies: CompanyCard[], initialCategories: CompanyCategory[]) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [categories, setCategories] = useState(initialCategories);
  const [preferences, setPreferences] = useState<Record<string, CompanyPreference>>({});
  const [ready, setReady] = useState(false);
  const [canSync, setCanSync] = useState(false);
  const [loading, setLoading] = useState(initialCompanies.length === 0);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setReady(false);
    let localPreferences: Record<string, CompanyPreference> = {};
    let cachedSnapshot: { ownerId: string; preferences: Record<string, CompanyPreference> } | null = null;
    let storageReadError = false;
    try { localPreferences = readPreferences(COMPANY_PREFERENCES_KEY); } catch { storageReadError = true; }
    try { cachedSnapshot = readCachedPreferences(); } catch { storageReadError = true; }
    setPreferences(hasPreferences(localPreferences) ? localPreferences : cachedSnapshot?.preferences || {});
    if (storageReadError) setNotice("Some browser preferences could not be loaded. Check browser storage settings before saving changes.");
    const fallbackPreferences = hasPreferences(localPreferences) ? localPreferences : cachedSnapshot?.preferences || {};
    async function load() {
      setLoadError(false);
      try {
        const sessionResponse = await fetch("/api/comp/session", { cache: "no-store" });
        const data = await sessionResponse.json().catch(() => ({}));
        if (!active) return;
        if (!sessionResponse.ok) {
          setCanSync(false);
          setPreferences(fallbackPreferences);
          const detail = typeof data.error === "string" ? ` ${data.error}` : "";
          setNotice(`Account sync is unavailable. Changes will be saved in this browser until sync returns.${detail}`);
        } else if (data.canEdit) {
          setCanSync(true);
          let nextPreferences = (data.preferences || {}) as Record<string, CompanyPreference>;
          const ownerId = typeof data.adminId === "string" ? data.adminId : "";
          let cacheCanUpdate = true;
          setNotice("");
          try {
            if (hasPreferences(localPreferences)) {
              const migrated = await fetch("/api/comp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: localPreferences, importOnly: true }) });
              const result = await migrated.json();
              if (!migrated.ok) throw new Error(result.error);
              nextPreferences = result.preferences;
              localStorage.removeItem(COMPANY_PREFERENCES_KEY);
            }
          } catch {
            cacheCanUpdate = false;
            if (active) setNotice("Browser preferences could not be imported. They are preserved; reload to retry.");
          }
          if (active) {
            setPreferences(nextPreferences);
            if (cacheCanUpdate && ownerId) {
              try { localStorage.setItem(COMPANY_PREFERENCES_CACHE_KEY, JSON.stringify({ ownerId, preferences: nextPreferences })); } catch { /* MongoDB remains the source of truth. */ }
            }
          }
        } else {
          setCanSync(false);
          setPreferences(fallbackPreferences);
          setNotice(storageReadError
            ? "Some browser preferences could not be loaded. Check browser storage settings before saving changes."
            : "Preferences are saved in this browser. Sign in as admin to sync across devices.");
        }
        if (active) setReady(true);
      } catch (error) {
        if (active) {
          setCanSync(false);
          setPreferences(fallbackPreferences);
          const detail = error instanceof Error ? ` ${error.message}` : "";
          setNotice(`Account sync is unavailable. Changes will be saved in this browser until sync returns.${detail}`);
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
