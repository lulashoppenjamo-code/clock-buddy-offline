import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2, Trophy } from "lucide-react";
import { BRANCHES, branchName, periodRanges, type AddonSale } from "@/lib/addon-sales";

export const Route = createFileRoute("/ranking")({
  head: () => ({
    meta: [
      { title: "Rankings del equipo · lula shop" },
      {
        name: "description",
        content:
          "Marcador en vivo con datos reales: ventas agregadas, puntualidad, limpieza, clientes registrados y puntaje general.",
      },
      { property: "og:title", content: "Rankings del equipo · lula shop" },
      {
        property: "og:description",
        content:
          "Ventas agregadas, puntualidad, limpieza y clientes: el progreso real de cada colaboradora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RankingPage,
});

type Period = "day" | "week" | "month";
type Board = "general" | "ventas" | "puntualidad" | "limpieza" | "clientes";

const PERIOD_LABELS: { id: Period; label: string }[] = [
  { id: "day", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

const BOARDS: { id: Board; label: string; emoji: string }[] = [
  { id: "general", label: "General", emoji: "🏆" },
  { id: "ventas", label: "Ventas", emoji: "📈" },
  { id: "puntualidad", label: "Puntualidad", emoji: "⏰" },
  { id: "limpieza", label: "Limpieza", emoji: "✨" },
  { id: "clientes", label: "Clientes", emoji: "💖" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

// Hora límite de entrada considerada puntual (hora local)
const ON_TIME_HOUR = 10;

type Employee = { id: string; name: string; color: string };
type ClockIn = { employee_id: string; occurred_at: string };
type CleaningLog = { employee_id: string; completed_at: string; branch: string };
type CustomerRow = { registered_by_id: string | null; created_at: string };

type Row = {
  id: string;
  name: string;
  color: string;
  value: number;
  detail: string;
};

function fmtTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function RankingPage() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<AddonSale[]>([]);
  const [clockIns, setClockIns] = useState<ClockIn[]>([]);
  const [cleaning, setCleaning] = useState<CleaningLog[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [branch, setBranch] = useState<string>("all");
  const [board, setBoard] = useState<Board>("general");

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("checador.ownerId")
        : null;
    if (stored) setOwnerId(stored);
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? stored;
      if (uid) setOwnerId(uid);
      else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      setLoading(true);
      const { month } = periodRanges();
      const since = month.toISOString();
      const [s, t, c, cu, emps] = await Promise.all([
        supabase
          .from("addon_sales")
          .select("*")
          .eq("owner_id", ownerId)
          .gte("sold_at", since)
          .limit(3000),
        supabase
          .from("time_entries")
          .select("employee_id,occurred_at")
          .eq("owner_id", ownerId)
          .eq("type", "clock_in")
          .gte("occurred_at", since)
          .limit(3000),
        supabase
          .from("cleaning_logs")
          .select("employee_id,completed_at,branch")
          .eq("owner_id", ownerId)
          .gte("completed_at", since)
          .limit(3000),
        supabase
          .from("customers")
          .select("registered_by_id,created_at")
          .eq("owner_id", ownerId)
          .gte("created_at", since)
          .limit(3000),
        supabase
          .from("employees")
          .select("id,name,color")
          .eq("owner_id", ownerId)
          .eq("active", true)
          .order("name"),
      ]);
      setSales((s.data ?? []) as AddonSale[]);
      setClockIns((t.data ?? []) as ClockIn[]);
      setCleaning((c.data ?? []) as CleaningLog[]);
      setCustomers((cu.data ?? []) as CustomerRow[]);
      setEmployees((emps.data ?? []) as Employee[]);
      setLoading(false);
    })();
  }, [ownerId]);

  const stats = useMemo(() => {
    const from = periodRanges()[period];
    const base = new Map<
      string,
      {
        name: string;
        color: string;
        ventas: number;
        ventasValidadas: number;
        checadas: number;
        puntuales: number;
        minutosEntrada: number;
        limpieza: number;
        clientes: number;
      }
    >();
    const get = (id: string, name?: string) => {
      let cur = base.get(id);
      if (!cur) {
        const emp = employees.find((e) => e.id === id);
        cur = {
          name: emp?.name ?? name ?? "Colaboradora",
          color: emp?.color ?? "#ec4899",
          ventas: 0,
          ventasValidadas: 0,
          checadas: 0,
          puntuales: 0,
          minutosEntrada: 0,
          limpieza: 0,
          clientes: 0,
        };
        base.set(id, cur);
      }
      return cur;
    };
    for (const e of employees) get(e.id);

    for (const s of sales) {
      if (s.status === "rechazado") continue;
      if (branch !== "all" && s.branch !== branch) continue;
      if (new Date(s.sold_at) < from) continue;
      const r = get(s.employee_id, s.employee_name);
      r.ventas += 1;
      if (s.status === "validado") r.ventasValidadas += 1;
    }
    for (const t of clockIns) {
      const d = new Date(t.occurred_at);
      if (d < from) continue;
      const r = get(t.employee_id);
      r.checadas += 1;
      const mins = d.getHours() * 60 + d.getMinutes();
      r.minutosEntrada += mins;
      if (mins <= ON_TIME_HOUR * 60) r.puntuales += 1;
    }
    for (const c of cleaning) {
      if (new Date(c.completed_at) < from) continue;
      if (branch !== "all" && c.branch !== branch) continue;
      get(c.employee_id).limpieza += 1;
    }
    for (const c of customers) {
      if (!c.registered_by_id) continue;
      if (new Date(c.created_at) < from) continue;
      get(c.registered_by_id).clientes += 1;
    }
    return base;
  }, [sales, clockIns, cleaning, customers, employees, period, branch]);

  const rows: Row[] = useMemo(() => {
    const list = [...stats.entries()].map(([id, r]) => {
      const pct = r.checadas ? Math.round((r.puntuales / r.checadas) * 100) : 0;
      const avg = r.checadas ? r.minutosEntrada / r.checadas : 0;
      switch (board) {
        case "ventas":
          return {
            id,
            name: r.name,
            color: r.color,
            value: r.ventas,
            detail: `${r.ventas} registro(s) · ${r.ventasValidadas} validada(s)`,
          };
        case "puntualidad":
          return {
            id,
            name: r.name,
            color: r.color,
            value: pct,
            detail: r.checadas
              ? `${pct}% puntual · ${r.puntuales}/${r.checadas} · entrada prom. ${fmtTime(avg)}`
              : "Sin entradas registradas",
          };
        case "limpieza":
          return {
            id,
            name: r.name,
            color: r.color,
            value: r.limpieza,
            detail: `${r.limpieza} tarea(s) completada(s)`,
          };
        case "clientes":
          return {
            id,
            name: r.name,
            color: r.color,
            value: r.clientes,
            detail: `${r.clientes} cliente(s) con convenio`,
          };
        default: {
          const puntos =
            r.ventasValidadas * 3 +
            (r.ventas - r.ventasValidadas) * 1 +
            r.limpieza * 2 +
            r.clientes * 2 +
            r.puntuales * 1;
          return {
            id,
            name: r.name,
            color: r.color,
            value: puntos,
            detail: `${puntos} pts · ${r.ventas} ventas · ${r.limpieza} limpieza · ${r.clientes} clientes · ${pct}% puntual`,
          };
        }
      }
    });
    return list.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [stats, board]);

  const max = Math.max(1, ...rows.map((r) => r.value));
  const totals = useMemo(() => {
    let ventas = 0,
      limpieza = 0,
      clientes = 0,
      puntuales = 0,
      checadas = 0;
    for (const r of stats.values()) {
      ventas += r.ventas;
      limpieza += r.limpieza;
      clientes += r.clientes;
      puntuales += r.puntuales;
      checadas += r.checadas;
    }
    return {
      ventas,
      limpieza,
      clientes,
      puntualidad: checadas ? Math.round((puntuales / checadas) * 100) : 0,
    };
  }, [stats]);

  const unit = board === "puntualidad" ? "%" : "";

  return (
    <div className="min-h-screen bg-pink-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm flex items-center gap-1 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Inicio
          </Link>
          <h1 className="font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" /> Rankings
          </h1>
        </div>

        <Card className="p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {PERIOD_LABELS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={period === p.id ? "default" : "outline"}
                className={period === p.id ? "bg-rose-600 hover:bg-rose-700" : ""}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {BOARDS.map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant={board === b.id ? "secondary" : "ghost"}
                onClick={() => setBoard(b.id)}
              >
                {b.emoji} {b.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={branch === "all" ? "secondary" : "ghost"}
              onClick={() => setBranch("all")}
            >
              Todas
            </Button>
            {BRANCHES.map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant={branch === b.id ? "secondary" : "ghost"}
                onClick={() => setBranch(b.id)}
              >
                {branchName(b.id)}
              </Button>
            ))}
          </div>
        </Card>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Ventas", value: totals.ventas },
                { label: "Puntualidad", value: `${totals.puntualidad}%` },
                { label: "Limpieza", value: totals.limpieza },
                { label: "Clientes", value: totals.clientes },
              ].map((t) => (
                <Card key={t.label} className="p-2 text-center">
                  <p className="text-lg font-bold tabular-nums text-rose-600">{t.value}</p>
                  <p className="text-[10px] text-muted-foreground">{t.label}</p>
                </Card>
              ))}
            </div>

            <Card className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                {BOARDS.find((b) => b.id === board)?.label} ·{" "}
                {PERIOD_LABELS.find((p) => p.id === period)?.label.toLowerCase()}
                {board === "puntualidad" && ` · entradas antes de las ${ON_TIME_HOUR}:00 AM`}
                {board === "general" &&
                  " · 3 pts venta validada, 2 pts limpieza y cliente, 1 pt entrada puntual"}
              </p>
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  Aún no hay datos en este periodo
                </p>
              )}
              {rows.map((r, i) => (
                <div key={r.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-6 text-center">
                        {MEDALS[i] ?? <span className="text-muted-foreground">{i + 1}</span>}
                      </span>
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="font-medium truncate">{r.name}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      {r.value}
                      {unit}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(r.value / max) * 100}%`,
                        backgroundColor: r.color,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-8">{r.detail}</p>
                </div>
              ))}
            </Card>

            <div className="text-center">
              <Link to="/ventas">
                <Button size="sm" className="bg-rose-600 hover:bg-rose-700">
                  📈 Registrar venta agregada
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
