"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Heart,
  Pencil,
  MapPin,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import type { CompanyCard } from "@/lib/comp/catalog";
import { TARGET_COMPANIES } from "@/lib/comp/catalog";
import type {
  CompanyDirectoryCategory,
  CompanyDirectoryGroupKey,
  CompanyDirectoryMainFilter,
} from "../company-directory.constants";
import { COMPANY_GROUPS } from "../company-directory.constants";
import type {
  CompanyDirectoryGroupSummaries,
  CompanyDirectoryGroupSummary,
  CompanyDirectoryViewData,
} from "../hooks/company-directory-view-types";
import {
  CompanyDirectoryHeader,
  CompanyDirectoryTopbar,
} from "./CompanyDirectoryHeader";
import { CompanyDirectoryTabs } from "./CompanyDirectoryTabs";
import { CompanyDirectoryStats } from "./CompanyDirectoryStats";
import { AllCompaniesDirectorySection } from "./AllCompaniesDirectorySection";
import { CompanyProfileCard } from "./CompanyProfileCard";
import { CompanyCardActions } from "./CompanyCardActions";
import styles from "./CompanyDirectoryView.module.css";

type Props = CompanyDirectoryViewData;

const emptyStats: CompanyDirectoryGroupSummary["stats"] = {
  total: 0,
  linked: 0,
  nearshore: 0,
  researched: 0,
  midLevel: 0,
};

export function CompanyDirectoryView({
  data,
  preferences,
  tab,
  setTab,
}: Props) {
  const [selectedCompany, setSelectedCompany] = useState<CompanyCard | null>(
    null,
  );
  const [jobTitle, setJobTitle] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [addingJob, setAddingJob] = useState(false);
  const [sharingJobId, setSharingJobId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [groupSummaries, setGroupSummaries] =
    useState<CompanyDirectoryGroupSummaries>({});
  const [keywordQuery, setKeywordQuery] = useState("");
  const [selectionRestored, setSelectionRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("cv-selected-company-v1");
      if (!saved) return;
      const parsed = JSON.parse(saved) as CompanyCard;
      if (parsed && typeof parsed.key === "string") setSelectedCompany(parsed);
    } catch {
      sessionStorage.removeItem("cv-selected-company-v1");
    } finally {
      setSelectionRestored(true);
    }
  }, []);
  useEffect(() => {
    if (!selectionRestored) return;
    try {
      if (selectedCompany) {
        sessionStorage.setItem("cv-selected-company-v1", JSON.stringify(selectedCompany));
        requestAnimationFrame(() =>
          document.getElementById(`company-card-${selectedCompany.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
        );
      } else {
        sessionStorage.removeItem("cv-selected-company-v1");
      }
    } catch {
      // Keep the selected detail panel usable when session storage is unavailable.
    }
  }, [selectedCompany, data.companies, selectionRestored]);
  useEffect(() => {
    if (!selectedCompany) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCompany(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCompany]);
  const hasAllSummaries = COMPANY_GROUPS.every(
    (group) => groupSummaries[group.key],
  );
  const groupCounts = useMemo(() => {
    const counts: Partial<Record<CompanyDirectoryMainFilter, number>> = {};
    const savedViews: CompanyDirectoryCategory[] = [
      "all",
      "likes",
      "dislikes",
      "archived",
      "saved-jobs",
    ];
    for (const group of COMPANY_GROUPS) {
      const summary = groupSummaries[group.key];
      if (!summary) continue;
      counts[group.key] = summary.stats.total;
    }
    if (hasAllSummaries) {
      for (const savedView of savedViews) {
        counts[savedView] = COMPANY_GROUPS.reduce(
          (total, group) =>
            total + (groupSummaries[group.key]?.categoryCounts[savedView] || 0),
          0,
        );
      }
    }
    const savedPreferences = Object.values(preferences.preferences);
    counts.likes = savedPreferences.filter((preference) => preference.liked && !preference.archived).length;
    counts.dislikes = savedPreferences.filter((preference) => preference.disliked && !preference.archived).length;
    counts.archived = savedPreferences.filter((preference) => preference.archived).length;
    counts["saved-jobs"] = savedPreferences.filter((preference) => (preference.likedJobIds || []).length > 0).length;
    return counts;
  }, [groupSummaries, hasAllSummaries, preferences.preferences]);
  const stats = useMemo(() => {
    if (!hasAllSummaries) return emptyStats;
    return COMPANY_GROUPS.reduce((total, group) => {
      const current = groupSummaries[group.key]?.stats;
      if (!current) return total;
      return {
        total: total.total + current.total,
        linked: total.linked + current.linked,
        nearshore: total.nearshore + current.nearshore,
        researched: total.researched + current.researched,
        midLevel: total.midLevel + current.midLevel,
      };
    }, emptyStats);
  }, [groupSummaries, hasAllSummaries]);
  const handleSummary = useCallback(
    (key: CompanyDirectoryGroupKey, summary: CompanyDirectoryGroupSummary) => {
      setGroupSummaries((current) => {
        const previous = current[key];
        if (
          previous &&
          previous.total === summary.total &&
          JSON.stringify(previous.categoryCounts) ===
            JSON.stringify(summary.categoryCounts) &&
          JSON.stringify(previous.stats) === JSON.stringify(summary.stats)
        )
          return current;
        return { ...current, [key]: summary };
      });
    },
    [],
  );
  const showAllGroups =
    tab === "all" ||
    tab === "likes" ||
    tab === "dislikes" ||
    tab === "archived";
  const selectedPreference = selectedCompany
    ? preferences.preferences[selectedCompany.key] ||
      selectedCompany.legacyKeys
        ?.map((key) => preferences.preferences[key])
        .find(Boolean)
    : undefined;
  const selectedJobs = selectedCompany
    ? [...selectedCompany.jobs, ...(selectedPreference?.addedJobs || [])]
    : [];
  const visibleSelectedJobs = tab === "saved-jobs"
    ? selectedJobs.filter((job) => selectedPreference?.likedJobIds?.includes(job.id || ""))
    : selectedJobs;
  const updateSelectedPreference = async (
    key: string,
    change: Parameters<typeof preferences.updatePreference>[1],
    reactionType?: "like" | "dislike",
  ) => {
    const saved = await preferences.updatePreference(key, change, reactionType);
    if (saved && reactionType === "dislike" && change.disliked) {
      setSelectedCompany(null);
    }
    return saved;
  };
  const addJob = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCompany) return;
    setAddingJob(true);
    const job = {
        id: editingJobId || `manual-${Date.now()}`,
        title: jobTitle.trim(),
        url: jobUrl.trim(),
        location: jobLocation.trim(),
      };
    const addedJobs = editingJobId
      ? (selectedPreference?.addedJobs || []).map((item) => item.id === editingJobId ? { ...item, ...job } : item)
      : [...(selectedPreference?.addedJobs || []), job];
    if (
      await preferences.updatePreference(selectedCompany.key, { addedJobs })
    ) {
      setJobTitle("");
      setJobUrl("");
      setJobLocation("");
      setEditingJobId(null);
    }
    setAddingJob(false);
  };
  const editJob = (job: CompanyCard["jobs"][number]) => {
    setEditingJobId(job.id || null);
    setJobTitle(job.title || "");
    setJobUrl(job.url || "");
    setJobLocation(job.location || "");
    document.getElementById("job-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const removeJob = async (jobId: string) => {
    if (!selectedCompany || !window.confirm("Remove this job?")) return;
    await preferences.updatePreference(selectedCompany.key, {
      addedJobs: (selectedPreference?.addedJobs || []).filter((job) => job.id !== jobId),
      likedJobIds: (selectedPreference?.likedJobIds || []).filter((id) => id !== jobId),
    });
  };
  const shareJob = async (job: CompanyCard["jobs"][number], fallbackId: string) => {
    if (!selectedCompany) return;
    const jobId = job.id || fallbackId;
    setSharingJobId(jobId);
    setShareLink("");
    try {
      const response = await fetch("/api/comp/share-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: selectedCompany.name, job }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create share link.");
      const url = `${window.location.origin}/shared-job/${payload.id}`;
      setShareLink(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // The link remains visible for manual copying.
      }
    } catch (error) {
      data.setNotice(error instanceof Error ? error.message : "Could not create share link.");
    } finally {
      setSharingJobId(null);
    }
  };
  return (
    <main
      className={`min-h-screen bg-zinc-950 text-zinc-100 ${styles.directory}`}
    >
      <CompanyDirectoryTopbar />
      <div
        className={`${styles.layout} ${selectedCompany ? styles.layoutWithDetails : ""}`}
      >
        <aside
          aria-label="Company directory navigation"
          className={`${styles.sidebar} rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4`}
        >
          <CompanyDirectoryTabs
            tab={tab}
            setTab={setTab}
            groupCounts={groupCounts}
            keywordQuery={keywordQuery}
            setKeywordQuery={setKeywordQuery}
          />
        </aside>
        <div className="min-w-0">
          {data.notice ? (
            <p role="status" className="mb-4 text-sm text-amber-300">
              {data.notice}
            </p>
          ) : null}
          <span role="status" className="sr-only">
            {preferences.copied ? "Copied to clipboard." : ""}
          </span>
          {data.loading ? (
            <p role="status" className="mb-5 text-zinc-400">
              Loading preferences…
            </p>
          ) : null}
          {data.loadError ? (
            <button
              type="button"
              onClick={() => data.setReload((value) => value + 1)}
              className="mb-5 rounded-lg bg-teal-400 px-4 py-2 text-zinc-950"
            >
              Retry loading
            </button>
          ) : null}
          <div
            role="tabpanel"
            id="company-panel"
            aria-labelledby={`${tab}-tab`}
          >
            <AllCompaniesDirectorySection
              filter={tab}
              keywordQuery={keywordQuery}
              active={showAllGroups || tab === "companies" || tab === "saved-jobs"}
              data={data}
              preferences={preferences}
              onSummary={handleSummary}
              onOpenCompany={setSelectedCompany}
              selectedCompanyKey={selectedCompany?.key}
            />
          </div>
          <footer className="border-t border-zinc-800 py-5 text-xs text-zinc-500">
            Additional company profiles:{" "}
            <a
              href="https://remoteintech.company/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-300 underline"
            >
              Remote In Tech
            </a>
            . Profile information is attributed on each card; employer feeds
            provide role evidence.
          </footer>
        </div>
      {selectedCompany ? (
          <aside
            role="region"
            aria-labelledby="company-detail-title"
            className={`${styles.detailsPanel} rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl`}
          >
            <header className="flex items-start justify-between border-b border-zinc-800 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
                  Company details
                </p>
                <h2
                  id="company-detail-title"
                  className="mt-2 text-xl font-semibold text-white"
                >
                  {selectedCompany.name}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!data.ready}
                  onClick={() =>
                    void preferences.updatePreference(selectedCompany.key, {
                      archived: !selectedPreference?.archived,
                    })
                  }
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {selectedPreference?.archived ? "Restore" : "Archive / hide"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCompany(null)}
                  aria-label="Close"
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
              <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <CompanyProfileCard
                  company={selectedCompany}
                  preference={selectedPreference}
                  copied={preferences.copied}
                  onCopied={preferences.setCopied}
                  onCopyError={() =>
                    data.setNotice(
                      "Could not copy. Check clipboard permissions and try again.",
                    )
                  }
                />
                <CompanyCardActions
                  company={selectedCompany}
                  preference={selectedPreference}
                  ready={data.ready}
                  reaction={
                    preferences.reaction?.key === selectedCompany.key
                      ? {
                          type: preferences.reaction.type,
                          leaving: preferences.reaction.leaving,
                        }
                      : null
                  }
                  onPreferenceChange={updateSelectedPreference}
                  onSaveCareers={preferences.saveCareers}
                  onCancel={preferences.clearNotice}
                />
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
                  About
                </h3>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {selectedCompany.research?.notes ||
                    selectedCompany.nearshore?.notes ||
                    selectedCompany.discovery?.remotePolicy ||
                    "Company profile and hiring information."}
                </p>
                <div className="mt-4 space-y-3 text-sm text-zinc-300">
                  {selectedCompany.research?.region ||
                  selectedCompany.locations.length ? (
                    <p className="flex items-center gap-2">
                      <MapPin size={15} className="text-teal-300" />
                      {selectedCompany.research?.region ||
                        selectedCompany.locations.join(" · ")}
                    </p>
                  ) : null}
                  {selectedCompany.research?.workMode ? (
                    <p>{selectedCompany.research.workMode}</p>
                  ) : null}
                  {selectedCompany.careersUrl ||
                  selectedCompany.nearshore?.careersUrl ||
                  selectedCompany.website ? (
                    <a
                      href={
                        selectedCompany.careersUrl ||
                        selectedCompany.nearshore?.careersUrl ||
                        selectedCompany.website
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-300 underline"
                    >
                      Company careers page <ArrowUpRight size={14} />
                    </a>
                  ) : null}
                </div>
              </section>
              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
                    Jobs
                  </h3>
                  <span className="text-xs text-zinc-500">
                    {selectedJobs.length} listed
                  </span>
                </div>
                {visibleSelectedJobs.length ? (
                  <ul className="mt-4 space-y-3">
                    {visibleSelectedJobs.map((job, index) => (
                      <li
                        key={job.id || `${job.title}-${job.url}-${index}`}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-w-0 flex-1 items-start justify-between gap-4"
                          >
                            <span>
                              <span className="font-medium text-zinc-100">
                                {job.title || "Open role"}
                              </span>
                              <span className="mt-2 block text-xs text-zinc-400">
                                {[job.location, job.workMode, job.listingStatus]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                              {job.matchReason || job.sourceNotes ? (
                                <span className="mt-2 block text-xs leading-5 text-zinc-400">
                                  {job.matchReason || job.sourceNotes}
                                </span>
                              ) : null}
                            </span>
                            <ArrowUpRight
                              size={16}
                              className="shrink-0 text-teal-300"
                            />
                          </a>
                          {(() => {
                            const jobId =
                              job.id || `${job.title}-${job.url}-${index}`;
                            const isLiked =
                              selectedPreference?.likedJobIds?.includes(
                                jobId,
                              ) || false;
                            return (
                              <span className="flex shrink-0 items-center gap-1">
                                {selectedPreference?.addedJobs?.some((item) => item.id === jobId) ? <>
                                  <button type="button" disabled={!data.ready} aria-label={`Edit ${job.title || "job"}`} title="Edit job" onClick={() => editJob(job)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-teal-300 disabled:opacity-50"><Pencil size={16} /></button>
                                  <button type="button" disabled={!data.ready} aria-label={`Remove ${job.title || "job"}`} title="Remove job" onClick={() => void removeJob(jobId)} className="rounded-lg p-2 text-zinc-400 hover:bg-red-950/50 hover:text-red-300 disabled:opacity-50"><Trash2 size={16} /></button>
                                </> : null}
                                <button
                                  type="button"
                                  disabled={sharingJobId === jobId}
                                  aria-label={`Share ${job.title || "this job"}`}
                                  title="Create and copy public job link"
                                  onClick={() => void shareJob(job, jobId)}
                                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-teal-300 disabled:opacity-50"
                                >
                                  <Share2 size={17} />
                                </button>
                                <button
                                  type="button"
                                  disabled={!data.ready}
                                  aria-label={`${isLiked ? "Unlike" : "Like"} ${job.title || "this job"}`}
                                  aria-pressed={isLiked}
                                  onClick={() => {
                                    if (!selectedCompany) return;
                                    const likedJobIds = new Set(
                                      selectedPreference?.likedJobIds || [],
                                    );
                                    if (isLiked) likedJobIds.delete(jobId);
                                    else likedJobIds.add(jobId);
                                    void preferences.updatePreference(
                                      selectedCompany.key,
                                      { likedJobIds: [...likedJobIds] },
                                    );
                                  }}
                                  className="shrink-0 rounded-lg p-2 text-pink-300 hover:bg-pink-950/40 disabled:opacity-50"
                                >
                                  <Heart
                                    size={18}
                                    fill={isLiked ? "currentColor" : "none"}
                                  />
                                </button>
                              </span>
                            );
                          })()}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-zinc-700 p-5 text-sm text-zinc-400">
                    <BriefcaseBusiness size={18} className="mb-3" />
                    No saved job links. Add one below or visit the careers page.
                  </div>
                )}
                {shareLink ? <p role="status" className="mt-3 break-all text-xs text-teal-300">Copied share link: <a className="underline" href={shareLink} target="_blank" rel="noopener noreferrer">{shareLink}</a></p> : null}
                <form
                  id="job-editor"
                  onSubmit={addJob}
                  className="mt-4 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
                >
                  <p className="text-sm font-medium text-zinc-200">{editingJobId ? "Edit job" : "Add a job"}</p>
                  <input
                    required
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                    placeholder="Job title"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="url"
                    value={jobUrl}
                    onChange={(event) => setJobUrl(event.target.value)}
                    placeholder="https://… job link"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <input
                    value={jobLocation}
                    onChange={(event) => setJobLocation(event.target.value)}
                    placeholder="Location (optional)"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <button
                    disabled={!data.ready || addingJob}
                    className="rounded-lg bg-teal-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                  >
                    {addingJob ? "Saving…" : editingJobId ? "Save changes" : "Save job"}
                  </button>
                  {editingJobId ? <button type="button" onClick={() => { setEditingJobId(null); setJobTitle(""); setJobUrl(""); setJobLocation(""); }} className="ml-2 rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button> : null}
                </form>
              </section>
            </div>
          </aside>
      ) : null}
      </div>
    </main>
  );
}
