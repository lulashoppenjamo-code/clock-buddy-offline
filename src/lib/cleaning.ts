// Lógica del módulo de limpieza: sucursales, semáforo, cola offline para logs.
import { openDB, type IDBPDatabase } from "idb";

export type Branch = "mina" | "morelos";
export const BRANCHES: { id: Branch; name: string }[] = [
  { id: "mina", name: "Sucursal Mina" },
  { id: "morelos", name: "Sucursal Morelos" },
];
export function branchName(b: string): string {
  return BRANCHES.find((x) => x.id === b)?.name ?? b;
}

export type Frequency = "daily" | "weekly" | "monthly";
export function frequencyLabel(f: Frequency): string {
  return f === "daily" ? "Diaria" : f === "weekly" ? "Semanal" : "Mensual";
}
export function frequencyMs(f: Frequency): number {
  if (f === "daily") return 24 * 3600 * 1000;
  if (f === "weekly") return 7 * 24 * 3600 * 1000;
  return 30 * 24 * 3600 * 1000;
}

export type Status = "green" | "yellow" | "red" | "never";
export function statusForLast(
  lastIso: string | null,
  freq: Frequency,
  nowMs = Date.now(),
): Status {
  if (!lastIso) return "red";
  const age = nowMs - new Date(lastIso).getTime();
  const period = frequencyMs(freq);
  if (age >= period) return "red";
  if (age >= period * 0.8) return "yellow";
  return "green";
}
export function statusColor(s: Status): string {
  return s === "green"
    ? "#16a34a"
    : s === "yellow"
      ? "#eab308"
      : "#dc2626";
}
export function statusLabel(s: Status): string {
  return s === "green"
    ? "Al día"
    : s === "yellow"
      ? "Pronto a vencer"
      : "Vencida";
}

// --- Cola offline para cleaning_logs ---
export interface QueuedCleaning {
  client_id: string;
  owner_id: string;
  task_id: string;
  area_id: string;
  employee_id: string;
  branch: Branch;
  completed_at: string;
  notes: string | null;
  photo_before_blob: Blob | null;
  photo_after_blob: Blob | null;
  photo_before_path: string | null;
  photo_after_path: string | null;
  latitude: number | null;
  longitude: number | null;
  device_label: string | null;
  synced: 0 | 1;
  created_at: number;
}

const DB_NAME = "cleaning-db";
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase> | null = null;
function getDb() {
  if (typeof window === "undefined")
    return Promise.reject(new Error("no window"));
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("logs")) {
          const s = db.createObjectStore("logs", { keyPath: "client_id" });
          s.createIndex("synced", "synced");
        }
        if (!db.objectStoreNames.contains("areas_cache")) {
          db.createObjectStore("areas_cache", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("tasks_cache")) {
          db.createObjectStore("tasks_cache", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("last_log_cache")) {
          // key: task_id, value: { task_id, completed_at }
          db.createObjectStore("last_log_cache", { keyPath: "task_id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function queueCleaning(
  log: Omit<QueuedCleaning, "synced" | "created_at">,
) {
  const db = await getDb();
  const full: QueuedCleaning = { ...log, synced: 0, created_at: Date.now() };
  await db.put("logs", full);
  // Optimistic: update last_log_cache so semáforo refleja inmediato
  await db.put("last_log_cache", {
    task_id: log.task_id,
    completed_at: log.completed_at,
  });
  return full;
}

export async function getPendingCleaning(): Promise<QueuedCleaning[]> {
  const db = await getDb();
  const all = (await db.getAll("logs")) as QueuedCleaning[];
  return all
    .filter((e) => e.synced === 0)
    .sort((a, b) => a.created_at - b.created_at);
}

export async function markCleaningSynced(
  client_id: string,
  paths: { before: string | null; after: string | null },
) {
  const db = await getDb();
  const existing = (await db.get("logs", client_id)) as
    | QueuedCleaning
    | undefined;
  if (!existing) return;
  existing.synced = 1;
  existing.photo_before_path = paths.before;
  existing.photo_after_path = paths.after;
  existing.photo_before_blob = null;
  existing.photo_after_blob = null;
  await db.put("logs", existing);
}

export async function cacheAreas(
  areas: Array<{
    id: string;
    branch: string;
    name: string;
    active: boolean;
  }>,
) {
  const db = await getDb();
  const tx = db.transaction("areas_cache", "readwrite");
  await tx.store.clear();
  for (const a of areas) await tx.store.put(a);
  await tx.done;
}
export async function getCachedAreas() {
  const db = await getDb();
  return (await db.getAll("areas_cache")) as Array<{
    id: string;
    branch: string;
    name: string;
    active: boolean;
  }>;
}

export async function cacheTasks(
  tasks: Array<{
    id: string;
    area_id: string;
    name: string;
    description: string | null;
    frequency: Frequency;
    active: boolean;
  }>,
) {
  const db = await getDb();
  const tx = db.transaction("tasks_cache", "readwrite");
  await tx.store.clear();
  for (const t of tasks) await tx.store.put(t);
  await tx.done;
}
export async function getCachedTasks() {
  const db = await getDb();
  return (await db.getAll("tasks_cache")) as Array<{
    id: string;
    area_id: string;
    name: string;
    description: string | null;
    frequency: Frequency;
    active: boolean;
  }>;
}

export async function cacheLastLogs(
  rows: Array<{ task_id: string; completed_at: string }>,
) {
  const db = await getDb();
  const tx = db.transaction("last_log_cache", "readwrite");
  await tx.store.clear();
  for (const r of rows) await tx.store.put(r);
  await tx.done;
}
export async function getCachedLastLogs(): Promise<
  Record<string, string>
> {
  const db = await getDb();
  const all = (await db.getAll("last_log_cache")) as Array<{
    task_id: string;
    completed_at: string;
  }>;
  const map: Record<string, string> = {};
  for (const r of all) map[r.task_id] = r.completed_at;
  return map;
}
