export const COMPANY_PREFERENCES_KEY = "cv-company-preferences-v1";
export const COMPANY_DIRECTORY_CACHE_KEY = "company-directory-cache-v1";
export const COMPANY_PAGE_SIZES = [12, 24, 48] as const;

export type CompanyDirectoryCategory = string;

export const COMPANY_GROUPS = [
  {
    key: "outsourcing",
    title: "Outsourcing & consulting",
    description:
      "Development agencies, staff augmentation, recruiters, and consulting firms hiring for client teams.",
  },
  {
    key: "unknown",
    title: "More engineering employers",
    description:
      "Additional software companies and technology teams. Review the company source for its business model.",
  },
  {
    key: "direct",
    title: "Direct employers",
    description:
      "Companies hiring for their own products, platforms, or internal operations.",
  },
] as const;
