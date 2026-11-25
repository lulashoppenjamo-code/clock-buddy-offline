
import { supabase } from "@/integrations/supabase/client";

import {
  getPendingEntries,
  markSynced,
  getPendingMutations,
  markMutationSynced,
} from "./offline-queue";

import {
  getPendingCleaning,
  markCleaningSynced,
} from "./cleaning";

let syncing = false;
let adaptiveBatchLimit = 2;
let failureStreak = 0;
let retryAfter = 0;

type SyncResult = {
  synced: number;
  failed: number;
};

function networkBatchHint(): number {
  if (typeof navigator === "undefined") return 2;

  const connection = (
    navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
      };
    }
  ).connection;

  const type = connection?.effectiveType;
  const downlink = connection?.downlink;

  if (
    type === "slow-2g" ||
    type === "2g" ||
    (typeof downlink === "number" && downlink < 0.5)
  ) {
    return 1;
  }

  if (
    type === "3g" ||
    (typeof downlink === "number" && downlink < 1.5)
  ) {
    return 2;
  }

  if (
    type === "4g" ||
    (typeof downlink === "number" && downlink >= 1.5)
  ) {
    return 5;
  }

  return adaptiveBatchLimit;
}

function adjustBatch(durationMs: number) {
  if (durationMs >= 5000) {
    adaptiveBatchLimit = 1;
  } else if (durationMs >= 2200) {
    adaptiveBatchLimit = 2;
  } else if (durationMs <= 700) {
    adaptiveBatchLimit = 5;
  } else {
    adaptiveBatchLimit = Math.min(adaptiveBatchLimit, 3);
  }
}

async function uploadPhoto(
  path: string,
  blob: Blob,
): Promise<void> {
  const { error } = await supabase.storage
    .from("checador-photos")
    .upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw error;
}

export async function syncPending(): Promise<SyncResult> {
  if (syncing) {
    return { synced: 0, failed: 0 };
  }

  if (
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) {
    return { synced: 0, failed: 0 };
  }

  if (Date.now() < retryAfter) {
    return { synced: 0, failed: 0 };
  }

  syncing = true;

  let synced = 0;
  let failed = 0;

  try {
    const [
      allEntries,
      allCleaning,
      allMutations,
    ] = await Promise.all([
      getPendingEntries(),
      getPendingCleaning(),
      getPendingMutations(),
    ]);

    // Si la aplicación se cerró mientras obtenía GPS,
    // después de 12 segundos se permite sincronizar sin ubicación.
    const entries = allEntries.filter(
      (entry) =>
        !entry.location_pending ||
        Date.now() - entry.created_at > 12000,
    );

    const jobs: Array<() => Promise<void>> = [];

    // PRIORIDAD 1: checadas.
    for (const entry of entries) {
      jobs.push(async () => {
        let photoPath: string | null = entry.photo_path;

        if (entry.photo_blob) {
          photoPath = `${entry.owner_id}/${entry.client_id}.jpg`;

          await uploadPhoto(photoPath, entry.photo_blob);
        }

        const { error } = await supabase
          .from("time_entries")
          .upsert(
            {
              client_id: entry.client_id,
              owner_id: entry.owner_id,
              employee_id: entry.employee_id,
              type: entry.type,
              occurred_at: entry.occurred_at,
              latitude: entry.latitude,
              longitude: entry.longitude,
              accuracy: entry.accuracy,
              photo_path: photoPath,
              device_label: entry.device_label,
            },
            {
              onConflict: "owner_id,client_id",
            },
          );

        if (error) throw error;

        await markSynced(entry.client_id, photoPath);
      });
    }

    // PRIORIDAD 2: limpieza.
    for (const log of allCleaning) {
      jobs.push(async () => {
        let beforePath: string | null = log.photo_before_path;
        let afterPath: string | null = log.photo_after_path;

        if (log.photo_before_blob) {
          beforePath =
            `${log.owner_id}/cleaning/${log.client_id}-before.jpg`;

          await uploadPhoto(beforePath, log.photo_before_blob);
        }

        if (log.photo_after_blob) {
          afterPath =
            `${log.owner_id}/cleaning/${log.client_id}-after.jpg`;

          await uploadPhoto(afterPath, log.photo_after_blob);
        }

        const { error } = await supabase
          .from("cleaning_logs")
          .upsert(
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
            {
              onConflict: "owner_id,client_id",
            },
          );

        if (error) throw error;

        await markCleaningSynced(log.client_id, {
          before: beforePath,
          after: afterPath,
        });
      });
    }

    // PRIORIDAD 3: ventas y otras mutaciones.
    for (const mut of allMutations) {
      jobs.push(async () => {
        if (mut.kind === "addon_sale") {
          let photoPath =
            (mut.payload.photo_path as string) ||
            mut.photo_path ||
            null;

          if (mut.photo_blob) {
            photoPath =
              photoPath ||
              `${mut.payload.owner_id}/ventas/${mut.id}.jpg`;

            await uploadPhoto(photoPath, mut.photo_blob);
          }

          const { error } = await supabase
            .from("addon_sales")
            .insert({
              ...mut.payload,
              client_id: mut.payload.client_id ?? mut.id,
              photo_path: photoPath,
            });

          if (
            error &&
            !/duplicate|unique|conflict/i.test(error.message)
          ) {
            throw error;
          }

          await markMutationSynced(mut.id, photoPath);
          return;
        }

        if (mut.kind === "shortage_report") {
          const { error } = await supabase
            .from("shortage_reports")
            .upsert(
              mut.payload,
              {
                onConflict: "employee_id,report_date",
              },
            );

          if (
            error &&
            !/duplicate|unique|conflict/i.test(error.message)
          ) {
            throw error;
          }

          await markMutationSynced(mut.id);
          return;
        }

        if (mut.kind === "supply_request") {
          const { error } = await supabase
            .from("supply_requests")
            .insert({
              ...mut.payload,
              client_id: mut.payload.client_id ?? mut.id,
            });

          if (
            error &&
            !/duplicate|unique|conflict/i.test(error.message)
          ) {
            throw error;
          }

          await markMutationSynced(mut.id);
          return;
        }

        if (mut.kind === "json_upsert") {
          const table = String(mut.payload._table || "");

          const row = { ...mut.payload };

          delete row._table;
          delete row._onConflict;

          const onConflict = mut.payload._onConflict as
            | string
            | undefined;

          if (!table) {
            throw new Error("json_upsert sin tabla");
          }

          const query = onConflict
            ? supabase.from(table).upsert(row, { onConflict })
            : supabase.from(table).insert(row);

          const { error } = await query;

          if (
            error &&
            !/duplicate|unique|conflict/i.test(error.message)
          ) {
            throw error;
          }

          await markMutationSynced(mut.id);
          return;
        }

        throw new Error(
          `Tipo de mutación desconocido: ${mut.kind}`,
        );
      });
    }

    const limit = Math.max(
      1,
      Math.min(
        networkBatchHint(),
        adaptiveBatchLimit || 2,
      ),
    );

    for (const job of jobs.slice(0, limit)) {
      const started = Date.now();

      try {
        await job();

        adjustBatch(Date.now() - started);

        synced++;
        failureStreak = 0;
        retryAfter = 0;
      } catch (error) {
        console.warn(
          "[sync] pendiente conservado para reintento:",
          error,
        );

        failed++;
        failureStreak++;

        retryAfter =
          Date.now() +
          Math.min(
            60000,
            5000 * 2 ** Math.min(failureStreak - 1, 3),
          );

        // No insistir con los demás registros si la conexión está fallando.
        break;
      }
    }
  } catch (error) {
    console.warn(
      "[sync] no se pudo leer la cola local:",
      error,
    );

    failed++;
    failureStreak++;

    retryAfter =
      Date.now() +
      Math.min(
        60000,
        5000 * 2 ** Math.min(failureStreak - 1, 3),
      );
  } finally {
    syncing = false;
  }

  return { synced, failed };
}
