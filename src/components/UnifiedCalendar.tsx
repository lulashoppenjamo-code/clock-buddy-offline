import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  WEEKDAYS,
  toISODate,
  monthGrid,
  buildCalendar,
  type RestSchedule,
  type RestOverride,
  type RestDay,
} from "@/lib/rest-days";

type CalEmployee = { id: string; name: string; color: string };

type Mark = { employeeId: string; kind: string; reason?: string | null };

function expandRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(toISODate(new Date(d)));
  }
  return out;
}

export function UnifiedCalendar({
  ownerId,
  employees,
  schedules,
  overrides,
  bonuses,
  note,
}: {
  ownerId: string;
  employees: CalEmployee[];
  schedules: RestSchedule[];
  overrides: RestOverride[];
  bonuses: RestDay[];
  note?: string;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [vacDays, setVacDays] = useState<Record<string, Mark[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("vacation_requests")
        .select("employee_id,start_date,end_date,status")
        .eq("owner_id", ownerId)
        .eq("status", "aprobada");
      if (cancelled) return;
      const map: Record<string, Mark[]> = {};
      for (const r of (data as any[]) ?? []) {
        for (const iso of expandRange(r.start_date, r.end_date)) {
          (map[iso] ??= []).push({ employeeId: r.employee_id, kind: "vacaciones" });
        }
      }
      setVacDays(map);
    }
    load();
    const ch = supabase
      .channel("unified-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vacation_requests" },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [ownerId]);

  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const marks = useMemo(
    () => buildCalendar(days, schedules, overrides, bonuses),
    [days, schedules, overrides, bonuses],
  );
  const empById = useMemo(() => {
    const m: Record<string, CalEmployee> = {};
    for (const e of employees) m[e.id] = e;
    return m;
  }, [employees]);

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
      {note && <p className="text-xs text-muted-foreground text-center">{note}</p>}
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
          const list: Mark[] = [...(marks[iso] ?? []), ...(vacDays[iso] ?? [])];
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
                  const icon =
                    m.kind === "cambio"
                      ? "🔁"
                      : m.kind === "bono"
                        ? "🎁"
                        : m.kind === "vacaciones"
                          ? "🌴"
                          : "🛌";
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-0.5 text-[9px] rounded px-0.5 truncate"
                      style={{
                        backgroundColor: `${e.color}22`,
                        color: e.color,
                        border:
                          m.kind === "cambio"
                            ? `1px dashed ${e.color}`
                            : m.kind === "vacaciones"
                              ? `1px solid ${e.color}`
                              : undefined,
                      }}
                      title={`${e.name} — ${m.kind}${m.reason ? `: ${m.reason}` : ""}`}
                    >
                      <span>{icon}</span>
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
        <span>🌴 Vacaciones</span>
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
