import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { ArrowLeft, Camera, Loader2, Send, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { uuid } from "@/lib/uuid";
import { useOnline } from "@/lib/use-online";
import { captureFromFileInput } from "@/lib/capture";
import {
  ADDON_SUGGESTIONS,
  BRANCHES,
  addonStatusInfo,
  branchName,
  type Branch,
} from "@/lib/addon-sales";
import { getCachedEmployees, cacheEmployees } from "@/lib/offline-queue";

export const Route = createFileRoute("/ventas")({
  head: () => ({
    meta: [
      { title: "Ventas Agregadas · lula shop" },
      {
        name: "description",
        content:
          "Registra tus ventas agregadas con ticket y evidencia desde tu sucursal.",
      },
      { property: "og:title", content: "Ventas Agregadas · lula shop" },
      {
        property: "og:description",
        content:
          "Registra tus ventas agregadas con ticket y evidencia desde tu sucursal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VentasRoute,
});

type Employee = { id: string; name: string; pin: string; color: string };
type MySale = {
  id: string;
  main_product: string;
  addon_product: string;
  ticket_number: string;
  status: string;
  sold_at: string;
  branch: string;
};

function VentasRoute() {
  const navigate = useNavigate();
  const online = useOnline();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [mine, setMine] = useState<MySale[]>([]);
  const [busy, setBusy] = useState(false);

  const [mainProduct, setMainProduct] = useState("");
  const [addonProduct, setAddonProduct] = useState("");
  const [ticket, setTicket] = useState("");
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

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
          if (navigator.onLine) {
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
    refreshMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, employee?.id]);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function refreshMine() {
    if (!ownerId || !employee) return;
    const { data } = await supabase
      .from("addon_sales")
      .select("id,main_product,addon_product,ticket_number,status,sold_at,branch")
      .eq("owner_id", ownerId)
      .eq("employee_id", employee.id)
      .order("sold_at", { ascending: false })
      .limit(20);
    setMine((data ?? []) as MySale[]);
  }

  function pinPress(n: string) {
    if (n === "del") setPin((p) => p.slice(0, -1));
    else if (pin.length < 4) setPin((p) => p + n);
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await captureFromFileInput(file);
      setPhoto(blob);
    } catch {
      setPhoto(file);
    }
  }

  async function save() {
    if (!ownerId || !employee || !branch) return;
    if (!mainProduct.trim() || !addonProduct.trim()) {
      toast.error("Indica el producto principal y el agregado");
      return;
    }
    if (!ticket.trim()) {
      toast.error("El número de ticket es obligatorio");
      return;
    }
    if (!photo) {
      toast.error("La foto del ticket es obligatoria");
      return;
    }
    if (!online) {
      toast.error("Se necesita conexión para subir la evidencia");
      return;
    }
    setBusy(true);
    try {
      const id = uuid();
      const path = `${ownerId}/ventas/${id}.jpg`;
      const up = await supabase.storage
        .from("checador-photos")
        .upload(path, photo, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw up.error;

      const { error } = await supabase.from("addon_sales").insert({
        client_id: id,
        owner_id: ownerId,
        employee_id: employee.id,
        employee_name: employee.name,
        branch,
        main_product: mainProduct.trim(),
        addon_product: addonProduct.trim(),
        ticket_number: ticket.trim(),
        photo_path: path,
        comment: comment.trim() || null,
        status: "pendiente",
      });
      if (error) throw error;

      toast.success("Venta agregada registrada");
      setMainProduct("");
      setAddonProduct("");
      setTicket("");
      setComment("");
      setPhoto(null);
      refreshMine();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar");
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
      <div className="min-h-screen bg-gradient-to-br from-rose-950 via-pink-900 to-rose-950 text-white flex flex-col p-5">
        <div className="flex items-center justify-between text-sm text-white/70">
          <Link to="/" className="flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <span>{online ? "En línea" : "Sin conexión"}</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
          <TrendingUp className="h-10 w-10" />
          <h1 className="text-2xl font-semibold">Ventas Agregadas</h1>
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

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Nueva venta agregada
          </h2>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleString("es-MX", {
              dateStyle: "medium",
              timeStyle: "short",
              hour12: true,
            })}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Producto principal
            </label>
            <Input
              value={mainProduct}
              onChange={(e) => setMainProduct(e.target.value)}
              placeholder="Ej. Uñas acrílicas"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Producto agregado
            </label>
            <Input
              value={addonProduct}
              onChange={(e) => setAddonProduct(e.target.value)}
              placeholder="Ej. Diseño extra"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ADDON_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAddonProduct(s)}
                  className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 text-xs"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Número de ticket *
            </label>
            <Input
              value={ticket}
              inputMode="numeric"
              onChange={(e) => setTicket(e.target.value)}
              placeholder="Obligatorio"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Foto del ticket *
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPickPhoto}
            />
            {photoUrl ? (
              <div className="relative">
                <img
                  src={photoUrl}
                  alt="Evidencia del ticket"
                  className="w-full rounded-lg border object-contain max-h-56 bg-white"
                />
                <button
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2 rounded-full bg-black/60 text-white p-1"
                  aria-label="Quitar foto"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-4 w-4" /> Tomar foto o subir captura
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Comentario</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Opcional"
            />
          </div>

          <Button
            className="w-full bg-pink-600 hover:bg-pink-700"
            onClick={save}
            disabled={busy || !online}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}{" "}
            Registrar venta
          </Button>
          {!online && (
            <p className="text-xs text-pink-700 text-center">
              Se necesita conexión para subir la evidencia.
            </p>
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-sm">Mis ventas agregadas</h3>
          {mine.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin registros aún</p>
          )}
          <ul className="divide-y">
            {mine.map((s) => {
              const st = addonStatusInfo(s.status);
              return (
                <li
                  key={s.id}
                  className="py-2 flex items-center justify-between text-sm gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {s.main_product} + {s.addon_product}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ticket {s.ticket_number} ·{" "}
                      {new Date(s.sold_at).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                        hour12: true,
                      })}
                    </p>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs text-white shrink-0"
                    style={{ backgroundColor: st.color }}
                  >
                    {st.label}
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
