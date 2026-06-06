// Helpers para el módulo de Solicitud de Insumos
import { supabase } from "@/integrations/supabase/client";
import { BRANCHES, branchName, type Branch } from "@/lib/cleaning";

export { BRANCHES, branchName };
export type { Branch };

export type SupplyReason = "terminado" | "queda_poco" | "danado" | "otro";
export const REASONS: { id: SupplyReason; label: string }[] = [
  { id: "terminado", label: "Se terminó" },
  { id: "queda_poco", label: "Queda poco" },
  { id: "danado", label: "Dañado" },
  { id: "otro", label: "Otro" },
];
export function reasonLabel(r: string): string {
  return REASONS.find((x) => x.id === r)?.label ?? r;
}

export type SupplyStatus = "pendiente" | "aprobada" | "entregada" | "rechazada";
export const STATUSES: { id: SupplyStatus; label: string; color: string }[] = [
  { id: "pendiente", label: "Pendiente", color: "#eab308" },
  { id: "aprobada", label: "Aprobada", color: "#2563eb" },
  { id: "entregada", label: "Entregada", color: "#16a34a" },
  { id: "rechazada", label: "Rechazada", color: "#dc2626" },
];
export function statusInfo(s: string) {
  return (
    STATUSES.find((x) => x.id === s) ?? {
      id: s as SupplyStatus,
      label: s,
      color: "#64748b",
    }
  );
}

// Catálogo por defecto que el admin sembrará la primera vez
export const DEFAULT_CATEGORIES: { name: string; slug: string }[] = [
  { name: "Limpieza", slug: "limpieza" },
  { name: "Papelería", slug: "papeleria" },
  { name: "Cafetería", slug: "cafeteria" },
  { name: "Material para uñas", slug: "unas" },
  { name: "Herramientas", slug: "herramientas" },
  { name: "Mantenimiento", slug: "mantenimiento" },
];

export const DEFAULT_CLEANING_SUPPLIES: {
  name: string;
  unit: string;
  reorder_days: number;
}[] = [
  { name: "Cloro 1 litro", unit: "L", reorder_days: 14 },
  { name: "Fabuloso 4 litros", unit: "L", reorder_days: 30 },
  { name: "Jabón en polvo 500 g", unit: "kg", reorder_days: 21 },
  { name: "Papel higiénico (4 rollos)", unit: "paquete", reorder_days: 7 },
  { name: "Escoba", unit: "pieza", reorder_days: 90 },
  { name: "Trapeador", unit: "pieza", reorder_days: 90 },
  { name: "Recogedor", unit: "pieza", reorder_days: 180 },
  { name: "Franela", unit: "pieza", reorder_days: 30 },
];

export async function ensureCatalogSeeded(ownerId: string): Promise<void> {
  // Verifica si ya hay categorías; si no, siembra el catálogo de Limpieza.
  const { data: cats } = await supabase
    .from("supply_categories")
    .select("id,slug")
    .eq("owner_id", ownerId);
  let cleaningId: string | null =
    cats?.find((c) => c.slug === "limpieza")?.id ?? null;

  if (!cats || cats.length === 0) {
    const toInsert = DEFAULT_CATEGORIES.map((c) => ({
      owner_id: ownerId,
      name: c.name,
      slug: c.slug,
      // Sólo Limpieza activa de inicio; las demás quedan listas pero inactivas
      active: c.slug === "limpieza",
    }));
    const { data: inserted } = await supabase
      .from("supply_categories")
      .insert(toInsert)
      .select("id,slug");
    cleaningId = inserted?.find((c) => c.slug === "limpieza")?.id ?? null;
  }

  if (!cleaningId) return;

  const { data: existing } = await supabase
    .from("supplies")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("category_id", cleaningId);

  if (!existing || existing.length === 0) {
    await supabase.from("supplies").insert(
      DEFAULT_CLEANING_SUPPLIES.map((s) => ({
        owner_id: ownerId,
        category_id: cleaningId,
        name: s.name,
        unit: s.unit,
        reorder_days: s.reorder_days,
      })),
    );
  }
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.floor(
    (new Date(bIso).getTime() - new Date(aIso).getTime()) / (24 * 3600 * 1000),
  );
}
