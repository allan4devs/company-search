import type { AnyBulkWriteOperation, Collection } from "mongodb";
import { getDb } from "@/lib/helpers/mongodb";
import { COLLECTIONS } from "@/lib/constants/db";
import {
  COMPANY_CATEGORIES,
  companyCategoryKeys,
  type CompanyCategory,
} from "./categories";
import {
  companyDomain,
  mergeCompanyJobs,
  normalizeCompanyName,
  type CompanyCard,
  type CompanySourceEvidence,
} from "./catalog";
import type { CompanyPreference } from "./types";
import type { CompanyEnrichmentInput } from "./enrichment";

type CompanyRecord = CompanyCard & { _id: string; categories: string[] };
type PreferenceRecord = CompanyPreference & {
  _id: string;
  ownerId: string;
  companyKey: string;
  categories: string[];
  updatedAt: Date;
};
export const SHARED_COMPANY_PREFERENCES_OWNER_ID =
  "__shared_company_directory__";
type MigrationRecord = { _id: string; completedAt: Date };

const indexPromises = new Map<string, Promise<void>>();

function ensureIndex(name: string, create: () => Promise<string>) {
  let promise = indexPromises.get(name);
  if (!promise) {
    promise = create()
      .then(() => undefined)
      .catch((error) => {
        indexPromises.delete(name);
        throw error;
      });
    indexPromises.set(name, promise);
  }
  return promise;
}

async function ensureCompanyNameIndex() {
  const db = await getDb();
  await ensureIndex("company-name", () =>
    db
      .collection(COLLECTIONS.COMP_COMPANIES)
      .createIndex({ name: 1, _id: 1 }, { name: "comp_company_name_order" }),
  );
}

async function ensurePreferenceOwnerIndex() {
  const db = await getDb();
  await ensureIndex("preference-owner", () =>
    db
      .collection(COLLECTIONS.COMP_PREFERENCES)
      .createIndex({ ownerId: 1 }, { name: "comp_preferences_owner" }),
  );
}

async function ensureCategoryOrderIndex() {
  const db = await getDb();
  await ensureIndex("category-order", () =>
    db
      .collection(COLLECTIONS.COMP_CATEGORIES)
      .createIndex({ order: 1, _id: 1 }, { name: "comp_category_order" }),
  );
}

async function ensureIndexes() {
  const db = await getDb();
  await Promise.all([
    ensureCompanyNameIndex(),
    ensurePreferenceOwnerIndex(),
    ensureCategoryOrderIndex(),
    ensureIndex("company-model-name", () =>
      db
        .collection(COLLECTIONS.COMP_COMPANIES)
        .createIndex(
          { model: 1, name: 1, _id: 1 },
          { name: "comp_company_model_name_order" },
        ),
    ),
    ensureIndex("company-fit-name", () =>
      db
        .collection(COLLECTIONS.COMP_COMPANIES)
        .createIndex(
          { "fit.status": 1, name: 1 },
          { name: "comp_company_fit_status" },
        ),
    ),
  ]);
}

function companyCategories(company: CompanyCard): string[] {
  return companyCategoryKeys(company);
}
function preferenceCategories(preference: CompanyPreference): string[] {
  return preference.liked ? ["likes"] : preference.disliked ? ["dislikes"] : [];
}

async function ensureSeedCompanies(
  collection: Collection<CompanyRecord>,
  migrations: Collection<MigrationRecord>,
) {
  const migrationId = "catalog-v3";
  if (await migrations.findOne({ _id: migrationId })) return;

  // The static JSON catalog is only needed when a database has not yet
  // received its seed records. Keep it out of the normal page request path.
  const { companies: seedCompanies } = await import("./companies");
  await collection.bulkWrite(
    seedCompanies.map((company) => ({
      updateOne: {
        filter: { _id: company.key },
        update: {
          $setOnInsert: {
            ...company,
            categories: companyCategories(company),
          },
        },
        upsert: true,
      },
    })),
  );
  await migrations.updateOne(
    { _id: migrationId },
    { $set: { completedAt: new Date() } },
    { upsert: true },
  );
}

async function ensureCompanyCategories(
  collection: Collection<CompanyRecord>,
  migrations: Collection<MigrationRecord>,
) {
  const migrationId = "categories-v2";
  if (await migrations.findOne({ _id: migrationId })) return;

  const existing = await collection.find({}).toArray();
  if (existing.length) {
    await collection.bulkWrite(
      existing.map((company) => ({
        updateOne: {
          filter: { _id: company._id },
          update: { $set: { categories: companyCategories(company) } },
        },
      })),
    );
  }
  const savedPreferences = await preferences();
  const savedPreferenceRows = await savedPreferences.find({}).toArray();
  if (savedPreferenceRows.length) {
    await savedPreferences.bulkWrite(
      savedPreferenceRows.map((preference) => ({
        updateOne: {
          filter: { _id: preference._id },
          update: { $set: { categories: preferenceCategories(preference) } },
        },
      })),
    );
  }
  await migrations.updateOne(
    { _id: migrationId },
    { $set: { completedAt: new Date() } },
    { upsert: true },
  );
}

export async function getCompanyPage(page: number, pageSize: number) {
  const db = await getDb();
  await ensureCompanyNameIndex();
  const collection = db.collection<CompanyRecord>(COLLECTIONS.COMP_COMPANIES);
  const migrations = db.collection<MigrationRecord>(COLLECTIONS.COMP_MIGRATIONS);
  await ensureSeedCompanies(collection, migrations);

  const [rows, total] = await Promise.all([
    collection
      .find({}, { projection: { _id: 0 } })
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments({}),
  ]);
  return {
    companies: rows.map((company) => ({
      ...company,
      categories: companyCategories(company),
    })),
    total,
  };
}

export async function getCompanies(model?: string): Promise<CompanyCard[]> {
  const db = await getDb();
  await ensureIndexes();
  const collection = db.collection<CompanyRecord>(COLLECTIONS.COMP_COMPANIES);
  const migrations = db.collection<MigrationRecord>(COLLECTIONS.COMP_MIGRATIONS);
  await ensureSeedCompanies(collection, migrations);
  await ensureCompanyCategories(collection, migrations);
  return collection
    .find(model ? { model } : {}, { projection: { _id: 0 } })
    .sort({ name: 1, _id: 1 })
    .toArray();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function mergeSourceEvidence(
  ...sources: (CompanySourceEvidence[] | undefined)[]
): CompanySourceEvidence[] {
  const merged = new Map<string, CompanySourceEvidence>();
  for (const source of sources.flatMap((items) => items || [])) {
    const key = `${source.kind}:${source.url}`;
    const existing = merged.get(key);
    if (!existing || source.checkedOn >= existing.checkedOn)
      merged.set(key, source);
  }
  return [...merged.values()];
}

function pendingCompanyKey(name: string) {
  const normalized = normalizeCompanyName(name);
  const fallback = encodeURIComponent(name.trim().toLowerCase())
    .replace(/%/g, "")
    .slice(0, 80);
  return `company-${normalized || fallback || "unknown"}`;
}

export async function upsertCompanyEnrichments(
  companies: CompanyEnrichmentInput[],
  batchId?: string,
) {
  await getCompanies();
  const db = await getDb();
  const collection = db.collection<CompanyRecord>(COLLECTIONS.COMP_COMPANIES);
  const existingCompanies = await collection.find({}).toArray();
  const byDomain = new Map<string, CompanyRecord>();
  const byName = new Map<string, CompanyRecord>();
  for (const company of existingCompanies) {
    const domain = companyDomain(company.website);
    if (domain && !byDomain.has(domain)) byDomain.set(domain, company);
    for (const name of [company.name, ...company.names]) {
      const normalized = normalizeCompanyName(name);
      if (normalized && !byName.has(normalized))
        byName.set(normalized, company);
    }
  }

  const writes: AnyBulkWriteOperation<CompanyRecord>[] = [];
  const resultRows: {
    key: string;
    name: string;
    sourceCount: number;
    operationIndex: number;
  }[] = [];
  for (const input of companies) {
    const domain = companyDomain(input.website);
    const normalizedName = normalizeCompanyName(input.name);
    const existing =
      (domain ? byDomain.get(domain) : undefined) ||
      (normalizedName ? byName.get(normalizedName) : undefined);
    const key = existing?._id || domain || pendingCompanyKey(input.name);
    const newJobs = input.jobs || [];
    const jobs = mergeCompanyJobs(existing?.jobs || [], newJobs);
    const sourceEvidence = mergeSourceEvidence(
      existing?.sourceEvidence,
      input.sourceEvidence,
    );
    const hasEvidence =
      sourceEvidence.length > 0 ||
      jobs.some((job) => job.checkedOn) ||
      !!input.discovery ||
      !!input.research ||
      !!input.roleEvidence ||
      !!existing?.discovery ||
      !!existing?.research ||
      !!existing?.roleEvidence;
    const company: CompanyCard = {
      key,
      name: existing?.name || input.name,
      names: unique([...(existing?.names || []), input.name]),
      website: input.website || existing?.website,
      careersUrl: input.careersUrl || existing?.careersUrl,
      tracks: unique([...(existing?.tracks || []), ...(input.tracks || [])]),
      locations: unique([
        ...(existing?.locations || []),
        ...(input.locations || []),
      ]),
      tags: unique([...(existing?.tags || []), ...(input.tags || [])]),
      records: jobs.length,
      model:
        input.model === "unknown" &&
        existing?.model &&
        existing.model !== "unknown"
          ? existing.model
          : input.model || existing?.model || "unknown",
      jobs,
      legacyKeys: unique([...(existing?.legacyKeys || [])]),
      nearshore: existing?.nearshore,
      discovery: input.discovery || existing?.discovery,
      research: input.research || existing?.research,
      roleEvidence: input.roleEvidence || existing?.roleEvidence,
      sourceEvidence,
      fit: input.fit || existing?.fit,
      extraction: {
        status: hasEvidence ? "sourced" : "pending",
        ...(batchId
          ? { batchId }
          : existing?.extraction?.batchId
            ? { batchId: existing.extraction.batchId }
            : {}),
        updatedAt: new Date().toISOString(),
      },
    };
    const operationIndex = writes.length;
    writes.push({
      updateOne: {
        filter: { _id: key },
        update: {
          $set: { ...company, categories: companyCategories(company) },
        },
        upsert: true,
      },
    });
    const saved: CompanyRecord = {
      ...company,
      _id: key,
      categories: companyCategories(company),
    };
    const savedDomain = companyDomain(saved.website);
    if (savedDomain) byDomain.set(savedDomain, saved);
    for (const name of [saved.name, ...saved.names]) {
      const normalized = normalizeCompanyName(name);
      if (normalized) byName.set(normalized, saved);
    }
    const sourceCount = new Set([
      ...sourceEvidence.map((source) => source.url),
      ...jobs.filter((job) => job.checkedOn).map((job) => job.url),
    ]).size;
    resultRows.push({ key, name: company.name, sourceCount, operationIndex });
  }
  const write = writes.length ? await collection.bulkWrite(writes) : undefined;
  const upsertedIndexes = new Set(
    Object.keys(write?.upsertedIds || {}).map(Number),
  );
  const results = resultRows.map(({ operationIndex, ...result }) => ({
    ...result,
    created: upsertedIndexes.has(operationIndex),
  }));
  return {
    imported: results.length,
    created: results.filter((result) => result.created).length,
    updated: results.filter((result) => !result.created).length,
    companies: results,
  };
}

export async function getCategories(): Promise<CompanyCategory[]> {
  const db = await getDb();
  await ensureCategoryOrderIndex();
  const collection = db.collection<CompanyCategory & { _id: string }>(
    COLLECTIONS.COMP_CATEGORIES,
  );
  const migrations = db.collection<{ _id: string; completedAt: Date }>(
    COLLECTIONS.COMP_MIGRATIONS,
  );
  const migrationId = "category-definitions-v1";
  if (!(await migrations.findOne({ _id: migrationId }))) {
    await collection.bulkWrite(
      COMPANY_CATEGORIES.map((category) => ({
        updateOne: {
          filter: { _id: category.key },
          update: { $setOnInsert: { ...category, _id: category.key } },
          upsert: true,
        },
      })),
    );
    await migrations.updateOne(
      { _id: migrationId },
      { $set: { completedAt: new Date() } },
      { upsert: true },
    );
  }
  return collection
    .find({}, { projection: { _id: 0 } })
    .sort({ order: 1, _id: 1 })
    .toArray();
}
const preferences = async () =>
  (await getDb()).collection<PreferenceRecord>(COLLECTIONS.COMP_PREFERENCES);
export async function getPreferences(
  ownerId: string,
): Promise<Record<string, CompanyPreference>> {
  await ensurePreferenceOwnerIndex();
  const rows = await (await preferences()).find({ ownerId }).toArray();
  return Object.fromEntries(
    rows.map((row) => [
      row.companyKey,
      {
        liked: row.liked,
        disliked: row.disliked,
        archived: row.archived,
        careersUrl: row.careersUrl,
        imageUrl: row.imageUrl,
        likedJobIds: row.likedJobIds,
        archivedJobIds: row.archivedJobIds,
        appliedJobIds: row.appliedJobIds,
        addedJobs: row.addedJobs,
      },
    ]),
  );
}
export async function copyPreferencesToOwner(
  sourceOwnerId: string,
  targetOwnerId: string,
) {
  if (sourceOwnerId === targetOwnerId) return;
  const collection = await preferences();
  const rows = await collection.find({ ownerId: sourceOwnerId }).toArray();
  if (!rows.length) return;
  const operations: AnyBulkWriteOperation<PreferenceRecord>[] = rows.map(
    (row) => {
      const targetId = JSON.stringify([targetOwnerId, row.companyKey]);
      return {
        updateOne: {
          filter: { _id: targetId },
          update: {
            $setOnInsert: { ...row, _id: targetId, ownerId: targetOwnerId },
          },
          upsert: true,
        },
      };
    },
  );
  await collection.bulkWrite(operations, { ordered: false });
}
export async function savePreference(
  ownerId: string,
  companyKey: string,
  change: CompanyPreference,
  importOnly = false,
) {
  const reaction = {
    ...change,
    ...(change.liked
      ? { disliked: false }
      : change.disliked
        ? { liked: false }
        : {}),
  };
  const collection = await preferences();
  const existing = await collection.findOne({
    _id: JSON.stringify([ownerId, companyKey]),
  });
  const fields = {
    ...reaction,
    categories: preferenceCategories({ ...existing, ...reaction }),
    ownerId,
    companyKey,
    updatedAt: new Date(),
  };
  await collection.updateOne(
    { _id: JSON.stringify([ownerId, companyKey]) },
    importOnly ? { $setOnInsert: fields } : { $set: fields },
    { upsert: true },
  );
}
