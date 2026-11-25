
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
  location_pending?: boolean;
  photo_blob: Blob | null;
  photo_path: string | null;
  device_label: string | null;
  synced: 0 | 1;
  created_at: number;
}

export type MutationKind =
  | "addon_sale"
  | "shortage_report"
  | "supply_request"
  | "json_upsert";

export interface QueuedMutation {
  id: string;
  kind: MutationKind;
  payload: Record<string, unknown>;
  photo_blob?: Blob | null;
  photo_path?: string | null;
  synced: 0 | 1;
  created_at: number;
  lastError?: string;
}

const DB_NAME = "checador-db";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", {
            keyPath: "client_id",
          });
          store.createIndex("synced", "synced");
          store.createIndex("created_at", "created_at");
        }

        if (!db.objectStoreNames.contains("employees_cache")) {
          db.createObjectStore("employees_cache", {
            keyPath: "id",
          });
        }

        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("kv")) {
            db.createObjectStore("kv", {
              keyPath: "key",
            });
          }

          if (!db.objectStoreNames.contains("mutations")) {
            const mutations = db.createObjectStore("mutations", {
              keyPath: "id",
            });
            mutations.createIndex("synced", "synced");
            mutations.createIndex("created_at", "created_at");
          }
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Guarda una checada directamente en IndexedDB.
 * No necesita conexión a Internet.
 */
export async function queueEntry(
  entry: Omit<QueuedEntry, "synced" | "created_at">,
) {
  const db = await getDb();

  const full: QueuedEntry = {
    ...entry,
    synced: 0,
    created_at: Date.now(),
  };

  await db.put("entries", full);

  return full;
}

/**
 * Actualiza la ubicación de una checada ya guardada.
 * No crea una segunda checada.
 */
export async function updateEntryLocation(
  client_id: string,
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
  },
): Promise<void> {
  const db = await getDb();

  const existing = (await db.get(
    "entries",
    client_id,
  )) as QueuedEntry | undefined;

  if (!existing || existing.synced === 1) return;

  existing.latitude = location.latitude;
  existing.longitude = location.longitude;
  existing.accuracy = location.accuracy;
  existing.location_pending = false;

  await db.put("entries", existing);
}

/**
 * Obtiene las checadas pendientes.
 */
export async function getPendingEntries(): Promise<QueuedEntry[]> {
  const db = await getDb();

  const all = (await db.getAll("entries")) as QueuedEntry[];

  return all
    .filter((entry) => entry.synced === 0)
    .sort((a, b) => a.created_at - b.created_at);
}

/**
 * Obtiene todos los registros locales.
 */
export async function getAllEntries(): Promise<QueuedEntry[]> {
  const db = await getDb();

  const all = (await db.getAll("entries")) as QueuedEntry[];

  return all.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Solo se marca como sincronizado después de confirmar el servidor.
 */
export async function markSynced(
  client_id: string,
  photo_path: string | null,
) {
  const db = await getDb();

  const existing = (await db.get(
    "entries",
    client_id,
  )) as QueuedEntry | undefined;

  if (!existing) return;

  existing.synced = 1;
  existing.photo_path = photo_path;
  existing.photo_blob = null;

  await db.put("entries", existing);
}

/**
 * Guarda colaboradores localmente.
 */
export async function cacheEmployees(
  employees: Array<{
    id: string;
    name: string;
    pin: string;
    color: string;
    branch?: string | null;
  }>,
) {
  const db = await getDb();

  const tx = db.transaction("employees_cache", "readwrite");

  await tx.store.clear();

  for (const employee of employees) {
    await tx.store.put(employee);
  }

  await tx.done;
}

/**
 * Recupera colaboradores sin conexión.
 */
export async function getCachedEmployees() {
  const db = await getDb();

  return (await db.getAll("employees_cache")) as Array<{
    id: string;
    name: string;
    pin: string;
    color: string;
    branch?: string | null;
  }>;
}

/**
 * Última checada de una colaboradora.
 */
export async function getLastEntryForEmployee(
  employee_id: string,
): Promise<QueuedEntry | null> {
  const db = await getDb();

  const all = (await db.getAll("entries")) as QueuedEntry[];

  const filtered = all
    .filter((entry) => entry.employee_id === employee_id)
    .sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() -
        new Date(a.occurred_at).getTime(),
    );

  return filtered[0] ?? null;
}

/**
 * Caché genérica por clave.
 */
export async function setCache(
  key: string,
  data: unknown,
): Promise<void> {
  try {
    const db = await getDb();

    await db.put("kv", {
      key,
      data,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.warn("[offline-queue] setCache", key, error);
  }
}

export async function getCache<T = unknown>(
  key: string,
): Promise<T | null> {
  try {
    const db = await getDb();

    const row = (await db.get("kv", key)) as
      | { key: string; data: T; updatedAt: number }
      | undefined;

    return row?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Cola de mutaciones de otros módulos.
 */
export async function queueMutation(
  mutation: Omit<QueuedMutation, "synced" | "created_at">,
): Promise<QueuedMutation> {
  const db = await getDb();

  const full: QueuedMutation = {
    ...mutation,
    synced: 0,
    created_at: Date.now(),
  };

  await db.put("mutations", full);

  return full;
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const db = await getDb();

  const all = (await db.getAll("mutations")) as QueuedMutation[];

  return all
    .filter((mutation) => mutation.synced === 0)
    .sort((a, b) => a.created_at - b.created_at);
}

export async function markMutationSynced(
  id: string,
  photo_path?: string | null,
) {
  const db = await getDb();

  const existing = (await db.get(
    "mutations",
    id,
  )) as QueuedMutation | undefined;

  if (!existing) return;

  existing.synced = 1;

  if (photo_path !== undefined) {
    existing.photo_path = photo_path;
  }

  existing.photo_blob = null;

  await db.put("mutations", existing);
}

export async function pendingMutationCount(): Promise<number> {
  const list = await getPendingMutations();

  return list.length;
}
