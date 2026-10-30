import type { Metadata } from "next";
import { companies } from "@/lib/comp/companies";
import { COMPANY_CATEGORIES, companyCategoryKeys } from "@/lib/comp/categories";
import type { CompanyCard } from "@/lib/comp/catalog";
import { CompanyDirectory } from "./company-directory.context";

export const metadata: Metadata = {
  title: "Comp | Company workspace",
  description: "Explore companies, save careers pages, and organize your favorites.",
  robots: { index: false, follow: false },
};

const prerenderedCompanies: CompanyCard[] = companies.slice(0, 24).map(company => ({
  ...company,
  categories: companyCategoryKeys(company),
}));

export default function CompPage() {
  return <CompanyDirectory initialCompanies={prerenderedCompanies} initialCategories={COMPANY_CATEGORIES} />;
}
