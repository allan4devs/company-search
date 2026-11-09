import type { CompanyCard } from "@/lib/comp/catalog";
import { companySignals } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";

export function companyDetailsCopyText(
  company: CompanyCard,
  preference?: CompanyPreference,
) {
  const previewJobs = [...company.jobs, ...(preference?.addedJobs || [])];
  const previewRoles = [
    ...new Set(
      [company.research?.role, ...previewJobs.map((job) => job.title)].filter(
        (role): role is string => !!role,
      ),
    ),
  ];
  const roleNote = [
    company.research?.notes,
    company.jobs[0]?.sourceNotes,
    company.jobs[0]?.matchReason,
  ].find((note) => note && !/\bcv\b|tailored/i.test(note));
  const signals = companySignals(company);

  return [
    company.name,
    company.website,
    preference?.careersUrl ||
      company.careersUrl ||
      company.nearshore?.careersUrl,
    signals.technologies.join(", "),
    company.research?.region || company.locations.join(" · "),
    company.research?.workMode || company.discovery?.remotePolicy,
    previewRoles.join(" · "),
    roleNote,
  ]
    .filter(Boolean)
    .join("\n");
}
