// Server-authoritative business storage. Browser storage is retained only for preferences and legacy backup.
type Document = { value: unknown; version: number };
let documents: Record<string, Document> = {};
let cache: Record<string, string> = {};
let ready = false;
let failed = false;
let sending = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let queued = new Map<string, string>();
let generation = 0;
const testing = import.meta.env.MODE === 'test';
const preferences = new Set(['machine-card-session', 'machine-card-employee-id']);
export const businessKey = (key: string) => !preferences.has(key) && (key.startsWith('machine-card-') || ['mc-master-parts', 'mc-pending-part-justifications', 'mc-system-audit-logs'].includes(key));
const encode = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value);
const decode = (value: string) => { try { return JSON.parse(value); } catch { return value; } };
const valueForKey = (key: string, value: string) => /^machine-card-(repair|pbjt|pm|other)-notes(?:-|$)|^machine-card-shift-members$/.test(key) ? value : decode(value);
function status(pending: boolean, error = '') { window.dispatchEvent(new CustomEvent('mc-sync-status', { detail: { pending, error } })); }

export async function loadBusinessData() {
  const response = await fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Data server belum tersedia. Silakan login kembali atau periksa koneksi.');
  documents = await response.json();
  cache = Object.fromEntries(Object.entries(documents).map(([key, doc]) => [key, encode(doc.value)]));
  ready = true; failed = false; generation++;
}

export function resetBusinessData() { ready = false; queued.clear(); documents = {}; cache = {}; generation++; }

export const storage = {
  getItem(key: string): string | null {
    if (testing || !businessKey(key)) return localStorage.getItem(key);
    return cache[key] ?? null;
  },
  setItem(key: string, value: string) {
    if (testing || !businessKey(key)) { localStorage.setItem(key, value); return; }
    if (!ready || failed) throw new Error('Data belum siap atau perlu dimuat ulang');
    if (cache[key] === value || (!(key in cache) && ['[]', '{}', ''].includes(value))) return;
    cache[key] = value; queued.set(key, value); status(true);
    if (!sending && !timer) timer = setTimeout(() => { timer = undefined; void flush(); }, 30);
  },
  removeItem(key: string) {
    if (testing || !businessKey(key)) { localStorage.removeItem(key); return; }
    throw new Error('Catatan bisnis tidak boleh dihapus. Gunakan pembatalan dengan alasan.');
  },
};

async function flush() {
  if (sending || failed || !queued.size) return;
  sending = true;
  const version = generation;
  const batch = queued; queued = new Map();
  const changes = [...batch].map(([key, value]) => ({ key, value: valueForKey(key, value), version: documents[key]?.version || 0 }));
  const request = JSON.stringify({ requestKey: crypto.randomUUID(), changes });
  try {
    // A network retry must reuse the same request key and exact payload.
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { response = await fetch('/api/state', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: request }); break; }
      catch (error) { if (attempt === 1) throw error; }
    }
    if (!response?.ok) throw new Error(response?.status === 409 ? 'Data diubah pengguna lain. Perubahan Anda belum tersimpan. Muat data terbaru lalu ulangi.' : response?.status === 403 ? 'Perubahan ditolak: akun Anda tidak memiliki izin untuk aksi ini.' : 'Perubahan belum terkonfirmasi tersimpan di server.');
    const saved: Record<string, Document> = await response.json();
    if (version !== generation) return;
    Object.assign(documents, saved);
    for (const [key, doc] of Object.entries(saved)) if (!queued.has(key)) cache[key] = encode(doc.value);
