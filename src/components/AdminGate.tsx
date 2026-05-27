import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  hasAdminCode,
  setAdminCode,
  verifyAdminCode,
  isUnlocked,
  markUnlocked,
} from "@/lib/admin-lock";

export function AdminGate({
  ownerId,
  children,
}: {
  ownerId: string;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const has = await hasAdminCode(ownerId);
      setNeedsSetup(!has);
      setUnlocked(has && isUnlocked());
      setReady(true);
    })();
  }, [ownerId]);

  async function onSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(code)) {
      toast.error("Usa 4 a 8 dígitos");
      return;
    }
    if (code !== code2) {
      toast.error("Los códigos no coinciden");
      return;
    }
    setBusy(true);
    await setAdminCode(ownerId, code);
    markUnlocked();
    setBusy(false);
    setUnlocked(true);
    toast.success("Código de administrador configurado");
  }

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await verifyAdminCode(ownerId, code);
    setBusy(false);
    if (!ok) {
      toast.error("Código incorrecto");
      setCode("");
      return;
    }
    markUnlocked();
    setUnlocked(true);
  }

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-rose-950 to-pink-950 p-6">
      <Card className="p-6 w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="h-12 w-12 rounded-full bg-pink-100 text-pink-700 grid place-items-center">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="font-semibold text-lg">
            {needsSetup ? "Configura tu código" : "Código de administrador"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {needsSetup
              ? "Crea un código numérico para proteger los reportes y la gestión de empleadas."
              : "Ingresa tu código para continuar."}
          </p>
        </div>

        <form onSubmit={needsSetup ? onSetup : onUnlock} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-code">Código</Label>
            <Input
              id="admin-code"
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              required
            />
          </div>
          {needsSetup && (
            <div className="space-y-1.5">
              <Label htmlFor="admin-code2">Confirmar código</Label>
              <Input
                id="admin-code2"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={code2}
                onChange={(e) => setCode2(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                required
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : needsSetup ? (
              "Guardar y entrar"
            ) : (
              "Desbloquear"
            )}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center">
          El código se guarda solo en este dispositivo.
        </p>
      </Card>
    </div>
  );
}
