import { useCallback, useMemo, useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import {
  COMPANY_GROUPS,
  type CompanyDirectoryCategory,
  type CompanyDirectoryGroupKey,
  type CompanyDirectoryMainFilter,
} from "../constants/directory";
import type {
  CompanyDirectoryGroupSummaries,
  CompanyDirectoryGroupSummary,
} from "../types";

const savedViews: CompanyDirectoryCategory[] = [
  "all",
  "new",
  "usa",
  "likes",
  "dislikes",
  "archived",
  "saved-jobs",
  "applied-jobs",
  "archived-jobs",
];

export function useCompanyDirectorySummary() {
  const [groupSummaries, setGroupSummaries] =
    useState<CompanyDirectoryGroupSummaries>({});
  const [visibleCompaniesByFilter, setVisibleCompaniesByFilter] = useState<
    Partial<Record<CompanyDirectoryMainFilter, CompanyCard[]>>
  >({});
  const [countryOptions, setCountryOptions] = useState<string[]>([]);

  const hasAllSummaries = COMPANY_GROUPS.every(
    (group) => groupSummaries[group.key],
  );

  const groupCounts = useMemo(() => {
    const counts: Partial<Record<CompanyDirectoryMainFilter, number>> = {};
    if (!hasAllSummaries) return counts;

    for (const savedView of savedViews) {
      counts[savedView] = COMPANY_GROUPS.reduce(
        (total, group) =>
          total + (groupSummaries[group.key]?.categoryCounts[savedView] || 0),
        0,
      );
    }

    return counts;
  }, [groupSummaries, hasAllSummaries]);

  const onSummary = useCallback(
    (key: CompanyDirectoryGroupKey, summary: CompanyDirectoryGroupSummary) => {
      setGroupSummaries((current) => {
        const previous = current[key];
        if (
          previous &&
          previous.total === summary.total &&
          JSON.stringify(previous.categoryCounts) ===
            JSON.stringify(summary.categoryCounts)
        ) {
          return current;
        }

        return { ...current, [key]: summary };
      });
    },
    [],
  );

  const onVisibleCompaniesChange = useCallback(
    (filter: CompanyDirectoryMainFilter, companies: CompanyCard[]) => {
      setVisibleCompaniesByFilter((current) => ({
        ...current,
        [filter]: companies,
      }));
    },
    [],
  );

  const onCountryOptionsChange = useCallback((countries: string[]) => {
    setCountryOptions(countries);
  }, []);

  return {
    countryOptions,
    groupCounts,
    onCountryOptionsChange,
    onSummary,
    onVisibleCompaniesChange,
    visibleCompaniesByFilter,
  };
}
