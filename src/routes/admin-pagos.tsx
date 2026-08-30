import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, HandCoins, Check, Undo2 } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { toISODate, todayISO, weekStart, formatDateLong } from "@/lib/rest-days";

export const Route = createFileRoute("/admin-pagos")({
  head: () => ({
    meta: [
      { title: "Pagos semanales — Administración | Lula Shop" },
      {
        name: "description",
        content: "Administra el sueldo semanal, préstamos y el estado de pago de cada colaboradora.",
      },
      { property: "og:title", content: "Pagos semanales — Administración | Lula Shop" },
      {
        property: "og:description",
        content: "Sueldo semanal, préstamos y control de semanas pagadas o pendientes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPagosRoute,
});

type Employee = {
  id: string;
  name: string;
  color: string;
  branch: string | null;
  weekly_salary: number | null;
};

type WeeklyPayment = {
  id: string;
  employee_id: string;
  week_start: string;
  base_amount: number;
  loan_amount: number;
  loan_note: string | null;
  total_amount: number;
  paid: boolean;
  paid_at: string | null;
};

/** Últimas 6 semanas (domingos) + las próximas 2, más reciente primero. */
export function paymentWeeks(): string[] {
  const current = weekStart(new Date());
  const weeks: string[] = [];
  for (let i = 2; i >= -5; i--) {
    const d = new Date(current);
    d.setDate(d.getDate() + i * 7);
    weeks.push(toISODate(d));
  }
  return weeks;
}

function money(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function AdminPagosRoute() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id ?? null;
      if (!id) {
        navigate({ to: "/auth" });
        return;
      }
      setUid(id);
      setChecking(false);
    });
  }, [navigate]);
  if (checking || !uid) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <AdminGate ownerId={uid}>
      <AdminPagosPage ownerId={uid} />
    </AdminGate>
  );
}

function AdminPagosPage({ ownerId }: { ownerId: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<WeeklyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>("");
  const weeks = useMemo(() => paymentWeeks(), []);
  const today = todayISO();

  async function load() {
    const [{ data: emps }, { data: pays }] = await Promise.all([
      supabase
        .from("employees")
        .select("id,name,color,branch,weekly_salary")
        .eq("owner_id", ownerId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("weekly_payments")
        .select("*")
        .eq("owner_id", ownerId)
        .order("week_start", { ascending: false }),
    ]);
    const list = ((emps as any) ?? []) as Employee[];
    setEmployees(list);
    setPayments(((pays as any) ?? []) as WeeklyPayment[]);
    setActive((prev) => prev || list[0]?.id || "");
    setLoading(false);
  }

  useEffect(() => {
    load();
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
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-950 to-teal-950 text-white p-4 pb-16">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between text-sm">
          <Link to="/admin" className="flex items-center gap-1 text-white/70">
            <ArrowLeft className="h-4 w-4" /> Panel
          </Link>
          <span className="font-medium">💵 Pagos semanales</span>
          <span />
        </div>

        {employees.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No hay colaboradoras activas.
          </Card>
        ) : (
          <Tabs value={active} onValueChange={setActive}>
            <TabsList className="w-full flex-wrap h-auto">
              {employees.map((e) => (
                <TabsTrigger key={e.id} value={e.id} className="flex-1">
                  {e.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {employees.map((e) => (
              <TabsContent key={e.id} value={e.id} className="space-y-4 mt-4">
                <SalaryCard employee={e} onSaved={load} />
                <WeeksList
                  employee={e}
                  ownerId={ownerId}
                  weeks={weeks}
                  today={today}
                  payments={payments.filter((p) => p.employee_id === e.id)}
                  onChanged={load}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}

function SalaryCard({ employee, onSaved }: { employee: Employee; onSaved: () => void }) {
  const [value, setValue] = useState(String(employee.weekly_salary ?? 0));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(String(employee.weekly_salary ?? 0));
  }, [employee.id, employee.weekly_salary]);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Monto inválido");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("employees")
      .update({ weekly_salary: n })
      .eq("id", employee.id);
    setBusy(false);
    if (error) {
      toast.error("No se pudo guardar");
      return;
    }
    toast.success("Sueldo semanal actualizado");
    onSaved();
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: employee.color }} />
        <span className="font-medium">{employee.name}</span>
        {employee.branch && <Badge variant="secondary">{employee.branch}</Badge>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`sal-${employee.id}`}>Sueldo semanal</Label>
        <div className="flex gap-2">
          <Input
            id={`sal-${employee.id}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={value}
            onChange={(ev) => setValue(ev.target.value)}
          />
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function WeeksList({
  employee,
  ownerId,
  weeks,
  today,
  payments,
  onChanged,
}: {
  employee: Employee;
  ownerId: string;
  weeks: string[];
  today: string;
  payments: WeeklyPayment[];
  onChanged: () => void;
}) {
  const [loanWeek, setLoanWeek] = useState<string | null>(null);
  const [loanAmount, setLoanAmount] = useState("");
  const [loanNote, setLoanNote] = useState("");
  const [busy, setBusy] = useState(false);

  const byWeek = useMemo(() => {
    const m: Record<string, WeeklyPayment> = {};
    for (const p of payments) m[p.week_start] = p;
    return m;
  }, [payments]);

  const base = Number(employee.weekly_salary ?? 0);

  async function ensureRow(week: string): Promise<WeeklyPayment | null> {
    const existing = byWeek[week];
    if (existing) return existing;
    const { data, error } = await supabase
      .from("weekly_payments")
      .insert({
        owner_id: ownerId,
        employee_id: employee.id,
        week_start: week,
        base_amount: base,
      })
      .select("*")
      .single();
    if (error) {
      toast.error("No se pudo crear el registro");
      return null;
    }
    return data as any as WeeklyPayment;
  }

  async function togglePaid(week: string) {
    setBusy(true);
    const row = await ensureRow(week);
    if (!row) {
      setBusy(false);
      return;
    }
    const next = !row.paid;
    const { error } = await supabase
      .from("weekly_payments")
      .update({
        paid: next,
        paid_at: next ? new Date().toISOString() : null,
        paid_by: next ? ownerId : null,
        base_amount: row.base_amount || base,
      })
      .eq("id", row.id);
    setBusy(false);
    if (error) {
      toast.error("No se pudo actualizar");
      return;
    }
    toast.success(next ? "Semana marcada como pagada" : "Semana marcada como pendiente");
    onChanged();
  }

  function openLoan(week: string) {
    const row = byWeek[week];
    setLoanWeek(week);
    setLoanAmount(row?.loan_amount ? String(row.loan_amount) : "");
    setLoanNote(row?.loan_note ?? "");
  }

  async function saveLoan() {
    if (!loanWeek) return;
    const n = Number(loanAmount || 0);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Monto inválido");
      return;
    }
    setBusy(true);
    const row = await ensureRow(loanWeek);
    if (!row) {
      setBusy(false);
      return;
    }
    const { error } = await supabase
      .from("weekly_payments")
      .update({
        loan_amount: n,
        loan_note: loanNote.trim() || null,
        base_amount: row.base_amount || base,
      })
      .eq("id", row.id);
    setBusy(false);
    if (error) {
      toast.error("No se pudo guardar el préstamo");
      return;
    }
    toast.success("Préstamo guardado");
    setLoanWeek(null);
    onChanged();
  }

  return (
    <>
      <Card className="p-4 space-y-2">
        <p className="text-sm font-medium">Semanas</p>
        {weeks.map((w) => {
          const row = byWeek[w];
          const future = w > today;
          const baseAmt = Number(row?.base_amount ?? base);
          const loan = Number(row?.loan_amount ?? 0);
          const total = baseAmt + loan;
          const paid = !!row?.paid;
          return (
            <div key={w} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium capitalize">{formatDateLong(w)}</p>
                  <p className="text-xs text-muted-foreground">
                    Base {money(baseAmt)}
                    {loan > 0 && <> · Préstamo {money(loan)}</>}
                    {" · "}
                    <span className="font-medium text-foreground">Total {money(total)}</span>
                  </p>
                  {row?.loan_note && (
                    <p className="text-xs text-muted-foreground mt-0.5">📝 {row.loan_note}</p>
                  )}
                </div>
                {paid ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">Pagada</Badge>
                ) : future ? (
                  <Badge variant="secondary">Próxima</Badge>
                ) : (
                  <Badge className="bg-rose-600 hover:bg-rose-600">Pendiente</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={paid ? "outline" : "default"}
                  disabled={busy}
                  onClick={() => togglePaid(w)}
                >
                  {paid ? (
                    <>
                      <Undo2 className="h-4 w-4 mr-1" /> Marcar pendiente
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" /> Marcar pagada
                    </>
                  )}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => openLoan(w)}>
                  <HandCoins className="h-4 w-4 mr-1" /> Préstamo
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      <Dialog open={!!loanWeek} onOpenChange={(o) => !o && setLoanWeek(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Préstamo de la semana</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {loanWeek && (
              <p className="text-sm text-muted-foreground capitalize">{formatDateLong(loanWeek)}</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="loan-amount">Monto</Label>
              <Input
                id="loan-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-note">Nota</Label>
              <Textarea
                id="loan-note"
                value={loanNote}
                onChange={(e) => setLoanNote(e.target.value)}
                placeholder="Motivo del préstamo (opcional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoanWeek(null)}>
              Cancelar
            </Button>
            <Button onClick={saveLoan} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </>
  );
}
