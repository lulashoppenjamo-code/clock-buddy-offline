import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  MapPin,
  Image as ImageIcon,
  Bell,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AdminGate } from "@/components/AdminGate";
import {
  BRANCHES,
  branchName,
  frequencyLabel,
  statusColor,
  statusForLast,
  statusLabel,
  type Branch,
  type Frequency,
} from "@/lib/cleaning";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-limpieza")({
  component: Wrapper,
});

function Wrapper() {
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <AdminGate ownerId={ownerId}>
      <AdminLimpieza ownerId={ownerId} />
    </AdminGate>
  );
}

type Area = { id: string; branch: string; name: string; active: boolean };
type Task = {
  id: string;
  area_id: string;
  name: string;
  description: string | null;
  frequency: Frequency;
  active: boolean;
};
type LogRow = {
  id: string;
  task_id: string;
  area_id: string;
  employee_id: string;
  branch: string;
  completed_at: string;
  notes: string | null;
  photo_before_path: string | null;
  photo_after_path: string | null;
  latitude: number | null;
  longitude: number | null;
};
type Employee = { id: string; name: string; color: string };

type Tab = "dashboard" | "areas" | "tasks" | "history";

function AdminLimpieza({ ownerId }: { ownerId: string }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  async function reload() {
    setLoading(true);
    const [a, t, l, e] = await Promise.all([
      supabase
        .from("cleaning_areas")
        .select("id,branch,name,active")
        .eq("owner_id", ownerId)
        .order("branch")
        .order("name"),
      supabase
        .from("cleaning_tasks")
        .select("id,area_id,name,description,frequency,active")
        .eq("owner_id", ownerId)
        .order("name"),
      supabase
        .from("cleaning_logs")
        .select(
          "id,task_id,area_id,employee_id,branch,completed_at,notes,photo_before_path,photo_after_path,latitude,longitude",
        )
        .eq("owner_id", ownerId)
        .order("completed_at", { ascending: false })
        .limit(500),
      supabase
        .from("employees")
        .select("id,name,color")
        .eq("owner_id", ownerId)
        .order("name"),
    ]);
    setAreas((a.data ?? []) as Area[]);
    setTasks((t.data ?? []) as Task[]);
    setLogs((l.data ?? []) as LogRow[]);
    setEmployees((e.data ?? []) as Employee[]);
    setLoading(false);
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function requestPush() {
    if (typeof Notification === "undefined") {
      toast.error("Este navegador no soporta notificaciones");
      return;
    }
    const p = await Notification.requestPermission();
    if (p === "granted")
      toast.success("Notificaciones activadas en este dispositivo");
    else toast.warning("No se concedió permiso");
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50 pb-16">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/admin" className="flex items-center gap-1 text-sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <h1 className="font-semibold flex items-center gap-1">
            <Sparkles className="h-4 w-4 text-emerald-600" /> Limpieza
          </h1>
          <button
            onClick={requestPush}
            className="p-1 text-muted-foreground"
            aria-label="Notificaciones"
            title="Activar notificaciones"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
        <div className="flex border-t text-xs">
          {(
            [
              ["dashboard", "Dashboard"],
              ["areas", "Áreas"],
              ["tasks", "Tareas"],
              ["history", "Historial"],
            ] as Array<[Tab, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 ${
                tab === k
                  ? "border-b-2 border-emerald-600 font-semibold text-emerald-700"
                  : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-md mx-auto p-4">
        {tab === "dashboard" && (
          <Dashboard
            areas={areas}
            tasks={tasks}
            logs={logs}
            employees={employees}
          />
        )}
        {tab === "areas" && (
          <AreasTab ownerId={ownerId} areas={areas} reload={reload} />
        )}
        {tab === "tasks" && (
          <TasksTab
            ownerId={ownerId}
            areas={areas}
            tasks={tasks}
            reload={reload}
          />
        )}
        {tab === "history" && (
          <HistoryTab
            ownerId={ownerId}
            logs={logs}
            tasks={tasks}
            areas={areas}
            employees={employees}
            reload={reload}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({
  areas,
  tasks,
  logs,
  employees,
}: {
  areas: Area[];
  tasks: Task[];
  logs: LogRow[];
  employees: Employee[];
}) {
  const lastByTask = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of logs) if (!m[l.task_id]) m[l.task_id] = l.completed_at;
    return m;
  }, [logs]);

  const statuses = useMemo(() => {
    const out = { green: 0, yellow: 0, red: 0, total: 0 };
    for (const t of tasks.filter((x) => x.active)) {
      const s = statusForLast(lastByTask[t.id] ?? null, t.frequency);
      out.total++;
      if (s === "green") out.green++;
      else if (s === "yellow") out.yellow++;
      else out.red++;
    }
    return out;
  }, [tasks, lastByTask]);

  const topEmployee = useMemo(() => {
    const count: Record<string, number> = {};
    const since = Date.now() - 30 * 24 * 3600 * 1000;
    for (const l of logs) {
      if (new Date(l.completed_at).getTime() < since) continue;
      count[l.employee_id] = (count[l.employee_id] ?? 0) + 1;
    }
    let bestId: string | null = null;
    let best = 0;
    for (const [id, n] of Object.entries(count)) {
      if (n > best) {
        best = n;
        bestId = id;
      }
    }
    return {
      employee: employees.find((e) => e.id === bestId) ?? null,
      count: best,
    };
  }, [logs, employees]);

  const branchCompliance = useMemo(() => {
    return BRANCHES.map((b) => {
      const branchTasks = tasks.filter(
        (t) =>
          t.active && areas.find((a) => a.id === t.area_id)?.branch === b.id,
      );
      if (branchTasks.length === 0) return { ...b, pct: 100, total: 0 };
      const green = branchTasks.filter(
        (t) => statusForLast(lastByTask[t.id] ?? null, t.frequency) !== "red",
      ).length;
      return {
        ...b,
        pct: Math.round((green / branchTasks.length) * 100),
        total: branchTasks.length,
      };
    });
  }, [tasks, areas, lastByTask]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Al día" value={statuses.green} color="#16a34a" />
        <StatCard label="Por vencer" value={statuses.yellow} color="#eab308" />
        <StatCard label="Vencidas" value={statuses.red} color="#dc2626" />
      </div>

      <Card className="p-4 space-y-3">
        <p className="font-semibold text-sm">Cumplimiento por sucursal</p>
        {branchCompliance.map((b) => (
          <div key={b.id} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{b.name}</span>
              <span className="font-semibold">{b.pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${b.pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{b.total} tarea(s)</p>
          </div>
        ))}
      </Card>

      <Card className="p-4">
        <p className="font-semibold text-sm mb-2">Top empleada (30 días)</p>
        {topEmployee.employee ? (
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full grid place-items-center text-white font-semibold"
              style={{ backgroundColor: topEmployee.employee.color }}
            >
              {topEmployee.employee.name[0]}
            </div>
            <div>
              <p className="font-medium">{topEmployee.employee.name}</p>
              <p className="text-xs text-muted-foreground">
                {topEmployee.count} tareas completadas
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aún sin registros</p>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <p className="font-semibold text-sm">Tareas vencidas</p>
        {tasks
          .filter(
            (t) =>
              t.active &&
              statusForLast(lastByTask[t.id] ?? null, t.frequency) === "red",
          )
          .slice(0, 10)
          .map((t) => {
            const a = areas.find((x) => x.id === t.area_id);
            return (
              <div
                key={t.id}
                className="flex items-center gap-2 text-sm border-b last:border-0 py-1.5"
              >
                <span className="h-2 w-2 rounded-full bg-red-600" />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a?.name} · {a ? branchName(a.branch) : ""}
                  </p>
                </div>
              </div>
            );
          })}
        {tasks.filter(
          (t) =>
            t.active &&
            statusForLast(lastByTask[t.id] ?? null, t.frequency) === "red",
        ).length === 0 && (
          <p className="text-xs text-muted-foreground">
            ¡Todo al día!
          </p>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card className="p-3 text-center">
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </Card>
  );
}

// ---------- Areas ----------
function AreasTab({
  ownerId,
  areas,
  reload,
}: {
  ownerId: string;
  areas: Area[];
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<Branch>("mina");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Area | null>(null);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("cleaning_areas").insert({
      owner_id: ownerId,
      name: name.trim(),
      branch,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    toast.success("Área agregada");
    reload();
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase
      .from("cleaning_areas")
      .update({ name: editing.name, branch: editing.branch })
      .eq("id", editing.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(null);
    reload();
  }

  async function del(id: string) {
    if (!confirm("¿Eliminar área y sus tareas?")) return;
    const { error } = await supabase
      .from("cleaning_areas")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    reload();
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-2">
        <p className="font-semibold text-sm">Nueva área</p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Baño, Cocina..."
        />
        <Select value={branch} onValueChange={(v) => setBranch(v as Branch)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BRANCHES.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={add}
          disabled={busy || !name.trim()}
          className="w-full bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </Card>

      {BRANCHES.map((b) => {
        const list = areas.filter((a) => a.branch === b.id);
        return (
          <Card key={b.id} className="overflow-hidden">
            <div className="bg-emerald-100/60 px-4 py-2 font-semibold text-emerald-900 text-sm">
              {b.name} ({list.length})
            </div>
            {list.length === 0 && (
              <p className="text-xs text-muted-foreground p-3">Sin áreas</p>
            )}
            <div className="divide-y">
              {list.map((a) =>
                editing?.id === a.id ? (
                  <div key={a.id} className="p-3 space-y-2">
                    <Input
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                    />
                    <Select
                      value={editing.branch}
                      onValueChange={(v) =>
                        setEditing({ ...editing, branch: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BRANCHES.map((bb) => (
                          <SelectItem key={bb.id} value={bb.id}>
                            {bb.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setEditing(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        onClick={save}
                        disabled={busy}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={a.id}
                    className="p-3 flex items-center justify-between"
                  >
                    <span className="text-sm font-medium">{a.name}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditing(a)}
                        className="p-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => del(a.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Tasks ----------
function TasksTab({
  ownerId,
  areas,
  tasks,
  reload,
}: {
  ownerId: string;
  areas: Area[];
  tasks: Task[];
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState<string>("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!areaId && areas.length) setAreaId(areas[0].id);
  }, [areas, areaId]);

  async function add() {
    if (!name.trim() || !areaId) return;
    setBusy(true);
    const { error } = await supabase.from("cleaning_tasks").insert({
      owner_id: ownerId,
      area_id: areaId,
      name: name.trim(),
      description: description.trim() || null,
      frequency,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setDescription("");
    toast.success("Tarea agregada");
    reload();
  }

  async function del(id: string) {
    if (!confirm("¿Eliminar tarea?")) return;
    const { error } = await supabase
      .from("cleaning_tasks")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    reload();
  }

  if (areas.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground text-center">
        Primero crea al menos un área.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-2">
        <p className="font-semibold text-sm">Nueva tarea</p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Trapear piso"
        />
        <Select value={areaId} onValueChange={setAreaId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} ({branchName(a.branch)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={frequency}
          onValueChange={(v) => setFrequency(v as Frequency)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Diaria</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="monthly">Mensual</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          rows={2}
        />
        <Button
          onClick={add}
          disabled={busy || !name.trim()}
          className="w-full bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </Card>

      {areas.map((a) => {
        const list = tasks.filter((t) => t.area_id === a.id);
        if (list.length === 0) return null;
        return (
          <Card key={a.id} className="overflow-hidden">
            <div className="bg-emerald-100/60 px-4 py-2 font-semibold text-emerald-900 text-sm">
              {a.name}{" "}
              <span className="text-xs text-emerald-700">
                · {branchName(a.branch)}
              </span>
            </div>
            <div className="divide-y">
              {list.map((t) => (
                <div
                  key={t.id}
                  className="p-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {frequencyLabel(t.frequency)}
                      {t.description ? ` · ${t.description}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => del(t.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- History ----------
function HistoryTab({
  ownerId,
  logs,
  tasks,
  areas,
  employees,
  reload,
}: {
  ownerId: string;
  logs: LogRow[];
  tasks: Task[];
  areas: Area[];
  employees: Employee[];
  reload: () => Promise<void>;
}) {
  const [fEmp, setFEmp] = useState<string>("all");
  const [fBranch, setFBranch] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (fEmp !== "all" && l.employee_id !== fEmp) return false;
      if (fBranch !== "all" && l.branch !== fBranch) return false;
      return true;
    });
  }, [logs, fEmp, fBranch]);

  async function openLog(l: LogRow) {
    const next = openId === l.id ? null : l.id;
    setOpenId(next);
    if (next) {
      for (const path of [l.photo_before_path, l.photo_after_path]) {
        if (path && !urls[path]) {
          const { data } = await supabase.storage
            .from("checador-photos")
            .createSignedUrl(path, 3600);
          if (data?.signedUrl)
            setUrls((u) => ({ ...u, [path]: data.signedUrl }));
        }
      }
    }
  }

  async function del(id: string) {
    if (!confirm("¿Eliminar este registro de limpieza?")) return;
    const { error } = await supabase
      .from("cleaning_logs")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registro eliminado");
    reload();
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-2">
        <div className="flex gap-2">
          <Select value={fEmp} onValueChange={setFEmp}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las empleadas</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fBranch} onValueChange={setFBranch}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {BRANCHES.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} registro(s)
        </p>
      </Card>

      <Card className="divide-y overflow-hidden">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground p-6">
            Sin registros
          </p>
        )}
        {filtered.slice(0, 200).map((l) => {
          const task = tasks.find((t) => t.id === l.task_id);
          const area = areas.find((a) => a.id === l.area_id);
          const emp = employees.find((e) => e.id === l.employee_id);
          const d = parseISO(l.completed_at);
          const isOpen = openId === l.id;
          const hasLoc = l.latitude != null && l.longitude != null;
          return (
            <div key={l.id}>
              <button
                onClick={() => openLog(l)}
                className="w-full p-3 text-left flex items-center gap-3 hover:bg-emerald-50/50"
              >
                <div
                  className="h-8 w-8 rounded-full grid place-items-center text-white text-xs font-semibold flex-shrink-0"
                  style={{ backgroundColor: emp?.color ?? "#64748b" }}
                >
                  {emp?.name?.[0] ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {task?.name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {area?.name} · {branchName(l.branch)} ·{" "}
                    {format(d, "d MMM, h:mm a", { locale: es })}
                  </p>
                </div>
                <div className="flex gap-1 text-muted-foreground">
                  {(l.photo_before_path || l.photo_after_path) && (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  {hasLoc && <MapPin className="h-3.5 w-3.5" />}
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-3 bg-emerald-50/40">
                  <p className="text-xs">
                    <span className="font-semibold">Empleada:</span>{" "}
                    {emp?.name ?? "—"}
                  </p>
                  {l.notes && (
                    <p className="text-xs">
                      <span className="font-semibold">Notas:</span> {l.notes}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {(["photo_before_path", "photo_after_path"] as const).map(
                      (k) => {
                        const path = l[k];
                        const label =
                          k === "photo_before_path" ? "Antes" : "Después";
                        return (
                          <div key={k}>
                            <p className="text-[10px] text-muted-foreground mb-1">
                              {label}
                            </p>
                            {path ? (
                              urls[path] ? (
                                <img
                                  src={urls[path]}
                                  alt={label}
                                  className="w-full aspect-square object-cover rounded border"
                                />
                              ) : (
                                <div className="aspect-square grid place-items-center bg-muted rounded">
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                              )
                            ) : (
                              <div className="aspect-square grid place-items-center bg-muted/40 rounded text-[10px] text-muted-foreground">
                                Sin foto
                              </div>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                  {hasLoc && (
                    <a
                      href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-700 flex items-center gap-1"
                    >
                      <MapPin className="h-3 w-3" /> Ver en mapa
                    </a>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={() => del(l.id)}
                      className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar registro
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
