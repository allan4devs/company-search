"use client";

import { useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyCategory } from "@/lib/comp/categories";
import type { CompanyDirectoryCategory } from "./company-directory.constants";
import { useCompanyDirectoryData } from "./hooks/use-company-directory-data";
import { useCompanyDirectoryFiltering } from "./hooks/use-company-directory-filtering";
import { useCompanyDirectoryPreferences } from "./hooks/use-company-directory-preferences";
import { CompanyDirectoryView } from "./components/CompanyDirectoryView";

type Props = { initialCompanies: CompanyCard[]; initialCategories: CompanyCategory[] };

export function CompanyDirectory({ initialCompanies, initialCategories }: Props) {
  const [tab, setTab] = useState<CompanyDirectoryCategory>("companies");
  const data = useCompanyDirectoryData(initialCompanies, initialCategories);
  const preferences = useCompanyDirectoryPreferences(data.companies, data.preferences, data.setPreferences, tab, data.ready, data.canSync, data.setReady, data.setNotice);
  const filtering = useCompanyDirectoryFiltering(data.companies, data.setCompanies, preferences.preferences, tab, setTab);

  return <CompanyDirectoryView data={data} preferences={preferences} filtering={filtering} />;
}
