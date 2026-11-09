import { useCallback, useState, type FormEvent } from "react";
import type { CompanyCard, CompanyJob } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import type { CompanyDirectoryViewData } from "../types";

type Props = Pick<CompanyDirectoryViewData, "data" | "preferences"> & {
  selectedCompany: CompanyCard | null;
  selectedPreference: CompanyPreference | undefined;
  selectedJobs: CompanyJob[];
};

export function useCompanyDirectoryJobActions({
  data,
  preferences,
  selectedCompany,
  selectedPreference,
  selectedJobs,
}: Props) {
  const [jobTitle, setJobTitle] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [addingJob, setAddingJob] = useState(false);
  const [sharingJobId, setSharingJobId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState("");

  const resetJobForm = useCallback(() => {
    setJobTitle("");
    setJobUrl("");
    setJobLocation("");
    setEditingJobId(null);
    setJobModalOpen(false);
    setAddingJob(false);
    setSharingJobId(null);
    setShareLink("");
  }, []);

  const addJob = async (event: FormEvent<HTMLFormElement>) => {
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
      ? (selectedPreference?.addedJobs || []).map((item) =>
          item.id === editingJobId ? { ...item, ...job } : item,
        )
      : [...(selectedPreference?.addedJobs || []), job];
    if (await preferences.updatePreference(selectedCompany.key, { addedJobs })) {
      setJobTitle("");
      setJobUrl("");
      setJobLocation("");
      setEditingJobId(null);
      setJobModalOpen(false);
    }
    setAddingJob(false);
  };

  const editJob = (job: CompanyJob) => {
    setEditingJobId(job.id || null);
    setJobTitle(job.title || "");
    setJobUrl(job.url || "");
    setJobLocation(job.location || "");
    setJobModalOpen(true);
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

  const removeJob = async (jobId: string) => {
    if (!selectedCompany || !window.confirm("Remove this job?")) return;
    const jobUrl = selectedJobs.find((job) => job.id === jobId)?.url;
    const removedIds = new Set([jobId, jobUrl].filter((id): id is string => !!id));
    await preferences.updatePreference(selectedCompany.key, {
      addedJobs: (selectedPreference?.addedJobs || []).filter(
        (job) => job.id !== jobId,
      ),
      likedJobIds: (selectedPreference?.likedJobIds || []).filter(
        (id) => !removedIds.has(id),
      ),
      archivedJobIds: (selectedPreference?.archivedJobIds || []).filter(
        (id) => !removedIds.has(id),
      ),
      appliedJobIds: (selectedPreference?.appliedJobIds || []).filter(
        (id) => !removedIds.has(id),
      ),
    });
  };

  const shareJob = async (job: CompanyJob, fallbackId: string) => {
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
      if (!response.ok)
        throw new Error(payload.error || "Could not create share link.");
      const url = `${window.location.origin}/shared-job/${payload.id}`;
      setShareLink(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // The link remains visible for manual copying.
      }
    } catch (error) {
      data.setNotice(
        error instanceof Error ? error.message : "Could not create share link.",
      );
    } finally {
      setSharingJobId(null);
    }
  };

  return {
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
  };
}
