import { supabase } from "@/integrations/supabase/client";
import { getPendingEntries, markSynced } from "./offline-queue";
import {
  getPendingCleaning,
  markCleaningSynced,
} from "./cleaning";

let syncing = false;

export async function syncPending(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    // 1) Checadas
    const pending = await getPendingEntries();
    for (const entry of pending) {
      try {
        let photo_path: string | null = null;
        if (entry.photo_blob) {
          const path = `${entry.owner_id}/${entry.client_id}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("checador-photos")
            .upload(path, entry.photo_blob, { contentType: "image/jpeg", upsert: true });
          if (!upErr) photo_path = path;
        }

        const { error } = await supabase.from("time_entries").upsert(
          {
            client_id: entry.client_id,
            owner_id: entry.owner_id,
            employee_id: entry.employee_id,
            type: entry.type,
            occurred_at: entry.occurred_at,
            latitude: entry.latitude,
            longitude: entry.longitude,
            accuracy: entry.accuracy,
            photo_path,
            device_label: entry.device_label,
          },
          { onConflict: "owner_id,client_id" },
        );
        if (error) {
          failed++;
        } else {
          await markSynced(entry.client_id, photo_path);
          synced++;
        }
      } catch {
        failed++;
      }
    }

    // 2) Logs de limpieza
    const pendingClean = await getPendingCleaning();
    for (const log of pendingClean) {
      try {
        let beforePath: string | null = log.photo_before_path;
        let afterPath: string | null = log.photo_after_path;

        if (log.photo_before_blob) {
          const p = `${log.owner_id}/cleaning/${log.client_id}-before.jpg`;
          const { error } = await supabase.storage
            .from("checador-photos")
            .upload(p, log.photo_before_blob, { contentType: "image/jpeg", upsert: true });
          if (!error) beforePath = p;
        }
        if (log.photo_after_blob) {
          const p = `${log.owner_id}/cleaning/${log.client_id}-after.jpg`;
          const { error } = await supabase.storage
            .from("checador-photos")
            .upload(p, log.photo_after_blob, { contentType: "image/jpeg", upsert: true });
          if (!error) afterPath = p;
        }

        const { error } = await supabase.from("cleaning_logs").upsert(
          {
            client_id: log.client_id,
            owner_id: log.owner_id,
            task_id: log.task_id,
            area_id: log.area_id,
            employee_id: log.employee_id,
            branch: log.branch,
            completed_at: log.completed_at,
            notes: log.notes,
            photo_before_path: beforePath,
            photo_after_path: afterPath,
            latitude: log.latitude,
            longitude: log.longitude,
            device_label: log.device_label,
          },
          { onConflict: "owner_id,client_id" },
        );
        if (error) {
          failed++;
        } else {
          await markCleaningSynced(log.client_id, {
            before: beforePath,
            after: afterPath,
          });
          synced++;
        }
      } catch {
        failed++;
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed };
}
