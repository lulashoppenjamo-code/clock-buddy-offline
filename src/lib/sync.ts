import { supabase } from "@/integrations/supabase/client";
import { getPendingEntries, markSynced } from "./offline-queue";

let syncing = false;

export async function syncPending(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
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
  } finally {
    syncing = false;
  }
  return { synced, failed };
}
