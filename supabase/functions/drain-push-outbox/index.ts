
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const VAPID_PUBLIC_KEY =
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "";

const VAPID_PRIVATE_KEY =
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

const MAX_ATTEMPTS = 8;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getStatusCode(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error
  ) {
    return Number(error.statusCode);
  }

  return 0;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Error de envío desconocido";
}

if (
  SUPABASE_URL &&
  SERVICE_ROLE_KEY &&
  VAPID_PUBLIC_KEY &&
  VAPID_PRIVATE_KEY
) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Método no permitido" },
      405,
    );
  }

  const authorization = req.headers.get("Authorization");

  if (
    !SERVICE_ROLE_KEY ||
    authorization !== `Bearer ${SERVICE_ROLE_KEY}`
  ) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  if (
    !SUPABASE_URL ||
    !VAPID_PUBLIC_KEY ||
    !VAPID_PRIVATE_KEY
  ) {
    return jsonResponse(
      { error: "Faltan variables privadas de configuración." },
      500,
    );
  }

  try {
    const { data: pending, error: claimError } =
      await supabase.rpc("claim_notification_outbox", {
        p_batch_size: 25,
      });

    if (claimError) throw claimError;

    let processed = 0;
    let delivered = 0;
    let failed = 0;
    let waitingForDevice = 0;
    let skipped = 0;

    for (const item of pending ?? []) {
      try {
        const { data: preference, error: preferenceError } =
          await supabase
            .from("notification_preferences")
            .select("enabled")
            .eq("owner_id", item.owner_id)
            .eq("event_type", item.event_type)
            .maybeSingle();

        if (preferenceError) throw preferenceError;

        if (preference?.enabled === false) {
          const { error } = await supabase
            .from("notification_outbox")
            .update({
              processed_at: new Date().toISOString(),
              locked_until: null,
              last_error: null,
            })
            .eq("id", item.id);

          if (error) throw error;

          skipped++;
          processed++;
          continue;
        }

        const { data: devices, error: devicesError } =
          await supabase
            .from("push_subscriptions")
            .select("id,endpoint,p256dh,auth")
            .eq("owner_id", item.owner_id)
            .eq("active", true);

        if (devicesError) throw devicesError;

        if (!devices?.length) {
          await supabase
            .from("notification_outbox")
            .update({
              locked_until: null,
              last_error: "Esperando un teléfono registrado.",
            })
            .eq("id", item.id);

          waitingForDevice++;
          continue;
        }

        let everyDeviceCompleted = true;
        const deliveryErrors: string[] = [];

        for (const device of devices) {
          try {
            const { data: existingDelivery, error: readError } =
              await supabase
                .from("push_deliveries")
                .select("id,delivered_at")
                .eq("outbox_id", item.id)
                .eq("subscription_id", device.id)
                .maybeSingle();

            if (readError) throw readError;

            if (existingDelivery?.delivered_at) {
              skipped++;
              continue;
            }

            let deliveryId = existingDelivery?.id;

            if (!deliveryId) {
              const { data: created, error: createError } =
                await supabase
                  .from("push_deliveries")
                  .upsert(
                    {
                      outbox_id: item.id,
                      subscription_id: device.id,
                    },
                    {
                      onConflict: "outbox_id,subscription_id",
                    },
                  )
                  .select("id")
                  .single();

              if (createError) throw createError;

              deliveryId = created.id;
            }

            const payload = {
              title: item.title,
              body: item.body,
              url: item.url || "/",
              tag: item.event_key,
              data: item.payload ?? {},
            };

            await webpush.sendNotification(
              {
                endpoint: device.endpoint,
                keys: {
                  p256dh: device.p256dh,
                  auth: device.auth,
                },
              },
              JSON.stringify(payload),
              {
                TTL: 60 * 60 * 24,
                urgency: "high",
              },
            );

            const { error: deliveredError } = await supabase
              .from("push_deliveries")
              .update({
                delivered_at: new Date().toISOString(),
                attempts: 1,
                last_error: null,
              })
              .eq("id", deliveryId);

            if (deliveredError) throw deliveredError;

            delivered++;
          } catch (error) {
            const statusCode = getStatusCode(error);
            const message = getErrorMessage(error);

            if (statusCode === 404 || statusCode === 410) {
              await supabase
                .from("push_subscriptions")
                .delete()
                .eq("id", device.id);

              // El teléfono ya no tiene una suscripción válida.
              // Se elimina de los dispositivos activos.
              continue;
            }

            everyDeviceCompleted = false;

            deliveryErrors.push(
              `${device.id}: ${message}`,
            );

            const { data: delivery } = await supabase
              .from("push_deliveries")
              .select("id,attempts")
              .eq("outbox_id", item.id)
              .eq("subscription_id", device.id)
              .maybeSingle();

            if (delivery?.id) {
              await supabase
                .from("push_deliveries")
                .update({
                  attempts: Number(delivery.attempts ?? 0) + 1,
                  last_error: message.slice(0, 1000),
                })
                .eq("id", delivery.id);
            }
          }
        }

        if (everyDeviceCompleted) {
          const { error } = await supabase
            .from("notification_outbox")
            .update({
              processed_at: new Date().toISOString(),
              locked_until: null,
              last_error: null,
            })
            .eq("id", item.id);

          if (error) throw error;

          processed++;
        } else {
          const attempts = Number(item.attempts ?? 0);

          if (attempts >= MAX_ATTEMPTS) {
            await supabase
              .from("notification_outbox")
              .update({
                processed_at: new Date().toISOString(),
                locked_until: null,
                last_error:
                  "Se agotaron los intentos: " +
                  deliveryErrors.join(" | ").slice(0, 1200),
              })
              .eq("id", item.id);

            failed++;
          } else {
            await supabase
              .from("notification_outbox")
              .update({
                locked_until: null,
                last_error: deliveryErrors
                  .join(" | ")
                  .slice(0, 1200),
              })
              .eq("id", item.id);

            failed++;
          }
        }
      } catch (error) {
        console.error(
          "[push] Error procesando evento:",
          item.id,
          error,
        );

        await supabase
          .from("notification_outbox")
          .update({
            locked_until: null,
            last_error: getErrorMessage(error).slice(0, 1200),
          })
          .eq("id", item.id);

        failed++;
      }
    }

    return jsonResponse({
      success: true,
      found: pending?.length ?? 0,
      processed,
      delivered,
      failed,
      waitingForDevice,
      skipped,
    });
  } catch (error) {
    console.error("[push] Error general:", error);

    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error),
      },
      500,
    );
  }
});
