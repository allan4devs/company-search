import { memo, useState } from "react";
import { ArrowUpRight, Heart, Pencil, Plus, ThumbsDown } from "lucide-react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";

type Reaction = { type: "like" | "dislike"; leaving: boolean } | null;
type Props = {
  company: CompanyCard;
  preference?: CompanyPreference;
  ready: boolean;
  reaction: Reaction;
  onPreferenceChange: (key: string, change: CompanyPreference, type?: "like" | "dislike") => Promise<boolean>;
  onSaveCareers: (company: CompanyCard, draft: string) => Promise<boolean>;
  onCancel: () => void;
};

function CompanyCardActionsView({ company, preference, ready, reaction, onPreferenceChange, onSaveCareers, onCancel }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const careersUrl = preference?.careersUrl || company.careersUrl || company.nearshore?.careersUrl || "";

  function beginEditing() {
    setDraft(careersUrl);
    setEditing(true);
  }

  return <>
    <div className="mt-2 flex flex-wrap gap-2">
      {careersUrl ? <>
        <a href={careersUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-teal-900 px-3 py-2 text-xs font-semibold text-teal-300">View careers <ArrowUpRight size={14} /><span className="sr-only"> for {company.name} (opens in a new tab)</span></a>
        <button type="button" disabled={!ready} aria-label={`Edit careers link for ${company.name}`} onClick={beginEditing} className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-400 hover:text-white"><Pencil size={14} /></button>
      </> : <button type="button" disabled={!ready} onClick={beginEditing} className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-teal-300"><Plus size={14} /> Add careers link<span className="sr-only"> for {company.name}</span></button>}
      <button type="button" disabled={!ready} aria-pressed={!!preference?.liked} aria-label={`${preference?.liked ? "Unlike" : "Like"} ${company.name}`} onClick={() => void onPreferenceChange(company.key, { liked: !preference?.liked, disliked: false }, "like")} className={`inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-pink-300 hover:bg-pink-950/40 ${reaction?.type === "like" ? "reaction-pop bg-pink-950/60 ring-1 ring-pink-400/50" : ""}`}><Heart size={14} fill={preference?.liked ? "currentColor" : "none"} />{preference?.liked ? "Liked" : "Like"}</button>
      <button type="button" disabled={!ready} aria-pressed={!!preference?.disliked} aria-label={`${preference?.disliked ? "Undo dislike for" : "Dislike"} ${company.name}`} onClick={() => void onPreferenceChange(company.key, { disliked: !preference?.disliked, liked: false }, "dislike")} className={`inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-orange-300 hover:bg-orange-950/40 ${reaction?.type === "dislike" ? "reaction-pop bg-orange-950/60 ring-1 ring-orange-400/50" : ""}`}><ThumbsDown size={14} fill={preference?.disliked ? "currentColor" : "none"} />{preference?.disliked ? "Undo dislike" : "Dislike"}</button>
    </div>
    {editing ? <form onSubmit={async event => {
      event.preventDefault();
      if (await onSaveCareers(company, draft)) setEditing(false);
    }} className="mt-2 rounded-xl border border-zinc-800 p-3">
      <label className="text-xs text-zinc-300" htmlFor={`careers-${company.key}`}>Careers page for {company.name}</label>
      <input autoFocus required type="url" id={`careers-${company.key}`} value={draft} onChange={event => setDraft(event.target.value)} placeholder="https://company.com/careers" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm" />
      <div className="mt-2 flex gap-3 text-xs">
        <button type="submit" className="rounded-lg bg-teal-400 px-3 py-2 font-semibold text-zinc-950">Save link</button>
        <button type="button" onClick={() => { setEditing(false); onCancel(); }} className="px-3 py-2 text-zinc-400">Cancel</button>
      </div>
    </form> : null}
  </>;
}

export const CompanyCardActions = memo(CompanyCardActionsView);
