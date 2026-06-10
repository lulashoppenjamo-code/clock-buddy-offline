import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Search, Package, Barcode } from "lucide-react";
import { toast } from "sonner";
import { deviceLabel, getPosition } from "@/lib/capture";
import {
  BRANCHES,
  type Branch,
  type Product,
  type MovementType,
  findProductByCode,
  searchProducts,
  getStock,
  registerMovement,
} from "@/lib/inventory";

export const Route = createFileRoute("/inventario")({
  component: InventarioRoute,
});

type Employee = { id: string; name: string; pin: string; color: string; branch: string | null };

function InventarioRoute() {
  const navigate = useNavigate();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [branch, setBranch] = useState<Branch>("Mina");

  const [code, setCode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [stock, setStock] = useState<number>(0);
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  const [type, setType] = useState<MovementType>("salida");
  const [qty, setQty] = useState<string>("");
  const [area, setArea] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        navigate({ to: "/auth" });
        return;
      }
      setOwnerId(uid);
      const { data: emps } = await supabase
        .from("employees")
        .select("id,name,pin,color,branch")
        .eq("owner_id", uid)
        .eq("active", true)
        .order("name");
      setEmployees((emps ?? []) as Employee[]);
    });
  }, [navigate]);

  useEffect(() => {
    if (pin.length === 4) {
      const match = employees.find((e) => e.pin === pin);
      if (match) {
        setEmployee(match);
        if (match.branch === "Mina" || match.branch === "Morelos") setBranch(match.branch as Branch);
        setPin("");
        setTimeout(() => codeRef.current?.focus(), 100);
      } else {
        toast.error("PIN incorrecto");
        setPin("");
      }
    }
  }, [pin, employees]);

  async function lookup() {
    if (!ownerId || !code.trim()) return;
    setSearching(true);
    const p = await findProductByCode(ownerId, code);
    if (p) {
      setProduct(p);
      setStock(await getStock(p.id, branch));
      setResults([]);
      setCode("");
    } else {
      const list = await searchProducts(ownerId, code);
      setResults(list);
      if (list.length === 0) toast.error("Producto no encontrado");
    }
    setSearching(false);
  }

  async function pick(p: Product) {
    setProduct(p);
    setStock(await getStock(p.id, branch));
    setResults([]);
    setCode("");
  }

  useEffect(() => {
    if (product) getStock(product.id, branch).then(setStock);
  }, [branch, product]);

  async function submit() {
    if (!ownerId || !product || !employee) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Cantidad inválida");
      return;
    }
    setSubmitting(true);
    try {
      const geo = await getPosition();
      const pos = geo.ok ? geo.position : null;
      await registerMovement({
        ownerId,
        productId: product.id,
        branch,
        type,
        quantity: n,
        reason: reason || undefined,
        area: area || undefined,
        employeeId: employee.id,
        deviceLabel: deviceLabel(),
        latitude: pos?.coords.latitude ?? null,
        longitude: pos?.coords.longitude ?? null,
      });
      toast.success("Movimiento registrado");
      setQty("");
      setReason("");
      setArea("");
      setStock(await getStock(product.id, branch));
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ownerId) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 flex flex-col">
        <Link to="/" className="text-sm flex items-center gap-1 text-white/70">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
          <div className="text-center">
            <Package className="h-10 w-10 mx-auto mb-2" />
            <h1 className="text-xl font-semibold">Inventario</h1>
            <p className="text-white/60 text-sm">Ingresa tu PIN para continuar</p>
          </div>
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
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold"
            >
              ⌫
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="font-semibold">Inventario</h1>
        <button onClick={() => setEmployee(null)} className="text-xs text-muted-foreground">
          Cambiar
        </button>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Colaborador:</span>{" "}
              <span className="font-medium">{employee.name}</span>
            </div>
            <Select value={branch} onValueChange={(v) => setBranch(v as Branch)}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-3 space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <Barcode className="h-3 w-3" /> Código de barras o nombre
          </Label>
          <div className="flex gap-2">
            <Input
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
              placeholder="Escanea o escribe..."
              autoFocus
            />
            <Button onClick={lookup} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="max-h-48 overflow-auto border rounded">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  className="w-full text-left px-3 py-2 text-sm border-b last:border-0 hover:bg-slate-50"
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.internal_code} {p.brand && `· ${p.brand}`}</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {product && (
          <Card className="p-4 space-y-3">
            <div>
              <p className="font-semibold">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.internal_code} {product.brand && `· ${product.brand}`}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 bg-slate-100 rounded">
                <p className="text-muted-foreground">Existencia</p>
                <p className="text-lg font-bold tabular-nums">{stock}</p>
              </div>
              <div className="p-2 bg-slate-100 rounded">
                <p className="text-muted-foreground">Mínimo</p>
                <p className="text-lg font-bold tabular-nums">{product.stock_min}</p>
              </div>
              <div className="p-2 bg-slate-100 rounded">
                <p className="text-muted-foreground">Unidad</p>
                <p className="text-lg font-bold">{product.unit ?? "pza"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de movimiento</Label>
              <Select value={type} onValueChange={(v) => setType(v as MovementType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="salida">Salida</SelectItem>
                  <SelectItem value="consumo">Consumo interno</SelectItem>
                </SelectContent>
              </Select>

              <Label>Cantidad</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
              />

              {type === "consumo" && (
                <>
                  <Label>Área</Label>
                  <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Limpieza, Uñas, Pestañas..." />
                </>
              )}

              <Label>Motivo / observaciones</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />

              <Button onClick={submit} disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
