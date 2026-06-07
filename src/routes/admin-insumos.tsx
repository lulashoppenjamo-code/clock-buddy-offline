import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Loader2,
  Check,
  X,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Plus,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { REASONS } from "@/lib/supplies";

import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import {
  BRANCHES,
  branchName,
  ensureCatalogSeeded,
  reasonLabel,
  statusInfo,
  STATUSES,
  daysBetween,
  type Branch,
} from "@/lib/supplies";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/admin-insumos")({
  component: AdminInsumosRoute,
});

type Employee = { id: string; name: string };
type Category = { id: string; name: string; slug: string; active: boolean };
type Supply = {
  id: string;
  name: string;
  unit: string | null;
  category_id: string;
  reorder_days: number;
  stock_mina: number;
  stock_morelos: number;
  active: boolean;
};
type Request = {
  id: string;
  employee_id: string;
  branch: string;
  supply_id: string;
  quantity: number;
  reason: string;
  notes: string | null;
  status: string;
  requested_at: string;
  delivered_at: string | null;
};
type Movement = {
  id: string;
  supply_id: string;
  branch: string;
  type: string;
  quantity: number;
  notes: string | null;
  created_at: string;
};

function AdminInsumosRoute() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        navigate({ to: "/auth" });
        return;
      }
      setOwnerId(uid);
      setChecking(false);
    });
  }, [navigate]);
  if (checking || !ownerId) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <AdminGate ownerId={ownerId}>
      <AdminInsumosPage ownerId={ownerId} />
    </AdminGate>
  );
}

function AdminInsumosPage({ ownerId }: { ownerId: string }) {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    await ensureCatalogSeeded(ownerId);
    const [emps, cats, sups, reqs, movs] = await Promise.all([
      supabase
        .from("employees")
        .select("id,name")
        .eq("owner_id", ownerId)
        .order("name"),
      supabase
        .from("supply_categories")
        .select("id,name,slug,active")
        .eq("owner_id", ownerId)
        .order("name"),
      supabase
        .from("supplies")
        .select(
          "id,name,unit,category_id,reorder_days,stock_mina,stock_morelos,active",
        )
        .eq("owner_id", ownerId)
        .order("name"),
      supabase
        .from("supply_requests")
        .select(
          "id,employee_id,branch,supply_id,quantity,reason,notes,status,requested_at,delivered_at",
        )
        .eq("owner_id", ownerId)
        .order("requested_at", { ascending: false })
        .limit(1000),
      supabase
        .from("supply_movements")
        .select("id,supply_id,branch,type,quantity,notes,created_at")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    setEmployees(emps.data ?? []);
    setCategories((cats.data ?? []) as Category[]);
    setSupplies((sups.data ?? []) as Supply[]);
    setRequests((reqs.data ?? []) as Request[]);
    setMovements((movs.data ?? []) as Movement[]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-supply-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supply_requests" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supply_movements" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/admin" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold">Insumos</h1>
        <div className="w-12" />
      </header>

      <div className="max-w-3xl mx-auto p-4">
        <Tabs defaultValue="dashboard">
          <TabsList className="w-full overflow-x-auto">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="requests">Solicitudes</TabsTrigger>
            <TabsTrigger value="inventory">Inventario</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
            <TabsTrigger value="catalog">Catálogo</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard
              requests={requests}
              supplies={supplies}
              employees={employees}
            />
          </TabsContent>
          <TabsContent value="requests">
            <RequestsTab
              ownerId={ownerId}
              requests={requests}
              supplies={supplies}
              employees={employees}
              onChange={load}
            />
          </TabsContent>
          <TabsContent value="inventory">
            <InventoryTab
              ownerId={ownerId}
              supplies={supplies}
              movements={movements}
              onChange={load}
            />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab
              requests={requests}
              supplies={supplies}
              employees={employees}
            />
          </TabsContent>
          <TabsContent value="catalog">
            <CatalogTab
              ownerId={ownerId}
              categories={categories}
              supplies={supplies}
              onChange={load}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ---------- DASHBOARD ---------- */
function Dashboard({
  requests,
  supplies,
  employees,
}: {
  requests: Request[];
  supplies: Supply[];
  employees: Employee[];
}) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      pendiente: 0,
      aprobada: 0,
      entregada: 0,
      rechazada: 0,
    };
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  const topProducts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of requests) map[r.supply_id] = (map[r.supply_id] ?? 0) + Number(r.quantity);
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, qty]) => ({
        name: supplies.find((s) => s.id === id)?.name ?? "—",
        qty,
      }));
  }, [requests, supplies]);

  const byBranchMonth = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const acc: Record<string, number> = { mina: 0, morelos: 0 };
    for (const r of requests) {
      if (r.requested_at.slice(0, 7) !== ym) continue;
      acc[r.branch] = (acc[r.branch] ?? 0) + Number(r.quantity);
    }
    return acc;
  }, [requests]);

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 gap-2">
        {STATUSES.map((s) => (
          <Card key={s.id} className="p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p
              className="text-2xl font-bold"
              style={{ color: s.color }}
            >
              {counts[s.id] ?? 0}
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <h3 className="font-semibold text-sm mb-2">Más solicitados</h3>
        {topProducts.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin datos</p>
        )}
        <ul className="space-y-1 text-sm">
          {topProducts.map((p) => (
            <li key={p.name} className="flex justify-between">
              <span>{p.name}</span>
              <span className="tabular-nums font-medium">{p.qty}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-3">
        <h3 className="font-semibold text-sm mb-2">Consumo del mes por sucursal</h3>
        <div className="grid grid-cols-2 gap-2">
          {BRANCHES.map((b) => (
            <div key={b.id} className="p-3 rounded-lg bg-white border">
              <p className="text-xs text-muted-foreground">{b.name}</p>
              <p className="text-xl font-bold tabular-nums">
                {byBranchMonth[b.id] ?? 0}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- REQUESTS ---------- */
function RequestsTab({
  ownerId,
  requests,
  supplies,
  employees,
  onChange,
}: {
  ownerId: string;
  requests: Request[];
  supplies: Supply[];
  employees: Employee[];
  onChange: () => void;
}) {
  const [branch, setBranch] = useState<string>("all");
  const [empF, setEmpF] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (branch !== "all" && r.branch !== branch) return false;
      if (empF !== "all" && r.employee_id !== empF) return false;
      if (status !== "all" && r.status !== status) return false;
      if (from && r.requested_at < from) return false;
      if (to && r.requested_at > to + "T23:59:59") return false;
      return true;
    });
  }, [requests, branch, empF, status, from, to]);

  function lastApprovedForSupply(supplyId: string, branchKey: string) {
    return requests.find(
      (x) =>
        x.supply_id === supplyId &&
        x.branch === branchKey &&
        (x.status === "aprobada" || x.status === "entregada"),
    );
  }

  async function decide(r: Request, next: "aprobada" | "rechazada") {
    setBusyId(r.id);
    try {
      const patch: Record<string, unknown> = {
        status: next,
        decided_at: new Date().toISOString(),
        decided_by: ownerId,
      };
      const { error } = await supabase
        .from("supply_requests")
        .update(patch)
        .eq("id", r.id);
      if (error) throw error;

      if (next === "aprobada") {
        const sup = supplies.find((s) => s.id === r.supply_id);
        if (sup) {
          const stockField =
            r.branch === "mina" ? "stock_mina" : "stock_morelos";
          const current =
            r.branch === "mina" ? sup.stock_mina : sup.stock_morelos;
          await supabase
            .from("supplies")
            .update({
              [stockField]: Number(current) + Number(r.quantity),
            })
            .eq("id", sup.id);
          await supabase.from("supply_movements").insert({
            owner_id: ownerId,
            supply_id: sup.id,
            branch: r.branch,
            type: "entrada",
            quantity: r.quantity,
            request_id: r.id,
            notes: "Autorizada — suma a inventario",
            created_by: ownerId,
          });
        }
      }
      toast.success("Actualizada");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusyId(null);
    }
  }

  const [editing, setEditing] = useState<Request | null>(null);


  function exportExcel() {
    const rows = filtered.map((r) => {
      const sup = supplies.find((s) => s.id === r.supply_id);
      const emp = employees.find((e) => e.id === r.employee_id);
      return {
        Fecha: new Date(r.requested_at).toLocaleString("es-MX"),
        Empleada: emp?.name ?? "",
        Sucursal: branchName(r.branch),
        Producto: sup?.name ?? "",
        Cantidad: r.quantity,
        Motivo: reasonLabel(r.reason),
        Observaciones: r.notes ?? "",
        Estado: statusInfo(r.status).label,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
    XLSX.writeFile(wb, `insumos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Solicitudes de Insumos", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Fecha", "Empleada", "Sucursal", "Producto", "Cant", "Estado"]],
      body: filtered.map((r) => {
        const sup = supplies.find((s) => s.id === r.supply_id);
        const emp = employees.find((e) => e.id === r.employee_id);
        return [
          new Date(r.requested_at).toLocaleString("es-MX"),
          emp?.name ?? "",
          branchName(r.branch),
          sup?.name ?? "",
          String(r.quantity),
          statusInfo(r.status).label,
        ];
      }),
      styles: { fontSize: 8 },
    });
    doc.save(`insumos-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-3 mt-3">
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger>
              <SelectValue placeholder="Sucursal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {BRANCHES.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={empF} onValueChange={setEmpF}>
            <SelectTrigger>
              <SelectValue placeholder="Empleada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-1">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={exportExcel}
            disabled={filtered.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={exportPDF}
            disabled={filtered.length === 0}
          >
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </Card>

      <Card className="divide-y overflow-hidden">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground p-6">
            Sin solicitudes
          </p>
        )}
        {filtered.map((r) => {
          const sup = supplies.find((s) => s.id === r.supply_id);
          const emp = employees.find((e) => e.id === r.employee_id);
          const s = statusInfo(r.status);
          const last = lastApprovedForSupply(r.supply_id, r.branch);
          const tooSoon =
            sup &&
            last &&
            last.id !== r.id &&
            daysBetween(last.requested_at, r.requested_at) < sup.reorder_days;
          return (
            <div key={r.id} className="p-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {sup?.name ?? "—"} · {r.quantity}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {emp?.name} · {branchName(r.branch)} ·{" "}
                    {new Date(r.requested_at).toLocaleString("es-MX")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Motivo: {reasonLabel(r.reason)}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </p>
                </div>
                <span
                  className="px-2 py-0.5 rounded-full text-xs text-white shrink-0"
                  style={{ backgroundColor: s.color }}
                >
                  {s.label}
                </span>
              </div>
              {tooSoon && (
                <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    El último pedido de {sup?.name} fue hace{" "}
                    {daysBetween(last!.requested_at, r.requested_at)} día(s).
                    Verifique antes de aprobar.
                  </p>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {r.status === "pendiente" && (
                  <>
                    <Button
                      size="sm"
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      onClick={() => decide(r, "aprobada")}
                      disabled={busyId === r.id}
                    >
                      <Check className="h-4 w-4" /> Autorizar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => decide(r, "rechazada")}
                      disabled={busyId === r.id}
                    >
                      <X className="h-4 w-4" /> Rechazar
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(r)}
                  disabled={busyId === r.id}
                >
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      <EditRequestDialog
        request={editing}
        supplies={supplies}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChange();
        }}
      />

    </div>
  );
}

/* ---------- INVENTORY ---------- */
function InventoryTab({
  ownerId,
  supplies,
  movements,
  onChange,
}: {
  ownerId: string;
  supplies: Supply[];
  movements: Movement[];
  onChange: () => void;
}) {
  const [supplyId, setSupplyId] = useState("");
  const [branch, setBranch] = useState<Branch>("mina");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function addEntry() {
    const sup = supplies.find((s) => s.id === supplyId);
    const q = Number(qty);
    if (!sup || !Number.isFinite(q) || q <= 0) {
      toast.error("Datos inválidos");
      return;
    }
    setBusy(true);
    try {
      const field = branch === "mina" ? "stock_mina" : "stock_morelos";
      const cur = branch === "mina" ? sup.stock_mina : sup.stock_morelos;
      await supabase
        .from("supplies")
        .update({ [field]: Number(cur) + q })
        .eq("id", sup.id);
      await supabase.from("supply_movements").insert({
        owner_id: ownerId,
        supply_id: sup.id,
        branch,
        type: "entrada",
        quantity: q,
        notes: notes || null,
        created_by: ownerId,
      });
      toast.success("Entrada registrada");
      setQty("1");
      setNotes("");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 mt-3">
      <Card className="p-3 space-y-2">
        <h3 className="font-semibold text-sm">Registrar entrada</h3>
        <Select value={supplyId} onValueChange={setSupplyId}>
          <SelectTrigger>
            <SelectValue placeholder="Producto" />
          </SelectTrigger>
          <SelectContent>
            {supplies.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Select value={branch} onValueChange={(v) => setBranch(v as Branch)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRANCHES.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <Textarea
          rows={2}
          placeholder="Notas (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <Button
          className="w-full"
          onClick={addEntry}
          disabled={busy || !supplyId}
        >
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </Card>

      <Card className="p-3">
        <h3 className="font-semibold text-sm mb-2">Stock actual</h3>
        <ul className="divide-y">
          {supplies.map((s) => (
            <li key={s.id} className="py-2 text-sm grid grid-cols-3 gap-2">
              <span className="col-span-1 truncate">{s.name}</span>
              <span className="text-xs text-right">
                Mina:{" "}
                <span className="font-medium tabular-nums">
                  {s.stock_mina}
                </span>
              </span>
              <span className="text-xs text-right">
                Morelos:{" "}
                <span className="font-medium tabular-nums">
                  {s.stock_morelos}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-3">
        <h3 className="font-semibold text-sm mb-2">Movimientos recientes</h3>
        <ul className="divide-y text-sm">
          {movements.slice(0, 30).map((m) => {
            const sup = supplies.find((s) => s.id === m.supply_id);
            return (
              <li
                key={m.id}
                className="py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span
                      className={
                        m.type === "entrada"
                          ? "text-green-600 font-medium"
                          : "text-red-600 font-medium"
                      }
                    >
                      {m.type === "entrada" ? "+" : "−"}
                      {m.quantity}
                    </span>{" "}
                    {sup?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {branchName(m.branch)} ·{" "}
                    {new Date(m.created_at).toLocaleString("es-MX")}
                  </p>
                </div>
              </li>
            );
          })}
          {movements.length === 0 && (
            <li className="text-xs text-muted-foreground py-2">Sin movimientos</li>
          )}
        </ul>
      </Card>
    </div>
  );
}

/* ---------- HISTORY ---------- */
function HistoryTab({
  requests,
  supplies,
  employees,
}: {
  requests: Request[];
  supplies: Supply[];
  employees: Employee[];
}) {
  const perSupply = useMemo(() => {
    return supplies.map((s) => {
      const list = requests.filter((r) => r.supply_id === s.id);
      const last = list[0];
      const totalThisMonth = list
        .filter(
          (r) =>
            r.requested_at.slice(0, 7) === new Date().toISOString().slice(0, 7),
        )
        .reduce((a, r) => a + Number(r.quantity), 0);

      // Frecuencia: días promedio entre solicitudes consecutivas
      let avgDays = 0;
      if (list.length >= 2) {
        const sorted = list
          .map((r) => new Date(r.requested_at).getTime())
          .sort((a, b) => a - b);
        let total = 0;
        for (let i = 1; i < sorted.length; i++)
          total += (sorted[i] - sorted[i - 1]) / (24 * 3600 * 1000);
        avgDays = Math.round(total / (sorted.length - 1));
      }

      const empCount: Record<string, number> = {};
      for (const r of list)
        empCount[r.employee_id] =
          (empCount[r.employee_id] ?? 0) + Number(r.quantity);
      const topEmpId = Object.entries(empCount).sort((a, b) => b[1] - a[1])[0]?.[0];

      const branchCount: Record<string, number> = {};
      for (const r of list)
        branchCount[r.branch] = (branchCount[r.branch] ?? 0) + Number(r.quantity);
      const topBranch = Object.entries(branchCount).sort((a, b) => b[1] - a[1])[0]?.[0];

      return {
        supply: s,
        last,
        totalThisMonth,
        avgDays,
        topEmpName: employees.find((e) => e.id === topEmpId)?.name ?? "—",
        topBranchName: topBranch ? branchName(topBranch) : "—",
        count: list.length,
      };
    });
  }, [requests, supplies, employees]);

  return (
    <div className="space-y-2 mt-3">
      {perSupply.map((row) => (
        <Card key={row.supply.id} className="p-3 space-y-1 text-sm">
          <p className="font-medium">{row.supply.name}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <p>
              Último:{" "}
              {row.last
                ? new Date(row.last.requested_at).toLocaleDateString("es-MX")
                : "—"}
            </p>
            <p>Total mes: {row.totalThisMonth}</p>
            <p>
              Frecuencia: {row.avgDays > 0 ? `cada ${row.avgDays} días` : "—"}
            </p>
            <p>Solicitudes: {row.count}</p>
            <p>Top empleada: {row.topEmpName}</p>
            <p>Top sucursal: {row.topBranchName}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------- CATALOG ---------- */
function CatalogTab({
  ownerId,
  categories,
  supplies,
  onChange,
}: {
  ownerId: string;
  categories: Category[];
  supplies: Supply[];
  onChange: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState<string>("");
  const [newUnit, setNewUnit] = useState("pieza");
  const [newReorder, setNewReorder] = useState("14");

  useEffect(() => {
    if (!newCat && categories.length) {
      const def = categories.find((c) => c.slug === "limpieza") ?? categories[0];
      setNewCat(def.id);
    }
  }, [categories, newCat]);

  async function addSupply() {
    if (!newName.trim() || !newCat) return;
    const { error } = await supabase.from("supplies").insert({
      owner_id: ownerId,
      category_id: newCat,
      name: newName.trim(),
      unit: newUnit || null,
      reorder_days: Math.max(1, Number(newReorder) || 14),
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Producto agregado");
      setNewName("");
      onChange();
    }
  }

  async function toggleActive(s: Supply) {
    await supabase.from("supplies").update({ active: !s.active }).eq("id", s.id);
    onChange();
  }

  async function toggleCategoryActive(c: Category) {
    await supabase
      .from("supply_categories")
      .update({ active: !c.active })
      .eq("id", c.id);
    onChange();
  }

  return (
    <div className="space-y-3 mt-3">
      <Card className="p-3 space-y-2">
        <h3 className="font-semibold text-sm">Nuevo producto</h3>
        <Input
          placeholder="Nombre"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <div className="grid grid-cols-3 gap-2">
          <Select value={newCat} onValueChange={setNewCat}>
            <SelectTrigger>
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Unidad"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Días repo."
            value={newReorder}
            onChange={(e) => setNewReorder(e.target.value)}
          />
        </div>
        <Button className="w-full" onClick={addSupply}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </Card>

      <Card className="p-3">
        <h3 className="font-semibold text-sm mb-2">Categorías</h3>
        <ul className="divide-y text-sm">
          {categories.map((c) => (
            <li key={c.id} className="py-2 flex items-center justify-between">
              <span className={c.active ? "" : "text-muted-foreground"}>
                {c.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleCategoryActive(c)}
              >
                {c.active ? "Activa" : "Inactiva"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-3">
        <h3 className="font-semibold text-sm mb-2">Productos</h3>
        <ul className="divide-y text-sm">
          {supplies.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={s.active ? "" : "text-muted-foreground"}>
                  {s.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.unit ?? "—"} · cada {s.reorder_days} días
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => toggleActive(s)}>
                {s.active ? "Activo" : "Inactivo"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
