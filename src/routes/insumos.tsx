import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Package, Send } from "lucide-react";
import { toast } from "sonner";
import { uuid } from "@/lib/uuid";
import { useOnline } from "@/lib/use-online";
import {
  BRANCHES,
  REASONS,
  statusInfo,
  type Branch,
  type SupplyReason,
} from "@/lib/supplies";
import { getCachedEmployees, cacheEmployees } from "@/lib/offline-queue";

export const Route = createFileRoute("/insumos")({
  component: InsumosRoute,
});

type Employee = { id: string; name: string; pin: string; color: string };
type Supply = {
  id: string;
  name: string;
  unit: string | null;
  category_id: string;
};
type MyRequest = {
  id: string;
  supply_id: string;
  quantity: number;
  status: string;
  requested_at: string;
  reason: string;
};

function InsumosRoute() {
  const navigate = useNavigate();
  const online = useOnline();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [busy, setBusy] = useState(false);

  // Form fields
  const [supplyId, setSupplyId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [reason, setReason] = useState<SupplyReason>("terminado");
  const [notes, setNotes] = useState("");

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
        }
        if (uid && navigator.onLine) {
          const [{ data: emps }, { data: sups }] = await Promise.all([
            supabase
              .from("employees")
              .select("id,name,pin,color")
              .eq("owner_id", uid)
              .eq("active", true)
              .order("name"),
            supabase
              .from("supplies")
              .select("id,name,unit,category_id")
              .eq("owner_id", uid)
              .eq("active", true)
              .order("name"),
          ]);
          if (mounted) {
            if (emps) {
              setEmployees(emps);
              await cacheEmployees(emps);
            }
            if (sups) setSupplies(sups);
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

  // Refresh my requests when employee+branch picked
  useEffect(() => {
    if (!ownerId || !employee) return;
    refreshMine();
    const channel = supabase
      .channel(`my-supply-requests-${employee.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "supply_requests",
          filter: `employee_id=eq.${employee.id}`,
        },
        () => refreshMine(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, employee?.id]);

  async function refreshMine() {
    if (!ownerId || !employee) return;
    const { data } = await supabase
      .from("supply_requests")
      .select("id,supply_id,quantity,status,requested_at,reason")
      .eq("owner_id", ownerId)
      .eq("employee_id", employee.id)
      .order("requested_at", { ascending: false })
      .limit(20);
    setMyRequests((data ?? []) as MyRequest[]);
  }

  function pinPress(n: string) {
    if (n === "del") setPin((p) => p.slice(0, -1));
    else if (pin.length < 4) setPin((p) => p + n);
  }

  async function send() {
    if (!ownerId || !employee || !branch || !supplyId) {
      toast.error("Completa los campos");
      return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Cantidad inválida");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("supply_requests").insert({
        client_id: uuid(),
        owner_id: ownerId,
        employee_id: employee.id,
        branch,
        supply_id: supplyId,
        quantity: q,
        reason,
        notes: notes || null,
        status: "pendiente",
      });
      if (error) throw error;
      toast.success("Solicitud enviada");
      setSupplyId("");
      setQuantity("1");
      setReason("terminado");
      setNotes("");
      refreshMine();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
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
      <div className="min-h-screen bg-gradient-to-br from-amber-950 via-orange-900 to-amber-950 text-white flex flex-col p-5">
        <div className="flex items-center justify-between text-sm text-white/70">
          <Link to="/" className="flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <span>{online ? "En línea" : "Sin conexión"}</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
          <Package className="h-10 w-10" />
          <h1 className="text-2xl font-semibold">Solicitar Insumos</h1>
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
            {employee.name} · {BRANCHES.find((b) => b.id === branch)?.name}
          </span>
        </div>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" /> Nueva solicitud
          </h2>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Producto</label>
            <Select value={supplyId} onValueChange={setSupplyId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige producto" />
              </SelectTrigger>
              <SelectContent>
                {supplies.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Cantidad</label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Motivo</label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as SupplyReason)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Observaciones
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Opcional"
            />
          </div>
          <Button
            className="w-full bg-amber-600 hover:bg-amber-700"
            onClick={send}
            disabled={busy || !online}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}{" "}
            Enviar solicitud
          </Button>
          {!online && (
            <p className="text-xs text-amber-700 text-center">
              Se necesita conexión para enviar la solicitud.
            </p>
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-sm">Mis solicitudes recientes</h3>
          {myRequests.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin solicitudes aún</p>
          )}
          <ul className="divide-y">
            {myRequests.map((r) => {
              const s = statusInfo(r.status);
              const supply = supplies.find((x) => x.id === r.supply_id);
              return (
                <li
                  key={r.id}
                  className="py-2 flex items-center justify-between text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {supply?.name ?? "Producto"} · {r.quantity}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.requested_at).toLocaleString("es-MX")}
                    </p>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs text-white"
                    style={{ backgroundColor: s.color }}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
