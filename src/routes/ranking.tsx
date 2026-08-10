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
      { title: "Ranking de Ventas Agregadas · lula shop" },
      {
        name: "description",
        content:
          "Marcador en vivo del progreso de cada colaboradora en ventas agregadas: hoy, esta semana y este mes.",
      },
      { property: "og:title", content: "Ranking de Ventas Agregadas · lula shop" },
      {
        property: "og:description",
        content: "Marcador en vivo del progreso de cada colaboradora en ventas agregadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RankingPage,
});

type Period = "day" | "week" | "month";

const PERIOD_LABELS: { id: Period; label: string }[] = [
  { id: "day", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

function RankingPage() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<AddonSale[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; color: string }[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [branch, setBranch] = useState<string>("all");

  useEffect(() => {
    let uid =
      typeof window !== "undefined"
        ? window.localStorage.getItem("checador.ownerId")
        : null;
    supabase.auth.getSession().then(({ data }) => {
      uid = data.session?.user.id ?? uid;
      setOwnerId(uid);
    });
    setOwnerId((prev) => prev ?? uid);
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      setLoading(true);
      const { month } = periodRanges();
      const [{ data: rows }, { data: emps }] = await Promise.all([
        supabase
          .from("addon_sales")
          .select("*")
          .eq("owner_id", ownerId)
          .gte("sold_at", month.toISOString())
          .order("sold_at", { ascending: false })
          .limit(2000),
        supabase
          .from("employees")
          .select("id,name,color")
          .eq("owner_id", ownerId)
          .eq("active", true)
          .order("name"),
      ]);
      setSales((rows ?? []) as AddonSale[]);
      setEmployees(emps ?? []);
      setLoading(false);
    })();
  }, [ownerId]);

  const ranking = useMemo(() => {
    const from = periodRanges()[period];
    const counts = new Map<string, { name: string; color: string; total: number; validated: number }>();
    for (const e of employees) {
      counts.set(e.id, { name: e.name, color: e.color, total: 0, validated: 0 });
    }
    for (const s of sales) {
      if (s.status === "rechazado") continue;
      if (branch !== "all" && s.branch !== branch) continue;
      if (new Date(s.sold_at) < from) continue;
      const cur =
        counts.get(s.employee_id) ??
        { name: s.employee_name, color: "#ec4899", total: 0, validated: 0 };
      cur.total += 1;
      if (s.status === "validado") cur.validated += 1;
      counts.set(s.employee_id, cur);
    }
    return [...counts.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [sales, employees, period, branch]);

  const max = Math.max(1, ...ranking.map((r) => r.total));
  const grandTotal = ranking.reduce((a, r) => a + r.total, 0);

  return (
    <div className="min-h-screen bg-pink-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm flex items-center gap-1 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Inicio
          </Link>
          <h1 className="font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" /> Ranking
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
          <div className="flex gap-2 flex-wrap">
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
            <Card className="p-4 text-center">
              <p className="text-3xl font-bold tabular-nums text-rose-600">{grandTotal}</p>
              <p className="text-xs text-muted-foreground">
                ventas agregadas del equipo ·{" "}
                {PERIOD_LABELS.find((p) => p.id === period)?.label.toLowerCase()}
              </p>
            </Card>

            <Card className="p-4 space-y-4">
              {ranking.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  Aún no hay registros en este periodo
                </p>
              )}
              {ranking.map((r, i) => (
                <div key={r.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
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
                    <span className="text-xs text-muted-foreground shrink-0">
                      {r.total} · {r.validated} validada(s)
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(r.total / max) * 100}%`,
                        backgroundColor: r.color,
                      }}
                    />
                  </div>
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
