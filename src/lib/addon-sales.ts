// Helpers para el módulo de Ventas Agregadas
import { BRANCHES, branchName, type Branch } from "@/lib/cleaning";

export { BRANCHES, branchName };
export type { Branch };

export type AddonSaleStatus = "pendiente" | "validado" | "rechazado";

export const ADDON_STATUSES: {
  id: AddonSaleStatus;
  label: string;
  color: string;
}[] = [
  { id: "pendiente", label: "Pendiente", color: "#eab308" },
  { id: "validado", label: "Validado", color: "#16a34a" },
  { id: "rechazado", label: "Rechazado", color: "#dc2626" },
];

export function addonStatusInfo(s: string) {
  return (
    ADDON_STATUSES.find((x) => x.id === s) ?? {
      id: s as AddonSaleStatus,
      label: s,
      color: "#64748b",
    }
  );
}

export type AddonSale = {
  id: string;
  owner_id: string;
  employee_id: string;
  employee_name: string;
  branch: string;
  main_product: string;
  addon_product: string;
  ticket_number: string;
  photo_path: string;
  comment: string | null;
  status: AddonSaleStatus;
  sold_at: string;
  created_at: string;
};

// Sugerencias de productos agregados frecuentes
export const ADDON_SUGGESTIONS = [
  "Diseño extra",
  "Decoración",
  "Retiro de gel",
  "Reparación de uña",
  "Pedicure express",
  "Tratamiento de manos",
  "Encapsulado",
  "Producto de venta",
];

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function periodRanges(now = new Date()) {
  const day = startOfDay(now);
  const week = startOfDay(now);
  const dow = (week.getDay() + 6) % 7; // lunes = 0
  week.setDate(week.getDate() - dow);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  return { day, week, month };
}
