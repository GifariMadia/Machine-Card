// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TechnicianDashboard from './TechnicianDashboard';
import { exampleTechnician } from './operator';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('TechnicianDashboard & Maintenance Execution Portal (RBAC Teknisi 3 Modul)', () => {
  it('menampilkan PM mendatang di pekerjaan aktif tanpa mengizinkan mulai sebelum jadwal', () => {
    localStorage.setItem('machine-card-pm-schedules', JSON.stringify([
      { id: 'future', nomorPm: 'PM-FUTURE-TEST', machine: 'Ilapak 1', kodeMesin: 'ILA-01', section: 'Filling', kegiatan: 'Periksa bearing', periode: 'Mingguan', tanggalJatuhTempo: '2099-10-31', status: 'TERJADWAL' },
      { id: 'finished', nomorPm: 'PM-FINISHED-TEST', machine: 'Ilapak 1', tanggalJatuhTempo: '2026-10-01', status: 'SELESAI' },
    ]));
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Pekerjaan Tengah Diambil/i }));
    expect(screen.getByText('PM-FUTURE-TEST')).toBeTruthy();
    expect(screen.getByText('Akan Datang')).toBeTruthy();
    expect(screen.queryByText('PM-FINISHED-TEST')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mulai PM' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Detail PM' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('memulai PM yang sudah jatuh tempo dan menyimpan teknisi pelaksana', () => {
    localStorage.setItem('machine-card-pm-schedules', JSON.stringify([
      { id: 'due', nomorPm: 'PM-DUE-TEST', machine: 'Ilapak 1', kodeMesin: 'ILA-01', section: 'Filling', kegiatan: 'Periksa bearing', periode: 'Mingguan', tanggalJatuhTempo: '2020-10-31', status: 'TERJADWAL' },
    ]));
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Pekerjaan Tengah Diambil/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mulai PM' }));
    expect(JSON.parse(localStorage.getItem('machine-card-pm-schedules') || '[]')[0]).toMatchObject({ status: 'DALAM_PENGERJAAN', pelaksanaNik: exampleTechnician.nik });
    expect(screen.getByRole('button', { name: 'Selesaikan PM' })).toBeTruthy();
  });

  it('merender info teknisi, divisi maintenance, shift, dan 3 navigasi modul teknisi', () => {
    const onLogout = vi.fn();
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Topbar context
    expect(screen.getByText('BINTANG TOEDJOE')).toBeTruthy();
    expect(screen.getByText(/Portal Teknisi Maintenance/i)).toBeTruthy();
    expect(screen.getAllByText(exampleTechnician.name).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(exampleTechnician.departments.join(', ')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Workshop On-Duty')).toBeTruthy();

    // 3 Tab buttons modul teknisi fokus tindakan
    expect(screen.getByRole('tab', { name: /Antrean Breakdown/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Pekerjaan Tengah Diambil/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Review Laporan Shift/i })).toBeTruthy();

    // Verifikasi domain Supervisor (Katalog Mesin & Lifetime Part) telah dipindahkan keluar dari teknisi
    expect(screen.queryByRole('tab', { name: /Katalog Mesin & Lifetime Part/i })).toBeNull();
  });

  it('dapat melakukan pencarian pada tab antrean breakdown dan mengambil tiket baru', () => {
    const onLogout = vi.fn();
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Input pencarian antrean tiket
    const searchInput = screen.getByLabelText(/Cari antrean tiket/i);
    fireEvent.change(searchInput, { target: { value: 'Ilapak 1' } });

    expect(screen.getAllByText('Ilapak 1').length).toBeGreaterThanOrEqual(1);

    // Ambil pekerjaan
    const ambilButtons = screen.getAllByRole('button', { name: /Ambil Pekerjaan/i });
    expect(ambilButtons.length).toBeGreaterThan(0);
    fireEvent.click(ambilButtons[0]);

    // Drawer langsung terbuka dan tab berpindah ke Pekerjaan Tengah Diambil
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Formulir Tindakan Teknisi Maintenance/i)).toBeTruthy();
  });

  it('membaca tiket breakdown yang dilaporkan operator dari localStorage secara real-time', () => {
    const onLogout = vi.fn();

    // Simulasi operator mengirim tiket breakdown baru
    const operatorTicket = {
      ticket: 'OW-20261014-88888',
      machine: 'SIG 6',
      section: 'Filling',
      reporter: 'OPR0001',
      reporterName: 'A. Dahlan',
      shift: '1',
      issue: 'Motor servo filling overload alarm 402',
      kategori: 'Motor & Drive Inverter',
      woType: 'Batch',
      kodeProduk: 'LNKQA',
      noBatch: 'HM990',
      opened: '14 Okt 2026, 10:15',
      originalOpenedAt: new Date().toISOString(),
      status: 'OPEN',
    };
    localStorage.setItem('machine-card-open-work', JSON.stringify([operatorTicket]));

    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    expect(screen.getByText('OW-20261014-88888')).toBeTruthy();
    expect(screen.getByText('Motor servo filling overload alarm 402')).toBeTruthy();
    expect(screen.getAllByText('A. Dahlan').length).toBeGreaterThanOrEqual(1);
  });

  it('dapat mencatat tindakan perbaikan, penggantian part, dan menyelesaikan perbaikan fisik (SELESAI_PERBAIKAN) tanpa menutup tiket', () => {
    const onLogout = vi.fn();
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Ambil tiket breakdown pertama
    const ambilButtons = screen.getAllByRole('button', { name: /Ambil Pekerjaan/i });
    fireEvent.click(ambilButtons[0]);

    // Buka input penggantian part opsional
    const addPartBtn = screen.getByRole('button', { name: /\+ Tambah Penggantian Spare Part/i });
    fireEvent.click(addPartBtn);

    // Isi tindakan teknisi
    const actionInput = screen.getByLabelText(/Rincian Tindakan Maintenance/i);
    fireEvent.change(actionInput, {
      target: { value: 'Penggantian pisau I-Cut baru dan penyetelan celah potong' },
    });

    // Isi rincian part
    const partNameInput = screen.getByPlaceholderText(/Contoh: Pisau I-Cut/i);
    fireEvent.change(partNameInput, { target: { value: 'Pisau I-Cut' } });

    const partSpecInput = screen.getByPlaceholderText(/Contoh: HSS 80 x 25 mm/i);
    fireEvent.change(partSpecInput, { target: { value: 'HSS 80 x 25 mm' } });

    // Submit selesaikan perbaikan (serahkan ke operator)
    const finishBtn = screen.getByRole('button', { name: /Selesaikan Perbaikan/i });
    fireEvent.click(finishBtn);

    // Status terupdate menjadi Selesai Perbaikan (Menunggu Closing Operator)
    expect(screen.getByText(/Laporan Tindakan Perbaikan \(Selesai Perbaikan - Menunggu Closing Operator\)/i)).toBeTruthy();

    // Verifikasi localStorage tersinkronisasi dengan SELESAI_PERBAIKAN
    const stored = localStorage.getItem('machine-card-open-work');
    expect(stored).toBeTruthy();
    expect(stored).toContain('SELESAI_PERBAIKAN');
    expect(stored).toContain('Penggantian pisau I-Cut');
  });

  it('dapat beralih ke tab Pekerjaan Tengah Diambil dan melihat daftar pekerjaan aktif', () => {
    const onLogout = vi.fn();
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Pindah ke tab Pekerjaan Tengah Diambil
    const activeTabBtn = screen.getByRole('tab', { name: /Pekerjaan Tengah Diambil/i });
    fireEvent.click(activeTabBtn);

    // Cek header dan elemen tab aktif
    expect(screen.getByRole('heading', { level: 1, name: /Daftar Pekerjaan Tengah Diambil/i })).toBeTruthy();
    expect(screen.getByLabelText(/Cari tiket pekerjaan aktif/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Semua Aktif/i })).toBeTruthy();
  });

  it('dapat beralih ke tab Review Laporan Shift dan memverifikasi laporan per mesin sebelum closing', () => {
    const onLogout = vi.fn();
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Pindah ke tab Review Laporan Shift
    const shiftReportTab = screen.getByRole('tab', { name: /Review Laporan Shift/i });
    fireEvent.click(shiftReportTab);

    // Verifikasi laporan disusun terstruktur per mesin tanpa konteks birokratis
    expect(screen.getByText(/Laporan Penanganan Per Mesin/i)).toBeTruthy();
    expect(screen.getByText(/\*AREA FILLING:\*/i)).toBeTruthy();
    expect(screen.getAllByText(/Ilapak 1/i).length).toBeGreaterThan(0);

    // Verifikasi tombol closing shift aktif
    const closingBtn = screen.getByRole('button', { name: /Konfirmasi & Closing Laporan Shift/i });
    expect(closingBtn).toBeTruthy();

    // Lakukan closing shift
    fireEvent.click(closingBtn);

    // Status closing shift tercatat
    expect(screen.getAllByText(/Laporan Shift Telah Ditutup/i).length).toBeGreaterThanOrEqual(1);
  });

  it('memastikan domain kalkulasi analitis dan target interval SPV tidak membebani teknisi', () => {
    const onLogout = vi.fn();
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Teknisi hanya fokus pada 3 modul eksekusi perbaikan
    expect(screen.queryByRole('tab', { name: /Katalog Mesin & Lifetime Part/i })).toBeNull();
    expect(screen.queryByText(/MTTR \(Waktu Perbaikan\)/i)).toBeNull();
    expect(screen.queryByText(/MTBF \(Jam Operasi Aktual\)/i)).toBeNull();
    expect(screen.queryByText(/Telusuri Sumber Log Jam Operasi/i)).toBeNull();
  });

  it('dapat menunda pekerjaan dengan alasan menunggu part sesuai URS 3.2 dan 3.4', () => {
    const onLogout = vi.fn();
    const inProgressTicket = {
      ticket: 'OW-20261014-99001',
      machine: 'Ilapak 1',
      section: 'Filling',
      reporter: 'OPR0001',
      reporterName: 'A. Dahlan',
      shift: '1',
      issue: 'Pneumatic silinder bocor',
