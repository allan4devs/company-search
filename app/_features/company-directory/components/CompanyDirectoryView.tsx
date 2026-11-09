"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import type { CompanyDirectoryMainFilter } from "../constants/directory";
import type { CompanyDirectoryViewData } from "../types";
import { useCompanyDirectoryJobActions } from "../hooks/use-company-directory-job-actions";
import { useCompanyDirectorySummary } from "../hooks/use-company-directory-summary";
import { CompanyDirectoryTopbar } from "./CompanyDirectoryTopbar";
import { CompanyDirectoryTabs } from "./CompanyDirectoryTabs";
import { AllCompaniesDirectorySection } from "./AllCompaniesDirectorySection";
import { CompanyDirectoryDetailPanel } from "./CompanyDirectoryDetailPanel";
import { CompanyDirectoryJobDialog } from "./CompanyDirectoryJobDialog";
import { CompanyDirectoryUndoToast } from "./CompanyDirectoryUndoToast";
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

  const jobActions = useCompanyDirectoryJobActions({
    data,
    preferences,
    selectedCompany,
    selectedPreference,
    selectedJobs,
  });
  const {
    addingJob,
    addJob,
    closeJobModal,
    editJob,
    editingJobId,
    jobLocation,
    jobModalOpen,
    jobTitle,
    jobUrl,
    openJobModal,
    removeJob,
    resetJobForm,
    setJobLocation,
    setJobTitle,
    setJobUrl,
    shareJob,
    shareLink,
    sharingJobId,
  } = jobActions;

  const selectCompany = useCallback(
    (company: CompanyCard | null) => {
      setSelectedCompany(company);
      setEditingCareers(false);
      setCareersDraft("");
      if (companyConfigRef.current) companyConfigRef.current.open = false;
      resetJobForm();
    },
    [resetJobForm],
  );

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
  const editListedJob = (company: CompanyCard, job: CompanyCard["jobs"][number]) => {
    const fullCompany = data.companies.find((item) => item.key === company.key) || company;
    selectCompany(fullCompany);
    editJob(job);
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
      <CompanyDirectoryJobDialog
        open={jobModalOpen}
        editingJobId={editingJobId}
        addingJob={addingJob}
        ready={data.ready}
        jobTitle={jobTitle}
        setJobTitle={setJobTitle}
        jobUrl={jobUrl}
        setJobUrl={setJobUrl}
        jobLocation={jobLocation}
        setJobLocation={setJobLocation}
        onSubmit={addJob}
        onClose={closeJobModal}
      />
      </div>
      <CompanyDirectoryUndoToast
        action={undoAction}
        onUndo={() => void undoLastAction()}
      />
    </main>
  );
}
