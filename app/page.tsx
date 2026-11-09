import type { Metadata } from "next";
import { COMPANY_CATEGORIES } from "@/lib/comp/categories";
import { CompanyDirectory } from "./_features/company-directory/context/CompanyDirectoryProvider";

export const metadata: Metadata = {
  title: "Comp | Company workspace",
  description: "Explore companies, save careers pages, and organize your favorites.",
  robots: { index: false, follow: false },
};

export default function CompPage() {
  return <CompanyDirectory initialCompanies={[]} initialCategories={COMPANY_CATEGORIES} />;
}
