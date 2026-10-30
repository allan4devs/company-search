import { CompanyDirectory } from "./use-company-directory-data";
import { CompanyDirectoryFiltering } from "./use-company-directory-filtering";
import { CompanyDirectoryPreferences } from "./use-company-directory-preferences";

export type CompanyDirectoryViewData = {
  data: ReturnType<typeof CompanyDirectory>;
  preferences: ReturnType<typeof CompanyDirectoryPreferences>;
  filtering: ReturnType<typeof CompanyDirectoryFiltering>;
};
