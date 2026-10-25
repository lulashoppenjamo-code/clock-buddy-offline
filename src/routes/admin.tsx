import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Loader2, RefreshCw, MapPin, Lock } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AdminGate } from "@/components/AdminGate";
import { lock, verifyAdminCode, setAdminCode } from "@/lib/admin-lock";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import {
  fetchSchedules,
  scheduleIndex,
  evaluateClockIn,
  evaluateBreakReturn,
  formatMinutesClock,
  TOLERANCE_MINUTES,
  LUNCH_MAX_MINUTES,
  type EmployeeSchedule,
} from "@/lib/schedule";
import { getLateStats } from "@/lib/late-tracking";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
});

type Entry = {
  id: string;
  employee_id: string;
  type: "clock_in" | "clock_out" | "break_start" | "break_end";
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  photo_path: string | null;
};

type Employee = { id: string; name: string; color: string };
type Range = "week" | "month" | "all";

function AdminRoute() {
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
      <AdminPage ownerId={ownerId} />
    </AdminGate>
  );
}

function AdminPage({ ownerId }: { ownerId: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [range, setRange] = useState<Range>("week");
  const [selectedEmp, setSelectedEmp] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    load(ownerId).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const [schedules, setSchedules] = useState<EmployeeSchedule[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "behavior">("list");
  const [expandedBehaviorId, setExpandedBehaviorId] = useState<string | null>(null);

  async function load(uid: string) {
    setRefreshing(true);
    const [{ data: emps }, { data: ents }, scheds] = await Promise.all([
      supabase.from("employees").select("id,name,color").eq("owner_id", uid).order("name"),
      supabase
        .from("time_entries")
        .select("id,employee_id,type,occurred_at,latitude,longitude,accuracy,photo_path")
        .eq("owner_id", uid)
        .order("occurred_at", { ascending: false })
        .limit(1000),
      fetchSchedules(uid).catch(() => [] as EmployeeSchedule[]),
    ]);
    setEmployees(emps ?? []);
    setEntries((ents ?? []) as Entry[]);
    setSchedules(scheds);
    setRefreshing(false);
  }

  async function toggleOpen(entry: Entry) {
    const next = openId === entry.id ? null : entry.id;
    setOpenId(next);
    if (next && entry.photo_path && !photoUrls[entry.id]) {
      const { data } = await supabase.storage
        .from("checador-photos")
        .createSignedUrl(entry.photo_path, 3600);
      if (data?.signedUrl) setPhotoUrls((p) => ({ ...p, [entry.id]: data.signedUrl }));
    }
  }

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (range === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    if (range === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    return { from: new Date(0), to: new Date(8.64e15) };
  }, [range]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const d = parseISO(e.occurred_at);
      if (d < from || d > to) return false;
      if (selectedEmp !== "all" && e.employee_id !== selectedEmp) return false;
      return true;
    });
  }, [entries, from, to, selectedEmp]);

  const stats = useMemo(() => {
    const perEmp: Record<string, { worked: number; sessions: number }> = {};
    for (const emp of employees) perEmp[emp.id] = { worked: 0, sessions: 0 };
    const byEmp: Record<string, Entry[]> = {};
    for (const e of filtered) (byEmp[e.employee_id] ??= []).push(e);
    for (const empId of Object.keys(byEmp)) {
      const list = byEmp[empId].slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
      let inAt: Date | null = null;
      let breakAt: Date | null = null;
      let breakMs = 0;
      for (const e of list) {
        const t = parseISO(e.occurred_at);
        if (e.type === "clock_in") { inAt = t; breakMs = 0; }
        else if (e.type === "break_start") { breakAt = t; }
        else if (e.type === "break_end") { if (breakAt) breakMs += t.getTime() - breakAt.getTime(); breakAt = null; }
        else if (e.type === "clock_out") {
          if (inAt) {
            const dur = t.getTime() - inAt.getTime() - breakMs;
            if (dur > 0) {
              perEmp[empId] ??= { worked: 0, sessions: 0 };
              perEmp[empId].worked += dur;
              perEmp[empId].sessions += 1;
            }
            inAt = null; breakMs = 0; breakAt = null;
          }
        }
      }
    }
    return perEmp;
  }, [filtered, employees]);

  /** Comportamiento detallado de entradas/salidas/comida por colaboradora */
  const behavior = useMemo(() => {
    const idx = scheduleIndex(schedules);
    type EntryDay = {
      date: string;
      clockIn: string | null;
      clockOut: string | null;
      expectedStart: string | null;
      lateMinutes: number;
      onTime: boolean | null;
      entryMins: number | null;
    };
    type LunchDay = {
      date: string;
      breakStart: string | null;
      breakEnd: string | null;
      durationMinutes: number;
      lateMinutes: number;
      onTime: boolean;
    };
    type DayTimeline = {
      date: string;
      events: Array<{ type: Entry["type"]; time: string; at: string }>;
    };
    type Row = {
      id: string;
      name: string;
      color: string;
      clockIns: number;
      lateIns: number;
      avgEntryMins: number | null;
      avgLateMins: number;
      lunchReturns: number;
      lateLunches: number;
      avgLunchMins: number | null;
      recurrenceEntry: boolean;
      recurrenceLunch: boolean;
      worstEntry: EntryDay | null;
      earliestEntry: EntryDay | null;
      worstLunch: LunchDay | null;
      entryDays: EntryDay[];
      lunchDays: LunchDay[];
      timeline: DayTimeline[];
    };
    const rows: Row[] = [];
    for (const emp of employees) {
      if (selectedEmp !== "all" && emp.id !== selectedEmp) continue;
      const list = filtered
        .filter((e) => e.employee_id === emp.id)
        .slice()
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

      const byDate = new Map<string, Entry[]>();
      for (const e of list) {
        const d = format(parseISO(e.occurred_at), "yyyy-MM-dd");
        (byDate.get(d) ?? byDate.set(d, []).get(d)!).push(e);
      }

      const entryDays: EntryDay[] = [];
      const lunchDays: LunchDay[] = [];
      const timeline: DayTimeline[] = [];
      let entrySum = 0;
      let entryCount = 0;
      let lateIns = 0;
      let lateSum = 0;
      let lunchCount = 0;
      let lunchSum = 0;
      let lateLunches = 0;

      const dates = Array.from(byDate.keys()).sort();
      for (const date of dates) {
        const dayEntries = byDate.get(date)!;
        const day = parseISO(date + "T12:00:00");
        const sch = idx.get(`${emp.id}|${day.getDay()}`);
        let expectedLabel: string | null = null;
        if (sch?.active) {
          const [h, m] = sch.start_time.split(":");
          expectedLabel = formatMinutesClock(Number(h) * 60 + Number(m));
        }

        let clockIn: string | null = null;
        let clockOut: string | null = null;
        let entryMins: number | null = null;
        let lateMinutes = 0;
        let onTime: boolean | null = null;
        let breakStartAt: Date | null = null;
        const dayEvents: DayTimeline["events"] = [];

        for (const e of dayEntries) {
          const when = parseISO(e.occurred_at);
          const timeStr = format(when, "h:mm a", { locale: es });
          dayEvents.push({ type: e.type, time: timeStr, at: e.occurred_at });

          if (e.type === "clock_in" && !clockIn) {
            clockIn = timeStr;
            entryMins = when.getHours() * 60 + when.getMinutes();
            entrySum += entryMins;
            entryCount += 1;
            const ev = evaluateClockIn(when, sch);
            if (ev) {
              onTime = ev.onTime;
              lateMinutes = ev.lateMinutes;
              if (!ev.onTime) {
                lateIns += 1;
                lateSum += ev.lateMinutes;
              }
            }
          } else if (e.type === "clock_out") {
            clockOut = timeStr;
          } else if (e.type === "break_start") {
            breakStartAt = when;
          } else if (e.type === "break_end" && breakStartAt) {
            const ev = evaluateBreakReturn(breakStartAt, when);
            lunchCount += 1;
            lunchSum += ev.durationMinutes;
            if (!ev.onTime) lateLunches += 1;
            lunchDays.push({
              date,
              breakStart: format(breakStartAt, "h:mm a", { locale: es }),
              breakEnd: timeStr,
              durationMinutes: ev.durationMinutes,
              lateMinutes: ev.lateMinutes,
              onTime: ev.onTime,
            });
            breakStartAt = null;
          }
        }

        if (clockIn || clockOut) {
          entryDays.push({
            date,
            clockIn,
            clockOut,
            expectedStart: expectedLabel,
            lateMinutes,
            onTime,
            entryMins,
          });
        }
        if (dayEvents.length) {
          timeline.push({ date, events: dayEvents });
        }
      }

      const local = getLateStats(emp.id);
      const worstEntry =
        entryDays.filter((d) => d.lateMinutes > 0).sort((a, b) => b.lateMinutes - a.lateMinutes)[0] ?? null;
      const earliestEntry =
        entryDays.filter((d) => d.entryMins != null).sort((a, b) => (a.entryMins! - b.entryMins!))[0] ?? null;
      const worstLunch =
        lunchDays.filter((d) => d.lateMinutes > 0).sort((a, b) => b.lateMinutes - a.lateMinutes)[0] ?? null;

      rows.push({
        id: emp.id,
        name: emp.name,
        color: emp.color,
        clockIns: entryCount,
        lateIns,
        avgEntryMins: entryCount ? entrySum / entryCount : null,
        avgLateMins: lateIns ? lateSum / lateIns : 0,
        lunchReturns: lunchCount,
        lateLunches,
        avgLunchMins: lunchCount ? lunchSum / lunchCount : null,
        recurrenceEntry: lateIns >= 2 || local.entryLates >= 2,
        recurrenceLunch: lateLunches >= 2 || local.lunchLates >= 2,
        worstEntry,
        earliestEntry,
        worstLunch,
        entryDays: entryDays.slice().reverse(),
        lunchDays: lunchDays.slice().reverse(),
        timeline: timeline.slice().reverse(),
      });
    }
    rows.sort((a, b) => b.lateIns - a.lateIns || a.name.localeCompare(b.name, "es"));
    return rows;
  }, [filtered, employees, schedules, selectedEmp]);

  function exportCSV() {
    const empName = (id: string) => employees.find((e) => e.id === id)?.name ?? id;
    const header = ["Colaborador", "Tipo", "Fecha", "Hora", "Latitud", "Longitud", "Precisión (m)", "Mapa"];
    const rows = filtered
      .slice()
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map((e) => {
        const d = parseISO(e.occurred_at);
        return [
          empName(e.employee_id),
          typeLabel(e.type),
          format(d, "yyyy-MM-dd"),
          format(d, "h:mm:ss a", { locale: es }),
          e.latitude ?? "",
          e.longitude ?? "",
          e.accuracy ?? "",
          e.latitude != null && e.longitude != null
            ? `https://www.google.com/maps?q=${e.latitude},${e.longitude}`
            : "",
        ];
      });
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checadas-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function lockAdmin() {
    lock();
    navigate({ to: "/" });
  }

  // --- Cambiar código de administrador ---
  const [changeOpen, setChangeOpen] = useState(false);
  const [curCode, setCurCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCode2, setNewCode2] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);

  async function submitChangeCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(newCode)) {
      toast.error("El nuevo código debe tener 4 a 8 dígitos");
      return;
    }
    if (newCode !== newCode2) {
      toast.error("Los códigos nuevos no coinciden");
      return;
    }
    setChangeBusy(true);
    const ok = await verifyAdminCode(ownerId, curCode);
    if (!ok) {
      setChangeBusy(false);
      toast.error("El código actual es incorrecto");
      return;
    }
    await setAdminCode(ownerId, newCode);
    setChangeBusy(false);
    setChangeOpen(false);
    setCurCode(""); setNewCode(""); setNewCode2("");
    toast.success("Código de administrador actualizado");
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold">Reportes</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(ownerId)}
            className="text-sm text-muted-foreground p-1"
            aria-label="Refrescar"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={lockAdmin}
            className="text-sm text-muted-foreground p-1"
            aria-label="Bloquear"
            title="Bloquear"
          >
            <Lock className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-3 space-y-3">
          <div className="flex gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mes</SelectItem>
                <SelectItem value="all">Todo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedEmp} onValueChange={setSelectedEmp}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex rounded-md border p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex-1 rounded px-2 py-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Historial
            </button>
            <button
              type="button"
              onClick={() => setViewMode("behavior")}
              className={`flex-1 rounded px-2 py-1.5 ${viewMode === "behavior" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Comportamiento
            </button>
          </div>
          <Button variant="outline" className="w-full" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Exportar CSV ({filtered.length})
          </Button>
          <Link to="/admin-limpieza" className="block">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
              ✨ Módulo de Limpieza
            </Button>
          </Link>
          <Link to="/admin-insumos" className="block">
            <Button className="w-full bg-amber-600 hover:bg-amber-700">
              📦 Solicitudes de Insumos
            </Button>
          </Link>
          <Link to="/admin-faltantes" className="block">
            <Button className="w-full bg-slate-700 hover:bg-slate-800">
              📦 Faltantes / Surtido
            </Button>
          </Link>
          <Link to="/admin-descansos" className="block">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
              🛌🌴 Descansos y Vacaciones
            </Button>
          </Link>
          <Link to="/admin-pagos" className="block">
            <Button className="w-full bg-cyan-600 hover:bg-cyan-700">
              💵 Pagos Semanales
            </Button>
          </Link>

          <Link to="/clientes" className="block">
            <Button className="w-full bg-pink-600 hover:bg-pink-700">
              💖 Clientes con Convenio
            </Button>
          </Link>
          <Link to="/admin-ventas" className="block">
            <Button className="w-full bg-rose-600 hover:bg-rose-700">
              📈 Ventas Agregadas
            </Button>
          </Link>
          <Button variant="outline" className="w-full" onClick={() => setChangeOpen(true)}>
            <KeyRound className="h-4 w-4" /> Cambiar código de administrador
          </Button>
        </Card>

        <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cambiar código de administrador</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitChangeCode} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cur-code">Código actual</Label>
                <Input
                  id="cur-code"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={curCode}
                  onChange={(e) => setCurCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-code">Código nuevo</Label>
                <Input
                  id="new-code"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-code2">Confirmar código nuevo</Label>
                <Input
                  id="new-code2"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newCode2}
                  onChange={(e) => setNewCode2(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={changeBusy}>
                {changeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar nuevo código"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {viewMode === "behavior" && (
          <Card className="p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4" />
              Comportamiento de entradas y salidas
            </div>
            <p className="text-[11px] text-muted-foreground">
              Toca una colaboradora para ver el detalle día por día: entradas, salidas, comida y retardos
              (tol. {TOLERANCE_MINUTES} min · comida máx. {LUNCH_MAX_MINUTES} min).
            </p>
            <div className="space-y-2">
              {behavior.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin datos en este rango</p>
              )}
              {behavior.map((b) => {
                const open = expandedBehaviorId === b.id;
                return (
                  <div
                    key={b.id}
                    className={`rounded-lg border overflow-hidden ${
                      b.recurrenceEntry || b.recurrenceLunch ? "border-rose-300" : "border-border"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedBehaviorId(open ? null : b.id)}
                      className={`w-full p-3 text-left text-xs space-y-1.5 ${
                        b.recurrenceEntry || b.recurrenceLunch ? "bg-rose-50" : "bg-white"
                      } hover:bg-pink-50/80`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: b.color || "#ec4899" }}
                        />
                        <span className="font-semibold text-sm">{b.name}</span>
                        <span className="text-muted-foreground ml-auto text-[10px]">{open ? "▲" : "▼"}</span>
                        {(b.recurrenceEntry || b.recurrenceLunch) && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-medium text-white">
                            <AlertTriangle className="h-3 w-3" /> Reincidencia
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground">
                        <div className="flex items-center gap-1 col-span-2">
                          <Clock className="h-3 w-3" />
                          Entrada prom.:{" "}
                          <span className="font-medium text-foreground">
                            {b.avgEntryMins != null ? formatMinutesClock(b.avgEntryMins) : "—"}
                          </span>
                        </div>
                        <div>
                          Entradas: <span className="font-medium text-foreground">{b.clockIns}</span>
                        </div>
                        <div className={b.lateIns > 0 ? "text-amber-700 font-medium" : ""}>
                          Retardos: {b.lateIns}
                          {b.lateIns > 0 ? ` · +${Math.round(b.avgLateMins)} min` : ""}
                        </div>
                        <div>
                          Comidas: {b.lunchReturns}
                          {b.avgLunchMins != null ? ` · ${Math.round(b.avgLunchMins)} min` : ""}
                        </div>
                        <div className={b.lateLunches > 0 ? "text-amber-700 font-medium" : ""}>
                          Comida tarde: {b.lateLunches}
                        </div>
                      </div>
                      {b.worstEntry && (
                        <p className="text-[11px] text-rose-700 font-medium pt-0.5">
                          Día más tarde: {format(parseISO(b.worstEntry.date + "T12:00:00"), "EEE d MMM", { locale: es })}{" "}
                          a las {b.worstEntry.clockIn} (+{b.worstEntry.lateMinutes} min)
                        </p>
                      )}
                    </button>

                    {open && (
                      <div className="border-t bg-white p-3 space-y-4 text-xs">
                        {/* Resumen destacado */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-md bg-pink-50 p-2">
                            <p className="text-[10px] text-muted-foreground uppercase">Entrada más temprana</p>
                            <p className="font-semibold">
                              {b.earliestEntry
                                ? `${format(parseISO(b.earliestEntry.date + "T12:00:00"), "d MMM", { locale: es })} · ${b.earliestEntry.clockIn}`
                                : "—"}
                            </p>
                          </div>
                          <div className="rounded-md bg-amber-50 p-2">
                            <p className="text-[10px] text-muted-foreground uppercase">Mayor retardo entrada</p>
                            <p className="font-semibold text-amber-800">
                              {b.worstEntry
                                ? `${format(parseISO(b.worstEntry.date + "T12:00:00"), "d MMM", { locale: es })} · +${b.worstEntry.lateMinutes} min`
                                : "Ninguno"}
                            </p>
                          </div>
                          <div className="rounded-md bg-sky-50 p-2 col-span-2">
                            <p className="text-[10px] text-muted-foreground uppercase">Mayor exceso de comida</p>
                            <p className="font-semibold text-sky-900">
                              {b.worstLunch
                                ? `${format(parseISO(b.worstLunch.date + "T12:00:00"), "d MMM", { locale: es })} · ${b.worstLunch.durationMinutes} min (máx. ${LUNCH_MAX_MINUTES})`
                                : "Ninguno"}
                            </p>
                          </div>
                        </div>

                        {/* Tabla entradas / salidas */}
                        <div>
                          <p className="font-semibold mb-1.5 flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> Entradas y salidas
                          </p>
                          {b.entryDays.length === 0 ? (
                            <p className="text-muted-foreground">Sin entradas en el periodo</p>
                          ) : (
                            <div className="overflow-x-auto rounded-md border">
                              <table className="w-full text-[11px]">
                                <thead className="bg-muted/60">
                                  <tr className="text-left">
                                    <th className="px-2 py-1.5 font-medium">Día</th>
                                    <th className="px-2 py-1.5 font-medium">Horario</th>
                                    <th className="px-2 py-1.5 font-medium">Entrada</th>
                                    <th className="px-2 py-1.5 font-medium">Salida</th>
                                    <th className="px-2 py-1.5 font-medium">Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {b.entryDays.map((d) => (
                                    <tr key={d.date} className="border-t">
                                      <td className="px-2 py-1.5 whitespace-nowrap">
                                        {format(parseISO(d.date + "T12:00:00"), "EEE d MMM", { locale: es })}
                                      </td>
                                      <td className="px-2 py-1.5 text-muted-foreground">
                                        {d.expectedStart ?? "—"}
                                      </td>
                                      <td className="px-2 py-1.5 font-medium">{d.clockIn ?? "—"}</td>
                                      <td className="px-2 py-1.5">{d.clockOut ?? "—"}</td>
                                      <td className="px-2 py-1.5">
                                        {d.onTime === null ? (
                                          <span className="text-muted-foreground">—</span>
                                        ) : d.onTime ? (
                                          <span className="text-emerald-700 font-medium">A tiempo</span>
                                        ) : (
                                          <span className="text-rose-700 font-medium">+{d.lateMinutes} min</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Tabla comida */}
                        <div>
                          <p className="font-semibold mb-1.5">🍽 Descanso comida y regreso</p>
                          {b.lunchDays.length === 0 ? (
                            <p className="text-muted-foreground">Sin registros de comida en el periodo</p>
                          ) : (
                            <div className="overflow-x-auto rounded-md border">
                              <table className="w-full text-[11px]">
                                <thead className="bg-muted/60">
                                  <tr className="text-left">
                                    <th className="px-2 py-1.5 font-medium">Día</th>
                                    <th className="px-2 py-1.5 font-medium">Salida</th>
                                    <th className="px-2 py-1.5 font-medium">Regreso</th>
                                    <th className="px-2 py-1.5 font-medium">Duración</th>
                                    <th className="px-2 py-1.5 font-medium">Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {b.lunchDays.map((d, i) => (
                                    <tr key={d.date + "-" + i} className="border-t">
                                      <td className="px-2 py-1.5 whitespace-nowrap">
                                        {format(parseISO(d.date + "T12:00:00"), "EEE d MMM", { locale: es })}
                                      </td>
                                      <td className="px-2 py-1.5">{d.breakStart ?? "—"}</td>
                                      <td className="px-2 py-1.5">{d.breakEnd ?? "—"}</td>
                                      <td className="px-2 py-1.5 font-medium">{d.durationMinutes} min</td>
                                      <td className="px-2 py-1.5">
                                        {d.onTime ? (
                                          <span className="text-emerald-700 font-medium">OK</span>
                                        ) : (
                                          <span className="text-rose-700 font-medium">
                                            +{d.lateMinutes} min (máx. {LUNCH_MAX_MINUTES})
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Línea de tiempo completa */}
                        <div>
                          <p className="font-semibold mb-1.5">Línea de tiempo del periodo</p>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {b.timeline.map((day) => (
                              <div key={day.date} className="rounded-md border p-2">
                                <p className="font-medium text-[11px] mb-1">
                                  {format(parseISO(day.date + "T12:00:00"), "EEEE d MMMM", { locale: es })}
                                </p>
                                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                                  {day.events.map((ev, i) => (
                                    <li key={i} className="flex gap-2">
                                      <span className="tabular-nums w-16 shrink-0 text-foreground">{ev.time}</span>
                                      <span>
                                        {ev.type === "clock_in" && "Entrada"}
                                        {ev.type === "clock_out" && "Salida"}
                                        {ev.type === "break_start" && "Salida a comida"}
                                        {ev.type === "break_end" && "Regreso de comida"}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {viewMode === "list" && (
        <>
        <div className="grid grid-cols-2 gap-2">
          {employees.map((e) => {
            const s = stats[e.id] ?? { worked: 0, sessions: 0 };
            const h = Math.floor(s.worked / 3600000);
            const m = Math.floor((s.worked % 3600000) / 60000);
            return (
              <Card key={e.id} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: e.color }} />
                  <p className="font-medium text-sm truncate">{e.name}</p>
                </div>
                <p className="text-xl font-bold tabular-nums">{h}h {m.toString().padStart(2, "0")}m</p>
                <p className="text-xs text-muted-foreground">{s.sessions} turno(s)</p>
              </Card>
            );
          })}
        </div>

        <Card className="divide-y overflow-hidden">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground p-6">Sin registros</p>
          )}
          {filtered.slice(0, 100).map((e) => {
            const emp = employees.find((x) => x.id === e.employee_id);
            const d = parseISO(e.occurred_at);
            const isOpen = openId === e.id;
            const hasLoc = e.latitude != null && e.longitude != null;
            const mapsUrl = hasLoc
              ? `https://www.google.com/maps?q=${e.latitude},${e.longitude}`
              : null;
            const mapEmbedUrl = hasLoc
              ? `https://www.google.com/maps?q=${e.latitude},${e.longitude}&z=17&output=embed`
              : null;
            return (
              <div key={e.id}>
                <button
                  onClick={() => toggleOpen(e)}
                  className="w-full p-3 flex items-center gap-3 text-sm text-left hover:bg-pink-50"
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: emp?.color ?? "#64748b" }}
                  >
                    {emp?.name[0] ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {emp?.name ?? "—"} · {typeLabel(e.type)}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {format(d, "EEE d MMM, h:mm a", { locale: es })}
                      {hasLoc && <MapPin className="h-3 w-3" />}
                      {e.photo_path && <span>📷</span>}
                    </p>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-3 bg-pink-50/50">
                    {e.photo_path ? (
                      photoUrls[e.id] ? (
                        <img
                          src={photoUrls[e.id]}
                          alt="Selfie"
                          className="w-full rounded-lg border max-h-72 object-cover"
                        />
                      ) : (
                        <div className="h-32 grid place-items-center text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      )
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin foto</p>
                    )}

                    {hasLoc ? (
                      <div className="space-y-2">
                        <div className="rounded-lg overflow-hidden border bg-white">
                          <iframe
                            title={`Ubicación ${e.id}`}
                            src={mapEmbedUrl!}
                            className="w-full h-48 border-0"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="text-muted-foreground tabular-nums">
                            <p>
                              {e.latitude!.toFixed(6)}, {e.longitude!.toFixed(6)}
                            </p>
                            {e.accuracy != null && (
                              <p>Precisión: ±{Math.round(e.accuracy)} m</p>
                            )}
                          </div>
                          <a
                            href={mapsUrl!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-pink-600 font-medium flex items-center gap-1"
                          >
                            <MapPin className="h-3 w-3" /> Abrir mapa
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin ubicación registrada</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length > 100 && (
            <p className="text-center text-xs text-muted-foreground p-3">
              Mostrando 100 de {filtered.length} — usa exportar para ver todo
            </p>
          )}
        </Card>
        </>
        )}
      </div>
    </div>
  );
}

function typeLabel(t: Entry["type"]) {
  return t === "clock_in"
    ? "Entrada"
    : t === "clock_out"
      ? "Salida"
      : t === "break_start"
        ? "Inicio descanso"
        : "Fin descanso";
}
