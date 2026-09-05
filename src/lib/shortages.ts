// Helpers del módulo de Faltantes / Surtido
import { BRANCHES, branchName, type Branch } from "@/lib/cleaning";

export { BRANCHES, branchName };
export type { Branch };

export type ShortageReport = {
  id: string;
  owner_id: string;
  employee_id: string;
  employee_name: string;
  branch: string;
  report_date: string; // YYYY-MM-DD
  items: string[];
  comment: string | null;
  created_at: string;
};

/** Fecha local en formato YYYY-MM-DD */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Domingo que inicia la semana de la fecha dada */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function weekEnd(d: Date): Date {
  const s = weekStart(d);
  s.setDate(s.getDate() + 6);
  return s;
}

export function formatDayLabel(iso: string): string {
  return parseISODate(iso).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatWeekLabel(start: Date): string {
  const end = weekEnd(start);
  const f = (d: Date) =>
    d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)}`;
}

/** Convierte el texto libre (uno por línea) en lista limpia de productos */
export function parseItems(text: string): string[] {
  return text
    .split(/\r?\n|,|;/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 200);
}

/** Normaliza para poder agrupar productos iguales o similares */
export function normalizeItem(s: string): string {
  let x = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // quita cantidades y unidades comunes al inicio o final
  x = x.replace(/\b\d+(\.\d+)?\s*(kg|kgs|gr|g|ml|lt|l|pz|pzas|piezas|paq|cajas?|bolsas?)\b/g, " ");
  x = x.replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
  // singulariza plurales simples
  x = x
    .split(" ")
    .map((w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
  return x;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const dist = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  return max >= 4 && dist <= (max > 8 ? 2 : 1);
}

export type GroupedItem = {
  label: string;
  count: number;
  variants: string[];
  reporters: string[];
};

/** Agrupa productos iguales o similares y cuenta cuántas veces se reportaron */
export function groupItems(
  reports: { items: string[]; employee_name: string }[],
): GroupedItem[] {
  const groups: {
    key: string;
    count: number;
    labels: Map<string, number>;
    reporters: Set<string>;
  }[] = [];

  for (const r of reports) {
    for (const raw of r.items) {
      const label = raw.trim();
      if (!label) continue;
      const key = normalizeItem(label);
      if (!key) continue;
      let g = groups.find((x) => similar(x.key, key));
      if (!g) {
        g = { key, count: 0, labels: new Map(), reporters: new Set() };
        groups.push(g);
      }
      g.count += 1;
      g.labels.set(label, (g.labels.get(label) ?? 0) + 1);
      g.reporters.add(r.employee_name);
    }
  }

  return groups
    .map((g) => {
      const variants = [...g.labels.entries()].sort((a, b) => b[1] - a[1]);
      return {
        label: variants[0]?.[0] ?? g.key,
        count: g.count,
        variants: variants.map((v) => v[0]),
        reporters: [...g.reporters].sort(),
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* ---------- Recordatorio diario ---------- */
const REMINDER_HOUR_KEY = "faltantes.reminderHour";
const REMINDER_SHOWN_KEY = "faltantes.reminderShown";

export function getReminderHour(): number {
  if (typeof window === "undefined") return 19;
  const raw = window.localStorage.getItem(REMINDER_HOUR_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : 19;
}

export function setReminderHour(h: number) {
  try {
    window.localStorage.setItem(REMINDER_HOUR_KEY, String(h));
  } catch {}
}

/** Devuelve true si ya pasó la hora del recordatorio y no se ha mostrado hoy */
export function shouldRemindNow(): boolean {
  if (typeof window === "undefined") return false;
  const now = new Date();
  if (now.getHours() < getReminderHour()) return false;
  return window.localStorage.getItem(REMINDER_SHOWN_KEY) !== todayISO();
}

export function markReminderShown() {
  try {
    window.localStorage.setItem(REMINDER_SHOWN_KEY, todayISO());
  } catch {}
}

export async function notifyReminder(body: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") return;
    new Notification("📦 Reporte de faltantes", { body });
  } catch {}
}
