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
  const careersUrl =
    preference?.careersUrl ||
    company.careersUrl ||
    company.nearshore?.careersUrl;
  const destinationType = careersUrl
    ? { label: "C", title: "Opens careers page" }
    : company.website
      ? { label: "V", title: "Opens company website" }
      : null;

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
        {company.tags?.includes("new") || destinationType ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {company.tags?.includes("new") ? (
              <span className="rounded-full border border-teal-300/30 bg-teal-300/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-200">
                New
              </span>
            ) : null}
            {destinationType ? (
              <span
                title={destinationType.title}
                aria-label={destinationType.title}
                className="inline-flex size-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[10px] font-bold text-zinc-200"
              >
                {destinationType.label}
              </span>
            ) : null}
          </span>
        ) : null}
        <button type="button" aria-label={`${preference?.liked ? "Unlike" : "Like"} ${company.name}`} aria-pressed={!!preference?.liked} onClick={() => void onPreferenceChange(company.key, { liked: !preference?.liked, disliked: false }, "like")} className={`rounded-lg p-2 ${preference?.liked ? "text-pink-400" : "text-zinc-500 hover:text-pink-300"}`}><Heart size={18} fill={preference?.liked ? "currentColor" : "none"} /></button>
        <button type="button" aria-label={`${preference?.disliked ? "Undo dislike for" : "Dislike"} ${company.name}`} aria-pressed={!!preference?.disliked} onClick={() => void onPreferenceChange(company.key, { disliked: !preference?.disliked, liked: false }, "dislike")} className={`rounded-lg p-2 ${preference?.disliked ? "text-amber-400" : "text-zinc-500 hover:text-amber-300"}`}><ThumbsDown size={18} fill={preference?.disliked ? "currentColor" : "none"} /></button>
        <span className="text-xs text-zinc-500">View details</span>
      </article>
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
