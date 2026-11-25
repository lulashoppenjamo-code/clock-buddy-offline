
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getNotificationPreferences,
  getPushDevices,
  registerPushDevice,
  unregisterPushDevice,
  saveNotificationPreference,
  NOTIFICATION_LABELS,
  type NotificationEventType,
  type NotificationPreferences,
  type PushDevice,
} from "@/lib/push-notifications";

export const Route = createFileRoute("/notificaciones")({
  component: NotificationsRoute,
});

const activeEventTypes: NotificationEventType[] = [
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
  "supply_request",
  "shortage_report",
];

const futureEventTypes: NotificationEventType[] = [
  "late_incident",
  "important_incident",
];

function NotificationsRoute() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        const uid = data.session?.user.id ?? null;

        if (!mounted) return;

        if (!uid) {
          await navigate({ to: "/auth" });
          return;
        }

        setOwnerId(uid);
      } catch (error) {
        console.error("[notificaciones] Sesión:", error);
        toast.error("No se pudo verificar la sesión.");
      } finally {
        if (mounted) setChecking(false);
      }
    }

    void checkSession();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (checking || !ownerId) {
    return (
      <div className="grid min-h-screen place-items-center">
        Cargando configuración...
      </div>
    );
  }

  return (
    <AdminGate ownerId={ownerId}>
      <NotificationsPage />
    </AdminGate>
  );
}

function NotificationsPage() {
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);

  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [savingEvent, setSavingEvent] =
    useState<NotificationEventType | null>(null);
  const [removing, setRemoving] = useState(false);

  async function load() {
    setLoading(true);

    try {
      const [deviceList, prefs] = await Promise.all([
        getPushDevices(),
        getNotificationPreferences(),
      ]);

      setDevices(deviceList);
      setPreferences(prefs);
    } catch (error) {
      console.error("[notificaciones] Carga:", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la configuración.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addThisDevice() {
    setRegistering(true);

    try {
      await registerPushDevice();

      toast.success(
        "Este teléfono quedó registrado para recibir avisos.",
      );

      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el teléfono.",
      );
    } finally {
      setRegistering(false);
    }
  }

  async function removeThisDevice() {
    setRemoving(true);

    try {
      await unregisterPushDevice();

      toast.success(
        "Se desactivaron las notificaciones de este teléfono.",
      );

      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo desactivar el teléfono.",
      );
    } finally {
      setRemoving(false);
    }
  }

  async function togglePreference(
    eventType: NotificationEventType,
  ) {
    if (!preferences || savingEvent) return;

    const previous = preferences[eventType];
    const next = !previous;

    setPreferences((current) =>
      current
        ? { ...current, [eventType]: next }
        : current,
    );

    setSavingEvent(eventType);

    try {
      await saveNotificationPreference(eventType, next);

      toast.success(
        next
          ? "Notificación activada."
          : "Notificación desactivada.",
      );
    } catch (error) {
      setPreferences((current) =>
        current
          ? { ...current, [eventType]: previous }
          : current,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el cambio.",
      );
    } finally {
      setSavingEvent(null);
    }
  }

  const activeDevices = devices.filter(
    (device) => device.active,
  ).length;

  return (
    <div className="min-h-screen bg-pink-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
        <Link
          to="/admin"
          className="flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Reportes
        </Link>

        <h1 className="font-semibold">Notificaciones</h1>

        <button
          type="button"
          onClick={() => void load()}
          aria-label="Actualizar"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-pink-600" />
            <h2 className="font-semibold">
              Teléfonos autorizados
            </h2>
          </div>

          <p className="text-sm text-muted-foreground">
            Registra aquí los dos teléfonos del administrador.
            Debes abrir esta pantalla en cada uno y aceptar
            el permiso de notificaciones.
          </p>

          <div className="rounded-lg bg-pink-50 p-3">
            <p className="text-sm font-medium">
              {activeDevices} teléfono(s) activo(s)
            </p>
            <p className="text-xs text-muted-foreground">
              Los teléfonos registrados reciben los avisos
              de la misma cuenta.
            </p>
          </div>

          <Button
            className="w-full"
            onClick={addThisDevice}
            disabled={registering || loading}
          >
            {registering
              ? "Registrando teléfono..."
              : "Registrar este teléfono"}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={removeThisDevice}
            disabled={removing || loading}
          >
            {removing
              ? "Desactivando..."
              : "Desactivar este teléfono"}
          </Button>

          <div className="space-y-2 pt-2">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {device.device_label}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Registrado:{" "}
                    {new Date(
                      device.created_at,
                    ).toLocaleDateString("es-MX")}
                  </p>
                </div>

                <span
                  className={`shrink-0 text-xs font-medium ${
                    device.active
                      ? "text-green-700"
                      : "text-gray-500"
                  }`}
                >
                  {device.active ? "Activo" : "Inactivo"}
                </span>
              </div>
            ))}

            {devices.length === 0 && !loading && (
              <p className="py-2 text-center text-sm text-muted-foreground">
                Todavía no hay teléfonos registrados.
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-pink-600" />
            <h2 className="font-semibold">
              Avisos que recibirás
            </h2>
          </div>

          <p className="text-xs text-muted-foreground">
            Estos ajustes se comparten entre los teléfonos
            registrados en la misma cuenta de administrador.
          </p>

          {activeEventTypes.map((eventType) => (
            <label
              key={eventType}
              className="flex cursor-pointer items-center justify-between gap-3 border-b py-3 last:border-0"
            >
              <span className="text-sm">
                {NOTIFICATION_LABELS[eventType]}
              </span>

              <input
                type="checkbox"
                className="h-5 w-5 accent-pink-600"
                checked={preferences?.[eventType] ?? true}
                disabled={
                  !preferences ||
                  loading ||
                  savingEvent !== null
                }
                onChange={() =>
                  void togglePreference(eventType)
                }
              />
            </label>
          ))}
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-amber-600" />
            <h2 className="font-semibold">
              Segunda etapa
            </h2>
          </div>

          {futureEventTypes.map((eventType) => (
            <div
              key={eventType}
              className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
            >
              <span className="text-sm">
                {NOTIFICATION_LABELS[eventType]}
              </span>

              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                Próximamente
              </span>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Estos avisos necesitan conectar el cálculo de
            horarios y las incidencias con un registro central.
            No se activarán hasta completar esa integración.
          </p>
        </Card>

        <div className="flex items-start gap-2 rounded-lg border bg-white p-3 text-xs text-muted-foreground">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Si no recibes avisos, revisa que las notificaciones
            estén permitidas en los ajustes del navegador o
            del teléfono. El permiso debe estar autorizado
            en cada dispositivo.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 pb-4 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          Configuración protegida para administrador
        </div>
      </main>
    </div>
  );
}
