import { supabase } from "@/integrations/supabase/client";

export const WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const BRANCHES = ["Mina", "Morelos"] as const;

export type RestSchedule = {
  id: string;
  owner_id: string;
  employee_id: string;
  weekday: number;
  updated_at: string;
  updated_by: string | null;
};

export type RestOverride = {
  id: string;
  owner_id: string;
  employee_id: string;
  original_weekday: number | null;
  new_date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type RestDay = {
  id: string;
  owner_id: string;
  employee_id: string;
  rest_date: string;
  type: string;
  reason: string | null;
  branch: string | null;
  created_by: string | null;
  created_at: string;
};

export type RestChangeStatus = "pendiente" | "aprobada" | "rechazada";

export type RestChangeType = "cambio" | "bono";

export type RestChangeRequest = {
  id: string;
  owner_id: string;
  employee_id: string;
  requested_date: string;
  original_weekday: number | null;
  reason: string | null;
  status: RestChangeStatus;
  request_type: RestChangeType;
  admin_comment: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export function weekdayName(w: number | null | undefined): string {
  if (w === null || w === undefined) return "Sin asignar";
  return WEEKDAYS[w] ?? "Sin asignar";
}

/** Local ISO date (YYYY-MM-DD) without timezone shifting. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Sunday-based start of the week containing the given date. */
export function weekStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function isSunday(iso: string): boolean {
  return parseISODate(iso).getDay() === 0;
}

export function formatDateLong(iso: string): string {
  return parseISODate(iso).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** All days shown in a month grid (padded to full weeks, Sunday first). */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = weekStart(first);
  const days: Date[] = [];
  const last = new Date(year, month + 1, 0);
  const end = weekStart(last);
  end.setDate(end.getDate() + 6);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

export type RestMark = {
  employeeId: string;
  kind: "habitual" | "cambio" | "bono";
  reason?: string | null;
};

/**
 * Resolves rest marks per date for a month.
 * Regular weekly rest is projected from rest_schedule, but any week where the
 * employee has an override is replaced by the override date.
 */
export function buildCalendar(
  days: Date[],
  schedules: RestSchedule[],
  overrides: RestOverride[],
  bonuses: RestDay[],
): Record<string, RestMark[]> {
  const map: Record<string, RestMark[]> = {};
  const push = (iso: string, mark: RestMark) => {
    (map[iso] ??= []).push(mark);
  };

  // week key -> set of employees with an override that week
  const overriddenWeeks = new Set<string>();
  for (const o of overrides) {
    overriddenWeeks.add(`${o.employee_id}|${toISODate(weekStart(parseISODate(o.new_date)))}`);
  }

  for (const d of days) {
    const iso = toISODate(d);
    const wk = toISODate(weekStart(d));
    for (const s of schedules) {
      if (d.getDay() !== s.weekday) continue;
      if (overriddenWeeks.has(`${s.employee_id}|${wk}`)) continue;
      push(iso, { employeeId: s.employee_id, kind: "habitual" });
    }
  }

  for (const o of overrides) {
    push(o.new_date, { employeeId: o.employee_id, kind: "cambio", reason: o.reason });
  }
  for (const b of bonuses) {
    push(b.rest_date, { employeeId: b.employee_id, kind: "bono", reason: b.reason });
  }

  return map;
}

export async function fetchRestData(ownerId: string) {
  const [{ data: schedules }, { data: overrides }, { data: bonuses }] = await Promise.all([
    supabase.from("rest_schedule").select("*").eq("owner_id", ownerId),
    supabase.from("rest_overrides").select("*").eq("owner_id", ownerId).order("new_date"),
    supabase.from("rest_days").select("*").eq("owner_id", ownerId).order("rest_date", { ascending: false }),
  ]);
  return {
    schedules: (schedules ?? []) as RestSchedule[],
    overrides: (overrides ?? []) as RestOverride[],
    bonuses: (bonuses ?? []) as RestDay[],
  };
}

export async function fetchChangeRequests(ownerId: string, employeeId?: string) {
  let query = supabase
    .from("rest_change_requests")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data } = await query;
  return (data ?? []) as RestChangeRequest[];
}
