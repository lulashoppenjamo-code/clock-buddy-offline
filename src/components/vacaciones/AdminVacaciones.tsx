import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, X, Download, Loader2, Trash2, Edit2, Plus } from "lucide-react";
import {
  computeBalance,
  daysBetween,
  yearsOfService,
  assignedDays,
  type Balance,
  type VacationRequest,
} from "@/lib/vacations";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Employee = {
  id: string;
  name: string;
  color: string;
  hire_date: string | null;
  branch: string | null;
};
export type AdminVacEmployee = Employee;

export function AdminVacaciones({ ownerId }: { ownerId: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: emps }, { data: reqs }] = await Promise.all([
      supabase
        .from("employees")
        .select("id,name,color,hire_date,branch")
        .eq("owner_id", ownerId)
        .order("name"),
      supabase
        .from("vacation_requests")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false }),
    ]);
    setEmployees((emps as any) ?? []);
    setRequests((reqs as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-vacaciones")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vacation_requests" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vacation_adjustments" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/admin" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold">🌴 Vacaciones</h1>
        <span />
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Tabs defaultValue="requests">
          <TabsList className="w-full overflow-auto">
            <TabsTrigger value="requests">Solicitudes</TabsTrigger>
            <TabsTrigger value="balances">Saldos</TabsTrigger>
            <TabsTrigger value="calendar">Calendario</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="pt-3">
            <RequestsTab
              ownerId={ownerId}
              employees={employees}
              requests={requests}
              reload={load}
            />
          </TabsContent>

          <TabsContent value="balances" className="pt-3">
            <BalancesTab ownerId={ownerId} employees={employees} reload={load} />
          </TabsContent>

          <TabsContent value="calendar" className="pt-3">
            <CalendarTab employees={employees} requests={requests} />
          </TabsContent>

          <TabsContent value="history" className="pt-3">
            <HistoryTab employees={employees} requests={requests} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function RequestsTab({
  ownerId,
  employees,
  requests,
  reload,
}: {
  ownerId: string;
  employees: Employee[];
  requests: VacationRequest[];
  reload: () => void;
}) {
  const [empFilter, setEmpFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<VacationRequest | null>(null);

  const empMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const emp = empMap.get(r.employee_id);
      if (empFilter !== "all" && r.employee_id !== empFilter) return false;
      if (branchFilter !== "all" && emp?.branch !== branchFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (from && r.end_date < from) return false;
      if (to && r.start_date > to) return false;
      return true;
    });
  }, [requests, empFilter, branchFilter, statusFilter, from, to, empMap]);

  async function decide(r: VacationRequest, status: "aprobada" | "rechazada") {
    let comment = "";
    if (status === "rechazada") {
      const c = window.prompt("Motivo del rechazo:");
      if (!c) return;
      comment = c;
    } else {
      const c = window.prompt("Comentario (opcional):", "");
      comment = c ?? "";
    }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("vacation_requests")
      .update({
        status,
        admin_comment: comment || null,
        decided_at: new Date().toISOString(),
        decided_by: u.user?.id ?? null,
      })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "aprobada" ? "Aprobada" : "Rechazada");
    reload();
  }

  async function remove(r: VacationRequest) {
    if (!confirm("¿Eliminar esta solicitud?")) return;
    const { error } = await supabase.from("vacation_requests").delete().eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Eliminada");
    reload();
  }

  function exportXLSX() {
    const rows = filtered.map((r) => {
      const emp = empMap.get(r.employee_id);
      return {
        Colaborador: emp?.name ?? "",
        Sucursal: emp?.branch ?? "",
        "Fecha ingreso": emp?.hire_date ?? "",
        "Fecha solicitud": r.created_at.slice(0, 10),
        Inicio: r.start_date,
        Fin: r.end_date,
        Días: r.days_requested,
        Estado: r.status,
        Comentario: r.employee_comment ?? "",
        "Comentario admin": r.admin_comment ?? "",
        "Autorizó": r.decided_by ?? "",
        "Fecha autorización": r.decided_at ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vacaciones");
    XLSX.writeFile(wb, `vacaciones-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.text("Vacaciones", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Colaborador", "Sucursal", "Inicio", "Fin", "Días", "Estado"]],
      body: filtered.map((r) => {
        const emp = empMap.get(r.employee_id);
        return [
          emp?.name ?? "",
          emp?.branch ?? "",
          r.start_date,
          r.end_date,
          String(r.days_requested),
          r.status,
        ];
      }),
    });
    doc.save(`vacaciones-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Colaborador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los colaboradores</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Sucursal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="mina">Mina</SelectItem>
              <SelectItem value="morelos">Morelos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="aprobada">Aprobadas</SelectItem>
              <SelectItem value="rechazada">Rechazadas</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-1">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportXLSX} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> PDF
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">Sin solicitudes</p>
        )}
        {filtered.map((r) => {
          const emp = empMap.get(r.employee_id);
          return (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {emp?.name ?? "—"}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({emp?.branch ?? "—"})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.start_date} → {r.end_date} · {r.days_requested} día(s)
                  </p>
                  {r.employee_comment && (
                    <p className="text-xs mt-1">📝 {r.employee_comment}</p>
                  )}
                  {r.admin_comment && (
                    <p className="text-xs mt-1 text-rose-700">Admin: {r.admin_comment}</p>
                  )}
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {r.status === "pendiente" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => decide(r, "aprobada")}
                    >
                      <Check className="h-3 w-3" /> Aprobar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => decide(r, "rechazada")}>
                      <X className="h-3 w-3" /> Rechazar
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                  <Edit2 className="h-3 w-3" /> Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <EditDialog
          request={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  request,
  onClose,
  onSaved,
}: {
  request: VacationRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(request.start_date);
  const [end, setEnd] = useState(request.end_date);
  const [comment, setComment] = useState(request.admin_comment ?? "");
  const [busy, setBusy] = useState(false);
  const days = daysBetween(start, end);

  async function save() {
    if (days <= 0) {
      toast.error("Fechas inválidas");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("vacation_requests")
      .update({
        start_date: start,
        end_date: end,
        days_requested: days,
        admin_comment: comment || null,
      })
      .eq("id", request.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Actualizada");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar solicitud</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Inicio</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{days} día(s)</p>
          <div>
            <Label>Comentario admin</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BalancesTab({
  ownerId,
  employees,
  reload,
}: {
  ownerId: string;
  employees: Employee[];
  reload: () => void;
}) {
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [adjOpen, setAdjOpen] = useState<Employee | null>(null);

  useEffect(() => {
    (async () => {
      const out: Record<string, Balance> = {};
      for (const e of employees) {
        out[e.id] = await computeBalance(ownerId, e.id, e.hire_date);
      }
      setBalances(out);
    })();
  }, [ownerId, employees]);

  return (
    <div className="space-y-2">
      {employees.map((e) => {
        const b = balances[e.id];
        return (
          <Card key={e.id} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{e.name}</p>
                <p className="text-xs text-muted-foreground">
                  Ingreso: {e.hire_date ?? "—"} · {e.branch ?? "—"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAdjOpen(e)}>
                <Plus className="h-3 w-3" /> Ajustar
              </Button>
            </div>
            {b && (
              <div className="grid grid-cols-4 gap-2 mt-2 text-center text-xs">
                <Cell label="Antigüedad" v={`${b.seniorityYears}a`} />
                <Cell label="Asignados" v={String(b.assigned)} />
                <Cell label="Usados" v={String(b.used)} />
                <Cell label="Disponibles" v={String(b.available)} accent />
              </div>
            )}
          </Card>
        );
      })}
      {adjOpen && (
        <AdjustDialog
          ownerId={ownerId}
          employee={adjOpen}
          onClose={() => setAdjOpen(null)}
          onSaved={() => {
            setAdjOpen(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Cell({ label, v, accent }: { label: string; v: string; accent?: boolean }) {
  return (
    <div className="bg-emerald-50 rounded p-1">
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-bold ${accent ? "text-emerald-700" : ""}`}>{v}</p>
    </div>
  );
}

function AdjustDialog({
  ownerId,
  employee,
  onClose,
  onSaved,
}: {
  ownerId: string;
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(days);
    if (!n || isNaN(n)) {
      toast.error("Cantidad inválida");
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("vacation_adjustments").insert({
      owner_id: ownerId,
      employee_id: employee.id,
      days: n,
      reason: reason || null,
      created_by: u.user?.id ?? null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ajuste guardado");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar saldo — {employee.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Días (+/-)</Label>
            <Input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="Ej: 2 ó -1"
            />
          </div>
          <div>
            <Label>Motivo</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalendarTab({
  employees,
  requests,
}: {
  employees: Employee[];
  requests: VacationRequest[];
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [branchFilter, setBranchFilter] = useState("all");
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const approved = requests.filter((r) => r.status === "aprobada");

  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const firstWeekday = new Date(year, m, 1).getDay();

  const cells: { day: number | null; reqs: VacationRequest[] }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, reqs: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = new Date(year, m, d).toISOString().slice(0, 10);
    const list = approved.filter((r) => {
      if (iso < r.start_date || iso > r.end_date) return false;
      const emp = empMap.get(r.employee_id);
      if (branchFilter !== "all" && emp?.branch !== branchFilter) return false;
      return true;
    });
    cells.push({ day: d, reqs: list });
  }

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMonth(new Date(year, m - 1, 1))}
        >
          ←
        </Button>
        <p className="font-medium capitalize">
          {month.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMonth(new Date(year, m + 1, 1))}
        >
          →
        </Button>
      </div>
      <Select value={branchFilter} onValueChange={setBranchFilter}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las sucursales</SelectItem>
          <SelectItem value="mina">Mina</SelectItem>
          <SelectItem value="morelos">Morelos</SelectItem>
        </SelectContent>
      </Select>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
          <div key={i} className="text-center font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            className={`min-h-14 rounded p-1 ${c.day ? "bg-white border" : ""}`}
          >
            {c.day && (
              <>
                <p className="text-muted-foreground">{c.day}</p>
                <div className="flex flex-col gap-0.5">
                  {c.reqs.slice(0, 3).map((r) => {
                    const emp = empMap.get(r.employee_id);
                    return (
                      <div
                        key={r.id}
                        title={emp?.name}
                        className="h-1.5 rounded-full"
                        style={{ backgroundColor: emp?.color ?? "#10b981" }}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function HistoryTab({
  employees,
  requests,
}: {
  employees: Employee[];
  requests: VacationRequest[];
}) {
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  return (
    <div className="space-y-2">
      {requests.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-6">Sin registros</p>
      )}
      {requests.map((r) => {
        const emp = empMap.get(r.employee_id);
        return (
          <Card key={r.id} className="p-3 text-xs">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{emp?.name ?? "—"}</p>
                <p className="text-muted-foreground">
                  Sucursal: {emp?.branch ?? "—"} · Ingreso: {emp?.hire_date ?? "—"}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="grid grid-cols-2 gap-1 mt-2">
              <span>Solicitud: {r.created_at.slice(0, 10)}</span>
              <span>Vacaciones: {r.start_date} → {r.end_date}</span>
              <span>Días: {r.days_requested}</span>
              <span>Decidido: {r.decided_at?.slice(0, 10) ?? "—"}</span>
            </div>
            {r.employee_comment && <p className="mt-1">📝 {r.employee_comment}</p>}
            {r.admin_comment && <p className="text-rose-700">Admin: {r.admin_comment}</p>}
          </Card>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "aprobada"
      ? "bg-emerald-100 text-emerald-800"
      : status === "rechazada"
        ? "bg-rose-100 text-rose-800"
        : "bg-amber-100 text-amber-800";
  return <Badge className={cls}>{status}</Badge>;
}

// Re-export for potential reuse
export { yearsOfService, assignedDays };
