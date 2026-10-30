import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB = process.env.MONGODB_DB ?? "lva";

type MongoCache = { client: MongoClient; dbName: string };
type MongoGlobal = typeof globalThis & { _mongoClient?: MongoCache | null };
const globalWithMongo = globalThis as MongoGlobal;
let cached: MongoCache | null = globalWithMongo._mongoClient ?? null;

export async function getDb() {
  if (!cached || !cached.client) {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI env var is not set");
    }
    const client = new MongoClient(MONGODB_URI, {});
    await client.connect();
    cached = { client, dbName: MONGODB_DB };
    globalWithMongo._mongoClient = cached;
  }
  return cached.client.db(cached.dbName);
}

export async function closeClient() {
  if (cached) {
    await cached.client.close();
    cached = null;
    globalWithMongo._mongoClient = null;
  }
}
