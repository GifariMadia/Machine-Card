// Regression checks for the defects originally reproduced by the audit.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

beforeEach(() => { vi.resetModules(); vi.stubEnv('MODE', 'production'); localStorage.clear(); sessionStorage.clear(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('AUD-01: production cannot authenticate using the bundled profile helper', async () => {
  const { authenticateUser } = await import('../src/operator');
  expect(authenticateUser('ADMIN', 'password')).toBeUndefined();
});
it('AUD-03: startup preserves legacy business records', async () => {
  localStorage.setItem('machine-card-open-work', JSON.stringify([{ ticket: 'KEEP-ME' }]));
  const { default: App } = await import('../src/App'); render(<App />);
  expect(localStorage.getItem('machine-card-open-work')).toContain('KEEP-ME');
});
it('AUD-13: latest replacement supersedes an older installed snapshot', async () => {
  const { getMachineParts } = await import('../src/machine-parts');
  const result = getMachineParts({ nama_mesin: 'Ilapak 1', kode_mesin: 'ILA-01' }, [{ machine: 'Ilapak 1', part: 'Pisau', position: 'Line 1', replacedAt: '2020-01-01', specification: '', intervalBasis: 'KALENDER', intervalTarget: 90, currentUsage: 80, isDataComplete: true }], [{ ticket: 'NEW', machine: 'Ilapak 1', status: 'CLOSED', waktuSelesai: '2026-10-26T10:00:00+07:00', partReplaced: { name: 'Pisau', position: 'Line 1' } } as any], [], [{ name: 'Pisau', intervalBasis: 'KALENDER', defaultLifetimeDays: 90 }]);
  expect(result[0].replacedAt).toBe('2026-10-26');
});
it('AUD-12: historical calendar part becomes overdue instead of staying at zero', async () => {
  const { getMachineParts } = await import('../src/machine-parts');
  const result = getMachineParts({ nama_mesin: 'Ilapak 1', kode_mesin: 'ILA-01' }, [], [{ ticket: 'OLD', machine: 'Ilapak 1', status: 'CLOSED', waktuSelesai: '2020-01-01T10:00:00+07:00', partReplaced: { name: 'Pisau', position: 'Line 1' } } as any], [], [{ name: 'Pisau', intervalBasis: 'KALENDER', defaultLifetimeDays: 90 }]);
  expect(result[0].currentUsage).toBeGreaterThan(90);
});
it('AUD-09: shift-2 report excludes a historical shift-1 ticket', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ 'machine-card-open-work': { version: 1, value: [{ ticket: 'OLD', machine: 'Ilapak 1', shift: '1', status: 'CLOSED', waktuMulai: '2020-01-01T10:00:00+07:00', keterangan: 'AUDIT-OLD-ISSUE' }] } }) } as Response);
  const { loadBusinessData } = await import('../src/storage'); await loadBusinessData();
  const { default: SupervisorDashboard } = await import('../src/SupervisorDashboard');
  const { exampleSupervisor } = await import('../src/operator');
  render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: /Laporan Shift & Handover/i }));
  fireEvent.click(screen.getByRole('button', { name: /Shift 2 \(Sore\)/i }));
  expect(screen.queryByText(/AUDIT-OLD-ISSUE/)).toBeNull();
});
it('AUD-08: operational report never claims automatically sent without server delivery evidence', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);
  const { loadBusinessData } = await import('../src/storage'); await loadBusinessData();
  const { default: SupervisorDashboard } = await import('../src/SupervisorDashboard');
  const { exampleSupervisor } = await import('../src/operator');
  render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: /Laporan Shift & Handover/i }));
  expect(screen.queryByText('COMPLETE (Terkirim Otomatis)')).toBeNull();
});
