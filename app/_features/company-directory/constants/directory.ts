export type CompanyDirectoryCategory =
  | "all"
  | "new"
  | "usa"
  | "likes"
  | "dislikes"
  | "archived"
  | "saved-jobs"
  | "applied-jobs"
  | "archived-jobs";

export const COMPANY_GROUPS = [
  {
    key: "companies",
    title: "Companies",
    description: "Browse every company in one list.",
  },
] as const;

export type CompanyDirectoryGroup = (typeof COMPANY_GROUPS)[number];
export type CompanyDirectoryGroupKey = CompanyDirectoryGroup["key"];
export type CompanyDirectoryMainFilter = CompanyDirectoryCategory;
