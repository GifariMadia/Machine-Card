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

    // Check active tab is now tickets
    expect(screen.getByRole('tab', { name: /Tiket Aktif/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('OW-20261014-99999')).toBeTruthy();
    expect(screen.getByText(/Pisau pemotong I-Cut tumpul/i)).toBeTruthy();
    expect(screen.getAllByText(/Menunggu Teknisi/i).length).toBeGreaterThanOrEqual(1);
  });

  it('dapat beralih filter status tiket di tab Tiket Aktif', () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    // Switch to tickets tab
    const ticketsTab = screen.getByRole('tab', { name: /Tiket Aktif/i });
    fireEvent.click(ticketsTab);

    // Check filter pills
    expect(screen.getByRole('button', { name: /^Semua Aktif/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Menunggu Teknisi/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Sedang Dikerjakan/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Riwayat Selesai/i })).toBeTruthy();

    // Default: tiket yang sudah diclosing (CLOSED) TIDAK muncul di daftar aktif utama
    expect(screen.queryByText('OW-233174')).toBeNull();

    // Filter to Riwayat Selesai
    const selesaiFilter = screen.getByRole('button', { name: /^Riwayat Selesai/i });
    fireEvent.click(selesaiFilter);

    // Seeded closed ticket should now be visible
    expect(screen.getByText('OW-233174')).toBeTruthy();
    expect(screen.getAllByText(/Selesai Perbaikan/i).length).toBeGreaterThanOrEqual(1);
  });

  it('dapat membuka modal closing operator dan menutup tiket setelah mesin beroperasi kembali', async () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    // Switch to tickets tab
    const ticketsTab = screen.getByRole('tab', { name: /Tiket Aktif/i });
    fireEvent.click(ticketsTab);

    // Find and click "Closing Tiket (Mesin Beroperasi)" button
    const closeButtons = screen.getAllByRole('button', { name: /Closing Tiket \(Mesin Beroperasi\)/i });
    expect(closeButtons.length).toBeGreaterThan(0);
    fireEvent.click(closeButtons[0]);

    // Check modal appears
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Closing Tiket')).toBeTruthy();

    // Fill notes and submit
    const notesInput = screen.getByLabelText(/Catatan Uji Coba \/ Running Test/i);
    fireEvent.change(notesInput, { target: { value: 'Running test 15 menit produk baik, speed normal 75 rpm.' } });

    // Submit form
    const form = screen.getByRole('dialog').querySelector('form')!;
    fireEvent.submit(form);

    // Verify banner success appears
    await waitFor(() => {
      expect(screen.getByText(/Berhasil Ditutup - Mesin Beroperasi/i)).toBeTruthy();
    });
  });

  it('memanggil onLogout saat tombol Keluar diklik', () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    const logoutBtn = screen.getByRole('button', { name: /Keluar/i });
    fireEvent.click(logoutBtn);

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('mendukung aksesibilitas keyboard (Escape untuk menutup drawer dan modal closing)', () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    // Buka drawer Open Work lalu tekan Escape
    const reportButtons = screen.getAllByRole('button', { name: /Laporkan Breakdown/i });
    fireEvent.click(reportButtons[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('menyediakan opsi interval pagination dan mengingat preferensi perPage di kedua halaman', () => {
    const onLogout = vi.fn();
    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    // Selector per page di tab Mesin
    const machinePerPageSelect = screen.getByLabelText(/Jumlah mesin per halaman/i) as HTMLSelectElement;
    expect(machinePerPageSelect).toBeTruthy();
    fireEvent.change(machinePerPageSelect, { target: { value: '5' } });
    expect(machinePerPageSelect.value).toBe('5');
    expect(localStorage.getItem('mc-operator-machines-per-page')).toBe('5');

    // Beralih ke tab Tiket
    const ticketsTab = screen.getByRole('tab', { name: /Tiket Aktif/i });
    fireEvent.click(ticketsTab);

    // Selector per page di tab Tiket
    const ticketPerPageSelect = screen.getByLabelText(/Jumlah tiket per halaman/i) as HTMLSelectElement;
    expect(ticketPerPageSelect).toBeTruthy();
    fireEvent.change(ticketPerPageSelect, { target: { value: '20' } });
    expect(ticketPerPageSelect.value).toBe('20');
    expect(localStorage.getItem('mc-operator-tickets-per-page')).toBe('20');
  });

  it('menampilkan tiket SELESAI_PERBAIKAN di banner siap closing dan operator dapat melakukan running test & finishing closing', async () => {
    const onLogout = vi.fn();
    const repairDoneTicket = {
      ticket: 'OW-20261025-001',
      machine: 'Ilapak 1',
      section: 'Filling',
      reporter: 'OPR0001',
      reporterName: 'Suparmi',
      shift: '1',
      keterangan: 'Sensor sealing macet',
      status: 'SELESAI_PERBAIKAN',
      action: 'Penggantian sensor proximity dan re-wiring',
      technicianName: 'PDA / RMA',
      waktuMulai: '2026-10-25T08:00:00.000Z',
      waktuSelesai: '2026-10-25T09:15:00.000Z',
      createdAt: '2026-10-25T08:00:00.000Z',
    };
    localStorage.setItem('machine-card-open-work', JSON.stringify([repairDoneTicket]));

    render(<OperatorDashboard operator={exampleOperator} onLogout={onLogout} />);

    // Verifikasi banner siap closing muncul untuk tiket tersebut
    expect(screen.getByText(/Mesin Ilapak 1 Siap Running Test \/ Ditutup/i)).toBeTruthy();
    expect(screen.getByText(/Penggantian sensor proximity dan re-wiring/i)).toBeTruthy();

    // Klik tombol closing dari banner
    const closingActionBtn = screen.getByRole('button', { name: /Closing Tiket \(Mesin Beroperasi\)/i });
    fireEvent.click(closingActionBtn);

    // Modal closing terbuka
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('OW-20261025-001').length).toBeGreaterThanOrEqual(1);

    // Isi formulir uji coba / running test
    const notesInput = screen.getByLabelText(/Catatan Uji Coba \/ Running Test/i);
    fireEvent.change(notesInput, { target: { value: 'Trial run 15 menit 120 sachet normal dan tidak macet lagi.' } });

    // Submit closing oleh Operator
    const submitBtn = screen.getByRole('button', { name: /Konfirmasi & Tutup Tiket/i });
    fireEvent.click(submitBtn);

    // Banner sukses closing tampil
    await waitFor(() => {
      expect(screen.getByText(/OW-20261025-001 \(Mesin Beroperasi Kembali & Tiket Ditutup\)/i)).toBeTruthy();
    });

    // Verifikasi status di localStorage berubah menjadi CLOSED oleh operator
    const stored = JSON.parse(localStorage.getItem('machine-card-open-work') || '[]');
    const closed = stored.find((t: any) => t.ticket === 'OW-20261025-001');
    expect(closed).toBeTruthy();
    expect(closed.status).toBe('CLOSED');
    expect(closed.catatanClosing).toContain('Trial run 15 menit');
  });
});



