import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Camera,
  Check,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  BRANCHES,
  branchName,
  cacheAreas,
  cacheLastLogs,
  cacheTasks,
  getCachedAreas,
  getCachedLastLogs,
  getCachedTasks,
  queueCleaning,
  statusColor,
  statusForLast,
  statusLabel,
  type Branch,
  type Frequency,
} from "@/lib/cleaning";
import {
  cacheEmployees,
  getCachedEmployees,
} from "@/lib/offline-queue";
import { syncPending } from "@/lib/sync";
import { useOnline } from "@/lib/use-online";
import { uuid } from "@/lib/uuid";
import {
  captureFromFileInput,
  deviceLabel,
  getPosition,
} from "@/lib/capture";

export const Route = createFileRoute("/limpieza")({
  component: LimpiezaRoute,
});

type Employee = { id: string; name: string; pin: string; color: string };
type Area = { id: string; branch: string; name: string; active: boolean };
type Task = {
  id: string;
  area_id: string;
  name: string;
  description: string | null;
  frequency: Frequency;
  active: boolean;
};

function LimpiezaRoute() {
  const navigate = useNavigate();
  const online = useOnline();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastByTask, setLastByTask] = useState<Record<string, string>>({});
  const [branch, setBranch] = useState<Branch | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");

  // Cargar todo desde caché y, si hay internet, refrescar desde Supabase
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const uid =
          typeof window !== "undefined"
            ? window.localStorage.getItem("checador.ownerId")
            : null;
        if (mounted && uid) setOwnerId(uid);

        const [cEmps, cAreas, cTasks, cLast] = await Promise.all([
          getCachedEmployees(),
          getCachedAreas(),
          getCachedTasks(),
          getCachedLastLogs(),
        ]);
        if (!mounted) return;
        if (cEmps.length) setEmployees(cEmps);
        if (cAreas.length) setAreas(cAreas);
        if (cTasks.length) setTasks(cTasks);
        if (Object.keys(cLast).length) setLastByTask(cLast);

        // Online refresh
        let effectiveUid = uid;
        if (!effectiveUid) {
          try {
            const sessionPromise = supabase.auth.getSession();
            const timeout = new Promise<{ data: { session: null } }>((res) =>
              setTimeout(() => res({ data: { session: null } }), 1500),
            );
            const { data } = (await Promise.race([
              sessionPromise,
              timeout,
            ])) as any;
            effectiveUid = data?.session?.user?.id ?? null;
            if (effectiveUid && mounted) setOwnerId(effectiveUid);
          } catch {}
        }
        if (
          effectiveUid &&
          typeof navigator !== "undefined" &&
          navigator.onLine
        ) {
          const [empsRes, areasRes, tasksRes, lastRes] = await Promise.all([
            supabase
              .from("employees")
              .select("id,name,pin,color")
              .eq("owner_id", effectiveUid)
              .eq("active", true)
              .order("name"),
            supabase
              .from("cleaning_areas")
              .select("id,branch,name,active")
              .eq("owner_id", effectiveUid)
              .eq("active", true)
              .order("name"),
            supabase
              .from("cleaning_tasks")
              .select("id,area_id,name,description,frequency,active")
              .eq("owner_id", effectiveUid)
              .eq("active", true)
              .order("name"),
            supabase
              .from("cleaning_logs")
              .select("task_id,completed_at")
              .eq("owner_id", effectiveUid)
              .order("completed_at", { ascending: false })
              .limit(2000),
          ]);
          if (!mounted) return;
          if (empsRes.data) {
            setEmployees(empsRes.data);
            await cacheEmployees(empsRes.data);
          }
          if (areasRes.data) {
            setAreas(areasRes.data);
            await cacheAreas(areasRes.data);
          }
          if (tasksRes.data) {
            setTasks(tasksRes.data as Task[]);
            await cacheTasks(tasksRes.data as Task[]);
          }
          if (lastRes.data) {
            const map: Record<string, string> = {};
            for (const r of lastRes.data as Array<{
              task_id: string;
              completed_at: string;
            }>) {
              if (!map[r.task_id]) map[r.task_id] = r.completed_at;
            }
            setLastByTask(map);
            await cacheLastLogs(
              Object.entries(map).map(([task_id, completed_at]) => ({
                task_id,
                completed_at,
              })),
            );
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync when online
  useEffect(() => {
    if (!online || !ownerId) return;
    syncPending().then((r) => {
      if (r.synced > 0) toast.success(`${r.synced} registro(s) sincronizado(s)`);
    });
  }, [online, ownerId]);

  // PIN
  useEffect(() => {
    if (pin.length === 4) {
      const match = employees.find((e) => e.pin === pin);
      if (match) {
        setEmployee(match);
        setPin("");
      } else {
        toast.error("PIN incorrecto");
        setPin("");
      }
    }
  }, [pin, employees]);

  function pinPress(n: string) {
    if (n === "del") setPin((p) => p.slice(0, -1));
    else if (pin.length < 4) setPin((p) => p + n);
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
      <div className="min-h-screen grid place-items-center p-6 text-center bg-pink-50">
        <Card className="p-6 space-y-3 max-w-sm">
          <h1 className="font-semibold">Inicia sesión</h1>
          <p className="text-sm text-muted-foreground">
            La administradora debe entrar primero al menos una vez con internet.
          </p>
          <Button onClick={() => navigate({ to: "/" })}>Volver</Button>
        </Card>
      </div>
    );
  }

  // Step 1: branch
  if (!branch) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-5 flex flex-col">
        <Header title="Limpieza" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 max-w-md mx-auto w-full">
          <div className="h-16 w-16 rounded-2xl bg-emerald-600 text-white grid place-items-center shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold">Selecciona la sucursal</h2>
          <div className="w-full space-y-3 mt-4">
            {BRANCHES.map((b) => (
              <button
                key={b.id}
                onClick={() => setBranch(b.id)}
                className="w-full p-5 rounded-2xl bg-white shadow hover:shadow-md text-left flex items-center justify-between active:scale-[.98] transition-all"
              >
                <span className="font-semibold">{b.name}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: PIN
  if (!employee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-900 to-emerald-900 text-white flex flex-col p-5">
        <Header title={branchName(branch)} dark onBack={() => setBranch(null)} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
          <p className="text-white/70 text-sm">Ingresa tu PIN</p>
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
          <div className="grid grid-cols-3 gap-3 w-full">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <button
                key={n}
                onClick={() => pinPress(n)}
                className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold"
              >
                {n}
              </button>
            ))}
            <div />
            <button
              onClick={() => pinPress("0")}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold"
            >
              0
            </button>
            <button
              onClick={() => pinPress("del")}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold"
            >
              ⌫
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Checklist
  return (
    <Checklist
      ownerId={ownerId}
      branch={branch}
      employee={employee}
      areas={areas.filter((a) => a.branch === branch)}
      tasks={tasks}
      lastByTask={lastByTask}
      onLogged={(taskId, iso) =>
        setLastByTask((m) => ({ ...m, [taskId]: iso }))
      }
      onExit={() => {
        setEmployee(null);
      }}
      online={online}
    />
  );
}

function Header({
  title,
  dark,
  onBack,
}: {
  title: string;
  dark?: boolean;
  onBack?: () => void;
}) {
  const color = dark ? "text-white/80" : "text-foreground";
  return (
    <header className={`flex items-center justify-between ${color}`}>
      {onBack ? (
        <button onClick={onBack} className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Atrás
        </button>
      ) : (
        <Link to="/" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Inicio
        </Link>
      )}
      <h1 className="font-semibold">{title}</h1>
      <div className="w-12" />
    </header>
  );
}

function Checklist({
  ownerId,
  branch,
  employee,
  areas,
  tasks,
  lastByTask,
  onLogged,
  onExit,
  online,
}: {
  ownerId: string;
  branch: Branch;
  employee: Employee;
  areas: Area[];
  tasks: Task[];
  lastByTask: Record<string, string>;
  onLogged: (taskId: string, iso: string) => void;
  onExit: () => void;
  online: boolean;
}) {
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [photoBefore, setPhotoBefore] = useState<Blob | null>(null);
  const [photoAfter, setPhotoAfter] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  const fileBefore = useRef<HTMLInputElement>(null);
  const fileAfter = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => {
    return areas.map((a) => ({
      area: a,
      tasks: tasks.filter((t) => t.area_id === a.id),
    }));
  }, [areas, tasks]);

  const openTaskObj = useMemo(
    () => tasks.find((t) => t.id === openTask) ?? null,
    [openTask, tasks],
  );

  const openCheck = useCallback((taskId: string) => {
    setOpenTask(taskId);
    setNotes("");
    setPhotoBefore(null);
    setPhotoAfter(null);
  }, []);

  async function onPickPhoto(
    e: React.ChangeEvent<HTMLInputElement>,
    which: "before" | "after",
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await captureFromFileInput(file);
      if (which === "before") setPhotoBefore(blob);
      else setPhotoAfter(blob);
    } catch {
      toast.error("No se pudo procesar la foto");
    }
  }

  async function submit() {
    if (!openTaskObj) return;
    setBusy(true);
    try {
      const geo = await getPosition();
      const pos = geo.ok ? geo.position : null;
      const iso = new Date().toISOString();
      await queueCleaning({
        client_id: uuid(),
        owner_id: ownerId,
        task_id: openTaskObj.id,
        area_id: openTaskObj.area_id,
        employee_id: employee.id,
        branch,
        completed_at: iso,
        notes: notes.trim() || null,
        photo_before_blob: photoBefore,
        photo_after_blob: photoAfter,
        photo_before_path: null,
        photo_after_path: null,
        latitude: pos?.coords.latitude ?? null,
        longitude: pos?.coords.longitude ?? null,
        device_label: deviceLabel(),
      });
      onLogged(openTaskObj.id, iso);
      toast.success(`${openTaskObj.name} marcada como completada`);
      setOpenTask(null);
      if (online) syncPending();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  if (grouped.length === 0) {
    return (
      <div className="min-h-screen bg-emerald-50 p-5 flex flex-col">
        <Header title={`${branchName(branch)} · ${employee.name}`} onBack={onExit} />
        <div className="flex-1 grid place-items-center text-center">
          <Card className="p-6 max-w-sm space-y-2">
            <p className="font-semibold">No hay áreas configuradas</p>
            <p className="text-sm text-muted-foreground">
              Pide a la administradora que cree áreas y tareas para esta sucursal.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50 pb-24">
      <header className="bg-emerald-600 text-white sticky top-0 z-10 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-sm text-white/90"
          >
            <ArrowLeft className="h-4 w-4" /> Salir
          </button>
          <div className="text-center">
            <p className="text-xs text-white/80">{branchName(branch)}</p>
            <p className="font-semibold">{employee.name}</p>
          </div>
          <div className="w-12" />
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {grouped.map(({ area, tasks: ts }) => (
          <Card key={area.id} className="overflow-hidden">
            <div className="bg-emerald-100/60 px-4 py-2 font-semibold text-emerald-900">
              {area.name}
            </div>
            {ts.length === 0 && (
              <p className="text-xs text-muted-foreground p-3">Sin tareas</p>
            )}
            <div className="divide-y">
              {ts.map((t) => {
                const last = lastByTask[t.id] ?? null;
                const status = statusForLast(last, t.frequency);
                return (
                  <button
                    key={t.id}
                    onClick={() => openCheck(t.id)}
                    className="w-full text-left p-3 flex items-center gap-3 hover:bg-emerald-50/50 active:bg-emerald-100/50"
                  >
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: statusColor(status) }}
                      aria-label={statusLabel(status)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.frequency === "daily"
                          ? "Diaria"
                          : t.frequency === "weekly"
                            ? "Semanal"
                            : "Mensual"}{" "}
                        ·{" "}
                        {last
                          ? `última: ${new Date(last).toLocaleString("es-MX", {
                              day: "2-digit",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}`
                          : "sin registros"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Sheet de tarea */}
      {openTaskObj && (
        <div
          className="fixed inset-0 z-30 bg-black/50 flex items-end"
          onClick={() => !busy && setOpenTask(null)}
        >
          <div
            className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 space-y-4">
              <div className="h-1.5 w-12 bg-muted rounded-full mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">{openTaskObj.name}</h3>
                {openTaskObj.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {openTaskObj.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <PhotoSlot
                  label="Antes"
                  blob={photoBefore}
                  onClick={() => fileBefore.current?.click()}
                  onClear={() => setPhotoBefore(null)}
                />
                <PhotoSlot
                  label="Después"
                  blob={photoAfter}
                  onClick={() => fileAfter.current?.click()}
                  onClear={() => setPhotoAfter(null)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Observaciones</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opcional..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setOpenTask(null)}
                  disabled={busy}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={submit}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" /> Completar
                    </>
                  )}
                </Button>
              </div>
            </div>
            <input
              ref={fileBefore}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickPhoto(e, "before")}
            />
            <input
              ref={fileAfter}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickPhoto(e, "after")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoSlot({
  label,
  blob,
  onClick,
  onClear,
}: {
  label: string;
  blob: Blob | null;
  onClick: () => void;
  onClear: () => void;
}) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {url ? (
        <button
          onClick={onClear}
          className="relative w-full aspect-square rounded-xl overflow-hidden border"
        >
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <span className="absolute top-1 right-1 bg-white/90 rounded-full px-2 py-0.5 text-[10px]">
            Quitar
          </span>
        </button>
      ) : (
        <button
          onClick={onClick}
          className="w-full aspect-square rounded-xl border-2 border-dashed border-muted-foreground/30 grid place-items-center text-muted-foreground hover:border-emerald-500 hover:text-emerald-600"
        >
          <div className="flex flex-col items-center gap-1">
            <Camera className="h-6 w-6" />
            <span className="text-xs">Tomar foto</span>
          </div>
        </button>
      )}
    </div>
  );
}
