import { supabase } from "@/integrations/supabase/client";
import {
  getPendingEntries,
  markSynced,
  getPendingMutations,
  markMutationSynced,
} from "./offline-queue";
import { getPendingCleaning, markCleaningSynced } from "./cleaning";

let syncing = false;

export async function syncPending(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }
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

    // 3) Mutaciones de módulos (ventas, faltantes, insumos…)
    const mutations = await getPendingMutations();
    for (const mut of mutations) {
      try {
        if (mut.kind === "addon_sale") {
          let photo_path = (mut.payload.photo_path as string) || mut.photo_path || null;
          if (mut.photo_blob) {
            const path =
              photo_path ||
              `${mut.payload.owner_id}/ventas/${mut.id}.jpg`;
            const { error: upErr } = await supabase.storage
              .from("checador-photos")
              .upload(path, mut.photo_blob, { contentType: "image/jpeg", upsert: true });
            if (!upErr) photo_path = path;
          }
          const { error } = await supabase.from("addon_sales").insert({
            ...mut.payload,
            client_id: mut.payload.client_id ?? mut.id,
            photo_path,
          });
          if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error;
          await markMutationSynced(mut.id, photo_path);
          synced++;
        } else if (mut.kind === "shortage_report") {
          const { error } = await supabase
            .from("shortage_reports")
            .upsert(mut.payload, { onConflict: "employee_id,report_date" });
          if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error;
          await markMutationSynced(mut.id);
          synced++;
        } else if (mut.kind === "supply_request") {
          const { error } = await supabase.from("supply_requests").insert({
            ...mut.payload,
            client_id: mut.payload.client_id ?? mut.id,
          });
          if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error;
          await markMutationSynced(mut.id);
          synced++;
        } else if (mut.kind === "json_upsert") {
          const table = String(mut.payload._table || "");
          const row = { ...mut.payload };
          delete row._table;
          delete row._onConflict;
          const onConflict = mut.payload._onConflict as string | undefined;
          if (!table) throw new Error("json_upsert sin tabla");
          const q = onConflict
            ? supabase.from(table).upsert(row, { onConflict })
            : supabase.from(table).insert(row);
          const { error } = await q;
          if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error;
          await markMutationSynced(mut.id);
          synced++;
        } else {
          failed++;
        }
      } catch (e) {
        console.warn("[sync] mutation failed", mut.kind, mut.id, e);
        failed++;
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed };
}
