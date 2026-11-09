"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import { validatePreference, type CompanyPreference } from "@/lib/comp/types";
import { COMPANY_PREFERENCES_CACHE_KEY, COMPANY_PREFERENCES_KEY } from "../company-directory.constants";
import { matchesCompanyCategory, safeCareersUrl } from "../company-directory.helpers";
import type { CompanyDirectoryMainFilter } from "../company-directory.constants";

export function useCompanyDirectoryPreferences(
  companies: CompanyCard[],
  preferences: Record<string, CompanyPreference>,
  setPreferences: Dispatch<SetStateAction<Record<string, CompanyPreference>>>,
  tab: CompanyDirectoryMainFilter,
  ready: boolean,
  canSync: boolean,
  setNotice: Dispatch<SetStateAction<string>>,
) {
  const [copied, setCopied] = useState<string | null>(null);
  const [reaction, setReaction] = useState<{ key: string; type: "like" | "dislike"; leaving: boolean } | null>(null);
  const preferenceChannel = useRef<BroadcastChannel | null>(null);
  const preferencesRef = useRef(preferences);
  const committedPreferences = useRef(new Map<string, CompanyPreference | null>());
  const latestMutationByKey = useRef(new Map<string, number>());
  const writeQueues = useRef(new Map<string, Promise<void>>());
  const pendingWrites = useRef(new Map<string, number>());
  const mutationSequence = useRef(0);
  const reactionSequence = useRef(0);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const commitPreferences = useCallback((update: SetStateAction<Record<string, CompanyPreference>>) => {
    const next = typeof update === "function" ? update(preferencesRef.current) : update;
    preferencesRef.current = next;
    setPreferences(next);
    return next;
  }, [setPreferences]);

  const preferenceSnapshotForSync = useCallback(() => {
    const snapshot = { ...preferencesRef.current };
    for (const [key, count] of pendingWrites.current) {
      if (!count) continue;
      const savedPreference = committedPreferences.current.get(key) || null;
      if (savedPreference) snapshot[key] = savedPreference;
      else delete snapshot[key];
    }
    return snapshot;
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const clearNotice = useCallback(() => setNotice(""), [setNotice]);
  const updatePreference = useCallback(async (key: string, change: CompanyPreference, reactionType?: "like" | "dislike") => {
    if (!ready) return false;
    const mutationId = ++mutationSequence.current;
    latestMutationByKey.current.set(key, mutationId);
    const reactionId = reactionType ? ++reactionSequence.current : null;
    if (reactionType) setReaction({ key, type: reactionType, leaving: false });
    if (!committedPreferences.current.has(key)) {
      committedPreferences.current.set(key, preferencesRef.current[key] || null);
    }
    if (canSync) {
      pendingWrites.current.set(key, (pendingWrites.current.get(key) || 0) + 1);
    }

    const optimisticChange = { ...change };
    if (reactionType === "like" && change.liked) optimisticChange.disliked = false;
    if (reactionType === "dislike" && change.disliked) optimisticChange.liked = false;
    const optimisticNext = commitPreferences(current => ({
      ...current,
      [key]: { ...current[key], ...optimisticChange },
    }));

    async function finishReactionAnimation(preference?: CompanyPreference) {
      if (!reactionType || reactionId === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      await new Promise(resolve => setTimeout(resolve, 240));
      const company = companies.find(company => company.key === key);
      if (
        reactionSequence.current === reactionId &&
        company &&
        !matchesCompanyCategory(company, tab, preference)
      ) {
        setReaction({ key, type: reactionType, leaving: true });
        await new Promise(resolve => setTimeout(resolve, 280));
      }
    }

    try {
      if (!canSync) {
        localStorage.setItem(COMPANY_PREFERENCES_KEY, JSON.stringify(optimisticNext));
        committedPreferences.current.set(key, optimisticNext[key]);
        await finishReactionAnimation(optimisticNext[key]);
        setNotice("Saved in this browser. Shared sync is unavailable.");
        return true;
      }

      const previousWrite = writeQueues.current.get(key) || Promise.resolve();
      const request = previousWrite.then(async () => {
        const response = await fetch("/api/comp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { [key]: optimisticChange } }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as { ownerId?: unknown; preferences?: Record<string, CompanyPreference> };
      });
      const queueTail = request.then(() => undefined, () => undefined);
      writeQueues.current.set(key, queueTail);
      void queueTail.then(() => {
        if (writeQueues.current.get(key) === queueTail) writeQueues.current.delete(key);
      });

      const data = await request;
      const savedPreference = data.preferences?.[key] || optimisticNext[key];
      committedPreferences.current.set(key, savedPreference);
      if (latestMutationByKey.current.get(key) === mutationId) {
        commitPreferences(current => ({ ...current, [key]: savedPreference }));
      }
      try {
        if (typeof data.ownerId === "string") localStorage.setItem(COMPANY_PREFERENCES_CACHE_KEY, JSON.stringify({ ownerId: data.ownerId, preferences: preferenceSnapshotForSync() }));
      } catch { /* MongoDB remains the source of truth. */ }
      await finishReactionAnimation(savedPreference);
      preferenceChannel.current?.postMessage({ type: "preferences", preferences: preferenceSnapshotForSync() });
      setNotice("");
      return true;
    } catch (error) {
      if (latestMutationByKey.current.get(key) !== mutationId) return true;
      const savedPreference = committedPreferences.current.get(key) || null;
      commitPreferences(current => {
        const next = { ...current };
        if (savedPreference) next[key] = savedPreference;
        else delete next[key];
        return next;
      });
      setNotice(error instanceof Error ? error.message : "Changes could not be saved. Please retry.");
      return false;
    } finally {
      if (canSync) {
        const remaining = (pendingWrites.current.get(key) || 1) - 1;
        if (remaining > 0) pendingWrites.current.set(key, remaining);
        else pendingWrites.current.delete(key);
      }
      if (reactionId !== null && reactionSequence.current === reactionId) setReaction(null);
    }
  }, [ready, companies, tab, canSync, commitPreferences, preferenceSnapshotForSync, setNotice]);

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
        const nextPreferences = Object.fromEntries(Object.entries(message.preferences).map(([key, value]) => [key, validatePreference(value)]));
        committedPreferences.current = new Map<string, CompanyPreference | null>(Object.entries(nextPreferences));
        const mergedPreferences = { ...nextPreferences };
        const currentPreferences = preferencesRef.current;
        for (const [key, count] of pendingWrites.current) {
          if (!count) continue;
          if (currentPreferences[key]) mergedPreferences[key] = currentPreferences[key];
          else delete mergedPreferences[key];
        }
        commitPreferences(mergedPreferences);
        try {
          const cached = JSON.parse(localStorage.getItem(COMPANY_PREFERENCES_CACHE_KEY) || "null");
          if (typeof cached?.ownerId === "string") {
            localStorage.setItem(COMPANY_PREFERENCES_CACHE_KEY, JSON.stringify({ ownerId: cached.ownerId, preferences: preferenceSnapshotForSync() }));
          }
        } catch { /* MongoDB remains the source of truth. */ }
      } catch {
        // Ignore invalid messages and keep the current preference state.
      }
    };
    return () => {
      channel.close();
      if (preferenceChannel.current === channel) preferenceChannel.current = null;
    };
  }, [canSync, commitPreferences, preferenceSnapshotForSync]);

  useEffect(() => {
    function syncBrowserStorage(event: StorageEvent) {
      if (event.key !== COMPANY_PREFERENCES_KEY || !event.newValue || canSync) return;
      try {
        const stored = JSON.parse(event.newValue) as Record<string, unknown>;
        const localPreferences = Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, validatePreference(value)]));
        commitPreferences(localPreferences);
        committedPreferences.current = new Map<string, CompanyPreference | null>(Object.entries(localPreferences));
      } catch {
        // Ignore malformed updates from another tab and keep the current view.
      }
    }
    window.addEventListener("storage", syncBrowserStorage);
    return () => window.removeEventListener("storage", syncBrowserStorage);
  }, [canSync, commitPreferences]);

  return { preferences, setPreferences, copied, setCopied, reaction, setReaction, updatePreference, saveCareers, clearNotice };
}

export const CompanyDirectoryPreferences = useCompanyDirectoryPreferences;
