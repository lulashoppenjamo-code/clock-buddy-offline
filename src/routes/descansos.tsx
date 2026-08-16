import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  weekdayName,
  todayISO,
  formatDateLong,
  type RestSchedule,
  type RestOverride,
  type RestDay,
} from "@/lib/rest-days";

export const Route = createFileRoute("/descansos")({
  head: () => ({
    meta: [
      { title: "Mis descansos | Lula Shop" },
      {
        name: "description",
        content: "Consulta tu día de descanso habitual, tus cambios programados y tus domingos bono.",
      },
      { property: "og:title", content: "Mis descansos | Lula Shop" },
      {
        property: "og:description",
        content: "Día habitual, próximos cambios y domingos de premio por metas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DescansosRoute,
});

type Employee = { id: string; name: string; pin: string; color: string; branch: string | null };

function DescansosRoute() {
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-950 to-sky-950 text-white flex flex-col p-5">
        <div className="flex items-center justify-between text-sm">
          <Link to="/" className="flex items-center gap-1 text-white/70">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <span className="font-medium">🛌 Descansos</span>
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

  return <DescansosPanel employee={selected} ownerId={ownerId!} onExit={() => setSelected(null)} />;
}

function DescansosPanel({
  employee,
  ownerId,
  onExit,
}: {
  employee: Employee;
  ownerId: string;
  onExit: () => void;
}) {
  const [schedule, setSchedule] = useState<RestSchedule | null>(null);
  const [overrides, setOverrides] = useState<RestOverride[]>([]);
  const [bonuses, setBonuses] = useState<RestDay[]>([]);
  const today = todayISO();

  useEffect(() => {
    (async () => {
      const [{ data: sch }, { data: ovr }, { data: bon }] = await Promise.all([
        supabase
          .from("rest_schedule")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("employee_id", employee.id)
          .maybeSingle(),
        supabase
          .from("rest_overrides")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("employee_id", employee.id)
          .order("new_date"),
        supabase
          .from("rest_days")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("employee_id", employee.id)
          .order("rest_date", { ascending: false }),
      ]);
      setSchedule((sch as any) ?? null);
      setOverrides((ovr as any) ?? []);
      setBonuses((bon as any) ?? []);
    })();
  }, [ownerId, employee.id]);

  const upcoming = overrides.filter((o) => o.new_date >= today);
  const past = overrides.filter((o) => o.new_date < today);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-sky-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onExit} className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Salir
        </button>
        <h1 className="font-semibold">🛌 {employee.name}</h1>
        <span />
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Tu día de descanso habitual</p>
          <p className="text-2xl font-bold text-indigo-700">{weekdayName(schedule?.weekday)}</p>
          {employee.branch && (
            <p className="text-xs text-muted-foreground mt-1">Sucursal: {employee.branch}</p>
          )}
        </Card>

        <Tabs defaultValue="cambios">
          <TabsList className="w-full">
            <TabsTrigger value="cambios" className="flex-1">Próximos cambios</TabsTrigger>
            <TabsTrigger value="bonos" className="flex-1">Domingos bono</TabsTrigger>
          </TabsList>

          <TabsContent value="cambios" className="space-y-2 pt-3">
            {upcoming.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                No tienes cambios programados
              </p>
            )}
            {upcoming.map((o) => (
              <Card key={o.id} className="p-3">
                <div className="flex items-center gap-2">
                  <span>🔁</span>
                  <p className="text-sm font-medium">{formatDateLong(o.new_date)}</p>
                </div>
                {o.original_weekday !== null && (
                  <p className="text-xs text-muted-foreground">
                    En lugar de tu {weekdayName(o.original_weekday)}
                  </p>
                )}
                {o.reason && <p className="text-xs mt-1">📝 {o.reason}</p>}
              </Card>
            ))}

            {past.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground pt-3">Anteriores</p>
                {past.map((o) => (
                  <Card key={o.id} className="p-3 opacity-70">
                    <p className="text-sm">{formatDateLong(o.new_date)}</p>
                    {o.reason && <p className="text-xs mt-1">📝 {o.reason}</p>}
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="bonos" className="space-y-2 pt-3">
            {bonuses.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                Aún no tienes domingos bono
              </p>
            )}
            {bonuses.map((b) => (
              <Card key={b.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">🎁 {formatDateLong(b.rest_date)}</p>
                  <Badge className="bg-amber-100 text-amber-800">bono</Badge>
                </div>
                {b.reason && <p className="text-xs mt-1 text-muted-foreground">{b.reason}</p>}
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
