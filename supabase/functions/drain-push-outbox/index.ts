
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@lulashop.mx";

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

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  const authorization = req.headers.get("Authorization");

  if (authorization !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  try {
    const { data: pending, error: pendingError } = await supabase
      .from("notification_outbox")
      .select("*")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (pendingError) throw pendingError;

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let waitingForDevice = 0;

    for (const item of pending ?? []) {
      try {
        const { data: preference } = await supabase
          .from("notification_preferences")
          .select("enabled")
          .eq("owner_id", item.owner_id)
          .eq("event_type", item.event_type)
          .maybeSingle();

        // Sin preferencia guardada, el aviso está activado.
        if (preference?.enabled === false) {
          await supabase
            .from("notification_outbox")
            .update({
              processed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", item.id);

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
          waitingForDevice++;
          continue;
        }

        const payload = {
          title: item.title,
          body: item.body,
          url: item.url || "/",
          tag: item.event_key,
          data: item.payload ?? {},
        };

        let allDelivered = true;
        let deliveredCount = 0;
        const errors: string[] = [];

        for (const device of devices) {
          try {
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

            deliveredCount++;
            sent++;
          } catch (error) {
            allDelivered = false;

            const statusCode =
              typeof error === "object" &&
              error !== null &&
              "statusCode" in error
                ? Number(error.statusCode)
                : 0;

            if (statusCode === 404 || statusCode === 410) {
              await supabase
                .from("push_subscriptions")
                .delete()
                .eq("id", device.id);
            }

            errors.push(
              `Dispositivo ${device.id}: ${
                error instanceof Error ? error.message : "Error Push"
              }`,
            );
          }
        }

        if (allDelivered) {
          await supabase
            .from("notification_outbox")
            .update({
              processed_at: new Date().toISOString(),
              attempts: Number(item.attempts ?? 0) + 1,
              last_error: null,
            })
            .eq("id", item.id);

          processed++;
        } else {
          // Se reintenta. El mismo tag evita acumular avisos
          // visualmente duplicados en el teléfono.
          await supabase
            .from("notification_outbox")
            .update({
              attempts: Number(item.attempts ?? 0) + 1,
              last_error: errors.join(" | ").slice(0, 1500),
            })
            .eq("id", item.id);

          failed++;
        }

        // Si se entregó a un teléfono y falló el otro,
        // se conserva el registro para intentar completar el envío.
        void deliveredCount;
      } catch (error) {
        failed++;

        await supabase
          .from("notification_outbox")
          .update({
            attempts: Number(item.attempts ?? 0) + 1,
            last_error:
              error instanceof Error
                ? error.message.slice(0, 1500)
                : "Error desconocido",
          })
          .eq("id", item.id);
      }
    }

    return jsonResponse({
      success: true,
      found: pending?.length ?? 0,
      processed,
      sent,
      failed,
      waitingForDevice,
    });
  } catch (error) {
    console.error("[push] Error general:", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Error interno",
      },
      500,
    );
  }
});
