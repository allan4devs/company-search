import { useEffect, useRef, type Dispatch, type FormEventHandler, type SetStateAction } from "react";
import { X } from "lucide-react";
import styles from "./CompanyDirectoryView.module.css";

type Props = {
  open: boolean;
  editingJobId: string | null;
  addingJob: boolean;
  ready: boolean;
  jobTitle: string;
  setJobTitle: Dispatch<SetStateAction<string>>;
  jobUrl: string;
  setJobUrl: Dispatch<SetStateAction<string>>;
  jobLocation: string;
  setJobLocation: Dispatch<SetStateAction<string>>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
};

export function CompanyDirectoryJobDialog({
  open,
  editingJobId,
  addingJob,
  ready,
  jobTitle,
  setJobTitle,
  jobUrl,
  setJobUrl,
  jobLocation,
  setJobLocation,
  onSubmit,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="job-dialog-title"
      className={styles.jobDialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.jobDialogContent}>
        <header className="mb-3 flex items-center justify-between gap-4">
          <h2 id="job-dialog-title" className="text-sm font-semibold text-zinc-100">
            {editingJobId ? "Edit job" : "Add a job"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close job dialog"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </header>
        <form onSubmit={onSubmit} className="space-y-3">
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
            disabled={!ready || addingJob}
            className="rounded-lg bg-teal-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-teal-200 disabled:opacity-50"
          >
            {addingJob ? "Saving…" : editingJobId ? "Save changes" : "Save job"}
          </button>
        </form>
      </section>
    </dialog>
  );
}
