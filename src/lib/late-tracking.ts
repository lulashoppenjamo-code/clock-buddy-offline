/**
 * Seguimiento local de retardos y reincidencias por colaboradora (mes actual).
 * También genera los mensajes al checar tarde (entrada o comida).
 */
import {
  TOLERANCE_MINUTES,
  LUNCH_MAX_MINUTES,
  evaluateClockIn,
  evaluateBreakReturn,
  expectedStartLabel,
  type EmployeeSchedule,
} from "@/lib/schedule";

const KEY = "checador.late.v1";

type LateStore = {
  /** YYYY-MM */
  month: string;
  /** employeeId -> { entryLates: number, lunchLates: number } */
  byEmp: Record<string, { entryLates: number; lunchLates: number }>;
};

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function load(): LateStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { month: monthKey(), byEmp: {} };
    const parsed = JSON.parse(raw) as LateStore;
    if (parsed.month !== monthKey()) return { month: monthKey(), byEmp: {} };
    return parsed;
  } catch {
    return { month: monthKey(), byEmp: {} };
  }
}

function save(s: LateStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function bump(employeeId: string, kind: "entry" | "lunch"): { entryLates: number; lunchLates: number } {
  const s = load();
  const cur = s.byEmp[employeeId] ?? { entryLates: 0, lunchLates: 0 };
  if (kind === "entry") cur.entryLates += 1;
  else cur.lunchLates += 1;
  s.byEmp[employeeId] = cur;
  save(s);
  return cur;
}

export function getLateStats(employeeId: string): { entryLates: number; lunchLates: number } {
  const s = load();
  return s.byEmp[employeeId] ?? { entryLates: 0, lunchLates: 0 };
}

export type LateFeedback = {
  late: boolean;
  message: string;
  severity: "ok" | "warn" | "recurrent";
  lateMinutes: number;
};

/**
 * Evalúa clock_in y devuelve mensaje + actualiza reincidencia del mes.
 */
export function feedbackClockIn(
  employeeId: string,
  employeeName: string,
  when: Date,
  schedule: EmployeeSchedule | undefined,
): LateFeedback {
  const ev = evaluateClockIn(when, schedule);
  if (!ev || ev.onTime) {
    return {
      late: false,
      message: `Entrada a tiempo · tolerancia ${TOLERANCE_MINUTES} min`,
      severity: "ok",
      lateMinutes: 0,
    };
  }
  const counts = bump(employeeId, "entry");
  const expected = expectedStartLabel(schedule);
  const recurrent = counts.entryLates >= 2;
  const message = recurrent
    ? `⚠️ REINCIDENCIA: ${employeeName} llega tarde otra vez (+${ev.lateMinutes} min). Horario: ${expected}. Este mes: ${counts.entryLates} retardos de entrada.`
    : `⏰ Retardo: ${employeeName} debió entrar a las ${expected} (tol. ${TOLERANCE_MINUTES} min) y llegó ${ev.lateMinutes} min tarde.`;
  return {
    late: true,
    message,
    severity: recurrent ? "recurrent" : "warn",
    lateMinutes: ev.lateMinutes,
  };
}

/**
 * Evalúa break_end respecto al último break_start.
 */
export function feedbackBreakEnd(
  employeeId: string,
  employeeName: string,
  breakStart: Date,
  breakEnd: Date,
): LateFeedback {
  const ev = evaluateBreakReturn(breakStart, breakEnd);
  if (ev.onTime) {
    return {
      late: false,
      message: `Comida OK (${ev.durationMinutes} min de ${LUNCH_MAX_MINUTES} permitidos)`,
      severity: "ok",
      lateMinutes: 0,
    };
  }
  const counts = bump(employeeId, "lunch");
  const recurrent = counts.lunchLates >= 2;
  const message = recurrent
    ? `⚠️ REINCIDENCIA en comida: ${employeeName} regresó ${ev.lateMinutes} min tarde (comida ${ev.durationMinutes} min; máx. ${LUNCH_MAX_MINUTES}). Este mes: ${counts.lunchLates} retardos de comida.`
    : `⏰ Comida excedida: ${employeeName} salió y regresó en ${ev.durationMinutes} min (máx. ${LUNCH_MAX_MINUTES}). +${ev.lateMinutes} min de retardo.`;
  return {
    late: true,
    message,
    severity: recurrent ? "recurrent" : "warn",
    lateMinutes: ev.lateMinutes,
  };
}
