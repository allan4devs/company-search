import { getDb } from "@/lib/helpers/mongodb";
import { COLLECTIONS } from "@/lib/constants/db";
import type { CompanyJob } from "./catalog";

export type SharedJob = {
  _id: string;
  companyName: string;
  job: CompanyJob;
  createdAt: Date;
};

export async function saveSharedJob(
  id: string,
  companyName: string,
  job: CompanyJob,
) {
  const collection = (await getDb()).collection<SharedJob>(COLLECTIONS.COMP_SHARED_JOBS);
  await collection.insertOne({ _id: id, companyName, job, createdAt: new Date() });
}

export async function getSharedJob(id: string) {
  const collection = (await getDb()).collection<SharedJob>(COLLECTIONS.COMP_SHARED_JOBS);
  return collection.findOne({ _id: id });
}
