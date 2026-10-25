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
    const limit = FALLBACK_HOUR * 60 + TOLERANCE_MINUTES;
    return { onTime: mins <= limit, lateMinutes: Math.max(0, mins - limit) };
  }
  if (!schedule.active) return null;
  const limit = timeToMinutes(schedule.start_time) + TOLERANCE_MINUTES;
  return { onTime: mins <= limit, lateMinutes: Math.max(0, mins - limit) };
}

/** Minutos máximos de comida (break_start → break_end). */
export const LUNCH_MAX_MINUTES = 120;

/**
 * Evalúa regreso de comida: si tardó más de LUNCH_MAX_MINUTES desde break_start.
 */
export function evaluateBreakReturn(
  breakStart: Date,
  breakEnd: Date,
): { onTime: boolean; lateMinutes: number; durationMinutes: number } {
  const durationMinutes = Math.round((breakEnd.getTime() - breakStart.getTime()) / 60000);
  const lateMinutes = Math.max(0, durationMinutes - LUNCH_MAX_MINUTES);
  return { onTime: lateMinutes === 0, lateMinutes, durationMinutes };
}

export function formatMinutesClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Texto de horario de entrada (HH:MM o fallback). */
export function expectedStartLabel(schedule: EmployeeSchedule | undefined): string {
  if (!schedule?.active) return `${FALLBACK_HOUR}:00 AM`;
  return formatMinutesClock(timeToMinutes(schedule.start_time));
}


/** Minutos antes del cierre en que ya se permite salir sin justificación. */
export const EARLY_OUT_GRACE_MINUTES = 2;

/**
 * Evalúa si la salida es anticipada respecto a end_time del horario.
 * early = true si falta más de EARLY_OUT_GRACE_MINUTES para la hora de cierre.
 */
export function evaluateEarlyClockOut(
  when: Date,
  schedule: EmployeeSchedule | undefined,
): { early: boolean; minutesBeforeEnd: number; endLabel: string } {
  const mins = when.getHours() * 60 + when.getMinutes();
  let endMins: number;
  if (schedule?.active && schedule.end_time) {
    endMins = timeToMinutes(schedule.end_time);
  } else {
    // Fallback: jornada 10:00–18:00
    endMins = 18 * 60;
  }
  const minutesBeforeEnd = endMins - mins;
  const early = minutesBeforeEnd > EARLY_OUT_GRACE_MINUTES;
  return {
    early,
    minutesBeforeEnd: Math.max(0, minutesBeforeEnd),
    endLabel: formatMinutesClock(endMins),
  };
}


/** Minutos antes del fin de turno que aún se aceptan sin comentario (ej. 2). */
export const EARLY_OUT_FREE_MINUTES = 2;

/**
 * Evalúa si la salida es anticipada respecto al horario de fin.
 * earlyMinutes > EARLY_OUT_FREE_MINUTES → debe pedir comentario.
 */
export function evaluateEarlyClockOut(
  when: Date,
  schedule: EmployeeSchedule | undefined,
): { early: boolean; earlyMinutes: number; requiresComment: boolean; endLabel: string } {
  if (!schedule?.active) {
    return { early: false, earlyMinutes: 0, requiresComment: false, endLabel: "—" };
  }
  const endMins = timeToMinutes(schedule.end_time);
  const nowMins = when.getHours() * 60 + when.getMinutes();
  const earlyMinutes = Math.max(0, endMins - nowMins);
  return {
    early: earlyMinutes > 0,
    earlyMinutes,
    requiresComment: earlyMinutes > EARLY_OUT_FREE_MINUTES,
    endLabel: formatMinutesClock(endMins),
  };
}
 