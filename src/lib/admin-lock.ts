// Simple local admin gate. Code is stored hashed in localStorage per owner.
// This is a UX lock for the shared device, not a server-side auth boundary
// (the actual data is protected by Supabase Auth + RLS).

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const KEY = (uid: string) => `admin_code_${uid}`;
const SESSION_KEY = "admin_unlocked_until";
const SESSION_MS = 15 * 60 * 1000; // 15 min

export async function hasAdminCode(uid: string): Promise<boolean> {
  return !!localStorage.getItem(KEY(uid));
}

export async function setAdminCode(uid: string, code: string): Promise<void> {
  const h = await sha256(code + ":" + uid);
  localStorage.setItem(KEY(uid), h);
}

export async function verifyAdminCode(uid: string, code: string): Promise<boolean> {
  const stored = localStorage.getItem(KEY(uid));
  if (!stored) return false;
  const h = await sha256(code + ":" + uid);
  return h === stored;
}

export function markUnlocked() {
  sessionStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_MS));
}

export function isUnlocked(): boolean {
  const v = sessionStorage.getItem(SESSION_KEY);
  if (!v) return false;
  return Date.now() < Number(v);
}

export function lock() {
  sessionStorage.removeItem(SESSION_KEY);
}
