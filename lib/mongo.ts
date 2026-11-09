import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB = process.env.MONGODB_DB ?? "lva";

type MongoCache = { client: MongoClient; dbName: string };
type MongoGlobal = typeof globalThis & {
  _mongoClient?: MongoCache | null;
  _mongoClientPromise?: Promise<MongoCache> | null;
};
const globalWithMongo = globalThis as MongoGlobal;
let cached: MongoCache | null = globalWithMongo._mongoClient ?? null;
let connecting: Promise<MongoCache> | null =
  globalWithMongo._mongoClientPromise ?? null;

export async function getDb() {
  if (!cached || !cached.client) {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI env var is not set");
    }
    connecting ??= new MongoClient(MONGODB_URI, {})
      .connect()
      .then((client) => {
        const connection: MongoCache = { client, dbName: MONGODB_DB };
        cached = connection;
        globalWithMongo._mongoClient = connection;
        return connection;
      })
      .catch((error) => {
        connecting = null;
        globalWithMongo._mongoClientPromise = null;
        throw error;
      });
    globalWithMongo._mongoClientPromise = connecting;
    await connecting;
  }
  return cached!.client.db(cached!.dbName);
}

export async function closeClient() {
  if (!cached && connecting) await connecting.catch(() => undefined);
  if (cached) {
    await cached.client.close();
    cached = null;
    globalWithMongo._mongoClient = null;
  }
  connecting = null;
  globalWithMongo._mongoClientPromise = null;
}
