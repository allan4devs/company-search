"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Copy,
  Heart,
  Image,
  Pencil,
  MapPin,
  Plus,
  Share2,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import { TARGET_COMPANIES } from "@/lib/comp/catalog";
import { companyDetailsCopyText } from "../company-directory.helpers";
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
const jobListFilters: CompanyDirectoryMainFilter[] = ["saved-jobs", "applied-jobs", "archived-jobs"];

export function CompanyDirectoryView({
  data,
  preferences,
  tab,
  setTab,
}: Props) {
  const [selectedCompany, setSelectedCompany] = useState<CompanyCard | null>(
    null,
  );
  const [editingCareers, setEditingCareers] = useState(false);
  const [careersDraft, setCareersDraft] = useState("");
  const companyConfigRef = useRef<HTMLDetailsElement>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const jobDialogRef = useRef<HTMLDialogElement>(null);
  const [addingJob, setAddingJob] = useState(false);
  const [sharingJobId, setSharingJobId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [groupSummaries, setGroupSummaries] =
    useState<CompanyDirectoryGroupSummaries>({});
  const [keywordQuery, setKeywordQuery] = useState("");
  const [latamCostaRicaFilter, setLatamCostaRicaFilter] = useState(false);
  const [hideWithoutDomain, setHideWithoutDomain] = useState(false);
  const [countryFilter, setCountryFilter] = useState("all");
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [visibleCompaniesByFilter, setVisibleCompaniesByFilter] = useState<
    Partial<Record<CompanyDirectoryMainFilter, CompanyCard[]>>
  >({});
  const [undoAction, setUndoAction] = useState<{
    id: number;
    key: string;
    message: string;
    restore: CompanyPreference;
  } | null>(null);
  const undoActionId = useRef(0);
  const [selectionRestored, setSelectionRestored] = useState(false);
  const selectCompany = useCallback((company: CompanyCard | null) => {
    setSelectedCompany(company);
    setEditingCareers(false);
    setCareersDraft("");
    if (companyConfigRef.current) companyConfigRef.current.open = false;
    setJobTitle("");
    setJobUrl("");
    setJobLocation("");
    setEditingJobId(null);
    setJobModalOpen(false);
    setAddingJob(false);
    setSharingJobId(null);
    setShareLink("");
  }, []);
  useEffect(() => {
    const dialog = jobDialogRef.current;
    if (!dialog) return;
    if (jobModalOpen && !dialog.open) dialog.showModal();
    if (!jobModalOpen && dialog.open) dialog.close();
  }, [jobModalOpen]);
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
      if (event.key === "Escape") selectCompany(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCompany, selectCompany]);
  const hasAllSummaries = COMPANY_GROUPS.every(
    (group) => groupSummaries[group.key],
  );
  const groupCounts = useMemo(() => {
    const counts: Partial<Record<CompanyDirectoryMainFilter, number>> = {};
    const savedViews: CompanyDirectoryCategory[] = [
      "all",
      "new",
      "usa",
      "likes",
      "dislikes",
      "archived",
      "saved-jobs",
      "applied-jobs",
      "archived-jobs",
    ];
    if (hasAllSummaries) {
      for (const savedView of savedViews) {
        counts[savedView] = COMPANY_GROUPS.reduce(
          (total, group) =>
            total + (groupSummaries[group.key]?.categoryCounts[savedView] || 0),
          0,
        );
      }
    }
    return counts;
  }, [groupSummaries, hasAllSummaries]);
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
  const handleVisibleCompaniesChange = useCallback(
    (filter: CompanyDirectoryMainFilter, companies: CompanyCard[]) => {
      setVisibleCompaniesByFilter((current) => ({ ...current, [filter]: companies }));
    },
    [],
  );
  const handleCountryOptionsChange = useCallback((countries: string[]) => {
    setCountryOptions(countries);
  }, []);
  const selectedPreference = selectedCompany
    ? preferences.preferences[selectedCompany.key] ||
      selectedCompany.legacyKeys
        ?.map((key) => preferences.preferences[key])
        .find(Boolean)
    : undefined;
  const selectedJobs = selectedCompany
    ? [...selectedCompany.jobs, ...(selectedPreference?.addedJobs || [])]
    : [];
  const savedJobIds = selectedPreference?.likedJobIds || [];
  const visibleSelectedJobs = jobListFilters.includes(tab)
    ? selectedJobs.filter((job) => {
        const jobId = job.id || job.url;
        const isSaved =
          savedJobIds.includes(jobId) ||
          savedJobIds.includes(job.url) ||
          selectedPreference?.addedJobs?.some((addedJob) => addedJob.id === job.id || addedJob.url === job.url);
        const isApplied = selectedPreference?.appliedJobIds?.includes(jobId) || selectedPreference?.appliedJobIds?.includes(job.url) || false;
        const isArchived = selectedPreference?.archivedJobIds?.includes(jobId) || selectedPreference?.archivedJobIds?.includes(job.url) || false;
        if (!isSaved) return false;
        if (tab === "applied-jobs") return isApplied && !isArchived;
        if (tab === "archived-jobs") return isArchived;
        return !isArchived;
      })
    : selectedJobs;
  useEffect(() => {
    if (!undoAction) return;
    const timeout = window.setTimeout(() => setUndoAction(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [undoAction]);

  const updateSelectedPreference = async (
    key: string,
    change: Parameters<typeof preferences.updatePreference>[1],
    reactionType?: "like" | "dislike",
  ) => {
    const companyName =
      data.companies.find((company) => company.key === key || company.legacyKeys?.includes(key))?.name ||
      selectedCompany?.name ||
      key;
    const previousPreference = preferences.preferences[key];
    let undo: { message: string; restore: CompanyPreference } | null = null;
    if (reactionType === "like" && typeof change.liked === "boolean") {
      undo = {
        message: `${change.liked ? "Added" : "Removed"} ${companyName} ${change.liked ? "to" : "from"} likes.`,
        restore: {
          liked: !!previousPreference?.liked,
          disliked: !!previousPreference?.disliked,
        },
      };
    } else if (reactionType === "dislike" && typeof change.disliked === "boolean") {
      undo = {
        message: `${change.disliked ? "Added" : "Removed"} ${companyName} ${change.disliked ? "to" : "from"} dislikes.`,
        restore: {
          liked: !!previousPreference?.liked,
          disliked: !!previousPreference?.disliked,
        },
      };
    } else if (typeof change.archived === "boolean") {
      undo = {
        message: change.archived ? `Archived ${companyName}.` : `Restored ${companyName} from archive.`,
        restore: { archived: !!previousPreference?.archived },
      };
    }
    const saved = await preferences.updatePreference(key, change, reactionType);
    if (saved && undo) {
      setUndoAction({ id: ++undoActionId.current, key, ...undo });
    }
    if (saved && reactionType === "dislike") {
      const isSelectedCompany =
        selectedCompany?.key === key || selectedCompany?.legacyKeys?.includes(key);
      if (isSelectedCompany) {
        const currentCompanies = visibleCompaniesByFilter[tab] || data.companies;
        const isDislikedCompany = (company: CompanyCard) =>
          company.key === key || company.legacyKeys?.includes(key);
        const currentIndex = currentCompanies.findIndex(isDislikedCompany);
        const nextCompany =
          currentIndex >= 0
            ? currentCompanies[currentIndex + 1] || currentCompanies[currentIndex - 1]
            : currentCompanies.find((company) => !isDislikedCompany(company));
        selectCompany(nextCompany || null);
      }
    } else if (saved && reactionType === "like" && change.liked) {
      selectCompany(null);
    }
    return saved;
  };
  const undoLastAction = async () => {
    if (!undoAction) return;
    const action = undoAction;
    setUndoAction(null);
    await preferences.updatePreference(action.key, action.restore);
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
      setJobModalOpen(false);
    }
    setAddingJob(false);
  };
  const editJob = (job: CompanyCard["jobs"][number]) => {
    setEditingJobId(job.id || null);
    setJobTitle(job.title || "");
    setJobUrl(job.url || "");
    setJobLocation(job.location || "");
    setJobModalOpen(true);
  };
  const editListedJob = (company: CompanyCard, job: CompanyCard["jobs"][number]) => {
    const fullCompany = data.companies.find((item) => item.key === company.key) || company;
    selectCompany(fullCompany);
    editJob(job);
  };
  const openJobModal = () => {
    setEditingJobId(null);
    setJobTitle("");
    setJobUrl("");
    setJobLocation("");
    setJobModalOpen(true);
  };
  const closeJobModal = () => {
    setJobModalOpen(false);
    setEditingJobId(null);
    setJobTitle("");
    setJobUrl("");
    setJobLocation("");
  };
  const closeCompanyConfig = () => {
    if (companyConfigRef.current) companyConfigRef.current.open = false;
  };
  const copyCompanyValue = async (field: "details" | "name", value: string) => {
    if (!selectedCompany) return;
    try {
      await navigator.clipboard.writeText(value);
      preferences.setCopied(`${selectedCompany.key}-${field}`);
    } catch {
      data.setNotice("Could not copy. Check clipboard permissions and try again.");
    }
    closeCompanyConfig();
  };
  const crawlCompanyImage = () => {
    if (!selectedCompany) return;
    const website = selectedCompany.website || selectedCompany.nearshore?.website;
    if (!website) return;
    try {
      const domain = new URL(website).hostname;
      const imageUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
      void preferences.updatePreference(selectedCompany.key, { imageUrl });
    } catch {
      data.setNotice("Add a valid company website before crawling its image.");
    }
    closeCompanyConfig();
  };
  const beginCareersEdit = () => {
    if (!selectedCompany) return;
    setCareersDraft(
      selectedPreference?.careersUrl ||
        selectedCompany.careersUrl ||
        selectedCompany.nearshore?.careersUrl ||
        "",
    );
    setEditingCareers(true);
    closeCompanyConfig();
  };
  const saveCareersEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      selectedCompany &&
      (await preferences.saveCareers(selectedCompany, careersDraft))
    ) {
      setEditingCareers(false);
    }
  };
  const removeJob = async (jobId: string) => {
    if (!selectedCompany || !window.confirm("Remove this job?")) return;
    const jobUrl = selectedJobs.find((job) => job.id === jobId)?.url;
    const removedIds = new Set([jobId, jobUrl].filter((id): id is string => !!id));
    await preferences.updatePreference(selectedCompany.key, {
      addedJobs: (selectedPreference?.addedJobs || []).filter((job) => job.id !== jobId),
      likedJobIds: (selectedPreference?.likedJobIds || []).filter((id) => !removedIds.has(id)),
      archivedJobIds: (selectedPreference?.archivedJobIds || []).filter((id) => !removedIds.has(id)),
      appliedJobIds: (selectedPreference?.appliedJobIds || []).filter((id) => !removedIds.has(id)),
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
          aria-label={jobListFilters.includes(tab) ? "Jobs navigation" : "Company directory navigation"}
          className={`${styles.sidebar} rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4`}
        >
          <CompanyDirectoryTabs
            tab={tab}
            setTab={setTab}
            groupCounts={groupCounts}
            keywordQuery={keywordQuery}
            setKeywordQuery={setKeywordQuery}
            latamCostaRicaFilter={latamCostaRicaFilter}
            setLatamCostaRicaFilter={setLatamCostaRicaFilter}
            hideWithoutDomain={hideWithoutDomain}
            setHideWithoutDomain={setHideWithoutDomain}
            country={countryFilter}
            setCountry={setCountryFilter}
            countryOptions={countryOptions}
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
              latamCostaRicaFilter={latamCostaRicaFilter}
              hideWithoutDomain={hideWithoutDomain}
              country={countryFilter}
              active
              data={data}
              preferences={preferences}
              onSummary={handleSummary}
              onVisibleCompaniesChange={handleVisibleCompaniesChange}
              onCountryOptionsChange={handleCountryOptionsChange}
              onOpenCompany={selectCompany}
              onEditJob={editListedJob}
              onPreferenceChange={updateSelectedPreference}
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
                    void updateSelectedPreference(selectedCompany.key, {
                      archived: !selectedPreference?.archived,
                    })
                  }
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {selectedPreference?.archived ? "Restore" : "Archive / hide"}
                </button>
                <details ref={companyConfigRef} className="relative">
                  <summary
                    aria-label={`Company options for ${selectedCompany.name}`}
                    title="Company options"
                    className="flex h-9 cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-teal-300 [&::-webkit-details-marker]:hidden"
                  >
                    <Settings2 size={14} />
                    <span className="text-[11px]">Config</span>
                  </summary>
                  <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl">
                    <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Company actions
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void copyCompanyValue(
                          "details",
                          companyDetailsCopyText(selectedCompany, selectedPreference),
                        )
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                      {preferences.copied === `${selectedCompany.key}-details` ? (
                        <Check size={14} className="text-teal-300" />
                      ) : (
                        <Copy size={14} className="text-zinc-400" />
                      )}
                      Copy company details
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void copyCompanyValue("name", selectedCompany.name)
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                      {preferences.copied === `${selectedCompany.key}-name` ? (
                        <Check size={14} className="text-teal-300" />
                      ) : (
                        <Copy size={14} className="text-zinc-400" />
                      )}
                      Copy company name
                    </button>
                    <button
                      type="button"
                      disabled={
                        !data.ready ||
                        !(selectedCompany.website || selectedCompany.nearshore?.website)
                      }
                      onClick={crawlCompanyImage}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Image size={14} className="text-zinc-400" />
                      {selectedPreference?.imageUrl
                        ? "Refresh company image"
                        : "Crawl image"}
                    </button>
                    <button
                      type="button"
                      disabled={!data.ready}
                      onClick={beginCareersEdit}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Pencil size={14} className="text-zinc-400" />
                      Edit careers page
                    </button>
                  </div>
                </details>
                <button
                  type="button"
                  onClick={() => selectCompany(null)}
                  aria-label="Close"
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
                    Jobs
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">
                      {selectedJobs.length} listed
                    </span>
                    <button
                      type="button"
                      disabled={!data.ready}
                      onClick={openJobModal}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-300 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-teal-200 disabled:opacity-50"
                    >
                      <Plus size={14} />
                      Add a job
                    </button>
                  </div>
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
                              savedJobIds.includes(jobId) || savedJobIds.includes(job.url);
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
                    No saved job links yet. Add one here or visit the careers page.
                  </div>
                )}
                {shareLink ? <p role="status" className="mt-3 break-all text-xs text-teal-300">Copied share link: <a className="underline" href={shareLink} target="_blank" rel="noopener noreferrer">{shareLink}</a></p> : null}
              </section>
              <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <CompanyProfileCard
                  company={selectedCompany}
                  preference={selectedPreference}
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
                />
                {editingCareers ? (
                  <form
                    onSubmit={saveCareersEdit}
                    className="mt-3 rounded-xl border border-zinc-800 p-3"
                  >
                    <label
                      className="text-xs text-zinc-300"
                      htmlFor={`careers-${selectedCompany.key}`}
                    >
                      Careers page for {selectedCompany.name}
                    </label>
                    <input
                      autoFocus
                      required
                      type="url"
                      id={`careers-${selectedCompany.key}`}
                      value={careersDraft}
                      onChange={(event) => setCareersDraft(event.target.value)}
                      placeholder="https://company.com/careers"
                      className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"
                    />
                    <div className="mt-2 flex gap-3 text-xs">
                      <button
                        type="submit"
                        disabled={!data.ready}
                        className="rounded-lg bg-teal-400 px-3 py-2 font-semibold text-zinc-950 disabled:opacity-50"
                      >
                        Save link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCareers(false);
                          preferences.clearNotice();
                        }}
                        className="px-3 py-2 text-zinc-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
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
                  {selectedPreference?.careersUrl ||
                  selectedCompany.careersUrl ||
                  selectedCompany.nearshore?.careersUrl ||
                  selectedCompany.website ? (
                    <a
                      href={
                        selectedPreference?.careersUrl ||
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

            </div>
          </aside>
      ) : null}
      <dialog
        ref={jobDialogRef}
        aria-labelledby="job-dialog-title"
        className={styles.jobDialog}
        onCancel={(event) => {
          event.preventDefault();
          closeJobModal();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeJobModal();
        }}
      >
        <section className={styles.jobDialogContent}>
          <header className="mb-3 flex items-center justify-between gap-4">
            <h2 id="job-dialog-title" className="text-sm font-semibold text-zinc-100">
              {editingJobId ? "Edit job" : "Add a job"}
            </h2>
            <button
              type="button"
              onClick={closeJobModal}
              aria-label="Close job dialog"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <X size={18} />
            </button>
          </header>
          <form onSubmit={addJob} className="space-y-3">
            <input
              required
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              placeholder="Job title"
              aria-label="Job title"
              autoFocus
              className={styles.jobInput}
            />
            <input
              required
              type="url"
              value={jobUrl}
              onChange={(event) => setJobUrl(event.target.value)}
              placeholder="https://… job link"
              aria-label="Job link"
              className={styles.jobInput}
            />
            <input
              value={jobLocation}
              onChange={(event) => setJobLocation(event.target.value)}
              placeholder="Location (optional)"
              aria-label="Location (optional)"
              className={styles.jobInput}
            />
            <button
              disabled={!data.ready || addingJob}
              className="rounded-lg bg-teal-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-teal-200 disabled:opacity-50"
            >
              {addingJob ? "Saving…" : editingJobId ? "Save changes" : "Save job"}
            </button>
          </form>
        </section>
      </dialog>
      </div>
      {undoAction ? (
        <div
          key={undoAction.id}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={styles.undoToast}
        >
          <span className="min-w-0 text-sm text-zinc-100">{undoAction.message}</span>
          <button
            type="button"
            onClick={() => void undoLastAction()}
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-teal-300 hover:bg-zinc-800 hover:text-teal-200 focus-visible:outline-2 focus-visible:outline-teal-300"
          >
            Undo
          </button>
        </div>
      ) : null}
    </main>
  );
}
