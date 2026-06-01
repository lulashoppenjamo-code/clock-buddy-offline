import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  cacheEmployees,
  getCachedEmployees,
  getLastEntryForEmployee,
  queueEntry,
  type EntryType,
} from "@/lib/offline-queue";
import { syncPending } from "@/lib/sync";
import { useOnline } from "@/lib/use-online";
import { uuid } from "@/lib/uuid";
import { captureFromFileInput, deviceLabel, geoReasonMessage, getPosition } from "@/lib/capture";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Wifi, WifiOff, Settings, LogIn, LogOut, Coffee, Play, Camera, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

type Employee = { id: string; name: string; pin: string; color: string };

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

  // session + employees
  useEffect(() => {
    let mounted = true;

    (async () => {
      // 0) Recuperar último ownerId conocido para arrancar offline
      try {
        const savedUid =
          typeof window !== "undefined" ? window.localStorage.getItem("checador.ownerId") : null;
        if (mounted && savedUid) setOwnerId(savedUid);
      } catch {}

      // 1) Mostrar empleadas cacheadas inmediatamente (camino offline)
      try {
        const cached = await getCachedEmployees();
        if (mounted && cached.length) setEmployees(cached);
      } catch {}

      // 2) Intentar leer sesión con timeout para no colgar offline
      let uid: string | null = null;
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeout = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 1500),
        );
        const { data } = (await Promise.race([sessionPromise, timeout])) as any;
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

      // 3) Si hay internet y sesión, refrescar empleadas desde servidor
      if (uid && typeof navigator !== "undefined" && navigator.onLine) {
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

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const newUid = s?.user.id ?? null;
      if (newUid) {
        // Sólo actualizamos al iniciar/renovar sesión. NUNCA limpiamos el
        // ownerId automáticamente: si el token expira sin internet, la app
        // debe seguir permitiendo checar. El cierre de sesión sólo ocurre
        // de forma explícita desde el panel de administrador.
        setOwnerId(newUid);
        try {
          window.localStorage.setItem("checador.ownerId", newUid);
        } catch {}
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // tick clock
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);


  // sync when online
  const doSync = useCallback(async () => {
    if (!navigator.onLine || !ownerId) return;
    const { synced, failed } = await syncPending();
    if (synced > 0) toast.success(`${synced} checada(s) sincronizada(s)`);
    if (failed > 0) toast.error(`${failed} checada(s) no se pudieron sincronizar`);
    await refreshPending();
  }, [ownerId]);

  useEffect(() => {
    refreshPending();
    if (online) doSync();
  }, [online, ownerId, doSync]);

  async function refreshPending() {
    const { getPendingEntries } = await import("@/lib/offline-queue");
    const p = await getPendingEntries();
    setPending(p.length);
  }

  // PIN handling
  useEffect(() => {
    if (pin.length === 4) {
      const match = employees.find((e) => e.pin === pin);
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
    if (n === "del") setPin((p) => p.slice(0, -1));
    else if (pin.length < 4) setPin((p) => p + n);
  }

  async function doCheck(type: EntryType, photoBlob: Blob | null) {
    if (!selected || !ownerId) return;
    setBusy(type);
    try {
      const geo = await getPosition();
      if (!geo.ok) {
        toast.warning(geoReasonMessage(geo.reason));
      }
      const pos = geo.ok ? geo.position : null;
      const entry = {
        client_id: uuid(),
        owner_id: ownerId,
        employee_id: selected.id,
        employee_name: selected.name,
        type,
        occurred_at: new Date().toISOString(),
        latitude: pos?.coords.latitude ?? null,
        longitude: pos?.coords.longitude ?? null,
        accuracy: pos?.coords.accuracy ?? null,
        photo_blob: photoBlob,
        photo_path: null,
        device_label: deviceLabel(),
      };
      await queueEntry(entry);
      toast.success(`${labelFor(type)} registrada para ${selected.name}`);
      setSelected(null);
      setLastEntryType(type);
      await refreshPending();
      if (navigator.onLine) doSync();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(null);
    }
  }

  function triggerCheck(type: EntryType) {
    pendingActionRef.current = type;
    fileRef.current?.click();
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
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
    doCheck(action, blob);
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ownerId) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-pink-50 to-rose-100 p-6 text-center">
        <Card className="p-6 space-y-4 max-w-sm">
          <h1 className="text-xl font-semibold">Reloj Checador</h1>
          <p className="text-sm text-muted-foreground">
            Inicia sesión con tu cuenta de administradora para empezar.
          </p>
          <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
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
          <h1 className="text-xl font-semibold">¡Bienvenida!</h1>
          <p className="text-sm text-muted-foreground">
            Primero agrega a tus empleadas y asígnales un PIN de 4 dígitos.
          </p>
          <Button className="w-full" onClick={() => navigate({ to: "/empleadas" })}>
            Agregar empleadas
          </Button>
        </Card>
      </div>
    );
  }

  // Selected: show check actions
  if (selected) {
    const isWorking = lastEntryType === "clock_in" || lastEntryType === "break_end";
    const isOnBreak = lastEntryType === "break_start";
    return (
      <div
        className="min-h-screen flex flex-col p-5 text-white"
        style={{ background: `linear-gradient(160deg, ${selected.color}, #4a051c)` }}
      >
        <TopBar online={online} pending={pending} dark />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <div>
            <p className="text-white/70 text-sm">Hola</p>
            <h2 className="text-4xl font-bold">{selected.name}</h2>
            <p className="text-white/70 mt-2 tabular-nums text-lg">
              {now ? now.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }) : "--:--"}
            </p>
            <p className="text-white/60 text-xs">
              {now ? now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : ""}
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
              className="w-full text-white hover:bg-white/10 hover:text-white"
              onClick={() => setSelected(null)}
            >
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-white/60 flex items-center gap-1">
            <Camera className="h-3 w-3" /> Se tomará una foto al checar
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
      </div>
    );
  }

  // Keypad
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-950 via-pink-950 to-rose-950 text-white flex flex-col p-5">
      <TopBar online={online} pending={pending} dark />
      <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
        <div className="text-center">
          <p className="text-5xl font-bold tabular-nums tracking-tight">
            {now ? now.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true }) : "--:--"}
          </p>
          <p className="text-white/60 text-sm capitalize">
            {now ? now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : ""}
          </p>

        </div>

        <div>
          <p className="text-center text-white/70 text-sm mb-3">Ingresa tu PIN</p>
          <div className="flex gap-3 justify-center">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border-2 transition-colors ${
                  pin.length > i ? "bg-white border-white" : "border-white/40"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 w-full">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <KeypadBtn key={n} onClick={() => pinPress(n)}>
              {n}
            </KeypadBtn>
          ))}
          <div />
          <KeypadBtn onClick={() => pinPress("0")}>0</KeypadBtn>
          <KeypadBtn onClick={() => pinPress("del")}>⌫</KeypadBtn>
        </div>

        <div className="flex gap-2 text-xs flex-wrap justify-center text-white/50">
          {employees.map((e) => (
            <span key={e.id} className="px-2 py-1 rounded-full bg-white/5">
              {e.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-2 pt-4">
        <Link to="/empleadas">
          <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/10 hover:text-white">
            <Settings className="h-4 w-4 mr-1" /> Empleadas
          </Button>
        </Link>
        <Link to="/admin">
          <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/10 hover:text-white">
            Reportes
          </Button>
        </Link>
      </div>
    </div>
  );
}

function KeypadBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-2xl font-semibold transition-colors backdrop-blur"
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
          ? "bg-white text-slate-900 hover:bg-white/90"
          : "bg-white/15 text-white hover:bg-white/25"
      } disabled:opacity-60`}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function TopBar({ online, pending, dark }: { online: boolean; pending: number; dark?: boolean }) {
  const muted = dark ? "text-white/70" : "text-muted-foreground";
  return (
    <div className={`flex items-center justify-between text-xs ${muted}`}>
      <span className="flex items-center gap-1">
        {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {online ? "En línea" : "Sin conexión"}
      </span>
      {pending > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200">
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
