"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import type { CompanyDirectoryMainFilter } from "../constants/directory";
import type { CompanyDirectoryViewData } from "../types";
import { useCompanyDirectorySummary } from "../hooks/use-company-directory-summary";
import { CompanyDirectoryTopbar } from "./CompanyDirectoryTopbar";
import { CompanyDirectoryTabs } from "./CompanyDirectoryTabs";
import { AllCompaniesDirectorySection } from "./AllCompaniesDirectorySection";
import { CompanyDirectoryDetailPanel } from "./CompanyDirectoryDetailPanel";
import styles from "./CompanyDirectoryView.module.css";

type Props = CompanyDirectoryViewData;

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
  const [keywordQuery, setKeywordQuery] = useState("");
  const [latamCostaRicaFilter, setLatamCostaRicaFilter] = useState(false);
  const [hideWithoutDomain, setHideWithoutDomain] = useState(false);
  const [countryFilter, setCountryFilter] = useState("all");
  const summary = useCompanyDirectorySummary();
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
        const currentCompanies =
          summary.visibleCompaniesByFilter[tab] || data.companies;
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
            groupCounts={summary.groupCounts}
            keywordQuery={keywordQuery}
            setKeywordQuery={setKeywordQuery}
            latamCostaRicaFilter={latamCostaRicaFilter}
            setLatamCostaRicaFilter={setLatamCostaRicaFilter}
            hideWithoutDomain={hideWithoutDomain}
            setHideWithoutDomain={setHideWithoutDomain}
            country={countryFilter}
            setCountry={setCountryFilter}
            countryOptions={summary.countryOptions}
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
              onSummary={summary.onSummary}
              onVisibleCompaniesChange={summary.onVisibleCompaniesChange}
              onCountryOptionsChange={summary.onCountryOptionsChange}
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
      <CompanyDirectoryDetailPanel
        selectedCompany={selectedCompany}
        selectedPreference={selectedPreference}
        selectedJobs={selectedJobs}
        visibleSelectedJobs={visibleSelectedJobs}
        savedJobIds={savedJobIds}
        data={data}
        preferences={preferences}
        companyConfigRef={companyConfigRef}
        updateSelectedPreference={updateSelectedPreference}
        copyCompanyValue={copyCompanyValue}
        crawlCompanyImage={crawlCompanyImage}
        beginCareersEdit={beginCareersEdit}
        editingCareers={editingCareers}
        saveCareersEdit={saveCareersEdit}
        careersDraft={careersDraft}
        setCareersDraft={setCareersDraft}
        setEditingCareers={setEditingCareers}
        selectCompany={selectCompany}
        openJobModal={openJobModal}
        editJob={editJob}
        removeJob={removeJob}
        sharingJobId={sharingJobId}
        shareJob={shareJob}
        shareLink={shareLink}
      />
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
