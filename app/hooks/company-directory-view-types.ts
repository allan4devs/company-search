import type { Dispatch, SetStateAction } from "react";
import type { CompanyDirectoryGroupKey, CompanyDirectoryMainFilter } from "../company-directory.constants";
import { CompanyDirectory } from "./use-company-directory-data";
import { CompanyDirectoryPreferences } from "./use-company-directory-preferences";

export type CompanyDirectoryGroupSummary = {
  total: number;
  categoryCounts: Record<string, number>;
  stats: { total: number; linked: number; nearshore: number; researched: number; midLevel: number };
};

export type CompanyDirectoryGroupSummaries = Partial<Record<CompanyDirectoryGroupKey, CompanyDirectoryGroupSummary>>;

export type CompanyDirectoryViewData = {
  data: ReturnType<typeof CompanyDirectory>;
  preferences: ReturnType<typeof CompanyDirectoryPreferences>;
  tab: CompanyDirectoryMainFilter;
  setTab: Dispatch<SetStateAction<CompanyDirectoryMainFilter>>;
};
