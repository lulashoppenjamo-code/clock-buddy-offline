import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cacheEmployees } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus, Loader2, Edit2, Clock } from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WEEKDAYS } from "@/lib/rest-days";
import {
  DEFAULT_DRAFT,
  TOLERANCE_MINUTES,
  fetchSchedules,
  saveSchedules,
  trimTime,
  type ScheduleDraft,
} from "@/lib/schedule";

export const Route = createFileRoute("/empleadas")({
  component: EmployeesRoute,
});

function EmployeesRoute() {
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
      <EmployeesPage />
    </AdminGate>
  );
}

type Employee = {
  id: string;
  name: string;
  pin: string;
  color: string;
  active: boolean;
  hire_date: string | null;
  branch: string | null;
};

const COLORS = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#06b6d4", "#8b5cf6"];
const DEFAULTS = ["Leslie", "Ana", "Esmeralda"];

function EmployeesPage() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [hireDate, setHireDate] = useState("");
  const [branch, setBranch] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Employee | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        navigate({ to: "/auth" });
        return;
      }
      setOwnerId(uid);
      await load(uid);
      setLoading(false);
    });
  }, [navigate]);

  async function load(uid: string) {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("owner_id", uid)
      .order("created_at");
    if (error) {
      toast.error(error.message);
      return;
    }
    setEmployees((data as any) ?? []);
    await cacheEmployees(((data as any) ?? []).filter((e: Employee) => e.active));
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerId) return;
    if (!/^\d{4}$/.test(pin)) {
      toast.error("El PIN debe ser de 4 dígitos");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("employees").insert({
      owner_id: ownerId,
      name: name.trim(),
      pin,
      color,
      hire_date: hireDate || null,
      branch: branch || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("unique") ? "Ese PIN ya está en uso" : error.message);
      return;
    }
    setName("");
    setPin("");
    setHireDate("");
    setBranch("");
    setColor(COLORS[(employees.length + 1) % COLORS.length]);
    toast.success("Colaborador agregado");
    await load(ownerId);
  }

  async function quickAdd(n: string) {
    if (!ownerId) return;
    setName(n);
    setTimeout(() => document.getElementById("pin-input")?.focus(), 0);
  }

  async function remove(id: string) {
    if (!ownerId) return;
    if (!confirm("¿Eliminar este colaborador y todas sus checadas?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Eliminado");
    await load(ownerId);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const existingNames = new Set(employees.map((e) => e.name.toLowerCase()));
  const suggestions = DEFAULTS.filter((n) => !existingNames.has(n.toLowerCase()));

  return (
    <div className="min-h-screen bg-pink-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold">Colaboradores</h1>
        <button onClick={signOut} className="text-sm text-muted-foreground">
          Salir
        </button>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-4">
          <h2 className="font-medium mb-3">Agregar colaborador</h2>
          <form onSubmit={addEmployee} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Nombre completo"
              />
              {suggestions.length > 0 && (
                <div className="flex gap-1 flex-wrap pt-1">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => quickAdd(s)}
                      className="text-xs px-2 py-1 rounded-full bg-pink-100 text-pink-700 hover:bg-pink-200"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin-input">PIN (4 dígitos)</Label>
              <Input
                id="pin-input"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                required
                placeholder="0000"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="hd">Fecha de ingreso</Label>
                <Input id="hd" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Sucursal</Label>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mina">Mina</SelectItem>
                    <SelectItem value="morelos">Morelos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition-transform ${
                      color === c ? "ring-2 ring-offset-2 ring-pink-900 scale-110" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </form>
        </Card>

        <div className="space-y-2">
          {employees.map((e) => (
            <Card key={e.id} className="p-3 flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold"
                style={{ backgroundColor: e.color }}
              >
                {e.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{e.name}</p>
                <p className="text-xs text-muted-foreground">
                  Ingreso: {e.hire_date ?? "—"} · {e.branch ?? "—"}
                </p>
              </div>
              <button
                onClick={() => setScheduleFor(e)}
                className="p-2 text-muted-foreground hover:text-foreground"
                aria-label="Horario"
                title="Horario semanal"
              >
                <Clock className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEditing(e)}
                className="p-2 text-muted-foreground hover:text-foreground"
                aria-label="Editar"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(e.id)}
                className="p-2 text-muted-foreground hover:text-destructive"
                aria-label="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
          {employees.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">Aún no hay colaboradores</p>
          )}
        </div>
      </div>

      {editing && (
        <EditEmployeeDialog
          employee={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            if (ownerId) load(ownerId);
          }}
        />
      )}
    </div>
  );
}

function EditEmployeeDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [pin, setPin] = useState(employee.pin);
  const [hireDate, setHireDate] = useState(employee.hire_date ?? "");
  const [branch, setBranch] = useState(employee.branch ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!/^\d{4}$/.test(pin)) {
      toast.error("PIN inválido");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("employees")
      .update({
        name: name.trim(),
        pin,
        hire_date: hireDate || null,
        branch: branch || null,
      })
      .eq("id", employee.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Actualizado");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar colaborador</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>PIN</Label>
            <Input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <Label>Fecha de ingreso</Label>
            <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </div>
          <div>
            <Label>Sucursal</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mina">Mina</SelectItem>
                <SelectItem value="morelos">Morelos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
