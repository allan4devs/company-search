"use client";

import type { Dispatch, FormEvent, RefObject, SetStateAction } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Copy,
  Heart,
  Image as ImageIcon,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import { companyDetailsCopyText } from "../lib/company-details";
import type { CompanyDirectoryViewData } from "../types";
import { CompanyCardActions } from "./CompanyCardActions";
import { CompanyProfileCard } from "./CompanyProfileCard";
import styles from "./CompanyDirectoryView.module.css";

type DirectoryData = CompanyDirectoryViewData["data"];
type DirectoryPreferences = CompanyDirectoryViewData["preferences"];
type Job = CompanyCard["jobs"][number];
type PreferenceChange = Parameters<DirectoryPreferences["updatePreference"]>[1];

type Props = {
  selectedCompany: CompanyCard | null;
  selectedPreference?: CompanyPreference;
  selectedJobs: Job[];
  visibleSelectedJobs: Job[];
  savedJobIds: string[];
  data: DirectoryData;
  preferences: DirectoryPreferences;
  companyConfigRef: RefObject<HTMLDetailsElement | null>;
  updateSelectedPreference: (
    key: string,
    change: PreferenceChange,
    reactionType?: "like" | "dislike",
  ) => Promise<boolean>;
  copyCompanyValue: (field: "details" | "name", value: string) => Promise<void>;
  crawlCompanyImage: () => void;
  beginCareersEdit: () => void;
  editingCareers: boolean;
  saveCareersEdit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  careersDraft: string;
  setCareersDraft: Dispatch<SetStateAction<string>>;
  setEditingCareers: Dispatch<SetStateAction<boolean>>;
  selectCompany: (company: CompanyCard | null) => void;
  openJobModal: () => void;
  editJob: (job: Job) => void;
  removeJob: (jobId: string) => Promise<void>;
  sharingJobId: string | null;
  shareJob: (job: Job, fallbackId: string) => Promise<void>;
  shareLink: string;
};

export function CompanyDirectoryDetailPanel({
  selectedCompany,
  selectedPreference,
  selectedJobs,
  visibleSelectedJobs,
  savedJobIds,
  data,
  preferences,
  companyConfigRef,
  updateSelectedPreference,
  copyCompanyValue,
  crawlCompanyImage,
  beginCareersEdit,
  editingCareers,
  saveCareersEdit,
  careersDraft,
  setCareersDraft,
  setEditingCareers,
  selectCompany,
  openJobModal,
  editJob,
  removeJob,
  sharingJobId,
  shareJob,
  shareLink,
}: Props) {
  return (
    <>
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
                      <ImageIcon size={14} className="text-zinc-400" />
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
    </>
  );
}
