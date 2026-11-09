import { memo } from "react";
import { ArrowUpRight, Heart, ThumbsDown } from "lucide-react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";

type Reaction = { type: "like" | "dislike"; leaving: boolean } | null;
type Props = {
  company: CompanyCard;
  preference?: CompanyPreference;
  ready: boolean;
  reaction: Reaction;
  onPreferenceChange: (
    key: string,
    change: CompanyPreference,
    type?: "like" | "dislike",
  ) => Promise<boolean>;
};

function CompanyCardActionsView({
  company,
  preference,
  ready,
  reaction,
  onPreferenceChange,
}: Props) {
  const careersUrl =
    preference?.careersUrl ||
    company.careersUrl ||
    company.nearshore?.careersUrl ||
    "";

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {careersUrl || company.website ? (
          <a
            href={careersUrl || company.website}
            target="_blank"
            rel="noopener noreferrer"
            className="mr-auto inline-flex items-center gap-2 rounded-lg bg-teal-300 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-teal-200"
          >
            {careersUrl ? "Open careers" : "Visit company"}
            <ArrowUpRight size={14} />
            <span className="sr-only">
              {" "}
              for {company.name} (opens in a new tab)
            </span>
          </a>
        ) : null}
        <button
          type="button"
          disabled={!ready}
          aria-pressed={!!preference?.liked}
          aria-label={`${preference?.liked ? "Unlike" : "Like"} ${company.name}`}
          onClick={() =>
            void onPreferenceChange(
              company.key,
              { liked: !preference?.liked, disliked: false },
              "like",
            )
          }
          className={`inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-pink-300 hover:bg-pink-950/40 ${reaction?.type === "like" ? "reaction-pop bg-pink-950/60 ring-1 ring-pink-400/50" : ""}`}
        >
          <Heart size={14} fill={preference?.liked ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={!!preference?.disliked}
          aria-label={`${preference?.disliked ? "Undo dislike for" : "Dislike"} ${company.name}`}
          onClick={() =>
            void onPreferenceChange(
              company.key,
              { disliked: !preference?.disliked, liked: false },
              "dislike",
            )
          }
          className={`inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-orange-300 hover:bg-orange-950/40 ${reaction?.type === "dislike" ? "reaction-pop bg-orange-950/60 ring-1 ring-orange-400/50" : ""}`}
        >
          <ThumbsDown
            size={14}
            fill={preference?.disliked ? "currentColor" : "none"}
          />
        </button>
      </div>
    </>
  );
}

export const CompanyCardActions = memo(CompanyCardActionsView);
