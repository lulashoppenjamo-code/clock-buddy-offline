import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Download,
  Trash2,
  Edit2,
  Save,
  Repeat,
  Gift,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import {
  WEEKDAYS,
  BRANCHES,
  weekdayName,
  toISODate,
  todayISO,
  isSunday,
  formatDateLong,
  monthGrid,
  buildCalendar,
  fetchRestData,
  type RestSchedule,
  type RestOverride,
  type RestDay,
} from "@/lib/rest-days";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/admin-descansos")({
  head: () => ({
    meta: [
      { title: "Descansos — Administración | Lula Shop" },
      {
        name: "description",
        content:
          "Administra el día de descanso habitual, cambios programados y domingos bono de cada colaboradora.",
      },
      { property: "og:title", content: "Descansos — Administración | Lula Shop" },
      {
        property: "og:description",
        content: "Horario habitual, excepciones programadas y domingos de premio por metas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDescansosRoute,
});

type Employee = { id: string; name: string; color: string; branch: string | null };

function AdminDescansosRoute() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id ?? null;
      if (!id) {
        navigate({ to: "/auth" });
        return;
      }
      setUid(id);
      setChecking(false);
    });
  }, [navigate]);
  if (checking || !uid) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <AdminGate ownerId={uid}>
      <AdminDescansosPage ownerId={uid} />
    </AdminGate>
  );
}

function AdminDescansosPage({ ownerId }: { ownerId: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<RestSchedule[]>([]);
  const [overrides, setOverrides] = useState<RestOverride[]>([]);
  const [bonuses, setBonuses] = useState<RestDay[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: emps }, rest] = await Promise.all([
      supabase
        .from("employees")
        .select("id,name,color,branch")
        .eq("owner_id", ownerId)
        .eq("active", true)
        .order("name"),
      fetchRestData(ownerId),
    ]);
    setEmployees((emps as any) ?? []);
    setSchedules(rest.schedules);
    setOverrides(rest.overrides);
    setBonuses(rest.bonuses);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const empById = useMemo(() => {
    const m: Record<string, Employee> = {};
    for (const e of employees) m[e.id] = e;
    return m;
  }, [employees]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-sky-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/admin" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold">🛌 Descansos</h1>
        <span />
      </header>

      <main className="max-w-3xl mx-auto p-4">
        <Tabs defaultValue="habitual">
          <TabsList className="w-full flex-wrap h-auto">
            <TabsTrigger value="habitual" className="flex-1">Horario habitual</TabsTrigger>
            <TabsTrigger value="cambio" className="flex-1">Programar cambio</TabsTrigger>
            <TabsTrigger value="bono" className="flex-1">Domingo bono</TabsTrigger>
            <TabsTrigger value="calendario" className="flex-1">Calendario</TabsTrigger>
            <TabsTrigger value="historial" className="flex-1">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="habitual" className="pt-3">
            <HabitualTab
              ownerId={ownerId}
              employees={employees}
              schedules={schedules}
              onSaved={load}
            />
          </TabsContent>

          <TabsContent value="cambio" className="pt-3">
            <CambioTab
              ownerId={ownerId}
              employees={employees}
              schedules={schedules}
              overrides={overrides}
              empById={empById}
              onSaved={load}
            />
          </TabsContent>

          <TabsContent value="bono" className="pt-3">
            <BonoTab
              ownerId={ownerId}
              employees={employees}
              bonuses={bonuses}
              empById={empById}
              onSaved={load}
            />
          </TabsContent>

          <TabsContent value="calendario" className="pt-3">
            <CalendarTab
              employees={employees}
              empById={empById}
              schedules={schedules}
              overrides={overrides}
              bonuses={bonuses}
            />
          </TabsContent>

          <TabsContent value="historial" className="pt-3">
            <HistorialTab
              employees={employees}
              empById={empById}
              overrides={overrides}
              bonuses={bonuses}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ------------------------------ Horario habitual ------------------------------ */

function HabitualTab({
  ownerId,
  employees,
  schedules,
  onSaved,
}: {
  ownerId: string;
  employees: Employee[];
  schedules: RestSchedule[];
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function save(employeeId: string, weekday: number) {
    setBusy(employeeId);
    const existing = schedules.find((s) => s.employee_id === employeeId);
    const { error } = existing
      ? await supabase
          .from("rest_schedule")
          .update({ weekday, updated_by: ownerId, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
      : await supabase
          .from("rest_schedule")
          .insert({ owner_id: ownerId, employee_id: employeeId, weekday, updated_by: ownerId });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Día de descanso actualizado");
    onSaved();
  }

  if (employees.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-8">No hay colaboradoras activas</p>;
  }

  return (
    <div className="space-y-3">
      {employees.map((e) => {
        const s = schedules.find((x) => x.employee_id === e.id);
        return (
          <Card key={e.id} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: e.color }} />
              <p className="font-medium">{e.name}</p>
              {e.branch && <Badge variant="secondary">{e.branch}</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">
                Actual: {weekdayName(s?.weekday)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w, i) => (
                <Button
                  key={w}
                  size="sm"
                  variant={s?.weekday === i ? "default" : "outline"}
                  className={s?.weekday === i ? "bg-indigo-600 hover:bg-indigo-700" : ""}
                  disabled={busy === e.id}
                  onClick={() => save(e.id, i)}
                >
                  {busy === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : w.slice(0, 3)}
                </Button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ------------------------------ Programar cambio ------------------------------ */

function CambioTab({
  ownerId,
  employees,
  schedules,
  overrides,
  empById,
  onSaved,
}: {
  ownerId: string;
  employees: Employee[];
  schedules: RestSchedule[];
  overrides: RestOverride[];
  empById: Record<string, Employee>;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RestOverride | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editReason, setEditReason] = useState("");

  const today = todayISO();
  const upcoming = overrides.filter((o) => o.new_date >= today);

  async function submit() {
    if (!employeeId || !date) {
      toast.error("Selecciona colaboradora y fecha");
      return;
    }
    if (overrides.some((o) => o.employee_id === employeeId && o.new_date === date)) {
      toast.error("Ya existe un cambio programado para esa colaboradora en esa fecha");
      return;
    }
    setBusy(true);
    const original = schedules.find((s) => s.employee_id === employeeId)?.weekday ?? null;
    const { error } = await supabase.from("rest_overrides").insert({
      owner_id: ownerId,
      employee_id: employeeId,
      original_weekday: original,
      new_date: date,
      reason: reason || null,
      created_by: ownerId,
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Ya existe un registro para esa colaboradora en esa fecha"
          : error.message,
      );
      return;
    }
    toast.success("Cambio programado");
    setDate("");
    setReason("");
    onSaved();
  }

  async function remove(o: RestOverride) {
    const { error } = await supabase.from("rest_overrides").delete().eq("id", o.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cambio eliminado");
    onSaved();
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editDate) {
      toast.error("Selecciona una fecha");
      return;
    }
    if (
      overrides.some(
        (o) => o.id !== editing.id && o.employee_id === editing.employee_id && o.new_date === editDate,
      )
    ) {
      toast.error("Ya existe un cambio en esa fecha para esa colaboradora");
      return;
    }
    const { error } = await supabase
      .from("rest_overrides")
      .update({ new_date: editDate, reason: editReason || null })
      .eq("id", editing.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cambio actualizado");
    setEditing(null);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <Label>Colaboradora</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {employeeId && (
            <p className="text-xs text-muted-foreground mt-1">
              Día habitual: {weekdayName(schedules.find((s) => s.employee_id === employeeId)?.weekday)}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="nd">Nueva fecha de descanso</Label>
          <Input id="nd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="rz">Motivo (opcional)</Label>
          <Textarea id="rz" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>
        <Button onClick={submit} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
          Programar cambio
        </Button>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium">Próximos cambios</p>
        {upcoming.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay cambios programados</p>
        )}
        {upcoming.map((o) => {
          const e = empById[o.employee_id];
          return (
            <Card key={o.id} className="p-3 flex items-start gap-2">
              <div className="h-3 w-3 rounded-full mt-1" style={{ backgroundColor: e?.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{e?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateLong(o.new_date)}
                  {o.original_weekday !== null && ` · antes ${weekdayName(o.original_weekday)}`}
                </p>
                {o.reason && <p className="text-xs mt-1">📝 {o.reason}</p>}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditing(o);
                  setEditDate(o.new_date);
                  setEditReason(o.reason ?? "");
                }}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(o)}>
                <Trash2 className="h-4 w-4 text-rose-600" />
              </Button>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cambio programado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ed">Fecha</Label>
              <Input id="ed" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="er">Motivo</Label>
              <Textarea id="er" value={editReason} onChange={(e) => setEditReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveEdit} className="bg-indigo-600 hover:bg-indigo-700">
              <Save className="h-4 w-4" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ Domingo bono ------------------------------ */

function BonoTab({
  ownerId,
  employees,
  bonuses,
  empById,
  onSaved,
}: {
  ownerId: string;
  employees: Employee[];
  bonuses: RestDay[];
  empById: Record<string, Employee>;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!employeeId || !date) {
      toast.error("Selecciona colaboradora y fecha");
      return;
    }
    if (!isSunday(date)) {
      toast.error("La fecha debe ser un domingo");
      return;
    }
    if (bonuses.some((b) => b.employee_id === employeeId && b.rest_date === date)) {
      toast.error("Ese domingo bono ya está registrado para esa colaboradora");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("rest_days").insert({
      owner_id: ownerId,
      employee_id: employeeId,
      rest_date: date,
      type: "bono_domingo",
      reason: reason || null,
      branch: branch || empById[employeeId]?.branch || null,
      created_by: ownerId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Registro duplicado" : error.message);
      return;
    }
    toast.success("Domingo bono registrado");
    setDate("");
    setReason("");
    onSaved();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("rest_days").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registro eliminado");
    onSaved();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <Label>Colaboradora</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="bd">Domingo</Label>
          <Input id="bd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Sucursal</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger>
              <SelectValue placeholder="Automática" />
            </SelectTrigger>
            <SelectContent>
              {BRANCHES.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="br">Motivo (opcional)</Label>
          <Textarea id="br" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>
        <Button onClick={submit} disabled={busy} className="w-full bg-amber-600 hover:bg-amber-700">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
          Registrar domingo bono
        </Button>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium">Domingos registrados</p>
        {bonuses.length === 0 && <p className="text-sm text-muted-foreground">Sin registros</p>}
        {bonuses.map((b) => {
          const e = empById[b.employee_id];
          return (
            <Card key={b.id} className="p-3 flex items-start gap-2">
              <div className="h-3 w-3 rounded-full mt-1" style={{ backgroundColor: e?.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{e?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateLong(b.rest_date)}
                  {b.branch && ` · ${b.branch}`}
                </p>
                {b.reason && <p className="text-xs mt-1">🎁 {b.reason}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(b.id)}>
                <Trash2 className="h-4 w-4 text-rose-600" />
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Calendario ------------------------------ */

function CalendarTab({
  employees,
  empById,
  schedules,
  overrides,
  bonuses,
}: {
  employees: Employee[];
  empById: Record<string, Employee>;
  schedules: RestSchedule[];
  overrides: RestOverride[];
  bonuses: RestDay[];
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const marks = useMemo(
    () => buildCalendar(days, schedules, overrides, bonuses),
    [days, schedules, overrides, bonuses],
  );

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const label = new Date(year, month, 1).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Button size="icon" variant="ghost" onClick={() => shift(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-medium capitalize">{label}</p>
        <Button size="icon" variant="ghost" onClick={() => shift(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-center text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w.slice(0, 3)}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === month;
          const list = marks[iso] ?? [];
          return (
            <div
              key={iso}
              className={`min-h-16 rounded-md border p-1 ${inMonth ? "bg-white" : "bg-muted/40 opacity-60"}`}
            >
              <p className="text-[10px] text-muted-foreground">{d.getDate()}</p>
              <div className="space-y-0.5">
                {list.map((m, i) => {
                  const e = empById[m.employeeId];
                  if (!e) return null;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-0.5 text-[9px] rounded px-0.5 truncate"
                      style={{
                        backgroundColor: `${e.color}22`,
                        color: e.color,
                        border: m.kind === "cambio" ? `1px dashed ${e.color}` : undefined,
                      }}
                      title={`${e.name} — ${m.kind}${m.reason ? `: ${m.reason}` : ""}`}
                    >
                      <span>{m.kind === "cambio" ? "🔁" : m.kind === "bono" ? "🎁" : "🛌"}</span>
                      <span className="truncate">{e.name.split(" ")[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
        <span>🛌 Habitual</span>
        <span>🔁 Cambio programado</span>
        <span>🎁 Domingo bono</span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {employees.map((e) => (
          <span key={e.id} className="flex items-center gap-1 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
            {e.name}
          </span>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------ Historial ------------------------------ */

function HistorialTab({
  employees,
  empById,
  overrides,
  bonuses,
}: {
  employees: Employee[];
  empById: Record<string, Employee>;
  overrides: RestOverride[];
  bonuses: RestDay[];
}) {
  const [emp, setEmp] = useState("all");
  const [branch, setBranch] = useState("all");
  const [type, setType] = useState("all");

  const rows = useMemo(() => {
    const all = [
      ...overrides.map((o) => ({
        id: o.id,
        employee_id: o.employee_id,
        date: o.new_date,
        type: "Cambio de día" as const,
        reason: o.reason,
        branch: empById[o.employee_id]?.branch ?? null,
        extra: o.original_weekday !== null ? `Antes: ${weekdayName(o.original_weekday)}` : "",
      })),
      ...bonuses.map((b) => ({
        id: b.id,
        employee_id: b.employee_id,
        date: b.rest_date,
        type: "Domingo bono" as const,
        reason: b.reason,
        branch: b.branch ?? empById[b.employee_id]?.branch ?? null,
        extra: "",
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    return all.filter(
      (r) =>
        (emp === "all" || r.employee_id === emp) &&
        (branch === "all" || r.branch === branch) &&
        (type === "all" || r.type === type),
    );
  }, [overrides, bonuses, emp, branch, type, empById]);

  function exportXLSX() {
    const data = rows.map((r) => ({
      Colaboradora: empById[r.employee_id]?.name ?? "",
      Fecha: r.date,
      Tipo: r.type,
      Sucursal: r.branch ?? "",
      Detalle: r.extra,
      Motivo: r.reason ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Descansos");
    XLSX.writeFile(wb, `descansos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 grid grid-cols-3 gap-2">
        <Select value={emp} onValueChange={setEmp}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sucursales</SelectItem>
            {BRANCHES.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo</SelectItem>
            <SelectItem value="Cambio de día">Cambios</SelectItem>
            <SelectItem value="Domingo bono">Domingos bono</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportXLSX} disabled={rows.length === 0}>
          <Download className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      {rows.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Sin registros</p>}
      {rows.map((r) => {
        const e = empById[r.employee_id];
        return (
          <Card key={r.id} className="p-3 flex items-start gap-2">
            <div className="h-3 w-3 rounded-full mt-1" style={{ backgroundColor: e?.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{e?.name ?? "—"}</p>
                <Badge
                  className={
                    r.type === "Domingo bono"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-indigo-100 text-indigo-800"
                  }
                >
                  {r.type}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDateLong(r.date)}
                {r.branch && ` · ${r.branch}`}
                {r.extra && ` · ${r.extra}`}
              </p>
              {r.reason && <p className="text-xs mt-1">📝 {r.reason}</p>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
