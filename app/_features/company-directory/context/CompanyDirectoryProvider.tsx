"use client";

import { useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyCategory } from "@/lib/comp/categories";
import type { CompanyDirectoryMainFilter } from "../constants/directory";
import { useCompanyDirectoryData } from "../hooks/use-company-directory-data";
import { useCompanyDirectoryPreferences } from "../hooks/use-company-directory-preferences";
import { CompanyDirectoryView } from "../components/CompanyDirectoryView";

type Props = { initialCompanies: CompanyCard[]; initialCategories: CompanyCategory[] };

export function CompanyDirectory({ initialCompanies, initialCategories }: Props) {
  const [tab, setTab] = useState<CompanyDirectoryMainFilter>("all");
  const data = useCompanyDirectoryData(initialCompanies, initialCategories);
  const preferences = useCompanyDirectoryPreferences(data.companies, data.preferences, data.setPreferences, tab, data.ready, data.canSync, data.setNotice);

  return <CompanyDirectoryView data={data} preferences={preferences} tab={tab} setTab={setTab} />;
}
