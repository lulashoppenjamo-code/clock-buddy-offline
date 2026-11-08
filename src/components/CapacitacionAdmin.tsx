
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  Upload,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";

const BUCKET = "lula-capacitacion";

const CATEGORIES = [
  { id: "unas", name: "Uñas", icon: "💅" },
  { id: "pestanas", name: "Pestañas", icon: "👁️" },
  { id: "cosmeticos", name: "Cosméticos y maquillaje", icon: "💄" },
  { id: "pedicure", name: "Pedicure y Pedi Spa", icon: "🦶" },
  { id: "ventas", name: "Ventas y atención al cliente", icon: "💗" },
  { id: "procedimientos", name: "Procedimientos internos", icon: "📋" },
  { id: "pixel-perfect", name: "Manual de Pixel Perfect", icon: "🖥️" },
];

type TrainingFile = {
  name: string;
  path: string;
  category: string;
};

export function CapacitacionAdmin({ ownerId }: { ownerId: string }) {
  const [files, setFiles] = useState<TrainingFile[]>([]);
  const [category, setCategory] = useState("unas");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadFiles() {
    setLoading(true);

    try {
      const all: TrainingFile[] = [];

      for (const cat of CATEGORIES) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .list(`${ownerId}/${cat.id}`, {
            limit: 200,
            sortBy: { column: "name", order: "asc" },
          });

        if (error) throw error;

        for (const item of data ?? []) {
          if (!item.name || item.name.startsWith(".")) continue;
          if (!item.name.toLowerCase().endsWith(".pdf")) continue;

          all.push({
            name: item.name,
            path: `${ownerId}/${cat.id}/${item.name}`,
            category: cat.id,
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
    loadFiles();
  }, [ownerId]);

  async function uploadPdf(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
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
    const path = `${ownerId}/${category}/${fileName}`;

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
    toast.success("Documento publicado en Capacitación");

    await loadFiles();
  }

  async function deletePdf(file: TrainingFile) {
    const name = file.name
      .replace(/^\d+-/, "")
      .replace(/\.pdf$/i, "")
      .replace(/-/g, " ");

    if (!window.confirm(`¿Eliminar "${name}" de la biblioteca?`)) return;

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([file.path]);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Documento eliminado");
    await loadFiles();
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-pink-600" />
          <div>
            <h2 className="font-semibold">Escuela Lula Shop</h2>
            <p className="text-xs text-muted-foreground">
              Administración de materiales de capacitación
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={loadFiles}
          disabled={loading}
          aria-label="Actualizar documentos"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>Categoría del documento</Label>

        <Select value={category} onValueChange={setCategory}>
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
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ej. Aplicación de uñas acrílicas"
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
        Solo PDF. Tamaño máximo: 20 MB por archivo.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Documentos publicados</h3>
          <span className="text-xs text-muted-foreground">
            {files.length} archivo(s)
          </span>
        </div>

        {loading ? (
          <div className="grid place-items-center py-5">
            <Loader2 className="h-5 w-5 animate-spin text-pink-600" />
          </div>
        ) : files.length === 0 ? (
          <p className="rounded-lg bg-pink-50 p-4 text-center text-sm text-muted-foreground">
            Todavía no has publicado documentos.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {files.map((file) => {
              const cat = CATEGORIES.find((c) => c.id === file.category);
              const displayName = file.name
                .replace(/^\d+-/, "")
                .replace(/\.pdf$/i, "")
                .replace(/-/g, " ");

              return (
                <div
                  key={file.path}
                  className="flex items-center gap-2 p-3"
                >
                  <FileText className="h-4 w-4 shrink-0 text-pink-600" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cat?.icon} {cat?.name}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-red-500"
                    onClick={() => deletePdf(file)}
                    aria-label="Eliminar documento"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
