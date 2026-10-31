import type { CompanyJob } from "./catalog";

export type CompanyPreference = {
  liked?: boolean;
  disliked?: boolean;
  archived?: boolean;
  careersUrl?: string;
  imageUrl?: string;
  likedJobIds?: string[];
  addedJobs?: CompanyJob[];
};
export function validatePreference(value: unknown): CompanyPreference {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid preference.");
  const item = value as CompanyPreference;
  const result: CompanyPreference = {};
  if (item.imageUrl !== undefined) {
    if (typeof item.imageUrl !== "string" || item.imageUrl.length > 2000)
      throw new Error("Invalid company image URL.");
    const url = new URL(item.imageUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.google.com" ||
      url.pathname !== "/s2/favicons"
    )
      throw new Error("Invalid company image URL.");
    result.imageUrl = url.href;
  }
  if (item.likedJobIds !== undefined) {
    if (
      !Array.isArray(item.likedJobIds) ||
      item.likedJobIds.length > 500 ||
      item.likedJobIds.some((id) => typeof id !== "string" || id.length > 250)
    )
      throw new Error("Invalid liked jobs.");
    result.likedJobIds = [...new Set(item.likedJobIds)];
  }
  for (const key of ["liked", "disliked", "archived"] as const) {
    if (item[key] !== undefined) {
      if (typeof item[key] !== "boolean") throw new Error("Invalid reaction.");
      result[key] = item[key];
    }
  }
  if (item.addedJobs !== undefined) {
    if (!Array.isArray(item.addedJobs) || item.addedJobs.length > 100)
      throw new Error("Invalid jobs.");
    result.addedJobs = item.addedJobs.map((job, index) => {
      if (
        !job ||
        typeof job !== "object" ||
        typeof job.title !== "string" ||
        typeof job.url !== "string" ||
        typeof job.location !== "string"
      )
        throw new Error(`Invalid job ${index + 1}.`);
      const url = new URL(job.url);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password)
        throw new Error("Invalid job URL.");
      return {
        id: String(job.id || `manual-${Date.now()}-${index}`).slice(0, 160),
        title: job.title.slice(0, 200),
        location: job.location.slice(0, 200),
        url: url.href,
        workMode:
          typeof job.workMode === "string" ? job.workMode.slice(0, 100) : "",
        sourceNotes: "Manually added",
      };
    });
  }
  if (result.liked && result.disliked)
    throw new Error("Choose like or dislike.");
  if (item.careersUrl !== undefined) {
    if (typeof item.careersUrl !== "string" || item.careersUrl.length > 2000)
      throw new Error("Invalid careers URL.");
    const url = new URL(item.careersUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      throw new Error("Invalid careers URL.");
    result.careersUrl = url.href;
  }
  return result;
}
