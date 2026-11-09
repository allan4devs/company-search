import type { Dispatch, SetStateAction } from "react";
import type { CompanyDirectoryGroupKey, CompanyDirectoryMainFilter } from "./constants/directory";
import { useCompanyDirectoryData } from "./hooks/use-company-directory-data";
import { useCompanyDirectoryPreferences } from "./hooks/use-company-directory-preferences";

export type CompanyDirectoryGroupSummary = {
  total: number;
  categoryCounts: Record<string, number>;
};

export type CompanyDirectoryGroupSummaries = Partial<Record<CompanyDirectoryGroupKey, CompanyDirectoryGroupSummary>>;

export type CompanyDirectoryViewData = {
  data: ReturnType<typeof useCompanyDirectoryData>;
  preferences: ReturnType<typeof useCompanyDirectoryPreferences>;
  tab: CompanyDirectoryMainFilter;
  setTab: Dispatch<SetStateAction<CompanyDirectoryMainFilter>>;
};
