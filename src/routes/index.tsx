
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  cacheEmployees,
  getCachedEmployees,
  getLastEntryForEmployee,
  getAllEntries,
  getCache,
  queueEntry,
  updateEntryLocation,
  type EntryType,
} from "@/lib/offline-queue";
import { syncPending } from "@/lib/sync";
import { useOnline } from "@/lib/use-online";
import { uuid } from "@/lib/uuid";
import { captureFromFileInput, deviceLabel, getPosition } from "@/lib/capture";
import { scheduleIndex, evaluateEarlyClockOut } from "@/lib/schedule";
import { feedbackClockIn, feedbackBreakEnd } from "@/lib/late-tracking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Wifi,
  WifiOff,
  Settings,
  LogIn,
  LogOut,
  Coffee,
  Play,
  Camera,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

type Employee = {
  id: string;
  name: string;
  pin: string;
  color: string;
};

function Index() {
  const navigate = useNavigate();
  const online = useOnline();

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [pending, setPending] = useState(0);
  const [lastEntryType, setLastEntryType] = useState<EntryType | null>(null);
  const [busy, setBusy] = useState<EntryType | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const pendingActionRef = useRef<EntryType | null>(null);

  const [earlyOutOpen, setEarlyOutOpen] = useState(false);
  const [earlyOutComment, setEarlyOutComment] = useState("");

  const [earlyOutInfo, setEarlyOutInfo] = useState<{
    earlyMinutes: number;
    endLabel: string;
  } | null>(null);

  const pendingPhotoRef = useRef<Blob | null>(null);
  const pendingEarlyTypeRef = useRef<EntryType | null>(null);
  const pendingTimestampRef = useRef<string | null>(null);
  const pendingEarlyTimestampRef = useRef<string | null>(null);

  // Sesión y colaboradores.
  useEffect(() => {
    let mounted = true;

    (async () => {
      // Recuperar el último propietario conocido.
      try {
        const savedUid =
          typeof window !== "undefined"
            ? window.localStorage.getItem("checador.ownerId")
            : null;

        if (mounted && savedUid) {
          setOwnerId(savedUid);
        }
      } catch {}

      // Mostrar primero los colaboradores guardados localmente.
      try {
        const cached = await getCachedEmployees();

        if (mounted && cached.length) {
          setEmployees(cached);
        }
      } catch {}

      // Leer la sesión sin dejar bloqueada la pantalla.
      let uid: string | null = null;

      try {
        const sessionPromise = supabase.auth.getSession();

        const timeout = new Promise<{ data: { session: null } }>(
          (resolve) =>
            setTimeout(
              () => resolve({ data: { session: null } }),
              1500,
            ),
        );

        const { data } = (await Promise.race([
          sessionPromise,
          timeout,
        ])) as any;

        uid = data?.session?.user?.id ?? null;
      } catch {}

      if (!mounted) return;

      if (uid) {
        setOwnerId(uid);

        try {
          window.localStorage.setItem("checador.ownerId", uid);
        } catch {}
      }

      setLoading(false);

      // Actualizar colaboradores en segundo plano.
      if (
        uid &&
        typeof navigator !== "undefined" &&
        navigator.onLine
      ) {
        try {
          const { data: emps } = await supabase
            .from("employees")
            .select("id,name,pin,color")
            .eq("owner_id", uid)
            .eq("active", true)
            .order("name");

          if (mounted && emps) {
            setEmployees(emps);
            await cacheEmployees(emps);
          }
        } catch {}
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const newUid = session?.user.id ?? null;

        if (newUid) {
          setOwnerId(newUid);

          try {
            window.localStorage.setItem(
              "checador.ownerId",
              newUid,
            );
          } catch {}
        }
      },
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Reloj local.
  useEffect(() => {
    setNow(new Date());

    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Sincronización secundaria.
  const doSync = useCallback(async () => {
    if (!navigator.onLine || !ownerId) return;

    const { synced, failed } = await syncPending();

    if (synced > 0) {
      toast.success(
        `${synced} checada(s) sincronizada(s)`,
      );
    }

    if (failed > 0) {
      console.warn(
        "[checador] Algunos registros siguen pendientes:",
        failed,
      );
    }

    await refreshPending();
  }, [ownerId]);

  useEffect(() => {
    refreshPending();

    if (online) {
      void doSync();
    }
  }, [online, ownerId, doSync]);

  async function refreshPending() {
    const { getPendingEntries } = await import("@/lib/offline-queue");

    const list = await getPendingEntries();

    setPending(list.length);
  }

  // Validación local del PIN.
  useEffect(() => {
    if (pin.length === 4) {
      const match = employees.find(
        (employee) => employee.pin === pin,
      );

      if (match) {
        setSelected(match);
        setPin("");

        getLastEntryForEmployee(match.id).then((last) => {
          setLastEntryType(last?.type ?? null);
        });
      } else {
        toast.error("PIN incorrecto");
        setPin("");
      }
    }
  }, [pin, employees]);

  function pinPress(n: string) {
    if (busy) return;

    if (n === "del") {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < 4) {
      setPin((p) => p + n);
    }
  }

  // Horarios guardados localmente. No consultar al servidor aquí.
  async function resolveScheduleForNow(
    empId: string,
    when = new Date(),
  ) {
    if (!ownerId) return undefined;

    try {
      const list = await getCache<any[]>(
        `admin_schedules:${ownerId}`,
      );

      if (list?.length) {
        return scheduleIndex(list).get(
          `${empId}|${when.getDay()}`,
        );
      }
    } catch {}

    return undefined;
  }

  async function doCheck(
    type: EntryType,
    photoBlob: Blob | null,
    earlyComment?: string | null,
    occurredAtOverride?: string | null,
  ) {
    if (!selected || !ownerId) return;

    const employee = selected;

    // Hora oficial capturada desde el primer toque.
    const occurredAt =
      occurredAtOverride || new Date().toISOString();

    const when = new Date(occurredAt);

    setBusy(type);

    try {
      // Protección local contra duplicados.
      const last = await getLastEntryForEmployee(employee.id);

      if (last && last.type === type) {
        const ageSec =
          (when.getTime() -
            new Date(last.occurred_at).getTime()) /
          1000;

        if (ageSec >= 0 && ageSec < 60) {
          toast.warning(
            `Ya registraste ${labelFor(type).toLowerCase()} hace un momento`,
          );

          setSelected(null);
          return;
        }
      }

      // PRIMERO: guardar la checada en IndexedDB.
      // No esperar GPS, Internet ni Supabase.
      const entry = {
        client_id: uuid(),
        owner_id: ownerId,
        employee_id: employee.id,
        employee_name: employee.name,
        type,
        occurred_at: occurredAt,
        latitude: null,
        longitude: null,
        accuracy: null,
        location_pending: true,
        photo_blob: photoBlob,
        photo_path: null,
        device_label: earlyComment
          ? `${deviceLabel()} · salida anticipada (${earlyComment})`
          : deviceLabel(),
      };

      await queueEntry(entry);

      // La checada ya está guardada. Liberar la pantalla.
      setSelected(null);
      setLastEntryType(type);

      void refreshPending();

      // GPS secundario. No bloquea la checada.
      const geoTask = getPosition()
        .then(async (geo) => {
          if (geo.ok) {
            await updateEntryLocation(entry.client_id, {
              latitude: geo.position.coords.latitude,
              longitude: geo.position.coords.longitude,
              accuracy: geo.position.coords.accuracy,
            });
          } else {
            await updateEntryLocation(entry.client_id, {
              latitude: null,
              longitude: null,
              accuracy: null,
            });
          }
        })
        .catch(async (error) => {
          console.warn(
            "[checador] GPS en segundo plano:",
            error,
          );

          await updateEntryLocation(entry.client_id, {
            latitude: null,
            longitude: null,
            accuracy: null,
          }).catch(() => {});
        });

      // Retardos calculados con los horarios locales.
      try {
        if (type === "clock_in") {
          const list = await getCache<any[]>(
            `admin_schedules:${ownerId}`,
          );

          const schedule = list?.length
            ? scheduleIndex(list).get(
                `${employee.id}|${when.getDay()}`,
              )
            : undefined;

          const fb = feedbackClockIn(
            employee.id,
            employee.name,
            when,
            schedule,
          );

          if (fb.late) {
            if (fb.severity === "recurrent") {
              toast.error(fb.message, { duration: 8000 });
            } else {
              toast.warning(fb.message, { duration: 6000 });
            }
          } else {
            toast.success(
              `${labelFor(type)} registrada para ${employee.name}`,
            );
          }
        } else if (type === "break_end") {
          const all = await getAllEntries();

          const start = all
            .filter(
              (entry) =>
                entry.employee_id === employee.id &&
                entry.type === "break_start",
            )
            .sort(
              (a, b) =>
                new Date(b.occurred_at).getTime() -
                new Date(a.occurred_at).getTime(),
            )[0];

          if (start) {
            const fb = feedbackBreakEnd(
              employee.id,
              employee.name,
              new Date(start.occurred_at),
              when,
            );

            if (fb.late) {
              if (fb.severity === "recurrent") {
                toast.error(fb.message, { duration: 8000 });
              } else {
                toast.warning(fb.message, { duration: 6000 });
              }
            } else {
              toast.success(
                `${labelFor(type)} registrada para ${employee.name}`,
              );
            }
          } else {
            toast.success(
              `${labelFor(type)} registrada para ${employee.name}`,
            );
          }
        } else {
          toast.success(
            `${labelFor(type)} registrada para ${employee.name}`,
          );
        }
      } catch {
        toast.success(
          `${labelFor(type)} registrada para ${employee.name}`,
        );
      }

      // Sincronizar después del intento de GPS, sin bloquear la interfaz.
      void geoTask.finally(() => {
        if (navigator.onLine) {
          void doSync();
        }
      });
    } catch (error: any) {
      toast.error(
        error?.message ??
          "No se pudo guardar la checada. Inténtalo nuevamente.",
      );
    } finally {
      setBusy(null);
    }
  }

  function triggerCheck(type: EntryType) {
    pendingActionRef.current = type;

    // Registrar hora exacta antes de abrir la cámara.
    pendingTimestampRef.current = new Date().toISOString();

    fileRef.current?.click();
  }

  async function onPhoto(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const action = pendingActionRef.current;

    pendingActionRef.current = null;

    const occurredAt =
      pendingTimestampRef.current ??
      new Date().toISOString();

    pendingTimestampRef.current = null;

    const file = e.target.files?.[0];

    e.target.value = "";

    if (!action) return;

    let blob: Blob | null = null;

    if (file) {
      try {
        blob = await captureFromFileInput(file);
      } catch {
        blob = null;
      }
    }

    // Salida anticipada.
    if (action === "clock_out" && selected) {
      const checkTime = new Date(occurredAt);

      const schedule = await resolveScheduleForNow(
        selected.id,
        checkTime,
      );

      const evaluation = evaluateEarlyClockOut(
        checkTime,
        schedule,
      );

      if (evaluation.requiresComment) {
        pendingPhotoRef.current = blob;
        pendingEarlyTypeRef.current = action;
        pendingEarlyTimestampRef.current = occurredAt;

        setEarlyOutInfo({
          earlyMinutes: evaluation.earlyMinutes,
          endLabel: evaluation.endLabel,
        });

        setEarlyOutComment("");
        setEarlyOutOpen(true);

        return;
      }
    }

    void doCheck(action, blob, null, occurredAt);
  }

  async function confirmEarlyOut() {
    const comment = earlyOutComment.trim();

    if (comment.length < 3) {
      toast.error(
        "Escribe el motivo de la salida anticipada",
      );
      return;
    }

    const action =
      pendingEarlyTypeRef.current ?? "clock_out";

    const blob = pendingPhotoRef.current;
    const occurredAt = pendingEarlyTimestampRef.current;

    setEarlyOutOpen(false);

    pendingEarlyTypeRef.current = null;
    pendingEarlyTimestampRef.current = null;
    pendingPhotoRef.current = null;

    setEarlyOutInfo(null);

    await doCheck(action, blob, comment, occurredAt);
  }

  function cancelEarlyOut() {
    setEarlyOutOpen(false);

    pendingEarlyTypeRef.current = null;
    pendingEarlyTimestampRef.current = null;
    pendingTimestampRef.current = null;
    pendingPhotoRef.current = null;

    setEarlyOutInfo(null);
    setEarlyOutComment("");

    toast.message(
      "Salida cancelada. Puedes intentarlo de nuevo.",
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-6 w-6 animate-spin text-pink-400" />
      </div>
    );
  }

  if (!ownerId) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-pink-50 to-rose-100 p-6 text-center">
        <Card className="p-6 space-y-4 max-w-sm">
          <h1 className="text-xl font-semibold">
            Reloj Checador
          </h1>

          <p className="text-sm text-muted-foreground">
            Inicia sesión con tu cuenta de administradora
            para empezar.
          </p>

          <Button
            className="w-full"
            onClick={() => navigate({ to: "/auth" })}
          >
            Entrar
          </Button>
        </Card>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-pink-50 to-rose-100 p-6 text-center">
        <Card className="p-6 space-y-4 max-w-sm">
          <h1 className="text-xl font-semibold">
            ¡Bienvenida!
          </h1>

          <p className="text-sm text-muted-foreground">
            Primero agrega a tus colaboradores y asígnales
            un PIN de 4 dígitos.
          </p>

          <Button
            className="w-full"
            onClick={() => navigate({ to: "/empleadas" })}
          >
            Agregar colaboradores
          </Button>
        </Card>
      </div>
    );
  }

  // Pantalla de acciones de la colaboradora.
  if (selected) {
    const isWorking =
      lastEntryType === "clock_in" ||
      lastEntryType === "break_end";

    const isOnBreak = lastEntryType === "break_start";

    return (
      <div className="min-h-screen flex flex-col p-5 text-slate-700 bg-gradient-to-br from-rose-50 via-white to-pink-100">
        <TopBar online={online} pending={pending} />

        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <div>
            <p className="text-slate-500 text-sm">
              Hola
            </p>

            <h2 className="text-4xl font-bold text-slate-800">
              {selected.name}
            </h2>

            <p className="text-slate-600 mt-2 tabular-nums text-lg">
              {now
                ? now.toLocaleTimeString("es-MX", {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })
                : "--:--"}
            </p>

            <p className="text-slate-500 text-xs">
              {now
                ? now.toLocaleDateString("es-MX", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : ""}
            </p>
          </div>

          <div className="w-full max-w-xs space-y-3">
            {!isWorking && !isOnBreak && (
              <ActionBtn
                onClick={() => triggerCheck("clock_in")}
                busy={busy === "clock_in"}
                icon={<LogIn className="h-5 w-5" />}
                label="Entrada"
                primary
              />
            )}

            {isWorking && (
              <>
                <ActionBtn
                  onClick={() => triggerCheck("break_start")}
                  busy={busy === "break_start"}
                  icon={<Coffee className="h-5 w-5" />}
                  label="Iniciar descanso"
                />

                <ActionBtn
                  onClick={() => triggerCheck("clock_out")}
                  busy={busy === "clock_out"}
                  icon={<LogOut className="h-5 w-5" />}
                  label="Salida"
                  primary
                />
              </>
            )}

            {isOnBreak && (
              <ActionBtn
                onClick={() => triggerCheck("break_end")}
                busy={busy === "break_end"}
                icon={<Play className="h-5 w-5" />}
                label="Terminar descanso"
                primary
              />
            )}

            <Button
              variant="ghost"
              className="w-full text-slate-600 hover:bg-pink-100 hover:text-slate-800"
              onClick={() => setSelected(null)}
            >
              Cancelar
            </Button>
          </div>

          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Camera className="h-3 w-3" />
            Se tomará una foto al checar
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={onPhoto}
        />

        {earlyOutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  Salida anticipada
                </h3>

                <p className="text-sm text-slate-600 mt-1">
                  {earlyOutInfo
                    ? `Faltan ${earlyOutInfo.earlyMinutes} min para las ${earlyOutInfo.endLabel}. Escribe el motivo para registrar la salida.`
                    : "Escribe el motivo de la salida anticipada."}
                </p>
              </div>

              <textarea
                className="w-full min-h-[88px] rounded-xl border border-pink-200 bg-pink-50/40 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-300"
                placeholder="Ej. cita médica, permiso de la jefa…"
                value={earlyOutComment}
                onChange={(e) =>
                  setEarlyOutComment(e.target.value)
                }
                autoFocus
              />

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 text-slate-600"
                  onClick={cancelEarlyOut}
                  disabled={busy === "clock_out"}
                >
                  Cancelar
                </Button>

                <Button
                  className="flex-1 bg-gradient-to-r from-pink-400 to-rose-300 text-white hover:from-pink-500 hover:to-rose-400"
                  onClick={confirmEarlyOut}
                  disabled={busy === "clock_out"}
                >
                  {busy === "clock_out" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Registrar salida"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Pantalla del PIN.
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-100 text-slate-700 flex flex-col p-5">
      <TopBar online={online} pending={pending} />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
        <div className="text-center">
          <p className="text-5xl font-bold tabular-nums tracking-tight text-slate-700">
            {now
              ? now.toLocaleTimeString("es-MX", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
              : "--:--"}
          </p>

          <p className="text-slate-500 text-sm capitalize">
            {now
              ? now.toLocaleDateString("es-MX", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : ""}
          </p>
        </div>

        <div>
          <p className="text-center text-slate-600 text-sm mb-3">
            Ingresa tu PIN
          </p>

          <div className="flex gap-3 justify-center">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border-2 transition-colors ${
                  pin.length > i
                    ? "bg-pink-400 border-pink-400"
                    : "border-pink-200"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 w-full">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <KeypadBtn
              key={n}
              onClick={() => pinPress(n)}
            >
              {n}
            </KeypadBtn>
          ))}

          <div />

          <KeypadBtn onClick={() => pinPress("0")}>
            0
          </KeypadBtn>

          <KeypadBtn onClick={() => pinPress("del")}>
            ⌫
          </KeypadBtn>
        </div>

        <div className="flex gap-2 text-xs flex-wrap justify-center text-slate-500">
          {employees.map((employee) => (
            <span
              key={employee.id}
              className="px-2 py-1 rounded-full bg-white/70 border border-pink-100"
            >
              {employee.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-2 pt-4 flex-wrap">
        <Link to="/limpieza">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            ✨ Limpieza
          </Button>
        </Link>

        <Link to="/insumos">
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
            📦 Solicitar Insumos
          </Button>
        </Link>

        <Link to="/faltantes">
          <Button size="sm" className="bg-slate-700 hover:bg-slate-800 text-white">
            📦 Faltantes
          </Button>
        </Link>

        <Link to="/descansos">
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
            🛌🌴 Descansos y Vacaciones
          </Button>
        </Link>

        <Link to="/pagos">
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white">
            💵 Mis Pagos
          </Button>
        </Link>

        <Link to="/clientes">
          <Button size="sm" className="bg-pink-600 hover:bg-pink-700 text-white">
            💖 Clientes
          </Button>
        </Link>

        <Link to="/ventas">
          <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white">
            📈 Ventas Agregadas
          </Button>
        </Link>

        <Link to="/perfumes">
          <Button size="sm" className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
            🧴 Perfumes
          </Button>
        </Link>

        <Link to="/ranking">
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">
            🏆 Ranking
          </Button>
        </Link>

        <Link to="/empleadas">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600 hover:bg-pink-100 hover:text-slate-800"
          >
            <Settings className="h-4 w-4 mr-1" />
            Colaboradores
          </Button>
        </Link>

        <Link to="/admin">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600 hover:bg-pink-100 hover:text-slate-800"
          >
            Reportes
          </Button>
        </Link>

        <Link to="/capacitacion">
          <Button size="sm" className="bg-pink-600 hover:bg-pink-700 text-white">
            📚 Capacitación Lula Shop
          </Button>
        </Link>
      </div>
    </div>
  );
}

function KeypadBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-16 rounded-2xl bg-white/80 border border-pink-100 shadow-sm hover:bg-pink-50 active:bg-pink-100 text-slate-700 text-2xl font-semibold transition-colors backdrop-blur"
    >
      {children}
    </button>
  );
}

function ActionBtn({
  onClick,
  busy,
  icon,
  label,
  primary,
}: {
  onClick: () => void;
  busy: boolean;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`w-full h-14 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors ${
        primary
          ? "bg-gradient-to-r from-pink-400 to-rose-300 text-white shadow-md hover:from-pink-500 hover:to-rose-400"
          : "bg-white/80 border border-pink-100 text-slate-700 hover:bg-pink-50 shadow-sm"
      } disabled:opacity-60`}
    >
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}

function TopBar({
  online,
  pending,
}: {
  online: boolean;
  pending: number;
}) {
  const muted = "text-slate-500";

  return (
    <div className={`flex items-center justify-between text-xs ${muted}`}>
      <span className="flex items-center gap-1">
        {online ? (
          <Wifi className="h-3.5 w-3.5" />
        ) : (
          <WifiOff className="h-3.5 w-3.5" />
        )}

        {online ? "En línea" : "Sin conexión"}
      </span>

      {pending > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700">
          {pending} pendiente{pending === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function labelFor(t: EntryType) {
  switch (t) {
    case "clock_in":
      return "Entrada";

    case "clock_out":
      return "Salida";

    case "break_start":
      return "Inicio de descanso";

    case "break_end":
      return "Fin de descanso";
  }
}
