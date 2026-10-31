import { memo } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import { CompanyCardActions } from "./CompanyCardActions";
import { CompanyProfileCard } from "./CompanyProfileCard";

type Reaction = { type: "like" | "dislike"; leaving: boolean } | null;
type Props = {
  company: CompanyCard;
  preference?: CompanyPreference;
  copied: string | null;
  ready: boolean;
  reaction: Reaction;
  onCopied: (id: string) => void;
  onCopyError: () => void;
  onPreferenceChange: (key: string, change: CompanyPreference, type?: "like" | "dislike") => Promise<boolean>;
  onSaveCareers: (company: CompanyCard, draft: string) => Promise<boolean>;
  onCancel: () => void;
};

function CompanyDirectoryCardView({ company, preference, copied, ready, reaction, onCopied, onCopyError, onPreferenceChange, onSaveCareers, onCancel }: Props) {
  const destinationUrl = preference?.careersUrl || company.careersUrl || company.nearshore?.careersUrl || company.website;
  return <div className={`flex flex-col ${reaction?.leaving ? "card-vanish" : ""}`}>
    <article className={`group relative flex flex-1 min-h-[340px] flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 transition ${destinationUrl ? "hover:-translate-y-1 hover:border-teal-400/60 hover:bg-zinc-900 hover:shadow-xl hover:shadow-teal-950/20" : "border-dashed"}`}>
      <CompanyProfileCard company={company} preference={preference} copied={copied} onCopied={onCopied} onCopyError={onCopyError} />
    <div className="relative z-10"><CompanyCardActions company={company} preference={preference} ready={ready} reaction={reaction} onPreferenceChange={onPreferenceChange} onSaveCareers={onSaveCareers} onCancel={onCancel} /></div>
    </article>
    {company.roleEvidence ? <a href={company.roleEvidence.source} target="_blank" rel="noopener noreferrer" className="mt-2 px-3 py-2 text-xs text-teal-300 underline underline-offset-4">Employer role feed · Checked {company.roleEvidence.checkedOn}<span className="sr-only"> (opens in a new tab)</span></a> : null}
    {company.nearshore ? <a href={company.nearshore.source} target="_blank" rel="noopener noreferrer" className="mt-2 rounded-lg px-3 py-2 text-xs text-teal-300 underline underline-offset-4 hover:text-teal-100">Nearshore company source <span className="text-zinc-500">(checked {company.nearshore.checkedOn})</span><span className="sr-only"> for {company.name} (opens in a new tab)</span></a> : null}
    {company.extraction || company.fit ? <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs">
      {company.extraction ? <p className="text-zinc-400">Research: {company.extraction.status === "pending" ? "pending" : "sources saved"} · Updated {company.extraction.updatedAt.slice(0, 10)}{company.extraction.batchId ? ` · Batch ${company.extraction.batchId}` : ""}</p> : null}
      {company.fit ? <p className="mt-1 text-teal-200">Profile fit: {company.fit.status}{company.fit.reasons.length ? ` · ${company.fit.reasons.join("; ")}` : ""} · {company.fit.evaluatedOn}</p> : null}
    </div> : null}
    {company.sourceEvidence?.length ? <details className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs">
      <summary className="cursor-pointer rounded-xl px-4 py-3 font-medium text-teal-300 focus-visible:outline-2 focus-visible:outline-teal-300">Company sources ({company.sourceEvidence.length})</summary>
      <ul className="space-y-3 px-4 pb-4">{company.sourceEvidence.map(source => <li key={`${source.kind}:${source.url}`}>
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-teal-300 underline underline-offset-4">{source.kind.replaceAll("-", " ")} · checked {source.checkedOn}<span className="sr-only"> (opens in a new tab)</span></a>
        {source.note ? <p className="mt-1 leading-5 text-zinc-400">{source.note}</p> : null}
      </li>)}</ul>
    </details> : null}
    {company.research ? <a href={company.research.source} target="_blank" rel="noopener noreferrer" className="mt-2 rounded-lg px-3 py-2 text-xs text-teal-300 underline underline-offset-4 hover:text-teal-100">Hiring evidence: {company.research.role} <span className="text-zinc-500">(checked {company.research.checkedOn})</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
  </div>;
}

function arePropsEqual(previous: Props, next: Props) {
  if (
    previous.company !== next.company
    || previous.preference !== next.preference
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
