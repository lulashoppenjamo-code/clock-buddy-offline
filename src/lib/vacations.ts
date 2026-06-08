import { supabase } from "@/integrations/supabase/client";

export type VacationStatus = "pendiente" | "aprobada" | "rechazada";

export type VacationRequest = {
  id: string;
  owner_id: string;
  employee_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: VacationStatus;
  employee_comment: string | null;
  admin_comment: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VacationAdjustment = {
  id: string;
  owner_id: string;
  employee_id: string;
  days: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

/** Inclusive natural day count between two ISO dates (YYYY-MM-DD). */
export function daysBetween(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const ms = e.getTime() - s.getTime();
  if (ms < 0) return 0;
  return Math.round(ms / 86400000) + 1;
}

/** Years of service (integer floor) from hire date to today. */
export function yearsOfService(hireDateISO: string | null, today = new Date()): number {
  if (!hireDateISO) return 0;
  const h = new Date(hireDateISO + "T00:00:00");
  let years = today.getFullYear() - h.getFullYear();
  const m = today.getMonth() - h.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < h.getDate())) years--;
  return Math.max(0, years);
}

/** Days assigned according to seniority rule. */
export function assignedDays(hireDateISO: string | null, today = new Date()): number {
  const years = yearsOfService(hireDateISO, today);
  if (years < 1) return 0;
  if (years < 2) return 7;
  return 14;
}

/** Start (inclusive) of current vacation year window based on hire date. */
export function currentVacationYearStart(hireDateISO: string, today = new Date()): Date {
  const h = new Date(hireDateISO + "T00:00:00");
  const years = yearsOfService(hireDateISO, today);
  const start = new Date(h);
  start.setFullYear(h.getFullYear() + years);
  return start;
}

export type Balance = {
  seniorityYears: number;
  assigned: number;
  used: number;
  adjustments: number;
  available: number;
};

export async function computeBalance(
  ownerId: string,
  employeeId: string,
  hireDateISO: string | null,
): Promise<Balance> {
  const today = new Date();
  const seniorityYears = yearsOfService(hireDateISO, today);
  const assigned = assignedDays(hireDateISO, today);

  let used = 0;
  let adjustments = 0;

  if (hireDateISO) {
    const yearStart = currentVacationYearStart(hireDateISO, today).toISOString().slice(0, 10);

    const { data: reqs } = await supabase
      .from("vacation_requests")
      .select("days_requested,status,start_date")
      .eq("owner_id", ownerId)
      .eq("employee_id", employeeId)
      .eq("status", "aprobada")
      .gte("start_date", yearStart);
    used = (reqs ?? []).reduce((s, r: any) => s + (r.days_requested || 0), 0);

    const { data: adj } = await supabase
      .from("vacation_adjustments")
      .select("days,created_at")
      .eq("owner_id", ownerId)
      .eq("employee_id", employeeId)
      .gte("created_at", yearStart);
    adjustments = (adj ?? []).reduce((s, r: any) => s + Number(r.days || 0), 0);
  }

  const available = Math.max(0, assigned + adjustments - used);
  return { seniorityYears, assigned, used, adjustments, available };
}
