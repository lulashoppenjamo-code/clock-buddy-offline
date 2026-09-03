import { supabase } from "@/integrations/supabase/client";
import { toISODate, weekStart, parseISODate, type RestSchedule, type RestOverride, type RestDay } from "@/lib/rest-days";

/** Minutos de tolerancia después de la hora asignada que aún cuentan como puntual. */
export const TOLERANCE_MINUTES = 5;

/** Hora usada cuando la colaboradora aún no tiene horario asignado. */
export const FALLBACK_HOUR = 10;

export type EmployeeSchedule = {
  id: string;
  owner_id: string;
  employee_id: string;
  weekday: number;
  start_time: string; // HH:MM:SS
  end_time: string;
  active: boolean;
};

export type ScheduleDraft = {
  weekday: number;
  start_time: string; // HH:MM
  end_time: string;
  active: boolean;
};

export const DEFAULT_DRAFT: ScheduleDraft[] = Array.from({ length: 7 }, (_, w) => ({
  weekday: w,
  start_time: "10:00",
  end_time: "18:00",
  active: w !== 0,
}));

/** "HH:MM[:SS]" -> minutos desde medianoche */
export function timeToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export function trimTime(t: string): string {
  return t.slice(0, 5);
}

export async function fetchSchedules(ownerId: string): Promise<EmployeeSchedule[]> {
  const { data } = await supabase
    .from("employee_schedules")
    .select("*")
    .eq("owner_id", ownerId)
    .order("weekday");
  return (data ?? []) as EmployeeSchedule[];
}

export async function saveSchedules(
  ownerId: string,
  employeeId: string,
  draft: ScheduleDraft[],
) {
  const rows = draft.map((d) => ({
    owner_id: ownerId,
    employee_id: employeeId,
    weekday: d.weekday,
    start_time: d.start_time,
    end_time: d.end_time,
    active: d.active,
  }));
  return supabase.from("employee_schedules").upsert(rows, { onConflict: "employee_id,weekday" });
}

/** Índice rápido: `${employeeId}|${weekday}` -> horario */
export function scheduleIndex(list: EmployeeSchedule[]) {
  const map = new Map<string, EmployeeSchedule>();
  for (const s of list) map.set(`${s.employee_id}|${s.weekday}`, s);
  return map;
}

/** Conjunto de días de descanso: `${employeeId}|${YYYY-MM-DD}` */
export function restDaySet(
  from: Date,
  to: Date,
  schedules: RestSchedule[],
  overrides: RestOverride[],
  bonuses: RestDay[],
): Set<string> {
  const set = new Set<string>();
  const overriddenWeeks = new Set<string>();
  for (const o of overrides) {
    overriddenWeeks.add(`${o.employee_id}|${toISODate(weekStart(parseISODate(o.new_date)))}`);
  }
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= to) {
    const iso = toISODate(cursor);
    const wk = toISODate(weekStart(cursor));
    for (const s of schedules) {
      if (cursor.getDay() !== s.weekday) continue;
      if (overriddenWeeks.has(`${s.employee_id}|${wk}`)) continue;
      set.add(`${s.employee_id}|${iso}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const o of overrides) set.add(`${o.employee_id}|${o.new_date}`);
  for (const b of bonuses) set.add(`${b.employee_id}|${b.rest_date}`);
  return set;
}

/**
 * Evalúa una entrada contra el horario asignado.
 * Devuelve null si ese día no cuenta (día inactivo en el horario).
 */
export function evaluateClockIn(
  when: Date,
  schedule: EmployeeSchedule | undefined,
): { onTime: boolean; lateMinutes: number } | null {
  const mins = when.getHours() * 60 + when.getMinutes();
  if (!schedule) {
    const limit = FALLBACK_HOUR * 60;
    return { onTime: mins <= limit, lateMinutes: Math.max(0, mins - limit) };
  }
  if (!schedule.active) return null;
  const limit = timeToMinutes(schedule.start_time) + TOLERANCE_MINUTES;
  return { onTime: mins <= limit, lateMinutes: Math.max(0, mins - limit) };
}
