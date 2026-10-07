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
    if (!queued.size) { status(false); window.dispatchEvent(new Event('mc-documents-saved')); }
  } catch (error) {
    failed = true; queued.clear();
    status(false, error instanceof Error ? error.message : 'Penyimpanan gagal.');
  } finally {
    sending = false;
    if (queued.size && !failed) void flush();
  }
}

export async function refreshBusinessData() {
  if (sending || queued.size || failed || !ready) return false;
  const response = await fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) { window.dispatchEvent(new Event('mc-session-expired')); return false; }
  if (!response.ok) return false;
  const latest: Record<string, Document> = await response.json();
  if (sending || queued.size) return false;
  if (JSON.stringify(latest) === JSON.stringify(documents)) return false;
  documents = latest; cache = Object.fromEntries(Object.entries(latest).map(([key, doc]) => [key, encode(doc.value)]));
  window.dispatchEvent(new Event('storage'));
  return true;
}

// Preserve legacy browser records before any server hydration; nothing is deleted or automatically imported.
export function backupLegacyBusinessData() {
  if (localStorage.getItem('mc-legacy-preserved-v1')) return;
  const legacy: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index); if (key && businessKey(key)) legacy[key] = localStorage.getItem(key)!;
  }
  if (Object.keys(legacy).length) localStorage.setItem(`mc-legacy-backup-${Date.now()}`, JSON.stringify(legacy));
  localStorage.setItem('mc-legacy-preserved-v1', 'true');
}

export function legacyImportSummary() {
  if (testing || cache['machine-card-import-ledger']) return [];
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key && businessKey(key) && !['mc-system-audit-logs', 'machine-card-correction-logs'].includes(key)) keys.push(key);
  }
  return keys.filter((key) => { const raw = localStorage.getItem(key); return raw && !['[]', '{}', ''].includes(raw); });
}

export function importLegacyRecords() {
  const keys = legacyImportSummary();
  for (const key of keys) {
    let legacy = valueForKey(key, localStorage.getItem(key)!);
    if (key === 'machine-card-managed-users' && Array.isArray(legacy)) legacy = legacy.map(({ password, password_hash, ...profile }) => profile);
    const current = valueForKey(key, cache[key] || '[]');
    if (Array.isArray(legacy) && Array.isArray(current)) {
      const id = (row: Record<string, unknown>) => String(key === 'machine-card-managed-users' ? row.nik : row.ticket || row.id || row.kode_mesin || row.kodeMesin || row.nik || '');
      const merged = new Map(current.map((row) => [id(row), row]));
      // Only untouched startup documents can be updated from the legacy snapshot.
      for (const row of legacy) if (!merged.has(id(row)) || (documents[key]?.version || 0) <= 1) merged.set(id(row), row);
      storage.setItem(key, JSON.stringify([...merged.values()]));
    } else if (!(key in cache)) storage.setItem(key, encode(legacy));
  }
  storage.setItem('machine-card-import-ledger', JSON.stringify({ importedAt: new Date().toISOString(), keys }));
}
