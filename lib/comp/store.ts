import { getDb } from "@/lib/helpers/mongodb";
import { COLLECTIONS } from "@/lib/constants/db";
import { companies as seedCompanies } from "./companies";
import { COMPANY_CATEGORIES, companyCategoryKeys, type CompanyCategory } from "./categories";
import type { CompanyCard } from "./catalog";
import type { CompanyPreference } from "./types";

type CompanyRecord = CompanyCard & { _id: string; categories: string[] };
type PreferenceRecord = CompanyPreference & { _id: string; ownerId: string; companyKey: string; categories: string[]; updatedAt: Date };
let indexPromise: Promise<void> | null = null;

async function ensureIndexes() {
  const db = await getDb();
  indexPromise ??= Promise.all([
    db.collection(COLLECTIONS.COMP_COMPANIES).createIndex({ name: 1, _id: 1 }, { name: "comp_company_name_order" }),
    db.collection(COLLECTIONS.COMP_CATEGORIES).createIndex({ order: 1, _id: 1 }, { name: "comp_category_order" }),
    db.collection(COLLECTIONS.COMP_PREFERENCES).createIndex({ ownerId: 1 }, { name: "comp_preferences_owner" }),
  ]).then(() => undefined).catch(error => {
    indexPromise = null;
    throw error;
  });
  await indexPromise;
}

function companyCategories(company: CompanyCard): string[] {
  return companyCategoryKeys(company);
}
function preferenceCategories(preference: CompanyPreference): string[] {
  return preference.liked ? ["likes"] : preference.disliked ? ["dislikes"] : [];
}
export async function getCompanies(): Promise<CompanyCard[]> {
  const db = await getDb();
  await ensureIndexes();
  const collection = db.collection<CompanyRecord>(COLLECTIONS.COMP_COMPANIES);
  // Stable IDs make the initial import safe across concurrent requests and retries.
  const migrations = db.collection<{ _id: string; completedAt: Date }>(COLLECTIONS.COMP_MIGRATIONS);
  const migrationId = "catalog-v1";
  if (!await migrations.findOne({ _id: migrationId })) {
    await collection.bulkWrite(seedCompanies.map(company => ({ updateOne: {
      filter: { _id: company.key }, update: { $setOnInsert: { ...company, categories: companyCategories(company) } }, upsert: true,
    } })));
    await migrations.updateOne({ _id: migrationId }, { $set: { completedAt: new Date() } }, { upsert: true });
  }
  const categoriesMigrationId = "categories-v2";
  if (!await migrations.findOne({ _id: categoriesMigrationId })) {
    const existing = await collection.find({}).toArray();
    await collection.bulkWrite(existing.map(company => ({ updateOne: {
      filter: { _id: company._id }, update: { $set: { categories: companyCategories(company) } },
    } })));
    const savedPreferences = await preferences();
    for (const preference of await savedPreferences.find({}).toArray()) {
      await savedPreferences.updateOne({ _id: preference._id }, { $set: { categories: preferenceCategories(preference) } });
    }
    await migrations.updateOne({ _id: categoriesMigrationId }, { $set: { completedAt: new Date() } }, { upsert: true });
  }
  return collection.find({}, { projection: { _id: 0 } }).sort({ name: 1, _id: 1 }).toArray();
}
export async function getCategories(): Promise<CompanyCategory[]> {
  const db = await getDb();
  await ensureIndexes();
  const collection = db.collection<CompanyCategory & { _id: string }>(COLLECTIONS.COMP_CATEGORIES);
  const migrations = db.collection<{ _id: string; completedAt: Date }>(COLLECTIONS.COMP_MIGRATIONS);
  const migrationId = "category-definitions-v1";
  if (!await migrations.findOne({ _id: migrationId })) {
    await collection.bulkWrite(COMPANY_CATEGORIES.map(category => ({ updateOne: {
      filter: { _id: category.key }, update: { $setOnInsert: { ...category, _id: category.key } }, upsert: true,
    } })));
    await migrations.updateOne({ _id: migrationId }, { $set: { completedAt: new Date() } }, { upsert: true });
  }
  return collection.find({}, { projection: { _id: 0 } }).sort({ order: 1, _id: 1 }).toArray();
}
const preferences = async () => (await getDb()).collection<PreferenceRecord>(COLLECTIONS.COMP_PREFERENCES);
export async function getPreferences(ownerId: string): Promise<Record<string, CompanyPreference>> {
  await ensureIndexes();
  const rows = await (await preferences()).find({ ownerId }).toArray();
  return Object.fromEntries(rows.map(row => [row.companyKey, { liked: row.liked, disliked: row.disliked, careersUrl: row.careersUrl }]));
}
export async function savePreference(ownerId: string, companyKey: string, change: CompanyPreference, importOnly = false) {
  const reaction = { ...change, ...(change.liked ? { disliked: false } : change.disliked ? { liked: false } : {}) };
  const collection = await preferences();
  const existing = await collection.findOne({ _id: JSON.stringify([ownerId, companyKey]) });
  const fields = { ...reaction, categories: preferenceCategories({ ...existing, ...reaction }), ownerId, companyKey, updatedAt: new Date() };
  await collection.updateOne({ _id: JSON.stringify([ownerId, companyKey]) }, importOnly ? { $setOnInsert: fields } : { $set: fields }, { upsert: true });
}
