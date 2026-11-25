import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const pushDb = supabase as unknown as SupabaseClient;

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

export const NOTIFICATION_LABELS: Record<
  NotificationEventType,
  string
> = {
  clock_in: "Entrada de colaboradora",
  clock_out: "Salida de colaboradora",
  break_start: "Salida a comer",
  break_end: "Regreso de comer",
  supply_request: "Solicitud de insumos",
  shortage_report: "Reporte de faltantes",
  late_incident: "Retardos",
  important_incident: "Incidencias importantes",
};

export type PushDevice = {
  id: string;
  device_label: string;
  active: boolean;
  created_at: string;
};

export type NotificationPreferences = Record<
  NotificationEventType,
  boolean
>;

function getPublicVapidKey(): string {
  return (
    (import.meta as ImportMeta & {
      env: Record<string, string | undefined>;
    }).env.VITE_VAPID_PUBLIC_KEY ?? ""
  ).trim();
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index++) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

function getDeviceLabel(): string {
  const ua = navigator.userAgent;

  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Teléfono Android";
  if (/Windows/i.test(ua)) return "Equipo Windows";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";

  return "Otro dispositivo";
}

function ensurePushSupport(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("Esta función solo está disponible en el navegador.");
  }

  if (!window.isSecureContext) {
    throw new Error(
      "Las notificaciones requieren una conexión HTTPS segura.",
    );
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador no admite Service Workers.");
  }

  if (!("PushManager" in window)) {
    throw new Error(
      "Este navegador no admite notificaciones Push. En iPhone, instala la aplicación en la pantalla de inicio y ábrela desde allí.",
    );
  }

  if (!("Notification" in window)) {
    throw new Error(
      "Este navegador no permite solicitar permisos de notificación.",
    );
  }
}

async function getCurrentOwnerId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const ownerId = data.session?.user.id;

  if (!ownerId) {
    throw new Error("Inicia sesión como administrador.");
  }

  return ownerId;
}

export async function registerPushDevice(): Promise<void> {
  ensurePushSupport();

  const vapidKey = getPublicVapidKey();

  if (!vapidKey) {
    throw new Error(
      "Falta configurar VITE_VAPID_PUBLIC_KEY en las variables del proyecto.",
    );
  }

  const ownerId = await getCurrentOwnerId();
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "El permiso está bloqueado. Actívalo desde los ajustes del navegador o del teléfono."
        : "No se concedió permiso para mostrar notificaciones.",
    );
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidKey),
    });
  }

  const subscriptionJson = subscription.toJSON();

  const endpoint = subscriptionJson.endpoint;
  const p256dh = subscriptionJson.keys?.p256dh;
  const auth = subscriptionJson.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error(
      "El navegador no devolvió todos los datos de la suscripción Push.",
    );
  }

  const { error } = await pushDb
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

  if (error) {
    throw new Error(
      `No se pudo guardar el teléfono: ${error.message}`,
    );
  }
}

export async function unregisterPushDevice(): Promise<void> {
  ensurePushSupport();

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;

  const { error } = await pushDb
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    throw new Error(
      `No se pudo desactivar el teléfono: ${error.message}`,
    );
  }

  const unsubscribed = await subscription.unsubscribe();

  if (!unsubscribed) {
    throw new Error(
      "El navegador no confirmó la desactivación de la suscripción.",
    );
  }
}

export async function getPushDevices(): Promise<PushDevice[]> {
  const { data, error } = await pushDb
    .from("push_subscriptions")
    .select("id,device_label,active,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `No se pudieron consultar los teléfonos: ${error.message}`,
    );
  }

  return (data ?? []) as PushDevice[];
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const defaults = Object.fromEntries(
    EVENT_TYPES.map((eventType) => [eventType, true]),
  ) as NotificationPreferences;

  const { data, error } = await pushDb
    .from("notification_preferences")
    .select("event_type,enabled");

  if (error) {
    throw new Error(
      `No se pudieron cargar las preferencias: ${error.message}`,
    );
  }

  for (const row of data ?? []) {
    if (
      EVENT_TYPES.includes(
        row.event_type as NotificationEventType,
      )
    ) {
      defaults[row.event_type as NotificationEventType] =
        Boolean(row.enabled);
    }
  }

  return defaults;
}

export async function saveNotificationPreference(
  eventType: NotificationEventType,
  enabled: boolean,
): Promise<void> {
  if (!EVENT_TYPES.includes(eventType)) {
    throw new Error("Tipo de notificación no válido.");
  }

  const ownerId = await getCurrentOwnerId();

  const { error } = await pushDb
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

  if (error) {
    throw new Error(
      `No se pudo guardar la preferencia: ${error.message}`,
    );
  }
}