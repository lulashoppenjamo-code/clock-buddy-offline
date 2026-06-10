import { supabase } from "@/integrations/supabase/client";

export const BRANCHES = ["Mina", "Morelos"] as const;
export type Branch = (typeof BRANCHES)[number];

export type Product = {
  id: string;
  internal_code: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  brand: string | null;
  unit: string | null;
  cost: number;
  price: number;
  stock_min: number;
  stock_max: number;
  supplier_id: string | null;
  photo_path: string | null;
  active: boolean;
};

export type MovementType =
  | "entrada"
  | "salida"
  | "ajuste"
  | "consumo"
  | "traspaso_out"
  | "traspaso_in"
  | "correccion";

export async function findProductByCode(ownerId: string, code: string) {
  const q = code.trim();
  if (!q) return null;
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("owner_id", ownerId)
    .or(`internal_code.eq.${q},barcode.eq.${q}`)
    .maybeSingle();
  return data as Product | null;
}

export async function searchProducts(ownerId: string, term: string) {
  const t = term.trim();
  let q = supabase
    .from("products")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .order("name")
    .limit(50);
  if (t) q = q.or(`name.ilike.%${t}%,internal_code.ilike.%${t}%,barcode.ilike.%${t}%,brand.ilike.%${t}%`);
  const { data } = await q;
  return (data ?? []) as Product[];
}

export async function getStock(productId: string, branch: Branch) {
  const { data } = await supabase
    .from("inventory_stock")
    .select("quantity")
    .eq("product_id", productId)
    .eq("branch", branch)
    .maybeSingle();
  return Number(data?.quantity ?? 0);
}

export async function registerMovement(args: {
  ownerId: string;
  productId: string;
  branch: Branch;
  type: MovementType;
  quantity: number;
  reason?: string;
  area?: string;
  employeeId?: string | null;
  authorizedBy?: string | null;
  transferId?: string | null;
  deviceLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const { error } = await supabase.from("inventory_movements").insert({
    owner_id: args.ownerId,
    product_id: args.productId,
    branch: args.branch,
    type: args.type,
    quantity: args.quantity,
    reason: args.reason ?? null,
    area: args.area ?? null,
    employee_id: args.employeeId ?? null,
    authorized_by: args.authorizedBy ?? null,
    transfer_id: args.transferId ?? null,
    device_label: args.deviceLabel ?? null,
    latitude: args.latitude ?? null,
    longitude: args.longitude ?? null,
  });
  if (error) throw error;
}

export function totalValue(stocks: { quantity: number; cost: number }[]) {
  return stocks.reduce((s, r) => s + r.quantity * r.cost, 0);
}
