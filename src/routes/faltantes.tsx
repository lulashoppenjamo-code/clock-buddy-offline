import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle2, ClipboardList, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useOnline } from "@/lib/use-online";
import { getCachedEmployees, cacheEmployees } from "@/lib/offline-queue";
import {
  BRANCHES,
  branchName,
  formatDayLabel,
  parseItems,
  todayISO,
  type Branch,
  type ShortageReport,
} from "@/lib/shortages";

export const Route = createFileRoute("/faltantes")({
  component: FaltantesRoute,
  head: () => ({
    meta: [
      { title: "Faltantes / Surtido · Reporte diario" },
      {
        name: "description",
        content:
          "Reporta en segundos los productos que hacen falta en tu sucursal cada día.",
      },
      { property: "og:title", content: "Faltantes / Surtido" },
      {
        property: "og:description",
        content: "Reporte diario de productos faltantes por sucursal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Employee = {
  id: string;
  name: string;
  pin: string;
  color: string;
  branch?: string | null;
};

function FaltantesRoute() {
  const navigate = useNavigate();
  const online = useOnline();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentToday, setSentToday] = useState<ShortageReport | null>(null);
  const [recent, setRecent] = useState<ShortageReport[]>([]);

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
        if (mounted && cached.length) setEmployees(cached as Employee[]);
      } catch {}
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user.id ?? null;
        if (uid) {
          if (mounted) setOwnerId(uid);
          try {
            window.localStorage.setItem("checador.ownerId", uid);
          } catch {}
          if (navigator.onLine) {
            const { data: emps } = await supabase
              .from("employees")
              .select("id,name,pin,color,branch")
              .eq("owner_id", uid)
              .eq("active", true)
              .order("name");
            if (mounted && emps) {
              setEmployees(emps as Employee[]);
              await cacheEmployees(
                emps.map((e) => ({
                  id: e.id,
                  name: e.name,
                  pin: e.pin,
                  color: e.color,
                })),
              );
            }
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
    if (pin.length !== 4) return;
    const m = employees.find((e) => e.pin === pin);
    if (m) {
      setEmployee(m);
      const b = BRANCHES.find((x) => x.id === m.branch);
      if (b) setBranch(b.id);
      setPin("");
    } else {
      toast.error("PIN incorrecto");
      setPin("");
    }
  }, [pin, employees]);

  useEffect(() => {
    if (!ownerId || !employee) return;
    (async () => {
      const { data } = await supabase
        .from("shortage_reports")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("employee_id", employee.id)
        .order("report_date", { ascending: false })
        .limit(10);
      const list = (data ?? []) as ShortageReport[];
      setRecent(list);
      const today = list.find((r) => r.report_date === todayISO()) ?? null;
      setSentToday(today);
      if (today) {
        setText(today.items.join("\n"));
        setComment(today.comment ?? "");
      } else if (shouldRemindNow()) {
        markReminderShown();
        notifyReminder(
          `${employee.name}, recuerda enviar tu reporte de faltantes de hoy.`,
        );
      }
    })();
  }, [ownerId, employee]);

  function pinPress(n: string) {
    if (n === "del") setPin((p) => p.slice(0, -1));
    else if (pin.length < 4) setPin((p) => p + n);
  }

  async function send() {
    if (!ownerId || !employee || !branch) return;
    const items = parseItems(text);
    if (items.length === 0 && !comment.trim()) {
      toast.error("Escribe al menos un producto");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("shortage_reports")
        .upsert(
          {
            owner_id: ownerId,
            employee_id: employee.id,
            employee_name: employee.name,
            branch,
            report_date: todayISO(),
            items,
            comment: comment.trim() || null,
          },
          { onConflict: "employee_id,report_date" },
        )
        .select()
        .single();
      if (error) throw error;
      setSentToday(data as ShortageReport);
      setRecent((prev) => [
        data as ShortageReport,
        ...prev.filter((r) => r.report_date !== todayISO()),
      ]);
      toast.success("¡Reporte enviado!");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar");
    } finally {
      setBusy(false);
    }
  }

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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col p-5">
        <div className="flex items-center justify-between text-sm text-white/70">
          <Link to="/" className="flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <span>{online ? "En línea" : "Sin conexión"}</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
          <ClipboardList className="h-10 w-10" />
          <h1 className="text-2xl font-semibold">Faltantes / Surtido</h1>
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

        {sentToday && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-100 text-emerald-800 px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Ya enviaste tu reporte de hoy. Puedes editarlo y volver a enviarlo.
          </div>
        )}

        <Card className="p-4 space-y-3">
          <div>
            <h1 className="font-semibold text-lg">📦 Faltantes de hoy</h1>
            <p className="text-xs text-muted-foreground">
              Escribe un producto por línea.
            </p>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            autoFocus
            placeholder={"Vasos grandes\nPopotes\nServilletas\nLeche entera"}
            className="text-base leading-7 font-medium"
          />
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Comentarios (opcional)"
            className="text-sm"
          />
          <Button
            className="w-full h-12 text-base bg-slate-800 hover:bg-slate-900"
            onClick={send}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar reporte de hoy
          </Button>
        </Card>

        {recent.length > 0 && (
          <Card className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">Mis últimos reportes</h2>
            {recent.map((r) => (
              <div key={r.id} className="text-xs border-b last:border-0 py-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>{formatDayLabel(r.report_date)}</span>
                  <span>{r.items.length} productos</span>
                </div>
                <p className="text-foreground">{r.items.join(" · ")}</p>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
