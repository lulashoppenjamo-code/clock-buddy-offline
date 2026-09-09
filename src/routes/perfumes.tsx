import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BRANCHES, branchName, type Branch } from "@/lib/addon-sales";
import { getCachedEmployees, cacheEmployees } from "@/lib/offline-queue";
import { PERFUME_GOAL, monthRange } from "@/lib/perfumes";

export const Route = createFileRoute("/perfumes")({
  head: () => ({
    meta: [
      { title: "Perfumes vendidos · lula shop" },
      {
        name: "description",
        content:
          "Registra los perfumes que vendiste este mes y avanza hacia el domingo bono.",
      },
      { property: "og:title", content: "Perfumes vendidos · lula shop" },
      {
        property: "og:description",
        content:
          "Registra los perfumes que vendiste este mes y avanza hacia el domingo bono.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PerfumesRoute,
});

type Employee = { id: string; name: string; pin: string; color: string };
type Row = {
  id: string;
  perfume_name: string;
  quantity: number;
  ticket_number: string | null;
  sold_at: string;
  branch: string;
};

function PerfumesRoute() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [ticket, setTicket] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved =
          typeof window !== "undefined"
            ? window.localStorage.getItem("checador.ownerId")
            : null;
        if (mounted && saved) setOwnerId(saved);
      } catch {}
      try {
        const cached = await getCachedEmployees();
        if (mounted && cached.length) setEmployees(cached);
      } catch {}
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user.id ?? null;
        if (uid) {
          if (mounted) setOwnerId(uid);
          try {
            window.localStorage.setItem("checador.ownerId", uid);
          } catch {}
          const { data: emps } = await supabase
            .from("employees")
            .select("id,name,pin,color")
            .eq("owner_id", uid)
            .eq("active", true)
            .order("name");
          if (mounted && emps) {
            setEmployees(emps);
            await cacheEmployees(emps);
          }
        }
      } catch {}
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (pin.length === 4) {
      const m = employees.find((e) => e.pin === pin);
      if (m) {
        setEmployee(m);
        setPin("");
      } else {
        toast.error("PIN incorrecto");
        setPin("");
      }
    }
  }, [pin, employees]);

  useEffect(() => {
    if (!ownerId || !employee) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, employee?.id]);

  async function refresh() {
    if (!ownerId || !employee) return;
    const { start } = monthRange();
    const { data } = await supabase
      .from("perfume_sales")
      .select("id,perfume_name,quantity,ticket_number,sold_at,branch")
      .eq("owner_id", ownerId)
      .eq("employee_id", employee.id)
      .gte("sold_at", start.toISOString())
      .order("sold_at", { ascending: false })
      .limit(100);
    setRows((data ?? []) as Row[]);
  }

  function pinPress(n: string) {
    if (n === "del") setPin((p) => p.slice(0, -1));
    else if (pin.length < 4) setPin((p) => p + n);
  }

  async function save() {
    if (!ownerId || !employee || !branch) return;
    if (!name.trim()) {
      toast.error("Escribe el nombre del perfume");
      return;
    }
    const q = Math.max(1, Math.round(Number(qty) || 1));
    setBusy(true);
    try {
      const { error } = await supabase.from("perfume_sales").insert({
        owner_id: ownerId,
        employee_id: employee.id,
        employee_name: employee.name,
        branch,
        perfume_name: name.trim(),
        quantity: q,
        ticket_number: ticket.trim() || null,
        comment: comment.trim() || null,
      });
      if (error) throw error;
      toast.success("Perfume registrado");
      setName("");
      setQty("1");
      setTicket("");
      setComment("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("perfume_sales").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Registro eliminado");
      refresh();
    }
  }

  const total = rows.reduce((a, r) => a + (r.quantity ?? 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ownerId) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="p-6 max-w-sm space-y-3 text-center">
          <p className="text-sm">Inicia sesión como administrador primero.</p>
          <Button onClick={() => navigate({ to: "/auth" })}>Entrar</Button>
        </Card>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-950 via-fuchsia-900 to-rose-950 text-white flex flex-col p-5">
        <div className="flex items-center justify-between text-sm text-white/70">
          <Link to="/" className="flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
          <Sparkles className="h-10 w-10" />
          <h1 className="text-2xl font-semibold">Perfumes vendidos</h1>
          <p className="text-white/70 text-sm">Ingresa tu PIN</p>
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border-2 ${pin.length > i ? "bg-white border-white" : "border-white/40"}`}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 w-full">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <button
                key={n}
                onClick={() => pinPress(n)}
                className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold"
              >
                {n}
              </button>
            ))}
            <div />
            <button
              onClick={() => pinPress("0")}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold"
            >
              0
            </button>
            <button
              onClick={() => pinPress("del")}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl"
            >
              ⌫
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="min-h-screen bg-pink-50 p-5">
        <div className="max-w-md mx-auto space-y-4">
          <button
            onClick={() => setEmployee(null)}
            className="text-sm flex items-center gap-1 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          <Card className="p-5 space-y-3 text-center">
            <h2 className="font-semibold">Hola {employee.name}</h2>
            <p className="text-sm text-muted-foreground">Selecciona sucursal</p>
            {BRANCHES.map((b) => (
              <Button
                key={b.id}
                className="w-full"
                variant="outline"
                onClick={() => setBranch(b.id)}
              >
                {b.name}
              </Button>
            ))}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setBranch(null)}
            className="text-sm flex items-center gap-1 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Cambiar sucursal
          </button>
          <span className="text-xs text-muted-foreground">
            {employee.name} · {branchName(branch)}
          </span>
        </div>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-fuchsia-600" /> Mi mes
            </h2>
            <span className="text-sm font-bold tabular-nums text-fuchsia-700">
              {total} / {PERFUME_GOAL}
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-fuchsia-600 transition-all"
              style={{ width: `${Math.min(100, (total / PERFUME_GOAL) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Mínimo {PERFUME_GOAL} perfumes en el mes para competir por el domingo bono.
            Gana quien cumpla el mínimo y tenga más ventas agregadas.
          </p>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold text-sm">Registrar perfume vendido</h2>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Perfume</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del perfume"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Cantidad</label>
              <Input
                value={qty}
                inputMode="numeric"
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Ticket (opcional)</label>
              <Input value={ticket} onChange={(e) => setTicket(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Comentario</label>
            <Textarea
              value={comment}
              rows={2}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <Button
            className="w-full bg-fuchsia-600 hover:bg-fuchsia-700"
            onClick={save}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}{" "}
            Guardar
          </Button>
        </Card>

        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-sm">Perfumes de este mes</h3>
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin registros aún</p>
          )}
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.perfume_name} × {r.quantity}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.sold_at).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                      hour12: true,
                    })}
                    {r.ticket_number ? ` · Ticket ${r.ticket_number}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => remove(r.id)}
                  className="text-muted-foreground hover:text-rose-600 shrink-0"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="text-center">
          <Link to="/ranking">
            <Button size="sm" variant="outline">
              🏆 Ver ranking del domingo bono
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
