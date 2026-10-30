import { ArrowUpRight, Building2, Check, Copy } from "lucide-react";
import { memo } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import { companySignals } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import type { CompanyDirectoryCategory } from "../company-directory.constants";

type Props = {
  company: CompanyCard;
  preference?: CompanyPreference;
  tab: CompanyDirectoryCategory;
  copied: string | null;
  onCopied: (id: string) => void;
  onCopyError: () => void;
};

function CompanyProfileCardView({ company, preference, tab, copied, onCopied, onCopyError }: Props) {
  const signals = companySignals(company);
  const tags = signals.technologies.length ? signals.technologies : company.tracks;
  const roleNote = [company.research?.notes, company.jobs[0]?.sourceNotes, company.jobs[0]?.matchReason]
    .find(note => note && !/\bcv\b|tailored/i.test(note));
  const details = [
    company.name,
    company.website,
    preference?.careersUrl || company.careersUrl || company.nearshore?.careersUrl,
    tags.join(", "),
    company.research?.region || company.locations.join(" · "),
    company.research?.workMode || company.discovery?.remotePolicy,
    company.research?.role || company.jobs.map(job => job.title).filter(Boolean).join(" · "),
    roleNote,
  ].filter(Boolean).join("\n");
  const note = (tab === "nearshore" ? company.nearshore?.notes : undefined)
    || roleNote
    || (!company.discovery ? company.nearshore?.notes : undefined);

  function copyButton(field: string, text: string) {
    const id = `${company.key}-${field}`;
    const label = `Copy ${field} for ${company.name}`;
    return <button type="button" aria-label={label} title={copied === id ? "Copied!" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          onCopied(id);
        } catch { onCopyError(); }
      }}
      className="relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-teal-300 focus-visible:outline-2 focus-visible:outline-teal-300">
      {copied === id ? <Check aria-hidden="true" size={14} className="text-teal-300" /> : <Copy aria-hidden="true" size={14} />}
    </button>;
  }

  return <>
    <div className="flex items-start justify-between gap-4">
      <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-teal-300/15 bg-teal-400/10 text-xl font-bold text-teal-200">{company.name.slice(0, 2).toUpperCase()}</span>
      <div className="flex items-center gap-2">{copyButton("details", details)}{company.website ? <ArrowUpRight aria-hidden="true" size={24} className="text-zinc-500 transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-teal-300" /> : <Building2 aria-hidden="true" size={22} className="text-zinc-600" />}</div>
    </div>
    <div className="mt-6 flex items-center gap-2">
      <h3 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-white">{company.website ? <a href={company.website} target="_blank" rel="noopener noreferrer" aria-label={`${company.name} company homepage (opens in a new tab)`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-teal-300">{company.name}</a> : company.name}</h3>
      {copyButton("name", company.name)}
    </div>
    <div className="mt-2 flex items-center gap-2"><p className="min-w-0 break-all text-sm text-zinc-400">{company.website ? new URL(company.website).hostname.replace(/^www\./, "") : "Company website needed"}</p>{company.website ? copyButton("website", company.website) : null}</div>
    <div className="mt-5 flex flex-wrap gap-2">{tags.slice(0, 4).map(value => <span key={value} className="rounded-md border border-zinc-700/70 px-2 py-1 text-xs text-zinc-400">{value}</span>)}{tags.length > 4 ? <span className="py-1 text-xs text-zinc-500">+{tags.length - 4}</span> : null}</div>
    <div className="flex flex-wrap gap-2 text-xs">{signals.roles.map(value => <span key={value} className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">{value}</span>)}{signals.levels.includes("Mid-level") ? <span className="rounded bg-amber-400/10 px-2 py-1 text-amber-200">Mid-level signal</span> : null}</div>
    <div className="space-y-2 text-xs leading-5">
      {!company.discovery ? <>
        <p className="text-teal-200">{company.research?.region || company.locations.join(" · ") || "Location not saved"}</p>
        <p className="text-teal-200">{company.research?.workMode || [...new Set(company.jobs.map(job => job.workMode).filter(Boolean))].join(" · ") || "Work mode not saved"}</p>
      </> : null}
      {note ? <p className="line-clamp-3 text-zinc-400">{note}</p> : null}
      <p className="line-clamp-2 text-zinc-300">{company.research?.role || [...new Set(company.jobs.map(job => job.title).filter(Boolean))].join(" · ")}</p>
    </div>
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-800 pt-5 text-xs"><span className="text-zinc-500">{company.records ? `${company.jobs.length} role ${company.jobs.length === 1 ? "link" : "links"}` : "Researched employer"}</span><span className={company.website ? "font-semibold text-teal-300" : "text-zinc-500"}>{company.website ? "Visit company" : "Homepage not identified"}</span></div>
  </>;
}

function arePropsEqual(previous: Props, next: Props) {
  if (
    previous.company !== next.company
    || previous.preference !== next.preference
    || (previous.tab === "nearshore") !== (next.tab === "nearshore")
    || previous.onCopied !== next.onCopied
    || previous.onCopyError !== next.onCopyError
  ) return false;

  const key = `${next.company.key}-`;
  return (previous.copied?.startsWith(key) ? previous.copied : null)
    === (next.copied?.startsWith(key) ? next.copied : null);
}

export const CompanyProfileCard = memo(CompanyProfileCardView, arePropsEqual);
