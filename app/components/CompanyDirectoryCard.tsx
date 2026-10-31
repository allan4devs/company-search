import { memo } from "react";
import { Heart, ThumbsDown } from "lucide-react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";

type Reaction = { type: "like" | "dislike"; leaving: boolean } | null;
type Props = {
  company: CompanyCard;
  preference?: CompanyPreference;
  reaction: Reaction;
  onOpenCompany: (company: CompanyCard) => void;
  onPreferenceChange: (key: string, change: CompanyPreference, type?: "like" | "dislike") => Promise<boolean>;
  selected: boolean;
};

function CompanyDirectoryCardView({
  company,
  preference,
  reaction,
  onOpenCompany,
  onPreferenceChange,
  selected,
}: Props) {
  return (
    <div className={`flex flex-col ${reaction?.leaving ? "card-vanish" : ""}`}>
      <article
        id={`company-card-${company.key}`}
        onClick={(event) => {
          if (
            (event.target as HTMLElement).closest(
              "a, button, input, summary, details, form",
            )
          )
            return;
          onOpenCompany(company);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenCompany(company);
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`Open ${company.name} details`}
        className={`group relative flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border bg-zinc-900/60 p-5 transition hover:border-teal-400/60 hover:bg-zinc-900 hover:shadow-xl hover:shadow-teal-950/20 focus-visible:outline-2 focus-visible:outline-teal-300 ${selected ? "border-teal-400" : "border-zinc-800"}`}
      >
        {preference?.imageUrl ? (
          <img
            src={preference.imageUrl}
            alt=""
            className="h-10 w-10 rounded-xl border border-zinc-700 bg-white object-contain p-1"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-400/10 text-sm font-bold text-teal-200"
          >
            {company.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-semibold text-white">
          {company.name}
        </span>
        <button type="button" aria-label={`Like ${company.name}`} aria-pressed={!!preference?.liked} onClick={() => void onPreferenceChange(company.key, { liked: !preference?.liked }, "like")} className={`rounded-lg p-2 ${preference?.liked ? "text-pink-400" : "text-zinc-500 hover:text-pink-300"}`}><Heart size={18} fill={preference?.liked ? "currentColor" : "none"} /></button>
        <button type="button" aria-label={`Dislike ${company.name}`} aria-pressed={!!preference?.disliked} onClick={() => void onPreferenceChange(company.key, { disliked: !preference?.disliked }, "dislike")} className={`rounded-lg p-2 ${preference?.disliked ? "text-amber-400" : "text-zinc-500 hover:text-amber-300"}`}><ThumbsDown size={18} /></button>
        <span className="text-xs text-zinc-500">View details</span>
      </article>
      {company.roleEvidence ? (
        <a
          href={company.roleEvidence.source}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 px-3 py-2 text-xs text-teal-300 underline underline-offset-4"
        >
          Employer role feed · Checked {company.roleEvidence.checkedOn}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
      {company.nearshore ? (
        <a
          href={company.nearshore.source}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 rounded-lg px-3 py-2 text-xs text-teal-300 underline underline-offset-4 hover:text-teal-100"
        >
          Nearshore company source{" "}
          <span className="text-zinc-500">
            (checked {company.nearshore.checkedOn})
          </span>
          <span className="sr-only">
            {" "}
            for {company.name} (opens in a new tab)
          </span>
        </a>
      ) : null}
      {company.extraction || company.fit ? (
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs">
          {company.extraction ? (
            <p className="text-zinc-400">
              Research:{" "}
              {company.extraction.status === "pending"
                ? "pending"
                : "sources saved"}{" "}
              · Updated {company.extraction.updatedAt.slice(0, 10)}
              {company.extraction.batchId
                ? ` · Batch ${company.extraction.batchId}`
                : ""}
            </p>
          ) : null}
          {company.fit ? (
            <p className="mt-1 text-teal-200">
              Profile fit: {company.fit.status}
              {company.fit.reasons.length
                ? ` · ${company.fit.reasons.join("; ")}`
                : ""}{" "}
              · {company.fit.evaluatedOn}
            </p>
          ) : null}
        </div>
      ) : null}
      {company.sourceEvidence?.length ? (
        <details className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs">
          <summary className="cursor-pointer rounded-xl px-4 py-3 font-medium text-teal-300 focus-visible:outline-2 focus-visible:outline-teal-300">
            Company sources ({company.sourceEvidence.length})
          </summary>
          <ul className="space-y-3 px-4 pb-4">
            {company.sourceEvidence.map((source) => (
              <li key={`${source.kind}:${source.url}`}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-300 underline underline-offset-4"
                >
                  {source.kind.replaceAll("-", " ")} · checked{" "}
                  {source.checkedOn}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                {source.note ? (
                  <p className="mt-1 leading-5 text-zinc-400">{source.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {company.research ? (
        <a
          href={company.research.source}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 rounded-lg px-3 py-2 text-xs text-teal-300 underline underline-offset-4 hover:text-teal-100"
        >
          Hiring evidence: {company.research.role}{" "}
          <span className="text-zinc-500">
            (checked {company.research.checkedOn})
          </span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}

function arePropsEqual(previous: Props, next: Props) {
  if (
    previous.company !== next.company ||
    previous.preference !== next.preference ||
    previous.reaction?.type !== next.reaction?.type ||
    previous.reaction?.leaving !== next.reaction?.leaving ||
    previous.onOpenCompany !== next.onOpenCompany
    || previous.onPreferenceChange !== next.onPreferenceChange
    || previous.selected !== next.selected
  )
    return false;

  return true;
}

export const CompanyDirectoryCard = memo(
  CompanyDirectoryCardView,
  arePropsEqual,
);
