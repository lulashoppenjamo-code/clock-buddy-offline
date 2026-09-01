import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Loader2, LogOut } from "lucide-react";
import { toISODate, todayISO, weekStart, formatDateLong } from "@/lib/rest-days";

export const Route = createFileRoute("/pagos")({
  head: () => ({
    meta: [
      { title: "Mis pagos semanales | Lula Shop" },
      {
        name: "description",
        content: "Consulta con tu PIN si tu semana ya fue pagada o sigue pendiente.",
      },
      { property: "og:title", content: "Mis pagos semanales | Lula Shop" },
      {
        property: "og:description",
        content: "Estado semanal de tus pagos: pagada, pendiente o próxima.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PagosRoute,
});

type Employee = { id: string; name: string; pin: string; color: string; branch: string | null };

type PaymentRow = {
  week_start: string;
  loan_amount: number;
  paid: boolean;
};

/** Últimas 8 semanas (domingos), más reciente primero. */
function lastEightWeeks(): string[] {
  const current = weekStart(new Date());
  const weeks: string[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(current);
    d.setDate(d.getDate() - i * 7);
    weeks.push(toISODate(d));
  }
  return weeks;
}

function monthColor(date: string) {
  const month = Number(date.slice(5, 7));
  const colors = [
    "border-l-chart-1 bg-chart-1/10",
    "border-l-chart-2 bg-chart-2/10",
    "border-l-chart-3 bg-chart-3/10",
    "border-l-chart-4 bg-chart-4/10",
    "border-l-chart-5 bg-chart-5/10",
  ];
  return colors[(month - 1) % colors.length];
}

function PagosRoute() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pin, setPin] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const saved = window.localStorage.getItem("checador.ownerId");
        if (saved) setOwnerId(saved);
      } catch {}
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (uid) setOwnerId(uid);
      if (!uid && !window.localStorage.getItem("checador.ownerId")) {
        navigate({ to: "/auth" });
        return;
      }
      const ownerForLoad = uid ?? window.localStorage.getItem("checador.ownerId");
      if (ownerForLoad) {
        const { data: emps } = await supabase
          .from("employees")
          .select("id,name,pin,color,branch")
          .eq("owner_id", ownerForLoad)
          .eq("active", true)
          .order("name");
        setEmployees((emps as any) ?? []);
      }
      setLoading(false);
    })();
  }, [navigate]);

  useEffect(() => {
    if (pin.length === 4) {
      const m = employees.find((e) => e.pin === pin);
      if (m) {
        setSelected(m);
        setPin("");
      } else {
        toast.error("PIN incorrecto");
        setPin("");
      }
    }
  }, [pin, employees]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-950 to-teal-950 text-white flex flex-col p-5">
        <div className="flex items-center justify-between text-sm">
          <Link to="/" className="flex items-center gap-1 text-white/70">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <span className="font-medium">💵 Mis pagos</span>
          <span />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
          <p className="text-center text-white/70 text-sm">Ingresa tu PIN para continuar</p>
          <div className="flex gap-3 justify-center">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border-2 transition-colors ${
                  pin.length > i ? "bg-white border-white" : "border-white/40"
                }`}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 w-full">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <button
                key={n}
                onClick={() => setPin((p) => (p.length < 4 ? p + n : p))}
                className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold"
              >
                {n}
              </button>
            ))}
            <div />
            <button
              onClick={() => setPin((p) => (p.length < 4 ? p + "0" : p))}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold"
            >
              0
            </button>
            <button
              onClick={() => setPin((p) => p.slice(0, -1))}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl"
            >
              ⌫
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!ownerId) return null;
  return <PagosPanel employee={selected} ownerId={ownerId} onExit={() => setSelected(null)} />;
}

function PagosPanel({
  employee,
  ownerId,
  onExit,
}: {
  employee: Employee;
  ownerId: string;
  onExit: () => void;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const weeks = lastEightWeeks();
  const today = todayISO();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("weekly_payments")
        .select("week_start,loan_amount,paid")
        .eq("owner_id", ownerId)
        .eq("employee_id", employee.id)
        .order("week_start", { ascending: false });
      setRows(((data as any) ?? []) as PaymentRow[]);
      setLoading(false);
    })();
  }, [ownerId, employee.id]);

  const byWeek: Record<string, PaymentRow> = {};
  for (const r of rows) byWeek[r.week_start] = r;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-950 to-teal-950 text-white p-4 pb-16">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between text-sm">
          <Link to="/" className="flex items-center gap-1 text-white/70">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <span className="font-medium">💵 Mis pagos</span>
          <button onClick={onExit} className="text-white/70 flex items-center gap-1">
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <Card className="p-4 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: employee.color }} />
          <span className="font-medium">{employee.name}</span>
          {employee.branch && <Badge variant="secondary">{employee.branch}</Badge>}
        </Card>

        {loading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
          </div>
        ) : (
          <Card className="p-4 space-y-2">
            <p className="text-sm font-medium">Últimas 8 semanas</p>
            {weeks.map((w) => {
              const row = byWeek[w];
              const future = w > today;
              const paid = !!row?.paid;
              const loan = Number(row?.loan_amount ?? 0);
              const hasLoan = loan > 0;
              return (
                <div
                  key={w}
                  className={`rounded-lg border border-l-4 p-3 flex items-start justify-between gap-2 ${monthColor(w)}`}
                >
                  <div>
                    <p className="text-sm font-medium capitalize">{formatDateLong(w)}</p>
                    {hasLoan && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Préstamo: ${loan.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  {paid ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">🟢 Pagada</Badge>
                  ) : future ? (
                    <Badge variant="secondary">Próxima</Badge>
                  ) : (
                    <Badge className="bg-rose-600 hover:bg-rose-600">🔴 Pendiente</Badge>
                  )}
                </div>
              );
            })}
          </Card>
        )}

        <Button variant="outline" className="w-full" onClick={onExit}>
          Salir
        </Button>
      </div>
    </div>
  );
}
