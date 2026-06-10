import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Lock, Plus, Pencil, Trash2, Download, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { lock } from "@/lib/admin-lock";
import { BRANCHES, type Branch, type Product, registerMovement } from "@/lib/inventory";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

export const Route = createFileRoute("/admin-inventario")({
  component: AdminInventarioRoute,
});

function AdminInventarioRoute() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) { navigate({ to: "/auth" }); return; }
      setOwnerId(uid);
    });
  }, [navigate]);
  if (!ownerId) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  return <AdminGate ownerId={ownerId}><Page ownerId={ownerId} /></AdminGate>;
}

type Category = { id: string; name: string; slug: string; active: boolean };
type Supplier = { id: string; name: string; phone: string | null; email: string | null; active: boolean };
type Stock = { product_id: string; branch: string; quantity: number };
type Movement = {
  id: string;
  product_id: string;
  branch: string;
  type: string;
  quantity: number;
  qty_before: number;
  qty_after: number;
  reason: string | null;
  area: string | null;
  employee_id: string | null;
  created_at: string;
};
type Alert = {
  id: string;
  kind: string;
  product_id: string | null;
  branch: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
};

function Page({ ownerId }: { ownerId: string }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [p, c, s, st, mv, al, em] = await Promise.all([
      supabase.from("products").select("*").eq("owner_id", ownerId).order("name"),
      supabase.from("product_categories").select("*").eq("owner_id", ownerId).order("name"),
      supabase.from("suppliers").select("*").eq("owner_id", ownerId).order("name"),
      supabase.from("inventory_stock").select("product_id,branch,quantity").eq("owner_id", ownerId),
      supabase.from("inventory_movements").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(500),
      supabase.from("inventory_alerts").select("*").eq("owner_id", ownerId).is("read_at", null).order("created_at", { ascending: false }).limit(50),
      supabase.from("employees").select("id,name").eq("owner_id", ownerId),
    ]);
    setProducts((p.data ?? []) as Product[]);
    setCategories((c.data ?? []) as Category[]);
    setSuppliers((s.data ?? []) as Supplier[]);
    setStocks((st.data ?? []) as Stock[]);
    setMovements((mv.data ?? []) as Movement[]);
    setAlerts((al.data ?? []) as Alert[]);
    setEmployees((em.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const ch = supabase.channel("inv-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_stock" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_movements" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_alerts" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const stockMap = useMemo(() => {
    const m = new Map<string, { Mina: number; Morelos: number }>();
    for (const s of stocks) {
      const row = m.get(s.product_id) ?? { Mina: 0, Morelos: 0 };
      if (s.branch === "Mina") row.Mina = Number(s.quantity);
      if (s.branch === "Morelos") row.Morelos = Number(s.quantity);
      m.set(s.product_id, row);
    }
    return m;
  }, [stocks]);

  const totalValue = useMemo(() => {
    let v = 0;
    for (const p of products) {
      const s = stockMap.get(p.id) ?? { Mina: 0, Morelos: 0 };
      v += (s.Mina + s.Morelos) * Number(p.cost);
    }
    return v;
  }, [products, stockMap]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  function lockAdmin() { lock(); navigate({ to: "/" }); }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/admin" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold">Inventario</h1>
        <button onClick={lockAdmin} className="text-muted-foreground p-1"><Lock className="h-4 w-4" /></button>
      </header>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Productos" value={products.length} />
          <Kpi label="Valor total" value={`$${totalValue.toFixed(0)}`} />
          <Kpi label="Agotados" value={products.filter(p => {
            const s = stockMap.get(p.id); return s ? (s.Mina + s.Morelos) <= 0 : true;
          }).length} />
          <Kpi label="Stock bajo" value={products.filter(p => {
            const s = stockMap.get(p.id); const t = s ? s.Mina + s.Morelos : 0;
            return t > 0 && t <= p.stock_min;
          }).length} />
        </div>

        <Tabs defaultValue="stock">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="stock">Existencias</TabsTrigger>
            <TabsTrigger value="catalog">Catálogo</TabsTrigger>
            <TabsTrigger value="movements">Movimientos</TabsTrigger>
            <TabsTrigger value="alerts">
              Alertas {alerts.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full">{alerts.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
          </TabsList>

          <TabsContent value="stock">
            <StockTab ownerId={ownerId} products={products} stockMap={stockMap} employees={employees} refresh={refresh} />
          </TabsContent>
          <TabsContent value="catalog">
            <CatalogTab ownerId={ownerId} products={products} categories={categories} suppliers={suppliers} refresh={refresh} />
          </TabsContent>
          <TabsContent value="movements">
            <MovementsTab products={products} employees={employees} movements={movements} />
          </TabsContent>
          <TabsContent value="alerts">
            <AlertsTab alerts={alerts} products={products} refresh={refresh} />
          </TabsContent>
          <TabsContent value="config">
            <ConfigTab ownerId={ownerId} categories={categories} suppliers={suppliers} refresh={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

function StockTab({
  ownerId, products, stockMap, employees, refresh,
}: {
  ownerId: string; products: Product[]; stockMap: Map<string, { Mina: number; Morelos: number }>;
  employees: { id: string; name: string }[]; refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [adjOpen, setAdjOpen] = useState<Product | null>(null);
  const [adjBranch, setAdjBranch] = useState<Branch>("Mina");
  const [adjType, setAdjType] = useState<"entrada" | "salida" | "ajuste">("entrada");
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("");

  const filtered = products.filter((p) => {
    const t = search.toLowerCase();
    return !t || p.name.toLowerCase().includes(t) || p.internal_code.toLowerCase().includes(t) || (p.barcode ?? "").includes(t);
  });

  async function submit() {
    if (!adjOpen) return;
    const n = Number(adjQty);
    if (!Number.isFinite(n) || n === 0) return toast.error("Cantidad inválida");
    try {
      await registerMovement({
        ownerId, productId: adjOpen.id, branch: adjBranch, type: adjType, quantity: n, reason: adjReason || "Ajuste admin",
      });
      toast.success("Aplicado");
      setAdjOpen(null); setAdjQty(""); setAdjReason("");
      refresh();
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  function exportExcel() {
    const rows = filtered.map((p) => {
      const s = stockMap.get(p.id) ?? { Mina: 0, Morelos: 0 };
      return {
        Código: p.internal_code, "Código de barras": p.barcode ?? "", Nombre: p.name,
        Marca: p.brand ?? "", Unidad: p.unit ?? "", Costo: p.cost, Precio: p.price,
        "Stock Mina": s.Mina, "Stock Morelos": s.Morelos, Total: s.Mina + s.Morelos,
        "Stock mín": p.stock_min,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Existencias");
    XLSX.writeFile(wb, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.text("Reporte de Inventario", 14, 14);
    let y = 24;
    doc.setFontSize(8);
    doc.text("Producto", 14, y); doc.text("Mina", 110, y); doc.text("Morelos", 135, y); doc.text("Total", 165, y);
    y += 4;
    for (const p of filtered) {
      const s = stockMap.get(p.id) ?? { Mina: 0, Morelos: 0 };
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(p.name.slice(0, 60), 14, y);
      doc.text(String(s.Mina), 110, y);
      doc.text(String(s.Morelos), 135, y);
      doc.text(String(s.Mina + s.Morelos), 165, y);
      y += 5;
    }
    doc.save(`inventario-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-40" />
        <Button variant="outline" onClick={exportExcel}><Download className="h-4 w-4 mr-1" /> Excel</Button>
        <Button variant="outline" onClick={exportPDF}><Download className="h-4 w-4 mr-1" /> PDF</Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs">
              <tr>
                <th className="text-left p-2">Producto</th>
                <th className="text-right p-2">Mina</th>
                <th className="text-right p-2">Morelos</th>
                <th className="text-right p-2">Total</th>
                <th className="text-right p-2">Mín</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const s = stockMap.get(p.id) ?? { Mina: 0, Morelos: 0 };
                const total = s.Mina + s.Morelos;
                const low = total <= p.stock_min;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.internal_code}{p.barcode && ` · ${p.barcode}`}</p>
                    </td>
                    <td className="text-right p-2 tabular-nums">{s.Mina}</td>
                    <td className="text-right p-2 tabular-nums">{s.Morelos}</td>
                    <td className={`text-right p-2 tabular-nums font-semibold ${low ? "text-red-600" : ""}`}>{total}</td>
                    <td className="text-right p-2 tabular-nums text-xs text-muted-foreground">{p.stock_min}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setAdjOpen(p)}>Ajustar</Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin productos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!adjOpen} onOpenChange={(o) => !o && setAdjOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar: {adjOpen?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Sucursal</Label>
            <Select value={adjBranch} onValueChange={(v) => setAdjBranch(v as Branch)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
            <Label>Tipo</Label>
            <Select value={adjType} onValueChange={(v) => setAdjType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada (suma)</SelectItem>
                <SelectItem value="salida">Salida (resta)</SelectItem>
                <SelectItem value="ajuste">Ajuste (delta firmado: +/-)</SelectItem>
              </SelectContent>
            </Select>
            <Label>Cantidad {adjType === "ajuste" && "(usa - para restar)"}</Label>
            <Input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} />
            <Label>Motivo</Label>
            <Textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} rows={2} />
          </div>
          <DialogFooter><Button onClick={submit}>Aplicar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogTab({
  ownerId, products, categories, suppliers, refresh,
}: {
  ownerId: string; products: Product[]; categories: Category[]; suppliers: Supplier[]; refresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Product | null>(null);
  const [form, setForm] = useState<any>({});

  function startNew() {
    setEdit(null);
    setForm({
      internal_code: "", barcode: "", name: "", description: "",
      category_id: null, brand: "", unit: "pza",
      cost: 0, price: 0, stock_min: 0, stock_max: 0,
      supplier_id: null, active: true,
    });
    setOpen(true);
  }
  function startEdit(p: Product) {
    setEdit(p);
    setForm({ ...p });
    setOpen(true);
  }
  async function save() {
    if (!form.internal_code || !form.name) return toast.error("Código y nombre son obligatorios");
    const payload = {
      ...form,
      cost: Number(form.cost) || 0, price: Number(form.price) || 0,
      stock_min: Number(form.stock_min) || 0, stock_max: Number(form.stock_max) || 0,
      barcode: form.barcode || null,
      owner_id: ownerId,
    };
    if (edit) {
      const { error } = await supabase.from("products").update(payload).eq("id", edit.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Guardado");
    setOpen(false);
    refresh();
  }
  async function del(p: Product) {
    if (!confirm(`¿Eliminar ${p.name}?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    refresh();
  }

  function exportCatalog() {
    const rows = products.map((p) => ({
      internal_code: p.internal_code, barcode: p.barcode ?? "", name: p.name,
      description: p.description ?? "", brand: p.brand ?? "", unit: p.unit ?? "",
      cost: p.cost, price: p.price, stock_min: p.stock_min, stock_max: p.stock_max,
      active: p.active,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `catalogo-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      let ok = 0, fail = 0;
      for (const r of rows) {
        if (!r.internal_code || !r.name) { fail++; continue; }
        const payload = {
          owner_id: ownerId,
          internal_code: String(r.internal_code),
          barcode: r.barcode ? String(r.barcode) : null,
          name: String(r.name),
          description: r.description ? String(r.description) : null,
          brand: r.brand ? String(r.brand) : null,
          unit: r.unit ? String(r.unit) : "pza",
          cost: Number(r.cost) || 0,
          price: Number(r.price) || 0,
          stock_min: Number(r.stock_min) || 0,
          stock_max: Number(r.stock_max) || 0,
          active: r.active !== false,
        };
        const { error } = await supabase.from("products").upsert(payload, { onConflict: "internal_code" });
        if (error) fail++; else ok++;
      }
      toast.success(`Importados: ${ok}. Errores: ${fail}`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error de importación");
    }
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="flex gap-2 flex-wrap">
        <Button onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Nuevo producto</Button>
        <Button variant="outline" onClick={exportCatalog}><Download className="h-4 w-4 mr-1" /> Exportar</Button>
        <label className="inline-flex">
          <Button variant="outline" asChild><span><Upload className="h-4 w-4 mr-1" /> Importar Excel/CSV</span></Button>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} />
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs">
              <tr>
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Nombre</th>
                <th className="text-left p-2">Categoría</th>
                <th className="text-right p-2">Costo</th>
                <th className="text-right p-2">Precio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 text-xs">{p.internal_code}<br /><span className="text-muted-foreground">{p.barcode}</span></td>
                  <td className="p-2">{p.name}</td>
                  <td className="p-2 text-xs text-muted-foreground">{categories.find(c => c.id === p.category_id)?.name ?? "—"}</td>
                  <td className="text-right p-2 tabular-nums">${Number(p.cost).toFixed(2)}</td>
                  <td className="text-right p-2 tabular-nums">${Number(p.price).toFixed(2)}</td>
                  <td className="p-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => del(p)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin productos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit ? "Editar producto" : "Nuevo producto"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Código interno *</Label><Input value={form.internal_code ?? ""} onChange={(e) => setForm({ ...form, internal_code: e.target.value })} /></div>
            <div><Label>Código de barras</Label><Input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
            <div className="col-span-2"><Label>Nombre *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Descripción</Label><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <Label>Categoría</Label>
              <Select value={form.category_id ?? "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Ninguna —</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Proveedor</Label>
              <Select value={form.supplier_id ?? "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Ninguno —</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Marca</Label><Input value={form.brand ?? ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div><Label>Unidad</Label><Input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pza, kg, l" /></div>
            <div><Label>Costo</Label><Input type="number" step="0.01" value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
            <div><Label>Precio</Label><Input type="number" step="0.01" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><Label>Stock mín</Label><Input type="number" value={form.stock_min ?? 0} onChange={(e) => setForm({ ...form, stock_min: e.target.value })} /></div>
            <div><Label>Stock máx</Label><Input type="number" value={form.stock_max ?? 0} onChange={(e) => setForm({ ...form, stock_max: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovementsTab({
  products, employees, movements,
}: { products: Product[]; employees: { id: string; name: string }[]; movements: Movement[] }) {
  const pMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const eMap = useMemo(() => new Map(employees.map(e => [e.id, e.name])), [employees]);

  function exportExcel() {
    const rows = movements.map((m) => ({
      Fecha: new Date(m.created_at).toLocaleString("es-MX"),
      Producto: pMap.get(m.product_id)?.name ?? m.product_id,
      Sucursal: m.branch, Tipo: m.type,
      Cantidad: m.quantity, Antes: m.qty_before, Después: m.qty_after,
      Colaborador: m.employee_id ? (eMap.get(m.employee_id) ?? "") : "",
      Área: m.area ?? "", Motivo: m.reason ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `movimientos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="flex gap-2"><Button variant="outline" onClick={exportExcel}><Download className="h-4 w-4 mr-1" /> Exportar Excel</Button></div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">Fecha</th>
                <th className="text-left p-2">Producto</th>
                <th className="text-left p-2">Suc.</th>
                <th className="text-left p-2">Tipo</th>
                <th className="text-right p-2">Cant.</th>
                <th className="text-right p-2">Antes→Después</th>
                <th className="text-left p-2">Quién</th>
                <th className="text-left p-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{new Date(m.created_at).toLocaleString("es-MX")}</td>
                  <td className="p-2">{pMap.get(m.product_id)?.name ?? "—"}</td>
                  <td className="p-2">{m.branch}</td>
                  <td className="p-2">{m.type}</td>
                  <td className="text-right p-2 tabular-nums">{m.quantity}</td>
                  <td className="text-right p-2 tabular-nums text-muted-foreground">{m.qty_before}→{m.qty_after}</td>
                  <td className="p-2">{m.employee_id ? eMap.get(m.employee_id) : "—"}</td>
                  <td className="p-2">{m.area ? `[${m.area}] ` : ""}{m.reason}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sin movimientos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AlertsTab({ alerts, products, refresh }: { alerts: Alert[]; products: Product[]; refresh: () => void }) {
  const pMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  async function markRead(id: string) {
    await supabase.from("inventory_alerts").update({ read_at: new Date().toISOString() }).eq("id", id);
    refresh();
  }
  async function markAll() {
    await supabase.from("inventory_alerts").update({ read_at: new Date().toISOString() }).is("read_at", null);
    refresh();
  }
  return (
    <div className="space-y-3 mt-3">
      {alerts.length > 0 && <Button variant="outline" onClick={markAll}>Marcar todas como leídas</Button>}
      <Card className="divide-y">
        {alerts.length === 0 && <p className="p-6 text-center text-muted-foreground text-sm">Sin alertas</p>}
        {alerts.map((a) => (
          <div key={a.id} className="p-3 flex items-start gap-2">
            <AlertTriangle className={`h-4 w-4 mt-0.5 ${a.kind === "agotado" ? "text-red-500" : "text-amber-500"}`} />
            <div className="flex-1 text-sm">
              <p className="font-medium">{a.message}</p>
              <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("es-MX")}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => markRead(a.id)}>OK</Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ConfigTab({
  ownerId, categories, suppliers, refresh,
}: { ownerId: string; categories: Category[]; suppliers: Supplier[]; refresh: () => void }) {
  const [catName, setCatName] = useState("");
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");

  async function addCat() {
    if (!catName.trim()) return;
    const slug = catName.toLowerCase().replace(/\s+/g, "-");
    const { error } = await supabase.from("product_categories").insert({ name: catName, slug, owner_id: ownerId });
    if (error) return toast.error(error.message);
    setCatName(""); refresh();
  }
  async function delCat(id: string) {
    if (!confirm("¿Eliminar categoría?")) return;
    await supabase.from("product_categories").delete().eq("id", id);
    refresh();
  }
  async function addSup() {
    if (!supName.trim()) return;
    const { error } = await supabase.from("suppliers").insert({ name: supName, phone: supPhone || null, owner_id: ownerId });
    if (error) return toast.error(error.message);
    setSupName(""); setSupPhone(""); refresh();
  }
  async function delSup(id: string) {
    if (!confirm("¿Eliminar proveedor?")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    refresh();
  }

  return (
    <div className="grid md:grid-cols-2 gap-4 mt-3">
      <Card className="p-3 space-y-2">
        <h3 className="font-semibold">Categorías</h3>
        <div className="flex gap-2">
          <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Nombre" />
          <Button onClick={addCat}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm border rounded p-2">
              <span>{c.name}</span>
              <Button size="sm" variant="ghost" onClick={() => delCat(c.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-3 space-y-2">
        <h3 className="font-semibold">Proveedores</h3>
        <Input value={supName} onChange={(e) => setSupName(e.target.value)} placeholder="Nombre" />
        <div className="flex gap-2">
          <Input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} placeholder="Teléfono" />
          <Button onClick={addSup}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1">
          {suppliers.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm border rounded p-2">
              <div><p>{s.name}</p><p className="text-xs text-muted-foreground">{s.phone}</p></div>
              <Button size="sm" variant="ghost" onClick={() => delSup(s.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
