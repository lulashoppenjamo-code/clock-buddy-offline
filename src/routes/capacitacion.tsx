
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, BookOpen, FileText, Upload, Trash2, Loader2,
  RefreshCw, X, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/capacitacion")({
  component: CapacitacionPage,
});

const BUCKET = "lula-capacitacion";

const CATEGORIES = [
  { id: "unas", name: "Uñas", icon: "💅" },
  { id: "pestanas", name: "Pestañas", icon: "👁️" },
  { id: "cosmeticos", name: "Cosméticos y maquillaje", icon: "💄" },
  { id: "pedicure", name: "Pedicure y Pedi Spa", icon: "🦶" },
  { id: "ventas", name: "Ventas y atención al cliente", icon: "💗" },
  { id: "procedimientos", name: "Procedimientos internos", icon: "📋" },
  { id: "pixel-perfect", name: "Manual de Pixel Perfect", icon: "🖥️" },
] as const;

type TrainingFile = {
  name: string;
  path: string;
  category: string;
  created_at?: string;
  metadata?: { size?: number };
};

function CapacitacionPage() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [files, setFiles] = useState<TrainingFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>("todas");
  const [selected, setSelected] = useState<TrainingFile | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("unas");
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.session?.user.id) {
        setOwnerId(null);
      } else {
        setOwnerId(data.session.user.id);
      }
      setChecking(false);
    });
    return () => { active = false; };
  }, []);

  async function loadFiles(uid: string) {
    setLoading(true);
    try {
      const all: TrainingFile[] = [];

      for (const cat of CATEGORIES) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .list(`${uid}/${cat.id}`, {
            limit: 200,
            sortBy: { column: "name", order: "asc" },
          });

        if (error) throw error;

        for (const item of data ?? []) {
          if (!item.name || item.name.startsWith(".")) continue;
          if (!item.name.toLowerCase().endsWith(".pdf")) continue;

          all.push({
            name: item.name,
            path: `${uid}/${cat.id}/${item.name}`,
            category: cat.id,
            created_at: item.created_at ?? undefined,
            metadata: item.metadata ?? undefined,
          });
        }
      }

      setFiles(all);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudieron cargar los documentos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ownerId) loadFiles(ownerId);
  }, [ownerId]);

  async function openPdf(file: TrainingFile) {
    setSelected(file);
    setPdfUrl("");
    setPdfLoading(true);

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.path, 3600);

    setPdfLoading(false);

    if (error || !data?.signedUrl) {
      toast.error("No se pudo abrir el documento. Comprueba tu conexión.");
      setSelected(null);
      return;
    }

    setPdfUrl(data.signedUrl);
  }

  async function uploadPdf(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !ownerId) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Solo puedes subir archivos PDF");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("El archivo supera el límite de 20 MB");
      return;
    }

    const cleanTitle = title.trim() || file.name.replace(/\.pdf$/i, "");
    const safeName = cleanTitle
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);

    const fileName = `${Date.now()}-${safeName || "documento"}.pdf`;
    const path = `${ownerId}/${uploadCategory}/${fileName}`;

    setUploading(true);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });

    setUploading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setTitle("");
    toast.success("Documento agregado a la biblioteca");
    await loadFiles(ownerId);
  }

  async function deletePdf(file: TrainingFile) {
    const confirmed = window.confirm(
      `¿Eliminar "${file.name.replace(/^\d+-/, "").replace(/\.pdf$/i, "")}" de la biblioteca?`,
    );
    if (!confirmed) return;

    const { error } = await supabase.storage.from(BUCKET).remove([file.path]);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (selected?.path === file.path) {
      setSelected(null);
      setPdfUrl("");
    }

    toast.success("Documento eliminado");
    if (ownerId) await loadFiles(ownerId);
  }

  const visibleFiles = files.filter(
    (file) => category === "todas" || file.category === category,
  );

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50">
        <Loader2 className="h-7 w-7 animate-spin text-pink-600" />
      </div>
    );
  }

  if (!ownerId) {
    return (
      <div className="min-h-screen grid place-items-center bg-pink-50 p-5">
        <Card className="max-w-sm p-5 text-center space-y-3">
          <h1 className="font-semibold text-lg">Capacitación Lula Shop</h1>
          <p className="text-sm text-muted-foreground">
            Para consultar la biblioteca, primero inicia sesión en el reloj checador.
          </p>
          <Link to="/auth">
            <Button className="w-full">Iniciar sesión</Button>
          </Link>
          <Link to="/" className="block text-sm text-muted-foreground">Volver</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50 text-slate-800">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-sm text-slate-600">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <div className="flex items-center gap-2 font-semibold">
          <BookOpen className="h-5 w-5 text-pink-600" />
          Capacitación
        </div>
        <button
          type="button"
          onClick={() => loadFiles(ownerId)}
          className="rounded-lg p-2 text-slate-500 hover:bg-pink-50"
          aria-label="Actualizar documentos"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        <section className="rounded-2xl bg-gradient-to-r from-pink-600 to-rose-400 p-5 text-white shadow-sm">
          <p className="text-sm font-medium text-pink-100">Aprender, crecer y mejorar</p>
          <h1 className="mt-1 text-2xl font-bold">Biblioteca Lula Shop</h1>
          <p className="mt-2 text-sm text-white/90">
            Consulta los manuales y materiales para desarrollar tus conocimientos y habilidades.
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Material de capacitación</h2>
            <span className="text-xs text-muted-foreground">
              {visibleFiles.length} documento(s)
            </span>
          </div>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="Selecciona una categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {loading ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-pink-600" />
            </div>
          ) : visibleFiles.length === 0 ? (
            <Card className="p-7 text-center">
              <BookOpen className="mx-auto h-9 w-9 text-pink-300" />
              <p className="mt-3 font-medium">Todavía no hay documentos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Los materiales que agregue la administración aparecerán aquí.
              </p>
            </Card>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleFiles.map((file) => {
                const cat = CATEGORIES.find((c) => c.id === file.category);
                const displayName = file.name
                  .replace(/^\d+-/, "")
                  .replace(/\.pdf$/i, "")
                  .replace(/-/g, " ");

                return (
                  <Card key={file.path} className="flex items-center gap-3 p-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-pink-50 text-pink-600">
                      <FileText className="h-5 w-5" />
                    </div>
                    <button
                      type="button"
                      onClick={() => openPdf(file)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold capitalize">
                        {displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {cat?.icon} {cat?.name ?? "Material"}
                      </span>
                    </button>
                    <span className="text-xs text-pink-600">Leer</span>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <AdminGate ownerId={ownerId}>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-pink-600" />
              <h2 className="font-semibold">Administrar biblioteca</h2>
            </div>
            <Card className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                Agrega manuales y documentos PDF para todas las colaboradoras.
              </p>

              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Nombre del documento (opcional)</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Aplicación correcta de uñas acrílicas"
                  maxLength={70}
                />
              </div>

              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={uploadPdf}
              />

              <Button
                className="w-full"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {uploading ? "Subiendo documento..." : "Seleccionar y subir PDF"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Formato PDF. Tamaño máximo: 20 MB por archivo.
              </p>
            </Card>

            {files.length > 0 && (
              <Card className="divide-y p-3">
                <h3 className="pb-2 text-sm font-semibold">Documentos publicados</h3>
                {files.map((file) => (
                  <div key={file.path} className="flex items-center gap-2 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-pink-600" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {file.name.replace(/^\d+-/, "").replace(/\.pdf$/i, "").replace(/-/g, " ")}
                    </span>
                    <button
                      type="button"
                      onClick={() => deletePdf(file)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      aria-label="Eliminar documento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </AdminGate>

        <section className="rounded-xl border border-rose-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
          <div className="mb-2 flex items-center gap-2 font-bold text-rose-700">
            <ShieldCheck className="h-4 w-4" />
            AVISO DE PROPIEDAD Y CONFIDENCIALIDAD
          </div>
          Toda la información, documentos, manuales, procedimientos y materiales de
          capacitación disponibles en esta sección son propiedad de Lula Shop o se
          utilizan con autorización de sus respectivos titulares. Queda prohibido
          fotografiar, capturar pantalla, copiar, reproducir, descargar, extraer,
          compartir, distribuir o divulgar, total o parcialmente, cualquier material
          interno o confidencial sin autorización expresa de la administración.
          El acceso se concede exclusivamente para fines de capacitación del personal.
          Cualquier uso, sustracción o divulgación no autorizada podrá dar lugar a
          medidas laborales y a las acciones legales que correspondan conforme a la
          legislación aplicable.
          <p className="mt-2 font-semibold text-slate-700">
            © Lula Shop. Todos los derechos reservados.
          </p>
        </section>
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
          <div className="flex items-center justify-between gap-3 bg-white px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">
                {selected.name.replace(/^\d+-/, "").replace(/\.pdf$/i, "").replace(/-/g, " ")}
              </p>
              <p className="text-xs text-slate-500">Documento de capacitación</p>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                setSelected(null);
                setPdfUrl("");
              }}
              aria-label="Cerrar documento"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {pdfLoading ? (
            <div className="grid flex-1 place-items-center text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : pdfUrl ? (
            <iframe
              title="Documento de capacitación Lula Shop"
              src={`${pdfUrl}#toolbar=1&navpanes=0`}
              className="min-h-0 flex-1 bg-slate-700"
              style={{ border: 0, width: "100%" }}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-5 text-center text-white">
              No se pudo mostrar el documento.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
