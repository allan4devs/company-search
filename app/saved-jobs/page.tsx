import type { Metadata } from "next";
import { COMPANY_CATEGORIES } from "@/lib/comp/categories";
import { CompanyDirectory } from "../_features/company-directory/context/CompanyDirectoryProvider";

export const metadata: Metadata = {
  title: "Comp | Saved jobs",
  description: "Review and organize saved, applied, and archived jobs.",
  robots: { index: false, follow: false },
};

export default function SavedJobsPage() {
  return (
    <CompanyDirectory
      initialCompanies={[]}
      initialCategories={COMPANY_CATEGORIES}
      initialTab="saved-jobs"
      jobsOnly
    />
  );
}
