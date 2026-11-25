
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, BellOff, Smartphone, RefreshCw } from "lucide-react";
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
} from "@/lib/push-notifications";

export const Route = createFileRoute("/notificaciones")({
  component: NotificationsRoute,
});

type Device = {
  id: string;
  device_label: string;
  active: boolean;
  created_at: string;
};

const eventTypes = Object.keys(
  NOTIFICATION_LABELS,
) as NotificationEventType[];

function NotificationsRoute() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;

      if (!uid) {
        navigate({ to: "/auth" });
        return;
      }

      setOwnerId(uid);
      setChecking(false);
    });
  }, [navigate]);

  if (checking || !ownerId) {
    return (
      <div className="min-h-screen grid place-items-center">
        Cargando...
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
  const [devices, setDevices] = useState<Device[]>([]);
  const [preferences, setPreferences] = useState<
    Record<NotificationEventType, boolean> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  async function load() {
    setLoading(true);

    try {
      const [deviceList, prefs] = await Promise.all([
        getPushDevices(),
        getNotificationPreferences(),
      ]);

      setDevices(deviceList as Device[]);
      setPreferences(prefs);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cargar la configuración.");
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
      toast.success("Este dispositivo quedó registrado.");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el dispositivo.",
      );
    } finally {
      setRegistering(false);
    }
  }

  async function removeThisDevice() {
    try {
      await unregisterPushDevice();
      toast.success("Se desactivaron las notificaciones en este dispositivo.");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo desactivar el dispositivo.",
      );
    }
  }

  async function togglePreference(
    eventType: NotificationEventType,
  ) {
    if (!preferences) return;

    const next = !preferences[eventType];

    setPreferences((current) =>
      current
        ? { ...current, [eventType]: next }
        : current,
    );

    try {
      await saveNotificationPreference(eventType, next);
      toast.success(
        next ? "Aviso activado." : "Aviso desactivado.",
      );
    } catch (error) {
      setPreferences((current) =>
        current
          ? { ...current, [eventType]: !next }
          : current,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el cambio.",
      );
    }
  }

  return (
    <div className="min-h-screen bg-pink-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
        <Link to="/admin" className="flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Reportes
        </Link>

        <h1 className="font-semibold">Notificaciones</h1>

        <button
          onClick={() => void load()}
          aria-label="Actualizar"
          className="p-2 text-muted-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-pink-600" />
            <h2 className="font-semibold">Teléfonos autorizados</h2>
          </div>

          <p className="text-sm text-muted-foreground">
            Abre esta pantalla en cada teléfono y pulsa
            “Registrar este teléfono”. Debes aceptar el permiso
            de notificaciones en ambos.
          </p>

          <Button
            className="w-full"
            onClick={addThisDevice}
            disabled={registering}
          >
            {registering ? "Registrando..." : "Registrar este teléfono"}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={removeThisDevice}
          >
            Desactivar este teléfono
          </Button>

          <div className="space-y-2 pt-2">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between rounded-lg border bg-white p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {device.device_label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Registrado:{" "}
                    {new Date(device.created_at).toLocaleDateString("es-MX")}
                  </p>
                </div>

                <span className="text-xs font-medium text-green-700">
                  {device.active ? "Activo" : "Inactivo"}
                </span>
              </div>
            ))}

            {devices.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">
                Todavía no hay teléfonos registrados.
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-pink-600" />
            <h2 className="font-semibold">Tipos de notificación</h2>
          </div>

          <p className="text-xs text-muted-foreground">
            Estos ajustes se comparten entre los teléfonos de la
            misma cuenta de administrador.
          </p>

          {eventTypes.map((eventType) => (
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
                disabled={!preferences || loading}
                onChange={() => void togglePreference(eventType)}
              />
            </label>
          ))}
        </Card>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Los avisos de retardos e incidencias importantes
          aparecen como opciones, pero todavía requieren conectar
          el cálculo de horarios con un registro central de
          incidencias. No se enviarán hasta completar esa parte.
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BellOff className="h-4 w-4" />
          El permiso también se puede bloquear desde los ajustes
          del navegador o del teléfono.
        </div>
      </main>
    </div>
  );
}
