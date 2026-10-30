export type CompanyPreference = { liked?: boolean; disliked?: boolean; careersUrl?: string };
export function validatePreference(value: unknown): CompanyPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid preference.");
  const item = value as CompanyPreference;
  const result: CompanyPreference = {};
  for (const key of ["liked", "disliked"] as const) {
    if (item[key] !== undefined) {
      if (typeof item[key] !== "boolean") throw new Error("Invalid reaction.");
      result[key] = item[key];
    }
  }
  if (result.liked && result.disliked) throw new Error("Choose like or dislike.");
  if (item.careersUrl !== undefined) {
    if (typeof item.careersUrl !== "string" || item.careersUrl.length > 2000) throw new Error("Invalid careers URL.");
    const url = new URL(item.careersUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("Invalid careers URL.");
    result.careersUrl = url.href;
  }
  return result;
}
