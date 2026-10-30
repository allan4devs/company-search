import { memo } from "react";
import { ArrowUpRight } from "lucide-react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import type { CompanyDirectoryCategory } from "../company-directory.constants";
import { CompanyCardActions } from "./CompanyCardActions";
import { CompanyProfileCard } from "./CompanyProfileCard";

type Reaction = { type: "like" | "dislike"; leaving: boolean } | null;
type Props = {
  company: CompanyCard;
  preference?: CompanyPreference;
  tab: CompanyDirectoryCategory;
  copied: string | null;
  ready: boolean;
  reaction: Reaction;
  onCopied: (id: string) => void;
  onCopyError: () => void;
  onPreferenceChange: (key: string, change: CompanyPreference, type?: "like" | "dislike") => Promise<boolean>;
  onSaveCareers: (company: CompanyCard, draft: string) => Promise<boolean>;
  onCancel: () => void;
};

function CompanyDirectoryCardView({ company, preference, tab, copied, ready, reaction, onCopied, onCopyError, onPreferenceChange, onSaveCareers, onCancel }: Props) {
  return <div className={`flex flex-col ${reaction?.leaving ? "card-vanish" : ""}`}>
    <article className={`group relative flex flex-1 min-h-[340px] flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 transition ${company.website ? "hover:-translate-y-1 hover:border-teal-400/60 hover:bg-zinc-900 hover:shadow-xl hover:shadow-teal-950/20" : "border-dashed"}`}>
      <CompanyProfileCard company={company} preference={preference} tab={tab} copied={copied} onCopied={onCopied} onCopyError={onCopyError} />
    </article>
    <CompanyCardActions company={company} preference={preference} ready={ready} reaction={reaction} onPreferenceChange={onPreferenceChange} onSaveCareers={onSaveCareers} onCancel={onCancel} />
    {company.roleEvidence ? <a href={company.roleEvidence.source} target="_blank" rel="noopener noreferrer" className="mt-2 px-3 py-2 text-xs text-teal-300 underline underline-offset-4">Employer role feed · Checked {company.roleEvidence.checkedOn}<span className="sr-only"> (opens in a new tab)</span></a> : null}
    {company.nearshore ? <a href={company.nearshore.source} target="_blank" rel="noopener noreferrer" className="mt-2 rounded-lg px-3 py-2 text-xs text-teal-300 underline underline-offset-4 hover:text-teal-100">Nearshore company source <span className="text-zinc-500">(checked {company.nearshore.checkedOn})</span><span className="sr-only"> for {company.name} (opens in a new tab)</span></a> : null}
    {company.jobs.length ? <details className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs">
      <summary className="cursor-pointer rounded-xl px-4 py-3 font-medium text-teal-300 focus-visible:outline-2 focus-visible:outline-teal-300">Preview {company.jobs.length === 1 ? "role link" : `${company.jobs.length} role links`}</summary>
      <ul className="divide-y divide-zinc-800 px-4">{company.jobs.map(job => <li key={job.id} className="space-y-2 py-4">
        <p className="text-sm font-semibold text-zinc-100">{job.title || "Untitled role"}</p>
        <p className="text-teal-200">{[job.location, job.workMode].filter(Boolean).join(" · ") || "Location and work mode not saved"}</p>
        {job.stack ? <p className="text-zinc-300">{job.stack}</p> : null}
        {job.matchReason || job.sourceNotes ? <p className="leading-5 text-zinc-400">{job.matchReason || job.sourceNotes}</p> : null}
        {job.eligibility ? <p className="leading-5 text-zinc-400">{job.eligibility}</p> : null}
        <p className="text-zinc-500">Listing: {job.listingStatus}{job.postedOn ? ` · Posted ${job.postedOn}` : ""}{job.checkedOn ? ` · Checked ${job.checkedOn}` : ""}</p>
        {/^(https?:\/\/)/i.test(job.url) ? <a href={job.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-300 underline underline-offset-4">View job posting <ArrowUpRight size={12} /><span className="sr-only"> (opens in a new tab)</span></a> : <p className="text-zinc-500">Posting link not saved</p>}
      </li>)}</ul>
    </details> : null}
    {company.research ? <a href={company.research.source} target="_blank" rel="noopener noreferrer" className="mt-2 rounded-lg px-3 py-2 text-xs text-teal-300 underline underline-offset-4 hover:text-teal-100">Hiring evidence: {company.research.role} <span className="text-zinc-500">(checked {company.research.checkedOn})</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
  </div>;
}

function arePropsEqual(previous: Props, next: Props) {
  if (
    previous.company !== next.company
    || previous.preference !== next.preference
    || (previous.tab === "nearshore") !== (next.tab === "nearshore")
    || previous.ready !== next.ready
    || previous.reaction?.type !== next.reaction?.type
    || previous.reaction?.leaving !== next.reaction?.leaving
    || previous.onCopied !== next.onCopied
    || previous.onCopyError !== next.onCopyError
    || previous.onPreferenceChange !== next.onPreferenceChange
    || previous.onSaveCareers !== next.onSaveCareers
    || previous.onCancel !== next.onCancel
  ) return false;

  const key = `${next.company.key}-`;
  return (previous.copied?.startsWith(key) ? previous.copied : null)
    === (next.copied?.startsWith(key) ? next.copied : null);
}

export const CompanyDirectoryCard = memo(CompanyDirectoryCardView, arePropsEqual);
