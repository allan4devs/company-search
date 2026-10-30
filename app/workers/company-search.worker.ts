import type { CompanyCard, CompanyFilters } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import { filterCompanyKeys } from "../company-directory.helpers";
import type { CompanyDirectoryCategory } from "../company-directory.constants";

type WorkerRequest = {
  type: "filter";
  id: number;
  tab: CompanyDirectoryCategory;
  preferences: Record<string, CompanyPreference>;
  filters: CompanyFilters;
  researchOnly: boolean;
} | { type: "init"; companies: CompanyCard[]; part: number };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: { id: number; part: number; keys: string[] }) => void;
};

let directory: CompanyCard[] = [];
let part = 0;

workerScope.onmessage = event => {
  const request = event.data;
  if (request.type === "init") {
    directory = request.companies;
    part = request.part;
    return;
  }

  const keys = filterCompanyKeys(directory, request.tab, request.preferences, request.filters, request.researchOnly);
  workerScope.postMessage({ id: request.id, part, keys });
};
