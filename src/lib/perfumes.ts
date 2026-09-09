// Meta mensual del domingo bono: ventas agregadas + perfumes
export const PERFUME_GOAL = 3; // mínimo de perfumes en el mes para competir

export type PerfumeSale = {
  id: string;
  employee_id: string;
  employee_name: string;
  branch: string;
  perfume_name: string;
  quantity: number;
  sold_at: string;
};

/** Rango del mes: del día 1 a las 00:00 al último día 23:59:59.999 */
export function monthRange(ref = new Date()) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function monthLabel(ref = new Date()) {
  return ref.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

export type GoalRow = {
  id: string;
  name: string;
  color: string;
  perfumes: number;
  ventas: number;
  qualified: boolean;
};

/**
 * Solo puede haber una ganadora al mes: entre quienes vendieron al menos
 * PERFUME_GOAL perfumes, gana la que tenga más ventas agregadas.
 * Empate en ventas agregadas -> más perfumes -> orden alfabético.
 */
export function rankGoal(rows: GoalRow[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.qualified) - Number(a.qualified) ||
      b.ventas - a.ventas ||
      b.perfumes - a.perfumes ||
      a.name.localeCompare(b.name),
  );
  const winner = sorted.find((r) => r.qualified) ?? null;
  return { sorted, winner };
}
