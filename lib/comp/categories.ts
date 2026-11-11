import { JOB_CATEGORIES, companyJobCategory, companySignals, TECHNOLOGIES } from "./catalog";
import type { CompanyCard } from "./catalog";
import type { CompanyPreference } from "./types";

export type CompanyCategory = {
  key: string;
  label: string;
  group: string;
  order: number;
};

export const COMPANY_CATEGORIES: CompanyCategory[] = [
  { key: "all", label: "Total", group: "Browse", order: 0 },
  { key: "new", label: "New", group: "Browse", order: 1 },
  { key: "latest-batch", label: "Latest batch", group: "Browse", order: 2 },
  { key: "nearshore", label: "Nearshore", group: "Browse", order: 3 },
  { key: "usa", label: "USA", group: "Browse", order: 4 },
  { key: "java", label: "Java", group: "Technology", order: 2 },
  { key: "react", label: "React", group: "Technology", order: 3 },
  { key: "python", label: "Python", group: "Technology", order: 4 },
  { key: "node", label: "Node.js", group: "Technology", order: 5 },
  { key: "javascript", label: "JavaScript", group: "Technology", order: 6 },
  { key: "typescript", label: "TypeScript", group: "Technology", order: 7 },
  { key: "othertech", label: "Other / unspecified stack", group: "Technology", order: 8 },
  { key: "fullstack", label: "Full stack", group: "Role", order: 9 },
  { key: "backend", label: "Backend", group: "Role", order: 10 },
  { key: "frontend", label: "Frontend", group: "Role", order: 11 },
  { key: "otherrole", label: "Other / unspecified role", group: "Role", order: 12 },
  { key: "midlevel", label: "Mid-level", group: "Level", order: 13 },
  { key: "junior", label: "Junior", group: "Level", order: 14 },
  { key: "senior", label: "Senior", group: "Level", order: 15 },
  { key: "otherlevel", label: "Level unspecified", group: "Level", order: 16 },
  { key: "outsourcing", label: "Outsourcing & consulting", group: "Company type", order: 17 },
  { key: "direct", label: "Direct employers", group: "Company type", order: 18 },
  { key: "othermodel", label: "Model to review", group: "Company type", order: 19 },
  { key: "latam", label: "LATAM evidence", group: "Location", order: 20 },
  ...JOB_CATEGORIES.map(({ key, label }, index) => ({ key, label, group: "Job category", order: 21 + index })),
  { key: "likes", label: "Likes", group: "Saved", order: 31 },
  { key: "dislikes", label: "Dislikes", group: "Saved", order: 32 },
];

export function matchesCompanyCategory(
  company: CompanyCard,
  category: string,
  preference?: CompanyPreference,
  latestNewBatchId?: string,
) {
  if (category === "all") return true;
  if (category === "likes") return !!preference?.liked;
  if (category === "dislikes") return !!preference?.disliked;
  if (category === "archived")
    return !!preference?.archived && !preference?.liked && !preference?.disliked;
  if (category === "usa")
    return (
      company.tags?.includes("usa-latam-2026") === true &&
      !preference?.liked &&
      !preference?.disliked &&
      !preference?.archived
    );
  // Saved jobs are independent of the company's like, dislike, and archive state.
  if (category === "saved-jobs")
    return !!preference?.likedJobIds?.length || !!preference?.addedJobs?.length;
  const isLatestNewBatch = !!latestNewBatchId &&
    company.tags?.includes("new") === true &&
    company.extraction?.batchId === latestNewBatchId;
  if (category === "latest-batch")
    return isLatestNewBatch && !preference?.disliked && !preference?.archived;
  if (category === "new" && isLatestNewBatch)
    return !preference?.disliked && !preference?.archived;
  if (preference?.archived || preference?.liked || preference?.disliked)
    return false;
  if (category === "new") return company.tags?.includes("new") || false;
  return company.categories?.includes(category) || false;
}

const technologyCategoryKeys: Record<string, string> = {
  Java: "java", React: "react", Python: "python", "Node.js": "node", JavaScript: "javascript", TypeScript: "typescript",
};
const roleCategoryKeys: Record<string, string> = { "Full stack": "fullstack", Backend: "backend", Frontend: "frontend" };
const levelCategoryKeys: Record<string, string> = { "Mid-level": "midlevel", Junior: "junior", Senior: "senior" };

export function companyCategoryKeys(company: CompanyCard): string[] {
  const categories = new Set<string>();
  if (company.model === "outsourcing" || company.model === "direct") categories.add(company.model);
  else categories.add("othermodel");
  if (company.nearshore) categories.add("nearshore");
  if (company.tags?.includes("usa-latam-2026")) categories.add("usa");
  if (company.research) categories.add("latam");

  const signals = companySignals(company);
  const technologies = signals.technologies.filter(technology => technology in technologyCategoryKeys);
  for (const technology of technologies) categories.add(technologyCategoryKeys[technology]);
  if (!technologies.length || !TECHNOLOGIES.some(technology => signals.technologies.includes(technology))) categories.add("othertech");

  for (const role of signals.roles) if (roleCategoryKeys[role]) categories.add(roleCategoryKeys[role]);
  if (!signals.roles.length) categories.add("otherrole");
  for (const level of signals.levels) if (levelCategoryKeys[level]) categories.add(levelCategoryKeys[level]);
  if (!signals.levels.length) categories.add("otherlevel");
  for (const job of company.jobs) categories.add(companyJobCategory(job));
  return [...categories];
}
