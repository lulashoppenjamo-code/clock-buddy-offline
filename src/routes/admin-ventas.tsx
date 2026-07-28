import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import {
  ADDON_STATUSES,
  BRANCHES,
  addonStatusInfo,
  branchName,
  periodRanges,
  type AddonSale,
  type AddonSaleStatus,
} from "@/lib/addon-sales";

export const Route = createFileRoute("/admin-ventas")({
  head: () => ({
    meta: [
      { title: "Dashboard de Ventas Agregadas · lula shop" },
      {
        name: "description",
        content:
          "Ranking por colaboradora, totales diarios, semanales y mensuales, y validación de evidencias.",
      },
      {
        property: "og:title",
        content: "Dashboard de Ventas Agregadas · lula shop",
      },
      {
        property: "og:description",
        content:
          "Ranking por colaboradora, totales diarios, semanales y mensuales, y validación de evidencias.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Wrapper,
});

function Wrapper() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        navigate({ to: "/auth" });
        return;
      }
      setOwnerId(uid);
      setChecking(false);
    });
  }, [navigate]);

  if (checking || !ownerId) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <AdminGate ownerId={ownerId}>
      <AdminVentas ownerId={ownerId} />
    </AdminGate>
  );
}

function AdminVentas({ ownerId }: { ownerId: string }) {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<AddonSale[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; color: string }[]>([]);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fBranch, setFBranch] = useState("all");
  const [fEmployee, setFEmployee] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<AddonSale | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function load() {
    setLoading(true);
    const [{ data: rows }, { data: emps }] = await Promise.all([
      supabase
        .from("addon_sales")
        .select("*")
        .eq("owner_id", ownerId)
        .order("sold_at", { ascending: false })
        .limit(1000),
      supabase
        .from("employees")
        .select("id,name,color")
        .eq("owner_id", ownerId)
        .order("name"),
    ]);
    setSales((rows ?? []) as AddonSale[]);
    setEmployees(emps ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const t = new Date(s.sold_at).getTime();
      if (fFrom && t < new Date(`${fFrom}T00:00:00`).getTime()) return false;
      if (fTo && t > new Date(`${fTo}T23:59:59`).getTime()) return false;
      if (fBranch !== "all" && s.branch !== fBranch) return false;
      if (fEmployee !== "all" && s.employee_id !== fEmployee) return false;
      if (fStatus !== "all" && s.status !== fStatus) return false;
      return true;
    });
  }, [sales, fFrom, fTo, fBranch, fEmployee, fStatus]);

  const totals = useMemo(() => {
    const { day, week, month } = periodRanges();
    const valid = filtered.filter((s) => s.status !== "rechazado");
    const count = (from: Date) =>
      valid.filter((s) => new Date(s.sold_at) >= from).length;
    return { day: count(day), week: count(week), month: count(month) };
  }, [filtered]);

  const ranking = useMemo(() => {
    const map = new Map<string, { name: string; total: number; validated: number }>();
    for (const s of filtered) {
      const cur = map.get(s.employee_id) ?? {
        name: s.employee_name,
        total: 0,
        validated: 0,
      };
      cur.total += 1;
      if (s.status === "validado") cur.validated += 1;
      map.set(s.employee_id, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  async function openPhoto(path: string) {
    const { data, error } = await supabase.storage
      .from("checador-photos")
      .createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error("No se pudo abrir la evidencia");
      return;
    }
    setPhotoUrl(data.signedUrl);
  }

  async function setStatus(sale: AddonSale, status: AddonSaleStatus) {
    const { error } = await supabase
      .from("addon_sales")
      .update({
        status,
        reviewed_by: ownerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", sale.id);
    if (error) return toast.error(error.message);
    setSales((prev) =>
      prev.map((s) => (s.id === sale.id ? { ...s, status } : s)),
    );
    toast.success(status === "validado" ? "Registro validado" : "Registro rechazado");
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editing.ticket_number.trim()) {
      toast.error("El número de ticket es obligatorio");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("addon_sales")
      .update({
        main_product: editing.main_product,
        addon_product: editing.addon_product,
        ticket_number: editing.ticket_number,
        comment: editing.comment,
        branch: editing.branch,
      })
      .eq("id", editing.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setSales((prev) => prev.map((s) => (s.id === editing.id ? editing : s)));
    setEditing(null);
    toast.success("Registro actualizado");
  }

  async function remove(sale: AddonSale) {
    if (!confirm("¿Eliminar este registro?")) return;
    const { error } = await supabase.from("addon_sales").delete().eq("id", sale.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from("checador-photos").remove([sale.photo_path]);
    setSales((prev) => prev.filter((s) => s.id !== sale.id));
    toast.success("Registro eliminado");
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link
            to="/admin"
            className="text-sm flex items-center gap-1 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Reportes
          </Link>
          <h1 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Ventas Agregadas
          </h1>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Hoy", value: totals.day },
            { label: "Esta semana", value: totals.week },
            { label: "Este mes", value: totals.month },
          ].map((t) => (
            <Card key={t.label} className="p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{t.value}</p>
              <p className="text-xs text-muted-foreground">{t.label}</p>
            </Card>
          ))}
        </div>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold text-sm">Filtros</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={fBranch} onValueChange={setFBranch}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {BRANCHES.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fEmployee} onValueChange={setFEmployee}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ADDON_STATUSES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <h2 className="font-semibold text-sm">Ranking por colaboradora</h2>
          {ranking.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin datos en el filtro</p>
          )}
          <ul className="divide-y">
            {ranking.map((r, i) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-6 text-center font-bold text-pink-600">
                    {i + 1}
                  </span>
                  {r.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.total} registro(s) · {r.validated} validado(s)
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="divide-y overflow-hidden">
          {filtered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              Sin registros
            </p>
          )}
          {filtered.map((s) => {
            const st = addonStatusInfo(s.status);
            return (
              <div key={s.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {s.main_product} + {s.addon_product}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.employee_name} · {branchName(s.branch as any)} · Ticket{" "}
                      {s.ticket_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.sold_at).toLocaleString("es-MX", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        hour12: true,
                      })}
                    </p>
                    {s.comment && (
                      <p className="text-xs mt-1 italic">{s.comment}</p>
                    )}
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs text-white shrink-0"
                    style={{ backgroundColor: st.color }}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openPhoto(s.photo_path)}>
                    <ImageIcon className="h-4 w-4" /> Ticket
                  </Button>
                  {s.status !== "validado" && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setStatus(s, "validado")}
                    >
                      <Check className="h-4 w-4" /> Validar
                    </Button>
                  )}
                  {s.status !== "rechazado" && (
                    <Button size="sm" variant="destructive" onClick={() => setStatus(s, "rechazado")}>
                      <X className="h-4 w-4" /> Rechazar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {photoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4"
          onClick={() => setPhotoUrl(null)}
        >
          <img
            src={photoUrl}
            alt="Evidencia del ticket"
            className="max-h-[85vh] max-w-full rounded-lg"
          />
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <Card className="p-4 w-full max-w-sm space-y-3">
            <h3 className="font-semibold text-sm">Editar registro</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Producto principal</Label>
              <Input
                value={editing.main_product}
                onChange={(e) => setEditing({ ...editing, main_product: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Producto agregado</Label>
              <Input
                value={editing.addon_product}
                onChange={(e) => setEditing({ ...editing, addon_product: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Número de ticket</Label>
              <Input
                value={editing.ticket_number}
                onChange={(e) => setEditing({ ...editing, ticket_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sucursal</Label>
              <Select
                value={editing.branch}
                onValueChange={(v) => setEditing({ ...editing, branch: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRANCHES.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Comentario</Label>
              <Textarea
                rows={2}
                value={editing.comment ?? ""}
                onChange={(e) => setEditing({ ...editing, comment: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={saveEdit} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
