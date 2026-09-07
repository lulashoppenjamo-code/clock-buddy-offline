import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import {
  BRANCHES,
  branchName,
  formatDayLabel,
  formatWeekLabel,
  getReminderHour,
  groupItems,
  setReminderHour,
  toISODate,
  todayISO,
  weekEnd,
  weekStart,
  type ShortageReport,
} from "@/lib/shortages";

export const Route = createFileRoute("/admin-faltantes")({
  component: AdminFaltantesRoute,
  head: () => ({
    meta: [
      { title: "Faltantes / Surtido · Panel de administración" },
      {
        name: "description",
        content:
          "Revisa quién reportó faltantes cada día y el resumen semanal por sucursal.",
      },
      { property: "og:title", content: "Panel de Faltantes / Surtido" },
      {
        property: "og:description",
        content: "Reportes diarios y resumen semanal de productos faltantes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Employee = { id: string; name: string; color: string; branch: string | null };

function AdminFaltantesRoute() {
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
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <AdminGate ownerId={uid}>
      <Inner ownerId={uid} />
    </AdminGate>
  );
}

function Inner({ ownerId }: { ownerId: string }) {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reports, setReports] = useState<ShortageReport[]>([]);
  const [day, setDay] = useState(todayISO());
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [weekRef, setWeekRef] = useState(() => weekStart(new Date()));
  const [reminderHour, setHour] = useState(19);

  useEffect(() => {
    setHour(getReminderHour());
  }, []);

  useEffect(() => {
    (async () => {
      const { data: emps } = await supabase
        .from("employees")
        .select("id,name,color,branch")
        .eq("owner_id", ownerId)
        .eq("active", true)
        .order("name");
      setEmployees((emps ?? []) as Employee[]);
      setLoading(false);
    })();
  }, [ownerId]);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const from = toISODate(new Date(weekRef.getFullYear(), weekRef.getMonth(), weekRef.getDate() - 60));
    const { data } = await supabase
      .from("shortage_reports")
      .select("*")
      .eq("owner_id", ownerId)
      .gte("report_date", from)
      .order("report_date", { ascending: false });
    setReports((data ?? []) as ShortageReport[]);
  }, [ownerId, weekRef]);

  useEffect(() => {
    load();
  }, [load]);

  const dayReports = useMemo(
    () =>
      reports.filter(
        (r) =>
          r.report_date === day &&
          (branchFilter === "all" || r.branch === branchFilter),
      ),
    [reports, day, branchFilter],
  );

  const pending = useMemo(() => {
    const done = new Set(dayReports.map((r) => r.employee_id));
    return employees.filter(
      (e) =>
        !done.has(e.id) &&
        (branchFilter === "all" || !e.branch || e.branch === branchFilter),
    );
  }, [employees, dayReports, branchFilter]);

  const weekReports = useMemo(() => {
    const s = toISODate(weekRef);
    const e = toISODate(weekEnd(weekRef));
    return reports.filter(
      (r) =>
        r.report_date >= s &&
        r.report_date <= e &&
        (branchFilter === "all" || r.branch === branchFilter),
    );
  }, [reports, weekRef, branchFilter]);

  const grouped = useMemo(() => groupItems(weekReports), [weekReports]);

  function shiftWeek(delta: number) {
    setWeekRef((w) => {
      const x = new Date(w);
      x.setDate(x.getDate() + delta * 7);
      return weekStart(x);
    });
  }

  async function sendReminderNow() {
    try {
      if (!("Notification" in window)) {
        toast.info("Este dispositivo no admite notificaciones");
        return;
      }
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Permiso de notificaciones denegado");
        return;
      }
      new Notification("📦 Reporte de faltantes", {
        body: "Recuerda enviar tu reporte de faltantes de hoy.",
      });
      toast.success("Recordatorio enviado en este dispositivo");
    } catch {
      toast.error("No se pudo mostrar el recordatorio");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-1 text-sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <h1 className="font-semibold">📦 Faltantes / Surtido</h1>
        </div>

        <Card className="p-3">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
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
        </Card>

        <Tabs defaultValue="dia">
          <TabsList className="w-full">
            <TabsTrigger value="dia" className="flex-1">
              Día
            </TabsTrigger>
            <TabsTrigger value="semana" className="flex-1">
              Resumen semanal
            </TabsTrigger>
            <TabsTrigger value="config" className="flex-1">
              Recordatorio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dia" className="space-y-3 pt-3">
            <Card className="p-3">
              <Input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </Card>

            <Card className="p-4 space-y-2">
              <h2 className="text-sm font-semibold">Estado del día</h2>
              <div className="flex flex-wrap gap-2">
                {dayReports.map((r) => (
                  <span
                    key={r.id}
                    className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" /> {r.employee_name}
                  </span>
                ))}
                {pending.map((e) => (
                  <span
                    key={e.id}
                    className="text-xs px-2 py-1 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1"
                  >
                    <XCircle className="h-3 w-3" /> {e.name}
                  </span>
                ))}
                {dayReports.length === 0 && pending.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Sin colaboradoras activas.
                  </span>
                )}
              </div>
            </Card>

            {dayReports.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground text-center">
                Nadie ha reportado el {formatDayLabel(day)}.
              </Card>
            ) : (
              dayReports.map((r) => (
                <Card key={r.id} className="p-4 space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {r.employee_name}
                    </span>
                    <span>{branchName(r.branch)}</span>
                  </div>
                  <ul className="text-sm list-disc pl-5 space-y-0.5">
                    {r.items.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                  {r.comment && (
                    <p className="text-xs italic text-muted-foreground">
                      “{r.comment}”
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("es-MX", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="semana" className="space-y-3 pt-3">
            <Card className="p-3 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => shiftWeek(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {formatWeekLabel(weekRef)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shiftWeek(1)}
                disabled={toISODate(weekRef) >= toISODate(weekStart(new Date()))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Card>

            <Card className="p-4 space-y-2">
              <h2 className="text-sm font-semibold">
                Resumen de faltantes ({weekReports.length} reportes)
              </h2>
              {grouped.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin reportes esta semana.
                </p>
              ) : (
                grouped.map((g) => (
                  <div
                    key={g.label}
                    className="flex items-start justify-between gap-3 border-b last:border-0 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium capitalize">{g.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {g.reporters.join(", ")}
                        {g.variants.length > 1 &&
                          ` · también: ${g.variants.slice(1).join(", ")}`}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-800 text-white shrink-0">
                      ×{g.count}
                    </span>
                  </div>
                ))
              )}
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-3 pt-3">
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Bell className="h-4 w-4" /> Recordatorio diario
              </h2>
              <p className="text-xs text-muted-foreground">
                A partir de esta hora, la app le recuerda a la colaboradora
                enviar su reporte de faltantes.
              </p>
              <Select
                value={String(reminderHour)}
                onValueChange={(v) => {
                  setHour(Number(v));
                  setReminderHour(Number(v));
                  toast.success("Hora del recordatorio guardada");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {new Date(2020, 0, 1, h).toLocaleTimeString("es-MX", {
                        hour: "numeric",
                        hour12: true,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="w-full" onClick={sendReminderNow}>
                Probar recordatorio ahora
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
