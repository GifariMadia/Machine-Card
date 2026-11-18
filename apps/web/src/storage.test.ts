import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.stubEnv('MODE', 'production'); vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('menyimpan bisnis melalui server dengan versi, bukan localStorage', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ 'machine-card-open-work': { version: 1, value: [] } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ 'machine-card-open-work': { version: 2, value: [{ ticket: 'SERVER' }] } }) });
  vi.stubGlobal('fetch', fetcher);
  const { storage, loadBusinessData } = await import('./storage'); await loadBusinessData();
  storage.setItem('machine-card-open-work', '[{"ticket":"SERVER"}]');
  await vi.advanceTimersByTimeAsync(35);
  expect(localStorage.getItem('machine-card-open-work')).toBeNull();
  const request = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(request.changes[0].version).toBe(1);
  expect(storage.getItem('machine-card-open-work')).toContain('SERVER');
});

it('retry jaringan menggunakan kunci idempotensi dan payload sama', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({}) }).mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ 'machine-card-open-work': { version: 1, value: [{ ticket: 'ONCE' }] } }) });
  vi.stubGlobal('fetch', fetcher);
  const { storage, loadBusinessData } = await import('./storage'); await loadBusinessData();
  storage.setItem('machine-card-open-work', '[{"ticket":"ONCE"}]'); await vi.advanceTimersByTimeAsync(35);
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
});

it('konflik ditampilkan sebagai gagal dan memblokir mutasi lanjutan sampai refresh', async () => {
  const listener = vi.fn(); window.addEventListener('mc-sync-status', listener);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({}) }).mockResolvedValueOnce({ ok: false, status: 409 }));
  const { storage, loadBusinessData } = await import('./storage'); await loadBusinessData();
  storage.setItem('machine-card-open-work', '[{"ticket":"CONFLICT"}]'); await vi.advanceTimersByTimeAsync(35);
  expect(listener.mock.calls[listener.mock.calls.length - 1]?.[0].detail.error).toMatch(/belum tersimpan/i);
  expect(() => storage.setItem('machine-card-open-work', '[]')).toThrow();
  window.removeEventListener('mc-sync-status', listener);
});

it('refreshBusinessData melewati serialisasi ulang saat versi dokumen tidak berubah dan memperbarui secara inkremental saat versi naik', async () => {
  const docA = [{ ticket: 'A-1' }];
  const docB = [{ id_mesin: 1 }];
  const updatedDocB = [{ id_mesin: 1 }, { id_mesin: 2 }];
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ 'machine-card-open-work': { version: 1, value: docA }, 'machine-card-machines': { version: 3, value: docB } }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ 'machine-card-open-work': { version: 1, value: docA }, 'machine-card-machines': { version: 3, value: docB } }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ 'machine-card-open-work': { version: 1, value: docA }, 'machine-card-machines': { version: 4, value: updatedDocB } }) });
  vi.stubGlobal('fetch', fetcher);
  const { storage, loadBusinessData, refreshBusinessData } = await import('./storage');
  await loadBusinessData();

  const stringifySpy = vi.spyOn(JSON, 'stringify');
  const storageListener = vi.fn();
  window.addEventListener('storage', storageListener);

  expect(await refreshBusinessData()).toBe(false);
  expect(stringifySpy).not.toHaveBeenCalled();
  expect(storageListener).not.toHaveBeenCalled();

  expect(await refreshBusinessData()).toBe(true);
  expect(stringifySpy).toHaveBeenCalledTimes(1);
  expect(stringifySpy).toHaveBeenCalledWith(updatedDocB);
  expect(storageListener).toHaveBeenCalledTimes(1);
  expect(storage.getItem('machine-card-machines')).toContain('"id_mesin":2');

  window.removeEventListener('storage', storageListener);
  stringifySpy.mockRestore();
});
