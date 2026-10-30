"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import { validatePreference, type CompanyPreference } from "@/lib/comp/types";
import { COMPANY_PREFERENCES_KEY } from "../company-directory.constants";
import { matchesCompanyCategory, safeCareersUrl } from "../company-directory.helpers";
import type { CompanyDirectoryCategory } from "../company-directory.constants";

export function useCompanyDirectoryPreferences(
  companies: CompanyCard[],
  preferences: Record<string, CompanyPreference>,
  setPreferences: Dispatch<SetStateAction<Record<string, CompanyPreference>>>,
  tab: CompanyDirectoryCategory,
  ready: boolean,
  canSync: boolean,
  setReady: Dispatch<SetStateAction<boolean>>,
  setNotice: Dispatch<SetStateAction<string>>,
) {
  const [copied, setCopied] = useState<string | null>(null);
  const [reaction, setReaction] = useState<{ key: string; type: "like" | "dislike"; leaving: boolean } | null>(null);
  const preferenceChannel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const clearNotice = useCallback(() => setNotice(""), [setNotice]);
  const updatePreference = useCallback(async (key: string, change: CompanyPreference, reactionType?: "like" | "dislike") => {
    if (!ready) return false;
    setReady(false);
    if (reactionType) setReaction({ key, type: reactionType, leaving: false });
    async function applyPreferences(next: Record<string, CompanyPreference>) {
      if (reactionType && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise(resolve => setTimeout(resolve, 240));
        const company = companies.find(company => company.key === key);
        if (company && !matchesCompanyCategory(company, tab, next[key])) {
          setReaction({ key, type: reactionType, leaving: true });
          await new Promise(resolve => setTimeout(resolve, 280));
        }
      }
      setPreferences(next);
    }
    try {
      if (!canSync) {
        const next = { ...preferences, [key]: { ...preferences[key], ...change } };
        localStorage.setItem(COMPANY_PREFERENCES_KEY, JSON.stringify(next));
        await applyPreferences(next);
        setNotice("Saved in this browser. Sign in as admin to sync across devices.");
        return true;
      }
      const response = await fetch("/api/comp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { [key]: change } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await applyPreferences(data.preferences);
      preferenceChannel.current?.postMessage({ type: "preferences", preferences: data.preferences });
      setNotice("");
      return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : "Changes could not be saved. Please retry."); return false; }
    finally { setReaction(null); setReady(true); }
  }, [ready, companies, tab, canSync, preferences, setReady, setNotice]);

  const saveCareers = useCallback(async (company: CompanyCard, draft: string) => {
    const url = safeCareersUrl(draft.trim());
    if (!url) { setNotice("Enter a valid careers URL starting with https:// or http://."); return false; }
    return updatePreference(company.key, { careersUrl: url });
  }, [updatePreference, setNotice]);

  useEffect(() => {
    if (!canSync || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("comp-preference-sync-v1");
    preferenceChannel.current = channel;
    channel.onmessage = event => {
      const message = event.data as { type?: string; preferences?: unknown };
      if (message?.type !== "preferences" || !message.preferences || typeof message.preferences !== "object" || Array.isArray(message.preferences)) return;
      try {
        setPreferences(Object.fromEntries(Object.entries(message.preferences).map(([key, value]) => [key, validatePreference(value)])));
      } catch {
        // Ignore invalid messages and keep the current preference state.
      }
    };
    return () => {
      channel.close();
      if (preferenceChannel.current === channel) preferenceChannel.current = null;
    };
  }, [canSync]);

  useEffect(() => {
    function syncBrowserStorage(event: StorageEvent) {
      if (event.key !== COMPANY_PREFERENCES_KEY || !event.newValue || canSync) return;
      try {
        const stored = JSON.parse(event.newValue) as Record<string, unknown>;
        const localPreferences = Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, validatePreference(value)]));
        setPreferences(localPreferences);
      } catch {
        // Ignore malformed updates from another tab and keep the current view.
      }
    }
    window.addEventListener("storage", syncBrowserStorage);
    return () => window.removeEventListener("storage", syncBrowserStorage);
  }, [canSync]);

  return { preferences, setPreferences, copied, setCopied, reaction, setReaction, updatePreference, saveCareers, clearNotice };
}

export const CompanyDirectoryPreferences = useCompanyDirectoryPreferences;
