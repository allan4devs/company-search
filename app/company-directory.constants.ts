export const COMPANY_PREFERENCES_KEY = "cv-company-preferences-v1";
export const COMPANY_PREFERENCES_CACHE_KEY = "cv-company-preferences-cache-v1";
export const COMPANY_DIRECTORY_CACHE_KEY = "company-directory-cache-v1";
export type CompanyDirectoryCategory =
  "all" | "likes" | "dislikes" | "archived" | "saved-jobs";

export const COMPANY_GROUPS = [
  {
    key: "companies",
    title: "Companies",
    description: "Browse every company in one list.",
  },
] as const;

export type CompanyDirectoryGroup = (typeof COMPANY_GROUPS)[number];
export type CompanyDirectoryGroupKey = CompanyDirectoryGroup["key"];
export type CompanyDirectoryMainFilter =
  CompanyDirectoryCategory | CompanyDirectoryGroupKey;
