import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Plus, Search, Trash2, Pencil, RefreshCw, MessageCircle, QrCode } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";

export const Route = createFileRoute("/clientes")({
  component: ClientesRoute,
});

type Customer = {
  id: string;
  owner_id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  school: string | null;
  discount_type: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  code: string;
  active: boolean;
};

type Status = "activo" | "por_vencer" | "vencido" | "sin_fecha";

function statusOf(c: Customer): Status {
  if (!c.end_date) return "sin_fecha";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(c.end_date + "T00:00:00");
  const diff = Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "vencido";
  if (diff <= 15) return "por_vencer";
  return "activo";
}

const STATUS_META: Record<Status, { label: string; dot: string; badge: string }> = {
  activo: { label: "Activo", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  por_vencer: { label: "Por vencer", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  vencido: { label: "Vencido", dot: "bg-red-500", badge: "bg-red-100 text-red-800" },
  sin_fecha: { label: "Sin vigencia", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-700" },
};

function genCode() {
  return "CLI-" + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase();
}

function ClientesRoute() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) navigate({ to: "/auth" });
      else setOwnerId(uid);
    });
  }, [navigate]);

  if (!ownerId) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AdminGate ownerId={ownerId}>
      <ClientesPage ownerId={ownerId} />
    </AdminGate>
  );
}

function ClientesPage({ ownerId }: { ownerId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [discountFilter, setDiscountFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("owner_id", ownerId)
      .order("name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Customer[]);
    setLoading(false);
  }

  const schools = useMemo(
    () => Array.from(new Set(rows.map((r) => r.school).filter(Boolean) as string[])).sort(),
    [rows]
  );
  const discounts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.discount_type).filter(Boolean) as string[])).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (schoolFilter !== "all" && (r.school ?? "") !== schoolFilter) return false;
      if (discountFilter !== "all" && (r.discount_type ?? "") !== discountFilter) return false;
      if (statusFilter !== "all" && statusOf(r) !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.whatsapp ?? "").toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, schoolFilter, statusFilter, discountFilter]);

  const counts = useMemo(() => {
    const c = { activo: 0, por_vencer: 0, vencido: 0, sin_fecha: 0 };
    for (const r of rows) c[statusOf(r)]++;
    return c;
  }, [rows]);

  function openNew() {
    setEditing({
      id: "",
      owner_id: ownerId,
      name: "",
      phone: "",
      whatsapp: "",
      email: "",
      school: "",
      discount_type: "",
      start_date: new Date().toISOString().slice(0, 10),
      end_date: "",
      notes: "",
      code: genCode(),
      active: true,
    });
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing({ ...c });
    setDialogOpen(true);
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    const payload = {
      owner_id: ownerId,
      name: editing.name.trim(),
      phone: editing.phone || null,
      whatsapp: editing.whatsapp || null,
      email: editing.email || null,
      school: editing.school || null,
      discount_type: editing.discount_type || null,
      start_date: editing.start_date || null,
      end_date: editing.end_date || null,
      notes: editing.notes || null,
      code: editing.code || genCode(),
      active: editing.active,
    };
    if (editing.id) {
      const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Cliente actualizado");
    } else {
      const { error } = await supabase.from("customers").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Cliente agregado");
    }
    setDialogOpen(false);
    setEditing(null);
    load();
  }

  async function remove(c: Customer) {
    if (!confirm(`¿Eliminar a ${c.name}?`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    load();
  }

  async function renew(c: Customer, months = 12) {
    const base = new Date();
    base.setMonth(base.getMonth() + months);
    const end = base.toISOString().slice(0, 10);
    const { error } = await supabase
      .from("customers")
      .update({ start_date: new Date().toISOString().slice(0, 10), end_date: end })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(`Vigencia renovada hasta ${end}`);
    load();
  }

  function sendWhats(c: Customer) {
    const num = (c.whatsapp || c.phone || "").replace(/\D/g, "");
    if (!num) {
      toast.error("Sin número de WhatsApp");
      return;
    }
    const st = statusOf(c);
    let msg = "";
    if (st === "vencido") {
      msg = `Hola ${c.name} 👋, tu convenio${c.discount_type ? " (" + c.discount_type + ")" : ""} venció el ${c.end_date}. ¡Renuévalo hoy y sigue disfrutando tus descuentos! 💖`;
    } else if (st === "por_vencer") {
      msg = `Hola ${c.name} 👋, te recordamos que tu convenio${c.discount_type ? " (" + c.discount_type + ")" : ""} vence el ${c.end_date}. Renuévalo con tiempo y conserva tus beneficios. ✨`;
    } else {
      msg = `Hola ${c.name} 👋, te compartimos una promoción especial por ser cliente con convenio${c.discount_type ? " (" + c.discount_type + ")" : ""}. ¡Aprovéchala! 💅✨`;
    }
    const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-100">
      <header className="bg-white/80 backdrop-blur border-b border-pink-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-1 text-sm text-pink-700">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold text-pink-900">Clientes con Convenio</h1>
        <Button size="sm" onClick={openNew} className="bg-pink-600 hover:bg-pink-700">
          <Plus className="h-4 w-4 mr-1" /> Nuevo
        </Button>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Contadores */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-pink-900">{rows.length}</p>
          </Card>
          <Card className="p-3 text-center border-emerald-200">
            <p className="text-xs text-emerald-700">Activos</p>
            <p className="text-2xl font-bold text-emerald-700">{counts.activo}</p>
          </Card>
          <Card className="p-3 text-center border-amber-200">
            <p className="text-xs text-amber-700">Por vencer</p>
            <p className="text-2xl font-bold text-amber-700">{counts.por_vencer}</p>
          </Card>
          <Card className="p-3 text-center border-red-200">
            <p className="text-xs text-red-700">Vencidos</p>
            <p className="text-2xl font-bold text-red-700">{counts.vencido}</p>
          </Card>
        </div>

        {/* Búsqueda + filtros */}
        <Card className="p-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono o código..."
                className="pl-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={schoolFilter} onValueChange={setSchoolFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Escuela" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las escuelas</SelectItem>
                {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="por_vencer">Por vencer</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
                <SelectItem value="sin_fecha">Sin vigencia</SelectItem>
              </SelectContent>
            </Select>
            <Select value={discountFilter} onValueChange={setDiscountFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Descuento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los descuentos</SelectItem>
                {discounts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Lista */}
        {loading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-pink-600" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No hay clientes que coincidan.
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const st = statusOf(c);
              const meta = STATUS_META[st];
              return (
                <Card key={c.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`h-3 w-3 mt-1.5 rounded-full ${meta.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-pink-900 truncate">{c.name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.badge}`}>
                          {meta.label}
                        </span>
                        {c.discount_type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 text-pink-800">
                            {c.discount_type}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                        {c.school && <div>🏫 {c.school}</div>}
                        {(c.phone || c.whatsapp) && <div>📞 {c.whatsapp || c.phone}</div>}
                        {c.end_date && <div>📅 Vence: {c.end_date}</div>}
                        <div className="flex items-center gap-1"><QrCode className="h-3 w-3" /> {c.code}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Button size="sm" variant="outline" onClick={() => sendWhats(c)} className="h-7 text-xs">
                          <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => renew(c)} className="h-7 text-xs">
                          <RefreshCw className="h-3 w-3 mr-1" /> Renovar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(c)} className="h-7 text-xs">
                          <Pencil className="h-3 w-3 mr-1" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => remove(c)} className="h-7 text-xs text-red-600">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Nombre *</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Teléfono</Label>
                  <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input value={editing.whatsapp ?? ""} onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} placeholder="+52..." />
                </div>
              </div>
              <div>
                <Label>Correo</Label>
                <Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div>
                <Label>Escuela / Sucursal de origen</Label>
                <Input value={editing.school ?? ""} onChange={(e) => setEditing({ ...editing, school: e.target.value })} />
              </div>
              <div>
                <Label>Tipo de descuento</Label>
                <Input value={editing.discount_type ?? ""} onChange={(e) => setEditing({ ...editing, discount_type: e.target.value })} placeholder="10%, 15%, VIP..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Fecha de inicio</Label>
                  <Input type="date" value={editing.start_date ?? ""} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
                </div>
                <div>
                  <Label>Fecha de vencimiento</Label>
                  <Input type="date" value={editing.end_date ?? ""} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Código (QR / barras)</Label>
                <div className="flex gap-2">
                  <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
                  <Button type="button" variant="outline" onClick={() => setEditing({ ...editing, code: genCode() })}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Observaciones</Label>
                <Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-pink-600 hover:bg-pink-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
