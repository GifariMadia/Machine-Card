// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OperatorDashboard from './OperatorDashboard';
import { exampleOperator } from './operator';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  // Safe default fetch mock for machine queries
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
  });
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('OperatorDashboard & Open Work Reporting Portal', () => {
  it('merender info operator, area kerja, shift, dan navigasi tab plant', () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    // Topbar context
    expect(screen.getByText('BINTANG TOEDJOE')).toBeTruthy();
    expect(screen.getByText(/Portal Operator/i)).toBeTruthy();
    expect(screen.getByText(exampleOperator.name)).toBeTruthy();
    expect(screen.getByText(exampleOperator.departments.join(', '))).toBeTruthy();

    // Tab buttons
    expect(screen.getByRole('tab', { name: /Daftar Mesin Plant/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Tiket Aktif/i })).toBeTruthy();
  });

  it('dapat melakukan filter dan pencarian pada katalog seluruh mesin plant (akses terbuka)', () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    const searchInput = screen.getByLabelText(/Cari mesin/i);
    fireEvent.change(searchInput, { target: { value: 'Ilapak 1' } });

    expect(screen.getByText('Ilapak 1')).toBeTruthy();
  });

  it('membuka drawer pelaporan Open Work saat tombol "Laporkan Breakdown" ditekan', () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    // Cari mesin Ilapak 1 pada katalog terbuka plant
    const searchInput = screen.getByLabelText(/Cari mesin/i);
    fireEvent.change(searchInput, { target: { value: 'Ilapak 1' } });

    const reportButtons = screen.getAllByRole('button', { name: /Laporkan Breakdown/i });
    expect(reportButtons.length).toBeGreaterThan(0);

    fireEvent.click(reportButtons[0]);

    // Drawer should appear
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /Ilapak 1/i })).toBeTruthy();
    expect(screen.getByLabelText(/Jam Mesin Berhenti/i)).toBeTruthy();
    expect(screen.getByText(/Detail Gangguan/i)).toBeTruthy();
    expect(screen.queryByText(/Smart-Typing Aktif/i)).toBeNull();
    expect(screen.getByText(/Konteks Produksi/i)).toBeTruthy();
  });

  it('menerima ketikan manual tanpa rekomendasi atau perubahan kategori otomatis', () => {
    render(<OperatorDashboard operator={exampleOperator} onLogout={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Laporkan Breakdown/i })[0]);
    const input = screen.getByLabelText(/Deskripsi Gangguan/i) as HTMLTextAreaElement;
    const category = screen.getByLabelText(/Kategori Breakdown/i) as HTMLSelectElement;
    const previousCategory = category.value;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'gasket bocor' } });
    expect(input.value).toBe('gasket bocor');
    expect(category.value).toBe(previousCategory);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText(/Smart-Typing Aktif/i)).toBeNull();
  });

  it('memvalidasi field form dalam drawer Open Work (keterangan minimal 5 karakter)', async () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    const reportButtons = screen.getAllByRole('button', { name: /Laporkan Breakdown/i });
    fireEvent.click(reportButtons[0]);

    // Enter short description
    const descInput = screen.getByLabelText(/Deskripsi Gangguan/i);
    fireEvent.change(descInput, { target: { value: 'test' } });

    // Fill NO.WR
    const noWrInput = screen.getByLabelText(/NO\.WR/i);
    fireEvent.change(noWrInput, { target: { value: 'WR-12345' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Kirim Laporan Open Work/i });
    fireEvent.click(submitBtn);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Keterangan gangguan minimal 5 karakter/i)).toBeTruthy();
  });

  it('berhasil mengirim laporan Open Work, menampilkan banner sukses, dan menambahkan ke Tiket Mesin', async () => {
    const onLogout = vi.fn();

    // Mock successful fetch to /api/open-work
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/open-work')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'success',
              data: {
                id_open_work: 999,
                nomor_work: 'OW-20261014-99999',
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
    });

    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    // Open Drawer for first machine
    const reportButtons = screen.getAllByRole('button', { name: /Laporkan Breakdown/i });
    fireEvent.click(reportButtons[0]);

    // Fill valid description
    const descInput = screen.getByLabelText(/Deskripsi Gangguan/i);
    fireEvent.change(descInput, {
      target: { value: 'Pisau pemotong I-Cut tumpul, sachet tidak terpotong rapi' },
    });

    // Fill NO.WR
    const noWrInput = screen.getByLabelText(/NO\.WR/i);
    fireEvent.change(noWrInput, { target: { value: 'WR-12345' } });

    // Fill WO Type & Batch details
    const batchInput = screen.getByLabelText(/Nomor Batch/i);
    fireEvent.change(batchInput, { target: { value: 'HM999' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Kirim Laporan Open Work/i });
    fireEvent.click(submitBtn);

    // Wait for success alert
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeTruthy();
      expect(screen.getByText(/Laporan Breakdown Berhasil Terkirim!/i)).toBeTruthy();
      expect(screen.getByText('OW-20261014-99999')).toBeTruthy();
    });

    // Click "Lihat di Tiket Aktif"
    const viewTicketsBtn = screen.getByRole('button', { name: /Lihat di Tiket Aktif/i });
    fireEvent.click(viewTicketsBtn);

