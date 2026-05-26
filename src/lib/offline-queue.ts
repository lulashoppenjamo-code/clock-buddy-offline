import { openDB, type IDBPDatabase } from "idb";

export type EntryType = "clock_in" | "clock_out" | "break_start" | "break_end";

export interface QueuedEntry {
  client_id: string;
  owner_id: string;
  employee_id: string;
  employee_name: string;
  type: EntryType;
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  photo_blob: Blob | null;
  photo_path: string | null;
  device_label: string | null;
  synced: 0 | 1;
  created_at: number;
}

const DB_NAME = "checador-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", { keyPath: "client_id" });
          store.createIndex("synced", "synced");
          store.createIndex("created_at", "created_at");
        }
        if (!db.objectStoreNames.contains("employees_cache")) {
          db.createObjectStore("employees_cache", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function queueEntry(entry: Omit<QueuedEntry, "synced" | "created_at">) {
  const db = await getDb();
  const full: QueuedEntry = { ...entry, synced: 0, created_at: Date.now() };
  await db.put("entries", full);
  return full;
}

export async function getPendingEntries(): Promise<QueuedEntry[]> {
  const db = await getDb();
  const all = (await db.getAll("entries")) as QueuedEntry[];
  return all.filter((e) => e.synced === 0).sort((a, b) => a.created_at - b.created_at);
}

export async function getAllEntries(): Promise<QueuedEntry[]> {
  const db = await getDb();
  const all = (await db.getAll("entries")) as QueuedEntry[];
  return all.sort((a, b) => b.created_at - a.created_at);
}

export async function markSynced(client_id: string, photo_path: string | null) {
  const db = await getDb();
  const existing = (await db.get("entries", client_id)) as QueuedEntry | undefined;
  if (!existing) return;
  existing.synced = 1;
  existing.photo_path = photo_path;
  existing.photo_blob = null;
  await db.put("entries", existing);
}

export async function cacheEmployees(employees: Array<{ id: string; name: string; pin: string; color: string }>) {
  const db = await getDb();
  const tx = db.transaction("employees_cache", "readwrite");
  await tx.store.clear();
  for (const e of employees) await tx.store.put(e);
  await tx.done;
}

export async function getCachedEmployees() {
  const db = await getDb();
  return (await db.getAll("employees_cache")) as Array<{
    id: string;
    name: string;
    pin: string;
    color: string;
  }>;
}

export async function getLastEntryForEmployee(employee_id: string): Promise<QueuedEntry | null> {
  const db = await getDb();
  const all = (await db.getAll("entries")) as QueuedEntry[];
  const filtered = all
    .filter((e) => e.employee_id === employee_id)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  return filtered[0] ?? null;
}
