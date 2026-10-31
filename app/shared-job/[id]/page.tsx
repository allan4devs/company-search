import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpRight, BriefcaseBusiness, MapPin } from "lucide-react";
import { getSharedJob } from "@/lib/comp/shared-jobs";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Shared job" };
  const shared = await getSharedJob(id).catch(() => null);
  return {
    title: shared ? `${shared.job.title || "Job"} at ${shared.companyName}` : "Shared job",
    description: shared ? `${shared.companyName} · ${shared.job.location || "Job opportunity"}` : "Shared job opportunity",
  };
}

export default async function SharedJobPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const shared = await getSharedJob(id).catch(() => null);
  if (!shared) notFound();
  const { job } = shared;

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-12 text-zinc-100">
      <article className="mx-auto max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
          <BriefcaseBusiness size={15} /> Shared job
        </p>
        <h1 className="mt-5 text-3xl font-semibold">{job.title || "Open role"}</h1>
        <p className="mt-2 text-lg text-zinc-300">{shared.companyName}</p>
        {job.location ? <p className="mt-5 flex items-center gap-2 text-sm text-zinc-400"><MapPin size={16} />{job.location}</p> : null}
        {job.workMode ? <p className="mt-2 text-sm text-zinc-400">{job.workMode}</p> : null}
        {job.sourceNotes ? <p className="mt-6 border-t border-zinc-800 pt-5 text-sm leading-6 text-zinc-300">{job.sourceNotes}</p> : null}
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-teal-300 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-teal-200">
          View job <ArrowUpRight size={16} />
        </a>
      </article>
    </main>
  );
}
