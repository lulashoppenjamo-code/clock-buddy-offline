
import { supabase } from "@/integrations/supabase/client";

const EVENT_TYPES = [
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
  "supply_request",
  "shortage_report",
  "late_incident",
  "important_incident",
] as const;

export type NotificationEventType = (typeof EVENT_TYPES)[number];

export const NOTIFICATION_LABELS: Record<NotificationEventType, string> = {
  clock_in: "Entrada de colaboradora",
  clock_out: "Salida de colaboradora",
  break_start: "Salida a comer",
  break_end: "Regreso de comer",
  supply_request: "Solicitud de insumos",
  shortage_report: "Reporte de faltantes",
  late_incident: "Retardos",
  important_incident: "Incidencias importantes",
};

function getPublicVapidKey(): string {
  return (
    (import.meta as ImportMeta & {
      env: Record<string, string | undefined>;
    }).env.VITE_VAPID_PUBLIC_KEY ?? ""
  );
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}

function getDeviceLabel(): string {
  const ua = navigator.userAgent;

  if (/Android/i.test(ua)) return "Teléfono Android";
  if (/iPhone|iPad/i.test(ua)) return "iPhone / iPad";

  return "Dispositivo";
}

export async function registerPushDevice(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador no admite notificaciones.");
  }

  if (!("PushManager" in window)) {
    throw new Error(
      "Este navegador no admite notificaciones Push. Instala la aplicación desde el navegador compatible.",
    );
  }

  const vapidKey = getPublicVapidKey();

  if (!vapidKey) {
    throw new Error("Falta configurar VITE_VAPID_PUBLIC_KEY.");
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  const ownerId = sessionData.session?.user.id;

  if (!ownerId) {
    throw new Error("Inicia sesión como administrador.");
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("No se concedió permiso para mostrar notificaciones.");
  }

  const registration =
    await navigator.serviceWorker.ready;

  let subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidKey),
    });
  }

  const json = subscription.toJSON();

  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error("No se pudo obtener la suscripción del dispositivo.");
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        owner_id: ownerId,
        endpoint,
        p256dh,
        auth,
        device_label: getDeviceLabel(),
        active: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "owner_id,endpoint",
      },
    );

  if (error) throw error;
}

export async function unregisterPushDevice(): Promise<void> {
  const registration =
    await navigator.serviceWorker.ready;

  const subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) throw error;

  await subscription.unsubscribe();
}

export async function getPushDevices() {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,device_label,active,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function getNotificationPreferences() {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("event_type,enabled");

  if (error) throw error;

  const result = Object.fromEntries(
    EVENT_TYPES.map((type) => [type, true]),
  ) as Record<NotificationEventType, boolean>;

  for (const row of data ?? []) {
    if (EVENT_TYPES.includes(row.event_type as NotificationEventType)) {
      result[row.event_type as NotificationEventType] =
        row.enabled;
    }
  }

  return result;
}

export async function saveNotificationPreference(
  eventType: NotificationEventType,
  enabled: boolean,
): Promise<void> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  const ownerId = sessionData.session?.user.id;

  if (!ownerId) {
    throw new Error("No hay una sesión de administrador activa.");
  }

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        owner_id: ownerId,
        event_type: eventType,
        enabled,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "owner_id,event_type",
      },
    );

  if (error) throw error;
}
