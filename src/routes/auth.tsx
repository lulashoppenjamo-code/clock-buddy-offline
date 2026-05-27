import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Ya puedes iniciar sesión.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bienvenida");
        navigate({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-rose-100 p-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-pink-600 flex items-center justify-center">
            <Clock className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-semibold">Reloj Checador</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Entra a tu cuenta de administrador" : "Crea tu cuenta"}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "..." : mode === "signin" ? "Entrar" : "Crear cuenta"}
          </Button>
        </form>
        <button
          type="button"
          className="text-sm text-pink-600 hover:underline w-full text-center"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "¿No tienes cuenta? Regístrate" : "Ya tengo cuenta"}
        </button>
        <p className="text-xs text-muted-foreground text-center">
          Una sola cuenta puede usarse en varios dispositivos. Cada empleada checará con su PIN.
        </p>
        <div className="text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">
            ← Volver
          </Link>
        </div>
      </Card>
    </div>
  );
}
