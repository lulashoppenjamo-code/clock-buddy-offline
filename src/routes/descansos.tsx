import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ChevronLeft, ChevronRight, CalendarPlus2, Send, Gift } from "lucide-react";
import {
  WEEKDAYS,
  weekdayName,
  todayISO,
  isSunday,
  toISODate,
  formatDateLong,
  monthGrid,
  buildCalendar,
  fetchRestData,
  fetchChangeRequests,
  sundayRestTakenBy,
  type RestSchedule,
  type RestOverride,
  type RestDay,
  type RestChangeRequest,
} from "@/lib/rest-days";
import { UnifiedCalendar } from "@/components/UnifiedCalendar";
import { EmployeeVacaciones } from "@/components/vacaciones/EmployeeVacaciones";

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

type Employee = { id: string; name: string; pin: string; color: string; branch: string | null; hire_date: string | null };

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
          .select("id,name,pin,color,branch,hire_date")
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
          <span className="font-medium">🛌 Descansos y vacaciones</span>
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
    <DescansosPanel
      employee={selected}
      allEmployees={employees}
      ownerId={ownerId!}
      onExit={() => setSelected(null)}
    />
  );
}

function DescansosPanel({
  employee,
  allEmployees,
  ownerId,
  onExit,
}: {
  employee: Employee;
  allEmployees: Employee[];
  ownerId: string;
  onExit: () => void;
}) {
  const [schedule, setSchedule] = useState<RestSchedule | null>(null);
  const [allSchedules, setAllSchedules] = useState<RestSchedule[]>([]);
  const [overrides, setOverrides] = useState<RestOverride[]>([]);
  const [allOverrides, setAllOverrides] = useState<RestOverride[]>([]);
  const [bonuses, setBonuses] = useState<RestDay[]>([]);
  const [allBonuses, setAllBonuses] = useState<RestDay[]>([]);
  const [requests, setRequests] = useState<RestChangeRequest[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [bonoOpen, setBonoOpen] = useState(false);
  const today = todayISO();

  async function load() {
    const [{ data: sch }, rest, reqs] = await Promise.all([
      supabase
        .from("rest_schedule")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("employee_id", employee.id)
        .maybeSingle(),
      fetchRestData(ownerId),
      fetchChangeRequests(ownerId, employee.id),
    ]);
    setSchedule((sch as any) ?? null);
    setAllSchedules(rest.schedules);
    setAllOverrides(rest.overrides);
    setAllBonuses(rest.bonuses);
    setOverrides(rest.overrides.filter((o) => o.employee_id === employee.id));
    setBonuses(rest.bonuses.filter((b) => b.employee_id === employee.id));
    setRequests(reqs);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, employee.id]);

  const upcoming = overrides.filter((o) => o.new_date >= today);
  const past = overrides.filter((o) => o.new_date < today);
  const pendingRequests = requests.filter((r) => r.status === "pendiente");

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-sky-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onExit} className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Salir
        </button>
        <h1 className="font-semibold">🛌🌴 {employee.name}</h1>
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

        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => setRequestOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <CalendarPlus2 className="h-4 w-4" /> Cambiar día
          </Button>
          <Button
            onClick={() => setBonoOpen(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Gift className="h-4 w-4" /> Pedir domingo bono
          </Button>
        </div>


        <Tabs defaultValue="equipo">
          <TabsList className="w-full flex-wrap h-auto">
            <TabsTrigger value="equipo" className="flex-1">Equipo</TabsTrigger>
            <TabsTrigger value="cambios" className="flex-1">Mis cambios</TabsTrigger>
            <TabsTrigger value="solicitudes" className="flex-1">
              Mis solicitudes
              {pendingRequests.length > 0 && (
                <Badge className="ml-1.5 bg-amber-500 hover:bg-amber-500 px-1.5">
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="bonos" className="flex-1">Bonos</TabsTrigger>
            <TabsTrigger value="vacaciones" className="flex-1">🌴 Vacaciones</TabsTrigger>
          </TabsList>

          <TabsContent value="vacaciones" className="pt-3">
            <EmployeeVacaciones employee={employee} ownerId={ownerId} />
          </TabsContent>

          <TabsContent value="equipo" className="pt-3">
            <UnifiedCalendar
              ownerId={ownerId}
              employees={allEmployees}
              schedules={allSchedules}
              overrides={allOverrides}
              bonuses={allBonuses}
              note="Descansos, cambios, domingos bono y vacaciones del equipo"
            />
          </TabsContent>

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

          <TabsContent value="solicitudes" className="space-y-2 pt-3">
            {requests.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                Aún no has enviado solicitudes
              </p>
            )}
            {requests.map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{formatDateLong(r.requested_date)}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      className={
                        r.request_type === "bono"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-indigo-100 text-indigo-800"
                      }
                    >
                      {r.request_type === "bono" ? "🎁 Bono" : "🔁 Cambio"}
                    </Badge>
                    <Badge
                      className={
                        r.status === "aprobada"
                          ? "bg-emerald-100 text-emerald-800"
                          : r.status === "rechazada"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                </div>
                {r.reason && <p className="text-xs mt-1 text-muted-foreground">📝 {r.reason}</p>}
                {r.admin_comment && (
                  <p className="text-xs mt-1 text-rose-700">Admin: {r.admin_comment}</p>
                )}
              </Card>
            ))}
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

      <RequestChangeDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        ownerId={ownerId}
        employee={employee}
        schedule={schedule}
        onSent={load}
      />

      <RequestBonoDialog
        open={bonoOpen}
        onOpenChange={setBonoOpen}
        ownerId={ownerId}
        employee={employee}
        onSent={load}
      />

    </div>
  );
}

/* ------------------------------ Solicitar cambio ------------------------------ */

function RequestChangeDialog({
  open,
  onOpenChange,
  ownerId,
  employee,
  schedule,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ownerId: string;
  employee: Employee;
  schedule: RestSchedule | null;
  onSent: () => void;
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!date) {
      toast.error("Elige la fecha en la que quieres descansar");
      return;
    }
    if (isSunday(date)) {
      const taken = await sundayRestTakenBy(ownerId, date, employee.id);
      if (taken) {
        toast.error("Ese domingo ya lo tiene otra colaboradora, elige otro");
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase.from("rest_change_requests").insert({
      owner_id: ownerId,
      employee_id: employee.id,
      requested_date: date,
      original_weekday: schedule?.weekday ?? null,
      reason: reason || null,
      status: "pendiente",
      request_type: "cambio",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Solicitud enviada, espera la autorización de tu jefa");
    setDate("");
    setReason("");
    onOpenChange(false);
    onSent();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar cambio de día</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Tu día habitual es {weekdayName(schedule?.weekday)}. Elige el nuevo día en que quieres
            descansar; tu jefa debe autorizarlo antes de que quede confirmado.
          </p>
          <div>
            <Label htmlFor="rq-date">Nueva fecha</Label>
            <Input id="rq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rq-reason">Motivo (opcional)</Label>
            <Textarea
              id="rq-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Solicitar domingo bono ------------------------------ */

function RequestBonoDialog({
  open,
  onOpenChange,
  ownerId,
  employee,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ownerId: string;
  employee: Employee;
  onSent: () => void;
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!date) {
      toast.error("Elige el domingo que quieres descansar");
      return;
    }
    if (!isSunday(date)) {
      toast.error("El domingo bono debe caer en domingo");
      return;
    }
    {
      const taken = await sundayRestTakenBy(ownerId, date, employee.id);
      if (taken) {
        toast.error("Ese domingo ya lo tiene otra colaboradora, elige otro");
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase.from("rest_change_requests").insert({
      owner_id: ownerId,
      employee_id: employee.id,
      requested_date: date,
      original_weekday: null,
      reason: reason || null,
      status: "pendiente",
      request_type: "bono",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Solicitud de domingo bono enviada");
    setDate("");
    setReason("");
    onOpenChange(false);
    onSent();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-amber-600" /> Pedir domingo bono
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Los domingos bono son un premio por cumplir tu meta. Elige el domingo que quieres
            descansar; tu jefa debe autorizarlo.
          </p>
          <div>
            <Label htmlFor="bn-date">Domingo</Label>
            <Input id="bn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="bn-reason">Motivo (opcional)</Label>
            <Textarea
              id="bn-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: cumplí mi meta de ventas de julio"
              maxLength={300}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="bg-amber-500 hover:bg-amber-600 text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
