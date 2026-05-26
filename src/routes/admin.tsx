import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Entry = {
  id: string;
  employee_id: string;
  type: "clock_in" | "clock_out" | "break_start" | "break_end";
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  photo_path: string | null;
};

type Employee = { id: string; name: string; color: string };

type Range = "week" | "month" | "all";

function AdminPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [range, setRange] = useState<Range>("week");
  const [selectedEmp, setSelectedEmp] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        navigate({ to: "/auth" });
        return;
      }
      setOwnerId(uid);
      await load(uid);
      setLoading(false);
    });
  }, [navigate]);

  async function load(uid: string) {
    setRefreshing(true);
    const [{ data: emps }, { data: ents }] = await Promise.all([
      supabase.from("employees").select("id,name,color").eq("owner_id", uid).order("name"),
      supabase
        .from("time_entries")
        .select("id,employee_id,type,occurred_at,latitude,longitude,photo_path")
        .eq("owner_id", uid)
        .order("occurred_at", { ascending: false })
        .limit(1000),
    ]);
    setEmployees(emps ?? []);
    setEntries((ents ?? []) as Entry[]);
    setRefreshing(false);
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

  // Pair entries to compute worked hours
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
        if (e.type === "clock_in") {
          inAt = t;
          breakMs = 0;
        } else if (e.type === "break_start") {
          breakAt = t;
        } else if (e.type === "break_end") {
          if (breakAt) breakMs += t.getTime() - breakAt.getTime();
          breakAt = null;
        } else if (e.type === "clock_out") {
          if (inAt) {
            const dur = t.getTime() - inAt.getTime() - breakMs;
            if (dur > 0) {
              perEmp[empId] ??= { worked: 0, sessions: 0 };
              perEmp[empId].worked += dur;
              perEmp[empId].sessions += 1;
            }
            inAt = null;
            breakMs = 0;
            breakAt = null;
          }
        }
      }
    }
    return perEmp;
  }, [filtered, employees]);

  function exportCSV() {
    const empName = (id: string) => employees.find((e) => e.id === id)?.name ?? id;
    const header = ["Empleada", "Tipo", "Fecha", "Hora", "Latitud", "Longitud"];
    const rows = filtered
      .slice()
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map((e) => {
        const d = parseISO(e.occurred_at);
        return [
          empName(e.employee_id),
          typeLabel(e.type),
          format(d, "yyyy-MM-dd"),
          format(d, "HH:mm:ss"),
          e.latitude ?? "",
          e.longitude ?? "",
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

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold">Reportes</h1>
        <button
          onClick={() => ownerId && load(ownerId)}
          className="text-sm text-muted-foreground"
          aria-label="Refrescar"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-3 space-y-3">
          <div className="flex gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mes</SelectItem>
                <SelectItem value="all">Todo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedEmp} onValueChange={setSelectedEmp}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="w-full" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Exportar CSV ({filtered.length})
          </Button>
        </Card>

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
                <p className="text-xl font-bold tabular-nums">
                  {h}h {m.toString().padStart(2, "0")}m
                </p>
                <p className="text-xs text-muted-foreground">{s.sessions} turno(s)</p>
              </Card>
            );
          })}
        </div>

        <Card className="divide-y">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground p-6">Sin registros</p>
          )}
          {filtered.slice(0, 100).map((e) => {
            const emp = employees.find((x) => x.id === e.employee_id);
            const d = parseISO(e.occurred_at);
            return (
              <div key={e.id} className="p-3 flex items-center gap-3 text-sm">
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
                  <p className="text-xs text-muted-foreground">
                    {format(d, "EEE d MMM, HH:mm", { locale: es })}
                    {e.latitude != null && " · 📍"}
                  </p>
                </div>
              </div>
            );
          })}
          {filtered.length > 100 && (
            <p className="text-center text-xs text-muted-foreground p-3">
              Mostrando 100 de {filtered.length} — usa exportar para ver todo
            </p>
          )}
        </Card>
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
