import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
  Building2,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getCachedEmployees, cacheEmployees } from "@/lib/offline-queue";

export const Route = createFileRoute("/clientes")({
  component: ClientesRoute,
});

type Employee = {
  id: string;
  name: string;
  pin: string;
  color: string;
};

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
  registered_by_id: string | null;
  registered_by_name: string | null;
};

type School = {
  id: string;
  owner_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  discount_type: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type Status = "activo" | "por_vencer" | "vencido" | "sin_fecha";

type ScannerBarcode = {
  rawValue: string;
  format?: string;
};

type ScannerDetector = {
  detect: (source: HTMLVideoElement) => Promise<ScannerBarcode[]>;
};

type ScannerDetectorConstructor = new (options?: {
  formats?: string[];
}) => ScannerDetector;

type ScannerBarcodeDetectorStatic = {
  new (options?: { formats?: string[] }): ScannerDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: ScannerBarcodeDetectorStatic;
  }
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function genCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function statusOf(c: Customer): Status {
  if (!c.end_date) return "sin_fecha";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(`${c.end_date}T00:00:00`);
  const diff = Math.floor(
    (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diff < 0) return "vencido";
  if (diff <= 15) return "por_vencer";
  return "activo";
}

function benefitIsActive(c: Customer) {
  const today = todayString();

  if (!c.active) return false;
  if (c.start_date && c.start_date > today) return false;
  if (c.end_date && c.end_date < today) return false;

  return true;
}

function daysRemaining(c: Customer) {
  if (!c.end_date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(`${c.end_date}T00:00:00`);

  return Math.ceil(
    (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

const STATUS_META: Record<
  Status,
  { label: string; dot: string; badge: string }
> = {
  activo: {
    label: "Activo",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800",
  },
  por_vencer: {
    label: "Por vencer",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800",
  },
  vencido: {
    label: "Vencido",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-800",
  },
  sin_fecha: {
    label: "Sin vigencia",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-700",
  },
};

function ClientesRoute() {
  const navigate = useNavigate();

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const saved =
          typeof window !== "undefined"
            ? window.localStorage.getItem("checador.ownerId")
            : null;

        if (mounted && saved) {
          setOwnerId(saved);
        }
      } catch {}

      try {
        const cached = await getCachedEmployees();

        if (mounted && cached.length) {
          setEmployees(cached);
        }
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

      if (mounted) {
        setLoadingBoot(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (pin.length !== 4) return;

    const matched = employees.find((e) => e.pin === pin);

    if (matched) {
      setEmployee(matched);
      setPin("");
    } else {
      toast.error("PIN incorrecto");
      setPin("");
    }
  }, [pin, employees]);

  function pinPress(value: string) {
    if (value === "del") {
      setPin((current) => current.slice(0, -1));
      return;
    }

    if (pin.length < 4) {
      setPin((current) => current + value);
    }
  }

  if (loadingBoot) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ownerId) {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-pink-50">
        <Card className="p-6 max-w-sm space-y-3 text-center">
          <p className="text-sm">
            Inicia sesión como administrador primero.
          </p>

          <Button onClick={() => navigate({ to: "/auth" })}>
            Entrar
          </Button>
        </Card>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-500 via-rose-500 to-pink-600 text-white flex flex-col p-5">
        <div className="flex items-center justify-between text-sm text-white/80">
          <Link to="/" className="flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
          <Users className="h-10 w-10" />

          <h1 className="text-2xl font-semibold">
            Clientes con Convenio
          </h1>

          <p className="text-white/80 text-sm">
            Ingresa tu PIN
          </p>

          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border-2 ${
                  pin.length > i
                    ? "bg-white border-white"
                    : "border-white/40"
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 w-full">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
            ].map((n) => (
              <button
                key={n}
                onClick={() => pinPress(n)}
                className="h-16 rounded-2xl bg-white/15 hover:bg-white/25 text-2xl font-semibold"
              >
                {n}
              </button>
            ))}

            <div />

            <button
              onClick={() => pinPress("0")}
              className="h-16 rounded-2xl bg-white/15 hover:bg-white/25 text-2xl font-semibold"
            >
              0
            </button>

            <button
              onClick={() => pinPress("del")}
              className="h-16 rounded-2xl bg-white/15 hover:bg-white/25 text-2xl"
            >
              ⌫
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ClientesPage
      ownerId={ownerId}
      employee={employee}
      onLogout={() => setEmployee(null)}
    />
  );
}

function ClientesPage({
  ownerId,
  employee,
  onLogout,
}: {
  ownerId: string;
  employee: Employee;
  onLogout: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Customer[]>([]);
  const [schoolsData, setSchoolsData] = useState<School[]>([]);

  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [discountFilter, setDiscountFilter] = useState("all");

  const [section, setSection] = useState<
    "clientes" | "escuelas"
  >("clientes");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const [schoolDialogOpen, setSchoolDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(
    null,
  );

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCode, setScannerCode] = useState("");
  const [scannerCustomer, setScannerCustomer] =
    useState<Customer | null>(null);
  const [scannerLoading, setScannerLoading] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("owner_id", ownerId)
      .order("name");

    if (error) {
      toast.error(error.message);
    }

    setRows((data ?? []) as Customer[]);
    setLoading(false);
  }, [ownerId]);

  const loadSchools = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("schools")
        .select("*")
        .eq("owner_id", ownerId)
        .order("name");

      if (error) {
        toast.error(error.message);
        return;
      }

      setSchoolsData((data ?? []) as School[]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las escuelas",
      );
    }
  }, [ownerId]);

  const load = useCallback(async () => {
    await Promise.all([loadCustomers(), loadSchools()]);
  }, [loadCustomers, loadSchools]);

  useEffect(() => {
    load();
  }, [load]);

  const schools = useMemo(() => {
    const names = new Set<string>();

    for (const school of schoolsData) {
      if (school.name.trim()) {
        names.add(school.name.trim());
      }
    }

    for (const customer of rows) {
      if (customer.school?.trim()) {
        names.add(customer.school.trim());
      }
    }

    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, "es"),
    );
  }, [schoolsData, rows]);

  const discounts = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((r) => r.discount_type)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((r) => {
      if (
        schoolFilter !== "all" &&
        (r.school ?? "") !== schoolFilter
      ) {
        return false;
      }

      if (
        discountFilter !== "all" &&
        (r.discount_type ?? "") !== discountFilter
      ) {
        return false;
      }

      if (
        statusFilter !== "all" &&
        statusOf(r) !== statusFilter
      ) {
        return false;
      }

      if (!q) return true;

      return (
        r.name.toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.whatsapp ?? "").toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.school ?? "").toLowerCase().includes(q)
      );
    });
  }, [
    rows,
    search,
    schoolFilter,
    statusFilter,
    discountFilter,
  ]);

  const counts = useMemo(() => {
    const result = {
      activo: 0,
      por_vencer: 0,
      vencido: 0,
      sin_fecha: 0,
    };

    for (const customer of rows) {
      result[statusOf(customer)]++;
    }

    return result;
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
      start_date: todayString(),
      end_date: "",
      notes: "",
      code: genCode(),
      active: true,
      registered_by_id: employee.id,
      registered_by_name: employee.name,
    });

    setDialogOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing({ ...customer });
    setDialogOpen(true);
  }

  async function save() {
    if (!editing) return;

    if (!editing.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    const basePayload = {
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
      const { error } = await supabase
        .from("customers")
        .update(basePayload)
        .eq("id", editing.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Cliente actualizado");
    } else {
      const { error } = await supabase.from("customers").insert({
        ...basePayload,
        registered_by_id: employee.id,
        registered_by_name: employee.name,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Cliente agregado");
    }

    setDialogOpen(false);
    setEditing(null);
    await loadCustomers();
  }

  async function remove(customer: Customer) {
    if (!confirm(`¿Eliminar a ${customer.name}?`)) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customer.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Cliente eliminado");
    await loadCustomers();
  }

  async function renew(customer: Customer, months = 12) {
    const base = new Date();
    base.setMonth(base.getMonth() + months);

    const end = base.toISOString().slice(0, 10);

    const { error } = await supabase
      .from("customers")
      .update({
        start_date: todayString(),
        end_date: end,
        active: true,
      })
      .eq("id", customer.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Vigencia renovada hasta ${end}`);
    await loadCustomers();
  }

  function buildWhatsAppMessage(
    customer: Customer,
    type: "promo" | "vence" | "renovacion",
  ) {
    const discount = customer.discount_type
      ? ` (${customer.discount_type})`
      : "";

    if (type === "vence") {
      return `Hola ${customer.name} 👋, te recordamos que tu convenio${discount} vence el ${customer.end_date ?? "próximamente"}. Queremos ayudarte a conservar tus beneficios. 💖`;
    }

    if (type === "renovacion") {
      return `Hola ${customer.name} 👋, tu convenio${discount} ya venció o está por vencer. Si deseas continuar disfrutando tus beneficios, puedes renovarlo con nosotros. ✨`;
    }

    return `Hola ${customer.name} 👋, tenemos una promoción especial para ti por ser cliente con convenio${discount}. ¡Ven a visitarnos y aprovecha tu beneficio! 💖✨`;
  }

  function openWhatsApp(
    customer: Customer,
    type: "promo" | "vence" | "renovacion",
  ) {
    const num = (
      customer.whatsapp ||
      customer.phone ||
      ""
    ).replace(/\D/g, "");

    if (!num) {
      toast.error("Este cliente no tiene número de WhatsApp");
      return;
    }

    const message = buildWhatsAppMessage(customer, type);

    const url = `https://wa.me/${num}?text=${encodeURIComponent(
      message,
    )}`;

    window.open(url, "_blank");
  }

  async function findCustomerByCode(rawCode: string) {
    const code = rawCode.trim();

    if (!code) {
      toast.error("Escribe o escanea un código");
      return;
    }

    setScannerLoading(true);

    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("code", code)
        .maybeSingle();

      if (error) {
        toast.error(error.message);
        return;
      }

      if (!data) {
        toast.error(
          `No encontré un cliente con el código ${code}`,
        );
        setScannerCustomer(null);
        return;
      }

      setScannerCustomer(data as Customer);
      setScannerOpen(false);
    } finally {
      setScannerLoading(false);
    }
  }

  function openScanner() {
    setScannerCode("");
    setScannerCustomer(null);
    setScannerOpen(true);
  }

  function closeScanner() {
    setScannerOpen(false);
    setScannerCustomer(null);
    setScannerCode("");
  }

  function openSchoolNew() {
    setEditingSchool({
      id: "",
      owner_id: ownerId,
      name: "",
      contact_name: "",
      phone: "",
      discount_type: "",
      start_date: todayString(),
      end_date: "",
      notes: "",
      active: true,
    });

    setSchoolDialogOpen(true);
  }

  function openSchoolEdit(school: School) {
    setEditingSchool({ ...school });
    setSchoolDialogOpen(true);
  }

  async function saveSchool() {
    if (!editingSchool) return;

    if (!editingSchool.name.trim()) {
      toast.error("El nombre de la escuela es obligatorio");
      return;
    }

    const payload = {
      owner_id: ownerId,
      name: editingSchool.name.trim(),
      contact_name: editingSchool.contact_name || null,
      phone: editingSchool.phone || null,
      discount_type: editingSchool.discount_type || null,
      start_date: editingSchool.start_date || null,
      end_date: editingSchool.end_date || null,
      notes: editingSchool.notes || null,
      active: editingSchool.active,
    };

    if (editingSchool.id) {
      const { error } = await (supabase as any)
        .from("schools")
        .update(payload)
        .eq("id", editingSchool.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      /*
       * Conservamos la compatibilidad con los clientes antiguos:
       * si cambiamos el nombre de una escuela, actualizamos también
       * el texto school de sus clientes.
       */
      const oldSchool = schoolsData.find(
        (school) => school.id === editingSchool.id,
      );

      if (
        oldSchool &&
        oldSchool.name.trim() !== editingSchool.name.trim()
      ) {
        await supabase
          .from("customers")
          .update({
            school: editingSchool.name.trim(),
          })
          .eq("owner_id", ownerId)
          .eq("school", oldSchool.name);
      }

      toast.success("Escuela actualizada");
    } else {
      const { error } = await (supabase as any)
        .from("schools")
        .insert(payload);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Escuela registrada");
    }

    setSchoolDialogOpen(false);
    setEditingSchool(null);

    await load();
  }

  async function removeSchool(school: School) {
    const clientCount = rows.filter(
      (customer) =>
        (customer.school ?? "").trim() ===
        school.name.trim(),
    ).length;

    const message =
      clientCount > 0
        ? `La escuela "${school.name}" tiene ${clientCount} cliente(s). Si la eliminas, los clientes conservarán el nombre de la escuela como texto, pero dejará de aparecer como escuela registrada. ¿Continuar?`
        : `¿Eliminar la escuela "${school.name}"?`;

    if (!confirm(message)) return;

    const { error } = await (supabase as any)
      .from("schools")
      .delete()
      .eq("id", school.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Escuela eliminada");
    await loadSchools();
  }

  function assignCustomerToSchool(
    customer: Customer,
    schoolName: string,
  ) {
    setEditing({
      ...customer,
      school: schoolName === "none" ? "" : schoolName,
    });
    setDialogOpen(true);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-100">
      <header className="bg-white/80 backdrop-blur border-b border-pink-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <button
          onClick={onLogout}
          className="flex items-center gap-1 text-sm text-pink-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Salir
        </button>

        <h1 className="font-semibold text-pink-900">
          Clientes con Convenio
        </h1>

        <Button
          size="sm"
          onClick={openNew}
          className="bg-pink-600 hover:bg-pink-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuevo
        </Button>
      </header>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <Card className="p-2 text-center text-xs text-pink-800 bg-pink-100/70 border-pink-200">
          Sesión:{" "}
          <span className="font-semibold">
            {employee.name}
          </span>
        </Card>

        {/* NAVEGACIÓN DEL MÓDULO */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant={section === "clientes" ? "default" : "outline"}
            onClick={() => setSection("clientes")}
            className={
              section === "clientes"
                ? "bg-pink-600 hover:bg-pink-700"
                : ""
            }
          >
            <Users className="h-4 w-4 mr-1" />
            Clientes
          </Button>

          <Button
            variant="outline"
            onClick={openScanner}
            className="border-pink-300 text-pink-700"
          >
            <Camera className="h-4 w-4 mr-1" />
            Escanear
          </Button>

          <Button
            variant={section === "escuelas" ? "default" : "outline"}
            onClick={() => setSection("escuelas")}
            className={
              section === "escuelas"
                ? "bg-pink-600 hover:bg-pink-700"
                : ""
            }
          >
            <Building2 className="h-4 w-4 mr-1" />
            Escuelas
          </Button>
        </div>

        {section === "clientes" ? (
          <>
            {/* CONTADORES */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Total
                </p>
                <p className="text-2xl font-bold text-pink-900">
                  {rows.length}
                </p>
              </Card>

              <Card className="p-3 text-center border-emerald-200">
                <p className="text-xs text-emerald-700">
                  Activos
                </p>
                <p className="text-2xl font-bold text-emerald-700">
                  {counts.activo}
                </p>
              </Card>

              <Card className="p-3 text-center border-amber-200">
                <p className="text-xs text-amber-700">
                  Por vencer
                </p>
                <p className="text-2xl font-bold text-amber-700">
                  {counts.por_vencer}
                </p>
              </Card>

              <Card className="p-3 text-center border-red-200">
                <p className="text-xs text-red-700">
                  Vencidos
                </p>
                <p className="text-2xl font-bold text-red-700">
                  {counts.vencido}
                </p>
              </Card>
            </div>

            {/* ESCÁNER RÁPIDO */}
            <Card className="p-4 border-pink-200 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-pink-900">
                    Consultar cliente
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Escanea su QR/código de barras o escribe su código.
                  </p>
                </div>

                <Button
                  onClick={openScanner}
                  className="bg-pink-600 hover:bg-pink-700"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Abrir escáner
                </Button>
              </div>
            </Card>

            {/* BÚSQUEDA Y FILTROS */}
            <Card className="p-3 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />

                  <Input
                    value={search}
                    onChange={(e) =>
                      setSearch(e.target.value)
                    }
                    placeholder="Buscar por nombre, teléfono, escuela o código..."
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Select
                  value={schoolFilter}
                  onValueChange={setSchoolFilter}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Escuela" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="all">
                      Todas las escuelas
                    </SelectItem>

                    {schools.map((school) => (
                      <SelectItem
                        key={school}
                        value={school}
                      >
                        {school}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="all">
                      Todos los estados
                    </SelectItem>
                    <SelectItem value="activo">
                      Activos
                    </SelectItem>
                    <SelectItem value="por_vencer">
                      Por vencer
                    </SelectItem>
                    <SelectItem value="vencido">
                      Vencidos
                    </SelectItem>
                    <SelectItem value="sin_fecha">
                      Sin vigencia
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={discountFilter}
                  onValueChange={setDiscountFilter}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Descuento" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="all">
                      Todos los descuentos
                    </SelectItem>

                    {discounts.map((discount) => (
                      <SelectItem
                        key={discount}
                        value={discount}
                      >
                        {discount}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* LISTA */}
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
                {filtered.map((customer) => {
                  const status = statusOf(customer);
                  const meta = STATUS_META[status];
                  const active = benefitIsActive(customer);
                  const remaining = daysRemaining(customer);

                  return (
                    <Card
                      key={customer.id}
                      className="p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`h-3 w-3 mt-1.5 rounded-full ${meta.dot}`}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-pink-900 truncate">
                              {customer.name}
                            </p>

                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${meta.badge}`}
                            >
                              {meta.label}
                            </span>

                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                active
                                  ? "bg-emerald-600 text-white"
                                  : "bg-red-600 text-white"
                              }`}
                            >
                              {active ? "BENEFICIO ACTIVO" : "INACTIVO"}
                            </span>

                            {customer.discount_type && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 text-pink-800">
                                {customer.discount_type}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            {customer.school && (
                              <div>
                                🏫 {customer.school}
                              </div>
                            )}

                            {(customer.phone ||
                              customer.whatsapp) && (
                              <div>
                                📞{" "}
                                {customer.whatsapp ||
                                  customer.phone}
                              </div>
                            )}

                            {customer.end_date && (
                              <div>
                                📅 Vence:{" "}
                                {customer.end_date}
                                {remaining !== null &&
                                  remaining >= 0 && (
                                    <span className="ml-1">
                                      ({remaining}{" "}
                                      {remaining === 1
                                        ? "día"
                                        : "días"})
                                    </span>
                                  )}
                              </div>
                            )}

                            <div className="flex items-center gap-1">
                              <QrCode className="h-3 w-3" />
                              {customer.code}
                            </div>

                            {customer.registered_by_name && (
                              <div className="text-pink-700">
                                👤 Registrado por:{" "}
                                {
                                  customer.registered_by_name
                                }
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openWhatsApp(
                                  customer,
                                  "promo",
                                )
                              }
                              className="h-7 text-xs"
                            >
                              <MessageCircle className="h-3 w-3 mr-1" />
                              WhatsApp
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                renew(customer)
                              }
                              className="h-7 text-xs"
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Renovar
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openEdit(customer)
                              }
                              className="h-7 text-xs"
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Editar
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                remove(customer)
                              }
                              className="h-7 text-xs text-red-600"
                            >
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
          </>
        ) : (
          <SchoolsSection
            schools={schoolsData}
            customers={rows}
            onNew={openSchoolNew}
            onEdit={openSchoolEdit}
            onDelete={removeSchool}
            onAssign={assignCustomerToSchool}
          />
        )}
      </div>

      {/* ======================================================
          CLIENTE
          ====================================================== */}
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id
                ? "Editar cliente"
                : "Nuevo cliente"}
            </DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Nombre *</Label>

                <Input
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      name: e.target.value,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Teléfono</Label>

                  <Input
                    value={editing.phone ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        phone: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <Label>WhatsApp</Label>

                  <Input
                    value={editing.whatsapp ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        whatsapp: e.target.value,
                      })
                    }
                    placeholder="+52..."
                  />
                </div>
              </div>

              <div>
                <Label>Correo</Label>

                <Input
                  type="email"
                  value={editing.email ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      email: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>Escuela / Convenio</Label>

                <Select
                  value={
                    editing.school &&
                    schools.includes(editing.school)
                      ? editing.school
                      : editing.school
                        ? "__legacy__"
                        : "none"
                  }
                  onValueChange={(value) => {
                    if (value === "none") {
                      setEditing({
                        ...editing,
                        school: "",
                      });
                    } else if (value === "__legacy__") {
                      return;
                    } else {
                      setEditing({
                        ...editing,
                        school: value,
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una escuela" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="none">
                      Sin escuela
                    </SelectItem>

                    {schools.map((school) => (
                      <SelectItem
                        key={school}
                        value={school}
                      >
                        {school}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {editing.school &&
                  !schools.includes(editing.school) && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Escuela anterior:{" "}
                      {editing.school}
                    </p>
                  )}
              </div>

              <div>
                <Label>Tipo de descuento</Label>

                <Input
                  value={editing.discount_type ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      discount_type: e.target.value,
                    })
                  }
                  placeholder="10%, 15%, VIP..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Fecha de inicio</Label>

                  <Input
                    type="date"
                    value={editing.start_date ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        start_date: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Fecha de vencimiento</Label>

                  <Input
                    type="date"
                    value={editing.end_date ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        end_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Estado del beneficio</Label>

                <Select
                  value={
                    editing.active ? "active" : "inactive"
                  }
                  onValueChange={(value) =>
                    setEditing({
                      ...editing,
                      active: value === "active",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="active">
                      Activo
                    </SelectItem>
                    <SelectItem value="inactive">
                      Inactivo
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Código QR / barras</Label>

                <div className="flex gap-2">
                  <Input
                    value={editing.code}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        code: e.target.value,
                      })
                    }
                  />

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        code: genCode(),
                      })
                    }
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label>Observaciones</Label>

                <Textarea
                  rows={2}
                  value={editing.notes ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      notes: e.target.value,
                    })
                  }
                />
              </div>

              {editing.registered_by_name && (
                <p className="text-xs text-muted-foreground">
                  Registrado por:{" "}
                  <span className="font-medium text-pink-700">
                    {editing.registered_by_name}
                  </span>
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancelar
            </Button>

            <Button
              onClick={save}
              className="bg-pink-600 hover:bg-pink-700"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================
          ESCÁNER
          ====================================================== */}
      <ScannerDialog
        open={scannerOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeScanner();
          } else {
            setScannerOpen(true);
          }
        }}
        code={scannerCode}
        setCode={setScannerCode}
        loading={scannerLoading}
        onSearch={() => findCustomerByCode(scannerCode)}
        onDetected={(code) => {
          setScannerCode(code);
          void findCustomerByCode(code);
        }}
      />

      {/* ======================================================
          RESULTADO DEL ESCÁNER
          ====================================================== */}
      <Dialog
        open={!!scannerCustomer}
        onOpenChange={(open) => {
          if (!open) setScannerCustomer(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Resultado del cliente
            </DialogTitle>
          </DialogHeader>

          {scannerCustomer && (
            <CustomerScanResult
              customer={scannerCustomer}
              onClose={() => setScannerCustomer(null)}
              onEdit={() => {
                setScannerCustomer(null);
                openEdit(scannerCustomer);
              }}
              onWhatsApp={(type) =>
                openWhatsApp(scannerCustomer, type)
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ======================================================
          ESCUELA
          ====================================================== */}
      <Dialog
        open={schoolDialogOpen}
        onOpenChange={setSchoolDialogOpen}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSchool?.id
                ? "Editar escuela"
                : "Registrar escuela"}
            </DialogTitle>
          </DialogHeader>

          {editingSchool && (
            <div className="space-y-3">
              <div>
                <Label>Nombre de la escuela *</Label>

                <Input
                  value={editingSchool.name}
                  onChange={(e) =>
                    setEditingSchool({
                      ...editingSchool,
                      name: e.target.value,
                    })
                  }
                  placeholder="Ej. Secundaria Miguel Hidalgo"
                />
              </div>

              <div>
                <Label>Persona de contacto</Label>

                <Input
                  value={editingSchool.contact_name ?? ""}
                  onChange={(e) =>
                    setEditingSchool({
                      ...editingSchool,
                      contact_name: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>Teléfono</Label>

                <Input
                  value={editingSchool.phone ?? ""}
                  onChange={(e) =>
                    setEditingSchool({
                      ...editingSchool,
                      phone: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>Beneficio / descuento</Label>

                <Input
                  value={
                    editingSchool.discount_type ?? ""
                  }
                  onChange={(e) =>
                    setEditingSchool({
                      ...editingSchool,
                      discount_type: e.target.value,
                    })
                  }
                  placeholder="Ej. 15%"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Inicio del convenio</Label>

                  <Input
                    type="date"
                    value={
                      editingSchool.start_date ?? ""
                    }
                    onChange={(e) =>
                      setEditingSchool({
                        ...editingSchool,
                        start_date: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Fin del convenio</Label>

                  <Input
                    type="date"
                    value={
                      editingSchool.end_date ?? ""
                    }
                    onChange={(e) =>
                      setEditingSchool({
                        ...editingSchool,
                        end_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Estado</Label>

                <Select
                  value={
                    editingSchool.active
                      ? "active"
                      : "inactive"
                  }
                  onValueChange={(value) =>
                    setEditingSchool({
                      ...editingSchool,
                      active: value === "active",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="active">
                      Activa
                    </SelectItem>
                    <SelectItem value="inactive">
                      Inactiva
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notas</Label>

                <Textarea
                  rows={3}
                  value={editingSchool.notes ?? ""}
                  onChange={(e) =>
                    setEditingSchool({
                      ...editingSchool,
                      notes: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setSchoolDialogOpen(false)
              }
            >
              Cancelar
            </Button>

            <Button
              onClick={saveSchool}
              className="bg-pink-600 hover:bg-pink-700"
            >
              Guardar escuela
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
   SECCIÓN ESCUELAS
   ============================================================ */

function SchoolsSection({
  schools,
  customers,
  onNew,
  onEdit,
  onDelete,
  onAssign,
}: {
  schools: School[];
  customers: Customer[];
  onNew: () => void;
  onEdit: (school: School) => void;
  onDelete: (school: School) => void;
  onAssign: (
    customer: Customer,
    schoolName: string,
  ) => void;
}) {
  const [search, setSearch] = useState("");

  const filteredSchools = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return schools;

    return schools.filter(
      (school) =>
        school.name.toLowerCase().includes(q) ||
        (school.contact_name ?? "")
          .toLowerCase()
          .includes(q) ||
        (school.phone ?? "").includes(q),
    );
  }, [schools, search]);

  return (
    <div className="space-y-4">
      <Card className="p-4 border-pink-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="font-semibold text-pink-900">
              Escuelas y convenios
            </h2>

            <p className="text-xs text-muted-foreground">
              Registra las escuelas y asigna clientes a cada convenio.
            </p>
          </div>

          <Button
            onClick={onNew}
            className="bg-pink-600 hover:bg-pink-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Nueva escuela
          </Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar escuela..."
            className="pl-8"
          />
        </div>
      </Card>

      {filteredSchools.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No hay escuelas registradas.
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSchools.map((school) => {
            const schoolCustomers = customers.filter(
              (customer) =>
                (customer.school ?? "").trim() ===
                school.name.trim(),
            );

            return (
              <Card
                key={school.id}
                className="p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-pink-100 grid place-items-center shrink-0">
                    <Building2 className="h-5 w-5 text-pink-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-pink-900">
                        {school.name}
                      </h3>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          school.active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {school.active
                          ? "ACTIVA"
                          : "INACTIVA"}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground mt-1 space-y-1">
                      {school.contact_name && (
                        <div>
                          👤 {school.contact_name}
                        </div>
                      )}

                      {school.phone && (
                        <div>
                          📞 {school.phone}
                        </div>
                      )}

                      {school.discount_type && (
                        <div>
                          🎁 {school.discount_type}
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {schoolCustomers.length} cliente(s)
                      </div>

                      {(school.start_date ||
                        school.end_date) && (
                        <div>
                          📅{" "}
                          {school.start_date ?? "Sin inicio"}{" "}
                          →{" "}
                          {school.end_date ?? "Sin vencimiento"}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(school)}
                        className="h-8 text-xs"
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Editar
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDelete(school)}
                        className="h-8 text-xs text-red-600"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Eliminar
                      </Button>
                    </div>

                    {schoolCustomers.length > 0 && (
                      <div className="mt-3 border-t pt-3 space-y-1">
                        <p className="text-xs font-semibold text-pink-900">
                          Clientes asignados
                        </p>

                        {schoolCustomers
                          .slice(0, 10)
                          .map((customer) => (
                            <div
                              key={customer.id}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate">
                                {customer.name}
                              </span>

                              <span
                                className={
                                  benefitIsActive(customer)
                                    ? "text-emerald-700 font-semibold"
                                    : "text-red-700 font-semibold"
                                }
                              >
                                {benefitIsActive(customer)
                                  ? "Activo"
                                  : "Inactivo"}
                              </span>
                            </div>
                          ))}

                        {schoolCustomers.length > 10 && (
                          <p className="text-[11px] text-muted-foreground">
                            +{" "}
                            {schoolCustomers.length - 10}{" "}
                            clientes más
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Esta sección permite reasignar clientes sin crear nuevos */}
      {customers.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-pink-900 mb-2">
            Asignar clientes existentes
          </h3>

          <p className="text-xs text-muted-foreground mb-3">
            Selecciona un cliente para cambiarlo de escuela.
          </p>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {customers.map((customer) => (
              <div
                key={customer.id}
                className="flex items-center gap-2 border rounded-lg p-2"
              >
                <UserRound className="h-4 w-4 text-pink-600 shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {customer.name}
                  </p>

                  <p className="text-[11px] text-muted-foreground truncate">
                    {customer.school ||
                      "Sin escuela asignada"}
                  </p>
                </div>

                <Select
                  value={customer.school || "none"}
                  onValueChange={(value) =>
                    onAssign(customer, value)
                  }
                >
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue placeholder="Escuela" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="none">
                      Sin escuela
                    </SelectItem>

                    {schools.map((school) => (
                      <SelectItem
                        key={school.id}
                        value={school.name}
                      >
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ============================================================
   RESULTADO DEL ESCÁNER
   ============================================================ */

function CustomerScanResult({
  customer,
  onClose,
  onEdit,
  onWhatsApp,
}: {
  customer: Customer;
  onClose: () => void;
  onEdit: () => void;
  onWhatsApp: (
    type: "promo" | "vence" | "renovacion",
  ) => void;
}) {
  const active = benefitIsActive(customer);
  const status = statusOf(customer);
  const remaining = daysRemaining(customer);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl p-5 text-center ${
          active
            ? "bg-emerald-50 border border-emerald-200"
            : "bg-red-50 border border-red-200"
        }`}
      >
        {active ? (
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-600" />
        ) : (
          <AlertCircle className="h-12 w-12 mx-auto text-red-600" />
        )}

        <p
          className={`text-2xl font-black mt-2 ${
            active
              ? "text-emerald-700"
              : "text-red-700"
          }`}
        >
          {active ? "BENEFICIO ACTIVO" : "BENEFICIO INACTIVO"}
        </p>

        <p className="font-semibold text-lg text-slate-900 mt-1">
          {customer.name}
        </p>

        <p className="text-xs text-muted-foreground mt-1">
          Código: {customer.code}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InfoBox
          label="Escuela"
          value={customer.school || "Sin escuela"}
        />

        <InfoBox
          label="Descuento"
          value={
            customer.discount_type || "Sin descuento"
          }
        />

        <InfoBox
          label="Inicio"
          value={customer.start_date || "Sin fecha"}
        />

        <InfoBox
          label="Vencimiento"
          value={customer.end_date || "Sin fecha"}
        />
      </div>

      {remaining !== null && (
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">
            Vigencia
          </p>

          <p
            className={`text-xl font-bold ${
              remaining < 0
                ? "text-red-700"
                : remaining <= 15
                  ? "text-amber-700"
                  : "text-emerald-700"
            }`}
          >
            {remaining < 0
              ? `Vencido hace ${Math.abs(remaining)} día(s)`
              : remaining === 0
                ? "Vence hoy"
                : `${remaining} día(s) restantes`}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => onWhatsApp("promo")}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          WhatsApp promoción
        </Button>

        <Button
          variant="outline"
          onClick={() =>
            onWhatsApp(
              status === "vencido"
                ? "renovacion"
                : "vence",
            )
          }
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          {status === "vencido"
            ? "WhatsApp renovación"
            : "WhatsApp vencimiento"}
        </Button>

        <Button
          variant="outline"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Editar cliente
        </Button>

        <Button
          variant="outline"
          onClick={onClose}
        >
          <X className="h-4 w-4 mr-2" />
          Cerrar
        </Button>
      </div>
    </div>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <p className="text-sm font-medium text-slate-900 mt-1 break-words">
        {value}
      </p>
    </div>
  );
}

/* ============================================================
   ESCÁNER DE CÁMARA
   ============================================================ */

function ScannerDialog({
  open,
  onOpenChange,
  code,
  setCode,
  loading,
  onSearch,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  setCode: (value: string) => void;
  loading: boolean;
  onSearch: () => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const detectedRef = useRef(false);

  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [detectorSupported, setDetectorSupported] =
    useState(false);

  function stopCamera() {
    runningRef.current = false;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
  }

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    detectedRef.current = false;
    setCameraError("");

    const detectorExists =
      typeof window !== "undefined" &&
      typeof window.BarcodeDetector !== "undefined";

    setDetectorSupported(detectorExists);

    let cancelled = false;

    async function startCamera() {
      if (!detectorExists) {
        setCameraError(
          "Este navegador no tiene lector de QR/código de barras integrado. Puedes escribir el código manualmente.",
        );
        return;
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setCameraError(
          "Este dispositivo no permite acceder a la cámara desde el navegador.",
        );
        return;
      }

      try {
        const Detector = window.BarcodeDetector!;

        let detector: ScannerDetector;

        try {
          const formats =
            Detector.getSupportedFormats
              ? await Detector.getSupportedFormats()
              : [];

          const wanted = [
            "qr_code",
            "code_128",
            "code_39",
            "code_93",
            "codabar",
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "itf",
          ];

          const supportedFormats =
            formats.length > 0
              ? wanted.filter((format) =>
                  formats.includes(format),
                )
              : wanted;

          detector =
            supportedFormats.length > 0
              ? new Detector({
                  formats: supportedFormats,
                })
              : new Detector();
        } catch {
          detector = new Detector();
        }

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: {
                ideal: "environment",
              },
              width: {
                ideal: 1280,
              },
              height: {
                ideal: 720,
              },
            },
            audio: false,
          });

        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;

        if (!video) return;

        video.srcObject = stream;

        await video.play();

        setCameraReady(true);
        runningRef.current = true;

        const scan = async () => {
          if (
            !runningRef.current ||
            cancelled ||
            detectedRef.current
          ) {
            return;
          }

          if (
            video.readyState >=
            HTMLMediaElement.HAVE_METADATA
          ) {
            try {
              const results = await detector.detect(
                video,
              );

              if (
                results.length > 0 &&
                results[0].rawValue
              ) {
                const value =
                  results[0].rawValue.trim();

                if (value) {
                  detectedRef.current = true;
                  runningRef.current = false;

                  if (
                    navigator.vibrate
                  ) {
                    navigator.vibrate(100);
                  }

                  onDetected(value);
                  return;
                }
              }
            } catch {}
          }

          frameRef.current =
            requestAnimationFrame(scan);
        };

        frameRef.current =
          requestAnimationFrame(scan);
      } catch (error) {
        setCameraError(
          error instanceof DOMException &&
            error.name === "NotAllowedError"
            ? "Permiso de cámara rechazado. Autoriza la cámara para usar el escáner."
            : "No se pudo abrir la cámara. Revisa los permisos del navegador.",
        );
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, onDetected]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-pink-600" />
            Escanear cliente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-black aspect-video">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />

            {cameraReady && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 border-2 border-pink-400 rounded-xl h-24" />

                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-pink-400/80" />
              </div>
            )}

            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 grid place-items-center text-white">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm">
                    Abriendo cámara...
                  </p>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center p-5 text-white text-center">
                <div>
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-pink-300" />

                  <p className="text-sm">
                    {cameraError}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Coloca el QR o código de barras dentro del recuadro.
            </p>

            {!detectorSupported && (
              <p className="text-[11px] text-amber-700 mt-1">
                Usa el campo manual de abajo en este navegador.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="h-px bg-border flex-1" />
            <span className="text-[10px] text-muted-foreground">
              O ESCRIBE EL CÓDIGO
            </span>
            <div className="h-px bg-border flex-1" />
          </div>

          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value)
              }
              placeholder="Ej. 12345678"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSearch();
                }
              }}
              autoComplete="off"
            />

            <Button
              onClick={onSearch}
              disabled={loading || !code.trim()}
              className="bg-pink-600 hover:bg-pink-700"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              stopCamera();

              setTimeout(() => {
                if (open) {
                  window.location.reload();
                }
              }, 50);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reiniciar cámara
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}