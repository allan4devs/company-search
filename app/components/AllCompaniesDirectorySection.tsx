"use client";

import { COMPANY_GROUPS } from "../company-directory.constants";
import {
  CompanyDirectoryGroupSection,
  type CompanyDirectoryGroupSectionProps,
} from "./CompanyDirectoryGroupSection";

type Props = Omit<CompanyDirectoryGroupSectionProps, "group">;

export function AllCompaniesDirectorySection(props: Props) {
  return <CompanyDirectoryGroupSection {...props} group={COMPANY_GROUPS[0]} />;
}
