// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SupervisorDashboard from './SupervisorDashboard';
import { exampleSupervisor } from './operator';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('SupervisorDashboard & Production Line Oversight (Peran Supervisor)', () => {
  it('menampilkan satu submodul analitik sesuai pilihan menu', () => {
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={vi.fn()} />);
    const menu = screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i });
    fireEvent.click(menu);
    const modules = [
      ['Pola & Akuntabilitas', /Ringkasan Pola Breakdown & Akuntabilitas Lapangan/i],
      ['Metrik & Target KPI', /Monitoring & Pengukuran Kinerja Maintenance/i],
      ['Part Lifetime & PM', /Monitoring Lifetime Komponen & Prioritas Penggantian/i],
      ['Antrean & Jejak Audit', /Monitoring Pekerjaan Terbuka & Matriks Aging Tiket/i],
    ] as const;
    modules.forEach(([label, heading]) => {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByText(heading)).toBeTruthy();
      modules.filter(([other]) => other !== label).forEach(([, otherHeading]) => {
        expect(screen.queryByText(otherHeading)).toBeNull();
      });
    });
    fireEvent.click(menu);
    expect(screen.getByText(modules[0][1])).toBeTruthy();
    expect(screen.queryByText(modules[3][1])).toBeNull();
  });

  it.each(['storage', 'focus'])('memperbarui riwayat part tiket ketika menerima %s dari akun lain', (eventName) => {
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i }));
    expect(screen.queryByText('Pisau Dapur Uji Sinkronisasi')).toBeNull();

    localStorage.setItem('machine-card-open-work', JSON.stringify([{
      ticket: 'TEST-PART-758468', machine: 'Ilapak 20', section: 'Packaging',
      status: 'CLOSED', partReplaced: { name: 'Pisau Dapur Uji Sinkronisasi', quantity: '1', position: 'Line 1' },
    }]));
    fireEvent(window, new Event(eventName));

    expect(screen.getByText('Pisau Dapur Uji Sinkronisasi')).toBeTruthy();
  });

  it('tidak menimpa data part tersimpan dengan snapshot supervisor saat dibuka', () => {
    const stored = JSON.stringify([{ id: 'verified-part', machine: 'Ilapak 20', part: 'Pisau Dapur', intervalTarget: 90, currentUsage: 0 }]);
    localStorage.setItem('machine-card-parts', stored);
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={vi.fn()} />);
    expect(localStorage.getItem('machine-card-parts')).toBe(stored);
  });

  it('merender info supervisor, divisi produksi, shift, dan ringkasan metrik lini', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Topbar context
    expect(screen.getByText('BINTANG TOEDJOE')).toBeTruthy();
    expect(screen.getAllByText(/Portal Pengawasan Supervisor/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(exampleSupervisor.name)).toBeTruthy();
    expect(screen.getByText(exampleSupervisor.departments.join(', '))).toBeTruthy();
    expect(screen.getByText('Pulogadung Maintenance')).toBeTruthy();

    // 4 Tabs Operasional Utama
    expect(screen.getByRole('tab', { name: /Status Lini & Mesin/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Verifikasi Breakdown/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Laporan Shift & Handover/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Roster Operator/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Decision Hub/i })).toBeNull();
  });

  it('dapat melakukan filter dan pencarian pada tabel pemantauan status lini mesin', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Search input
    const searchInput = screen.getByLabelText(/Cari mesin produksi/i);
    fireEvent.change(searchInput, { target: { value: 'Ilapak 1' } });

    expect(screen.getAllByText('Ilapak 1').length).toBeGreaterThan(0);

    // Section filter: Packaging
    const packagingBtn = screen.getByRole('button', { name: /^Packaging/i });
    fireEvent.click(packagingBtn);

    expect(screen.getAllByText('Packaging').length).toBeGreaterThan(0);
  });

  it('membuka drawer review breakdown saat tombol "Lihat Breakdown" diklik pada mesin yang mengalami kendala', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Machine with breakdown has "Lihat Breakdown" button
    const lihatButtons = screen.getAllByRole('button', { name: /Lihat Breakdown/i });
    expect(lihatButtons.length).toBeGreaterThan(0);
    fireEvent.click(lihatButtons[0]);

    // Drawer should open
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Konteks Pelaporan Operator/i)).toBeTruthy();
    expect(screen.getByText(/Tindakan Penanganan Teknisi Maintenance/i)).toBeTruthy();
    expect(screen.getByText(/Evaluasi & Catatan Pengawasan Supervisor/i)).toBeTruthy();
  });

  it('dapat melakukan verifikasi dan sign-off pada breakdown ticket yang telah diselesaikan teknisi', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch to Verifikasi Breakdown Tab
    const woTab = screen.getByRole('tab', { name: /Verifikasi Breakdown/i });
    fireEvent.click(woTab);

    // Review on first ticket via Action Dropdown
    const actionBtns = screen.getAllByRole('button', { name: /Aksi & Opsi Tiket/i });
    expect(actionBtns.length).toBeGreaterThan(0);
    fireEvent.click(actionBtns[0]);

    const reviewButtons = screen.getAllByRole('button', { name: /Review Tiket/i });
    expect(reviewButtons.length).toBeGreaterThan(0);
    fireEvent.click(reviewButtons[0]);

    // In drawer, verify button or status
    const verifyBtn = screen.queryByRole('button', { name: /Simpan Catatan Evaluasi SPV/i });
    if (verifyBtn) {
      fireEvent.click(verifyBtn);
      // Status in drawer should show reviewed
      expect(screen.getByText(/Telah Ditinjau oleh Supervisor/i)).toBeTruthy();
    }
  });

  it('memantau laporan operasional shift otomatis sesuai jadwal Weekdays & Weekend serta alur URS 7.9', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch to Handover Tab
    const handoverTab = screen.getByRole('tab', { name: /Laporan Shift & Handover/i });
    fireEvent.click(handoverTab);

    // Verify title and system-generated indication
    expect(screen.getByText(/Laporan operasional shift/i)).toBeTruthy();
    expect(screen.getByText(/^Otomatis$/i)).toBeTruthy();

    // Switch to Weekdays explicitly to verify Weekdays hours
    const weekdayBtn = screen.getByRole('button', { name: /Weekdays \(Senin - Jumat\)/i });
    fireEvent.click(weekdayBtn);

    expect(screen.getByRole('button', { name: /Shift 1 \(Pagi\)/i })).toBeTruthy();
    expect(screen.getAllByText(/06:45 - 15:15/i).length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: /Shift 2 \(Sore\)/i })).toBeTruthy();
    expect(screen.getAllByText(/15:00 - 22:30/i).length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: /Shift 3 \(Malam\)/i })).toBeTruthy();
    expect(screen.getAllByText(/22:15 - 06:45/i).length).toBeGreaterThan(0);

    // Switch to Weekend to verify Weekend hours (06:45 - 14:15, 14:15 - 21:45, 21:45 - 05:30)
    const weekendBtn = screen.getByRole('button', { name: /Weekend \(Sabtu - Minggu\)/i });
    fireEvent.click(weekendBtn);

    expect(screen.getAllByText(/06:45 - 14:15/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/14:15 - 21:45/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/21:45 - 05:30/i).length).toBeGreaterThan(0);

    // Test URS 7.9 Pending flow
    fireEvent.click(screen.getByText('Simulasi kondisi laporan'));
    const pendingBtn = screen.getByRole('button', { name: /Belum Lengkap \(Status Pending\)/i });
    fireEvent.click(pendingBtn);
    expect(screen.getAllByText(/PENDING/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Belum Lapor/i).length).toBeGreaterThan(0);

    // Switch to Shift 2
    const shift2Btn = screen.getByRole('button', { name: /Shift 2 \(Sore\)/i });
    fireEvent.click(shift2Btn);
    expect(screen.getByText(/Rekapitulasi Operasional Shift 2 \(Sore\)/i)).toBeTruthy();
  });

  it('menampilkan 4 pilar ringkasan pada halaman khusus Pola & Akuntabilitas Lapangan', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch to Pola & Akuntabilitas (Analytics) Tab
    const analyticsTab = screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i });
    fireEvent.click(analyticsTab);

    // Verify 4 Pillars
    expect(screen.getByText(/1\. Top Breakdown \(Mesin\)/i)).toBeTruthy();
    expect(screen.getByText(/2\. Klasifikasi Pola Masalah/i)).toBeTruthy();
    expect(screen.getByText(/3\. Akuntabilitas & Integritas Data/i)).toBeTruthy();
    expect(screen.getByText(/4\. Rekomendasi Tindakan Lapangan/i)).toBeTruthy();

    // Verify key field accountability metrics
    expect(screen.getByText(/Kepatuhan Nomor WR:/i)).toBeTruthy();
    expect(screen.getByText(/Rata-rata Respon Teknisi:/i)).toBeTruthy();
  });

  it('dapat melakukan simulasi pengiriman laporan shift ke Discord dan memvisualisasikan Discord embed preview', async () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch to Handover Tab
    const handoverTab = screen.getByRole('tab', { name: /Laporan Shift & Handover/i });
    fireEvent.click(handoverTab);

    // Verify Discord section exists
    expect(screen.getByText(/Kirim laporan ke Discord/i)).toBeTruthy();

    // Click "Uji Simulasi (Mock)" button
    const simBtn = screen.getByRole('button', { name: /Uji Simulasi \(Mock\)/i });
    fireEvent.click(simBtn);

    // Wait for simulation result banner and Discord Embed to appear
    await waitFor(() => {
      expect(screen.getByText(/Simulasi pengiriman laporan shift ke Discord berhasil/i)).toBeTruthy();
      expect(screen.getByText(/B7 Machine Card Bot/i)).toBeTruthy();
      expect(screen.getAllByText(/LAPORAN SHIFT OTOMATIS/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Supervisor Pemantau Shift/i)).toBeTruthy();
    });
  });

  it('menampilkan Logbook Jam Operasi Aktual dan Evaluasi MTBF sesuai URS 3.6 di Detail Mesin', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Cari mesin Ilapak 8 yang memiliki catatan operasi parsial (URS 3.6)
    const searchInput = screen.getByLabelText(/Cari mesin produksi/i);
    fireEvent.change(searchInput, { target: { value: 'Ilapak 8' } });

    const detailButtons = screen.getAllByRole('button', { name: /Detail Mesin/i });
    fireEvent.click(detailButtons[0]);

    // Verifikasi keberadaan Jam Operasi Aktual & Metrik Keandalan terintegrasi
    expect(screen.getByText(/Jam Operasi Aktual & Metrik Keandalan/i)).toBeTruthy();

    // Pastikan jam operasi aktual dan jam shift kalender terpisah
    expect(screen.getAllByText(/94 Jam/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/176 Jam/).length).toBeGreaterThan(0);

    // Pastikan data yang belum lengkap ditandai dan bukan final
    expect(screen.getByText(/Belum Final: Data Parsial/i)).toBeTruthy();
    expect(screen.getAllByText(/Belum Lengkap/i).length).toBeGreaterThan(0);
  });

  it('mengembalikan ke daftar mesin saat tombol menu Status Lini & Mesin diklik dari tampilan detail mesin', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Buka detail mesin
    const searchInput = screen.getByLabelText(/Cari mesin produksi/i);
    fireEvent.change(searchInput, { target: { value: 'Ilapak 8' } });
    const detailButtons = screen.getAllByRole('button', { name: /Detail Mesin/i });
    fireEvent.click(detailButtons[0]);

    // Verifikasi sedang di detail mesin
    expect(screen.getByText(/← Kembali ke Daftar Mesin/i)).toBeTruthy();

    // Klik menu Status Lini & Mesin di navigasi sidebar
    const linesNavBtn = screen.getByRole('tab', { name: /Status Lini & Mesin/i });
    fireEvent.click(linesNavBtn);

    // Verifikasi detail mesin tertutup dan kembali ke daftar mesin
    expect(screen.queryByText(/← Kembali ke Daftar Mesin/i)).toBeNull();
    expect(screen.getByLabelText(/Cari mesin produksi/i)).toBeTruthy();
  });

  it('memanggil onLogout saat tombol Keluar diklik', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    const logoutBtn = screen.getByRole('button', { name: /Keluar/i });
    fireEvent.click(logoutBtn);

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('menampilkan metrik kinerja maintenance terpadu, agregasi gabungan, dan filter cakupan sesuai URS 7.1, 7.4, 7.5, 7.6', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch ke Tab Analytics & Sub-menu Metrik & Target KPI
    const analyticsTab = screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i });
    fireEvent.click(analyticsTab);
    fireEvent.click(screen.getByRole('button', { name: 'Metrik & Target KPI' }));

    // Verifikasi Judul & Standar Agregasi
    expect(screen.getByText(/Monitoring & Pengukuran Kinerja Maintenance/i)).toBeTruthy();
    expect(screen.getByText(/Standar Perhitungan & Agregasi Gabungan/i)).toBeTruthy();

    // Verifikasi 4 Card KPI Utama
    expect(screen.getByText(/Mean Time to Repair \(MTTR Gabungan\)/i)).toBeTruthy();
    expect(screen.getByText(/Mean Time Between Failures \(MTBF\)/i)).toBeTruthy();
    expect(screen.getAllByText(/Ketepatan Pelaksanaan PM/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Total Downtime Lini Mesin/i)).toBeTruthy();

    // Verifikasi pemisahan waktu aktif vs waktu tunggu suku cadang
    expect(screen.getByText(/Pemisahan Waktu:/i)).toBeTruthy();
    expect(screen.getByText(/Waktu Perbaikan Aktif:/i)).toBeTruthy();
    expect(screen.getByText(/Waktu Tunggu Komponen\/Dukungan:/i)).toBeTruthy();

  });

  it('memungkinkan Supervisor menetapkan target KPI Maintenance dan menyimpan riwayat perubahan target sesuai URS 7.1 Klausul 6', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch ke Tab Analytics & Sub-menu Metrik & Target KPI
    const analyticsTab = screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i });
    fireEvent.click(analyticsTab);
    fireEvent.click(screen.getByRole('button', { name: 'Metrik & Target KPI' }));

    // Klik tombol Tetapkan Target KPI (SPV)
    const openModalBtn = screen.getByRole('button', { name: /Tetapkan Target KPI \(SPV\)/i });
    fireEvent.click(openModalBtn);

    // Modal harus terbuka
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Penetapan & Penyesuaian Target KPI Maintenance/i)).toBeTruthy();
    expect(screen.getByText(/Kewenangan SPV Maintenance:/i)).toBeTruthy();

    // Update target value & alasan
    const targetInput = screen.getByLabelText(/Nilai Target Baru/i);
    fireEvent.change(targetInput, { target: { value: '1.2' } });

    const reasonInput = screen.getByLabelText(/Alasan Penyesuaian Target/i);
    fireEvent.change(reasonInput, { target: { value: 'Percepatan respon teknisi Q4 dan ketersediaan kit perbaikan' } });

    // Submit form
    const saveBtn = screen.getByRole('button', { name: /Simpan & Terapkan Target KPI/i });
    fireEvent.click(saveBtn);

    // Modal tertutup dan riwayat perubahan tercatat di tabel audit trail ALCOA
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Percepatan respon teknisi Q4 dan ketersediaan kit perbaikan/i)).toBeTruthy();
    expect(screen.getAllByText(/≤ 1.2 Jam/i).length).toBeGreaterThan(0);
  });

  it('menampilkan prioritas penggantian komponen dan batas pengingat 80% sesuai URS 7.2', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch ke Tab Analytics & Sub-menu Masa Pakai Part & Jadwal PM
    const analyticsTab = screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i });
    fireEvent.click(analyticsTab);
    fireEvent.click(screen.getByRole('button', { name: 'Part Lifetime & PM' }));

    // Verifikasi Bagian Monitoring Lifetime Komponen
    expect(screen.getByText(/Monitoring Lifetime Komponen & Prioritas Penggantian/i)).toBeTruthy();

    // Verifikasi badge status Melewati Target (Overdue) dan Mendekati Batas (>= 80%)
    expect(screen.getAllByText(/Kritis: Melewati Target/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pengingat: Mendekati Batas \(≥ 80%\)/i).length).toBeGreaterThan(0);

    // Komponen Ilapak 5 Pisau I-Cut (progress 105.6%) dan Unifill B Seal Piston (89%)
    expect(screen.getAllByText('Ilapak 5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unifill B').length).toBeGreaterThan(0);
  });

  it('mendeteksi kerusakan berulang (bad actor) dan pola penggantian sparepart sesuai URS 7.3', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch ke Tab Analytics & Sub-menu Pola Kerusakan & Akuntabilitas
    const analyticsTab = screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i });
    fireEvent.click(analyticsTab);

    // Verifikasi tabel Kerusakan Berulang (Bad Actor)
    expect(screen.getByText(/Identifikasi Kerusakan Berulang \(Bad Actor \/ Recurrent Issues\)/i)).toBeTruthy();
    expect(screen.getByText(/Kriteria: Frekuensi ≥ 2 Kejadian/i)).toBeTruthy();

    // Mesin SIG 5 & FBD Jaw Chuan yang memiliki insiden berulang (>= 2x)
    expect(screen.getAllByText('SIG 5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FBD Jaw Chuan').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2x Kejadian/i).length).toBeGreaterThan(0);

    // Pola Penggantian Suku Cadang Terbanyak
    expect(screen.getByText(/Pola Penggantian Suku Cadang Terbanyak/i)).toBeTruthy();
    expect(screen.getAllByText(/Fast Moving Part/i).length).toBeGreaterThan(0);
  });

  it('menampilkan matriks aging tiket pekerjaan terbuka dan ketepatan PM sesuai URS 7.7 & 7.8', () => {
    const onLogout = vi.fn();
    render(<SupervisorDashboard supervisor={exampleSupervisor} onLogout={onLogout} />);

    // Switch ke Tab Analytics & Sub-menu Antrean Tiket & Jejak Audit
    const analyticsTab = screen.getByRole('tab', { name: /Monitoring & KPI Maintenance/i });
    fireEvent.click(analyticsTab);
    fireEvent.click(screen.getByRole('button', { name: 'Antrean & Jejak Audit' }));

    // Matriks Aging Tiket
    expect(screen.getByText(/Monitoring Pekerjaan Terbuka & Matriks Aging Tiket/i)).toBeTruthy();
    expect(screen.getAllByText(/> 24 Jam: Kritis/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8 - 24 Jam: Sedang/i).length).toBeGreaterThan(0);
