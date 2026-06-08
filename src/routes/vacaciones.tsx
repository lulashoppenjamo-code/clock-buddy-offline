import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Send, Calendar } from "lucide-react";
import { uuid } from "@/lib/uuid";
import { computeBalance, daysBetween, type Balance, type VacationRequest } from "@/lib/vacations";

export const Route = createFileRoute("/vacaciones")({
  component: VacacionesRoute,
});

type Employee = { id: string; name: string; pin: string; color: string; hire_date: string | null; branch: string | null };

function VacacionesRoute() {
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
          .select("id,name,pin,color,hire_date,branch")
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
      <div className="min-h-screen bg-gradient-to-br from-teal-950 via-emerald-950 to-teal-950 text-white flex flex-col p-5">
        <div className="flex items-center justify-between text-sm">
          <Link to="/" className="flex items-center gap-1 text-white/70">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <span className="font-medium">🌴 Vacaciones</span>
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

  return (
    <VacacionesPanel
      employee={selected}
      ownerId={ownerId!}
      onExit={() => setSelected(null)}
    />
  );
}

function VacacionesPanel({
  employee,
  ownerId,
  onExit,
}: {
  employee: Employee;
  ownerId: string;
  onExit: () => void;
}) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => daysBetween(start, end), [start, end]);

  async function load() {
    const b = await computeBalance(ownerId, employee.id, employee.hire_date);
    setBalance(b);
    const { data } = await supabase
      .from("vacation_requests")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false });
    setRequests((data as any) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`vac-emp-${employee.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vacation_requests", filter: `employee_id=eq.${employee.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  async function submit() {
    if (!employee.hire_date) {
      toast.error("Pide al administrador que registre tu fecha de ingreso");
      return;
    }
    if (!start || !end) {
      toast.error("Selecciona fechas de inicio y fin");
      return;
    }
    if (days <= 0) {
      toast.error("La fecha de fin debe ser posterior o igual al inicio");
      return;
    }
    if (balance && days > balance.available) {
      toast.error(`Solo tienes ${balance.available} día(s) disponibles`);
      return;
    }
    if (!navigator.onLine) {
      toast.error("Se requiere conexión a internet para enviar la solicitud");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("vacation_requests").insert({
      owner_id: ownerId,
      employee_id: employee.id,
      client_id: uuid(),
      start_date: start,
      end_date: end,
      days_requested: days,
      employee_comment: comment || null,
      status: "pendiente",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Solicitud enviada");
    setStart("");
    setEnd("");
    setComment("");
    load();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onExit} className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Salir
        </button>
        <h1 className="font-semibold">🌴 {employee.name}</h1>
        <span />
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Antigüedad" value={`${balance?.seniorityYears ?? 0} año(s)`} />
            <Stat label="Disponibles" value={`${balance?.available ?? 0}`} accent />
            <Stat label="Usados" value={`${balance?.used ?? 0}`} />
          </div>
          {!employee.hire_date && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 p-2 rounded">
              Tu fecha de ingreso no está registrada. Pide al administrador que la configure.
            </p>
          )}
        </Card>

        <Tabs defaultValue="new">
          <TabsList className="w-full">
            <TabsTrigger value="new" className="flex-1">Nueva solicitud</TabsTrigger>
            <TabsTrigger value="mine" className="flex-1">Mis solicitudes</TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-3 pt-3">
            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="s">Inicio</Label>
                  <Input id="s" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="e">Fin</Label>
                  <Input id="e" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              <div className="text-center text-sm bg-emerald-50 text-emerald-800 rounded p-2 flex items-center justify-center gap-2">
                <Calendar className="h-4 w-4" />
                {days > 0 ? `${days} día(s) solicitados` : "Selecciona fechas"}
              </div>
              <div>
                <Label htmlFor="c">Comentario (opcional)</Label>
                <Textarea id="c" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
              </div>
              <Button onClick={submit} disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar solicitud
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="mine" className="space-y-2 pt-3">
            {requests.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Aún no tienes solicitudes</p>
            )}
            {requests.map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">
                      {r.start_date} → {r.end_date}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.days_requested} día(s)</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.employee_comment && (
                  <p className="text-xs mt-2 text-muted-foreground">📝 {r.employee_comment}</p>
                )}
                {r.admin_comment && (
                  <p className="text-xs mt-1 text-rose-700">Admin: {r.admin_comment}</p>
                )}
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-bold text-lg ${accent ? "text-emerald-700" : ""}`}>{value}</p>
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
