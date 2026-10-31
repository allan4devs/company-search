import { Check, Copy } from "lucide-react";

import { memo } from "react";

import type { CompanyCard } from "@/lib/comp/catalog";

import { companySignals } from "@/lib/comp/catalog";

import type { CompanyPreference } from "@/lib/comp/types";



type Props = {

  company: CompanyCard;

  preference?: CompanyPreference;

  copied: string | null;

  onCopied: (id: string) => void;

  onCopyError: () => void;

};



function CompanyProfileCardView({ company, preference, copied, onCopied, onCopyError }: Props) {

  const careersUrl = preference?.careersUrl || company.careersUrl || company.nearshore?.careersUrl;

  const destinationUrl = careersUrl || company.website;

  const signals = companySignals(company);

  const tags = signals.technologies;

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

  const note = roleNote

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

    <div className="flex items-start gap-3">

      <span title={company.name} aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-400/10 text-sm font-bold text-teal-200">{company.name.slice(0, 2).toUpperCase()}</span>

      <h3 className="min-w-0 flex-1 break-words pt-1 text-lg font-semibold text-white">{destinationUrl ? <a href={destinationUrl} target="_blank" rel="noopener noreferrer" aria-label={`${company.name} ${careersUrl ? "careers page" : "company homepage"} (opens in a new tab)`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-teal-300">{company.name}</a> : company.name}</h3>

      <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300">{preference?.liked ? "Saved" : "To review"}</span>

    </div>

    <p className="line-clamp-2 min-h-10 text-[15px] font-semibold leading-5 text-zinc-100">{company.research?.role || company.jobs.map(job => job.title).filter(Boolean).join(" · ") || "Role not stated"}</p>

    <p className="text-xs leading-5 text-zinc-300">{[company.research?.workMode || company.discovery?.remotePolicy || [...new Set(company.jobs.map(job => job.workMode).filter(Boolean))].join(" / "), company.research?.region || company.discovery?.region || company.locations.join(" / ")].filter(Boolean).join(" · ") || "Location to verify"}</p>

    {tags.length ? <div className="flex flex-wrap gap-2">{tags.slice(0, 4).map(value => <span key={value} className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-xs text-zinc-200">{value}</span>)}{tags.length > 4 ? <span className="py-1 text-xs text-zinc-400">+{tags.length - 4}</span> : null}</div> : null}

    {signals.roles.length ? <p className="text-xs font-medium text-teal-200">{signals.roles.join(" · ")}</p> : null}

    {note ? <details className="group/notes relative z-10 text-xs leading-5 text-zinc-300"><summary className="cursor-pointer list-none rounded focus-visible:outline-2 focus-visible:outline-teal-300"><span className="line-clamp-2 group-open/notes:hidden">{note}</span><span className="mt-1 inline-block text-teal-200 underline underline-offset-2"><span className="group-open/notes:hidden">Show more</span><span className="hidden group-open/notes:inline">Show less</span></span></summary><p className="mt-2 whitespace-pre-line">{note}</p></details> : null}

    <div className="mt-auto flex items-center justify-between border-t border-zinc-800 pt-3">

      <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">{company.jobs.length ? `Role links (${company.jobs.length})` : "Company directory"}</span>

      <div className="flex">{copyButton("details", details)}{copyButton("name", company.name)}</div>

    </div>

  </>;

}



function arePropsEqual(previous: Props, next: Props) {

  if (

    previous.company !== next.company

    || previous.preference !== next.preference

    || previous.onCopied !== next.onCopied

    || previous.onCopyError !== next.onCopyError

  ) return false;



  const key = `${next.company.key}-`;

  return (previous.copied?.startsWith(key) ? previous.copied : null)

    === (next.copied?.startsWith(key) ? next.copied : null);

}



export const CompanyProfileCard = memo(CompanyProfileCardView, arePropsEqual);

