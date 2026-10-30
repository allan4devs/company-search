import companyData from "./data/companies.json";
import nearshoreData from "./data/nearshore.json";
import expandedCompanies from "./data/expanded-companies.json";
import employerRoles from "./data/employer-roles.json";
import { buildCompanyCatalog, mergeCompanyJobs, type CompanyCard } from "./catalog";

export type { CompanyCard } from "./catalog";
export const companies = buildCompanyCatalog(companyData, nearshoreData, expandedCompanies as CompanyCard[]);
for (const evidence of employerRoles) {
  const company = companies.find(item => item.key === evidence.key);
  if (!company) continue;
  company.jobs = mergeCompanyJobs(company.jobs, evidence.jobs);
  company.records = company.jobs.length;
  company.roleEvidence = { source: evidence.source, checkedOn: evidence.checkedOn };
}
