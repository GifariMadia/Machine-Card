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
      status: 'IN_PROGRESS',
      waktuMulai: new Date().toISOString(),
    };
    localStorage.setItem('machine-card-open-work', JSON.stringify([inProgressTicket]));

    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Pindah ke tab Pekerjaan Tengah Diambil
    const activeTabBtn = screen.getByRole('tab', { name: /Pekerjaan Tengah Diambil/i });
    fireEvent.click(activeTabBtn);

    // Klik tombol Update
    const updateButtons = screen.getAllByRole('button', { name: /^Update$/i });
    expect(updateButtons.length).toBeGreaterThan(0);
    fireEvent.click(updateButtons[0]);

    // Klik tombol tunda / tunggu part di dalam drawer
    const pauseBtn = screen.getByRole('button', { name: /Tunda \/ Tunggu Part/i });
    fireEvent.click(pauseBtn);

    // Modal penundaan muncul
    expect(screen.getByText(/Tunda Pengerjaan Breakdown/i)).toBeTruthy();
    expect(screen.getByText(/Pemisahan Waktu Tunggu Part vs Waktu Kerja Murni/i)).toBeTruthy();

    // Isi alasan penundaan
    const reasonTextarea = screen.getByPlaceholderText(/Contoh: Menunggu stok seal ring 25mm/i);
    fireEvent.change(reasonTextarea, { target: { value: 'Menunggu kiriman seal kit dari gudang spare part' } });

    // Konfirmasi penundaan
    const confirmBtn = screen.getByRole('button', { name: /Konfirmasi Penundaan/i });
    fireEvent.click(confirmBtn);

    // Status terupdate
    expect(screen.getByText(/Pekerjaan Ditunda: Menunggu Suku Cadang/i)).toBeTruthy();
  });

  it('mendukung status PENDING dengan pencatatan kondisi terakhir, tindak lanjut, dan mempertahankan umur tiket (URS 5.1 & 5.2)', () => {
    const onLogout = vi.fn();
    const olderDate = new Date(Date.now() - 5 * 3600000).toISOString(); // 5 jam lalu
    const inProgressTicket = {
      ticket: 'OW-URS52-01',
      machine: 'Ilapak 1',
      section: 'Packing',
      reporter: 'OPR001',
      reporterName: 'Muji',
      shift: '1',
      issue: 'Bearing roll panas dan bergetar',
      status: 'IN_PROGRESS',
      originalOpenedAt: olderDate,
      waktuMulai: olderDate,
    };
    localStorage.setItem('machine-card-open-work', JSON.stringify([inProgressTicket]));

    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Pindah ke tab Pekerjaan Tengah Diambil
    const activeTabBtn = screen.getByRole('tab', { name: /Pekerjaan Tengah Diambil/i });
    fireEvent.click(activeTabBtn);

    // Buka drawer pekerjaan aktif
    const updateButtons = screen.getAllByRole('button', { name: /^Update$/i });
    fireEvent.click(updateButtons[0]);

    // Verifikasi umur tiket
    expect(screen.getByText(/Umur Tiket:/i)).toBeTruthy();

    // Buka modal tunda / pending
    const pauseBtn = screen.getByRole('button', { name: /Tunda \/ Tunggu Part/i });
    fireEvent.click(pauseBtn);

    // Ubah kategori menjadi PENDING
    const categorySelect = screen.getByRole('combobox');
    fireEvent.change(categorySelect, { target: { value: 'PENDING' } });

    // Isi alasan, kondisi terakhir, dan rencana tindak lanjut
    const reasonInput = screen.getByPlaceholderText(/Contoh: Menunggu stok seal ring 25mm/i);
    fireEvent.change(reasonInput, { target: { value: 'Pergantian shift, pembongkaran bearing belum tuntas' } });

    const kondisiInput = screen.getByPlaceholderText(/Contoh: Silinder dibuka separuh/i);
    fireEvent.change(kondisiInput, { target: { value: 'Rumah bearing dilepas, roll penyangga telah diganjal' } });

    const tindakLanjutInput = screen.getByPlaceholderText(/Contoh: Pasang spare part baru/i);
    fireEvent.change(tindakLanjutInput, { target: { value: 'Lanjut pembersihan housing dan pasang bearing 6204-2RS' } });

    // Konfirmasi
    const confirmBtn = screen.getByRole('button', { name: /Konfirmasi Penundaan/i });
    fireEvent.click(confirmBtn);

    // Verifikasi audit trail pending
    expect(screen.getByText(/^Pekerjaan Pending/i)).toBeTruthy();
    expect(screen.getByText(/Rumah bearing dilepas, roll penyangga telah diganjal/i)).toBeTruthy();
    expect(screen.getByText(/Lanjut pembersihan housing dan pasang bearing 6204-2RS/i)).toBeTruthy();
  });

  it('mendukung pencatatan serah-terima shift (handover) lanjutan tanpa menghilangkan catatan shift sebelumnya (URS 5.3)', () => {
    const onLogout = vi.fn();
    const handoverTicket = {
      ticket: 'OW-URS53-01',
      machine: 'Ilapak 3',
      section: 'Filling',
      reporter: 'OPR001',
      reporterName: 'A. Dahlan',
      shift: '1',
      issue: 'Temperatur sealing tidak stabil',
      status: 'PENDING',
      originalOpenedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      action: '[Shift 1 - Anton]: Pengecekan thermocouple dan heater cartridge',
      riwayatHandover: [
        {
          shift: 'Shift 1',
          tanggal: '2026-10-21',
          pelaksanaNik: 'TEK0001',
          pelaksanaNama: 'Anton',
          progres: 'Thermocouple diganti dengan sensor tipe J baru',
          kendala: 'Kabel sensor perlu extension',
          tindakLanjut: 'Shift 2 sambung extension kabel dan kalibrasi PID',
          waktuDicatat: '21 Okt 2026, 14:45',
          tanggungJawabShiftAsal: 'Shift 1 (A. Dahlan)',
        },
      ],
    };
    localStorage.setItem('machine-card-open-work', JSON.stringify([handoverTicket]));

    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Buka tab Pekerjaan Tengah Diambil
    const activeTabBtn = screen.getByRole('tab', { name: /Pekerjaan Tengah Diambil/i });
    fireEvent.click(activeTabBtn);

    // Buka detail pekerjaan
    const updateButtons = screen.getAllByRole('button', { name: /^Update$/i });
    fireEvent.click(updateButtons[0]);

    // Verifikasi riwayat shift 1 tetap utuh
    expect(screen.getByText(/Thermocouple diganti dengan sensor tipe J baru/i)).toBeTruthy();
    expect(screen.getByText(/Tanggung jawab pelengkapan laporan shift asal tetap pada: Shift 1/i)).toBeTruthy();

    // Tambah handover lanjutan
    const addHandoverBtn = screen.getByRole('button', { name: /\+ Catat Lanjutan Shift/i });
    fireEvent.click(addHandoverBtn);

    expect(screen.getAllByText(/Serah-Terima Shift \(Handover\)/i).length).toBeGreaterThanOrEqual(1);

    const progresTextarea = screen.getByPlaceholderText(/Jelaskan progres pekerjaan yang telah diselesaikan/i);
    fireEvent.change(progresTextarea, { target: { value: 'Penyambungan extension kabel selesai, auto-tuning PID suhu 145 C' } });

    const tindakLanjutTextarea = screen.getByPlaceholderText(/Contoh: Lanjut penggantian bearing/i);
    fireEvent.change(tindakLanjutTextarea, { target: { value: 'Lanjut uji jalan produksi batch komersial' } });

    const submitBtn = screen.getByRole('button', { name: /Simpan Riwayat Serah-Terima/i });
    fireEvent.click(submitBtn);

    // Keduanya tampil
    expect(screen.getAllByText(/Penyambungan extension kabel selesai/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Thermocouple diganti dengan sensor tipe J baru/i)).toBeTruthy();
  });

  it('memanggil onLogout saat tombol Keluar diklik', () => {
    const onLogout = vi.fn();
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    const logoutBtn = screen.getByRole('button', { name: /Keluar/i });
    fireEvent.click(logoutBtn);

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('menampilkan Active Job Spotlight Banner di tab Pekerjaan Tengah Diambil', () => {
    const onLogout = vi.fn();
    const inProgressWork = {
      ticket: 'OW-20261014-99888',
      machine: 'SIG 5',
      section: 'Packaging',
      reporter: 'OPR0001',
      reporterName: 'A. Dahlan',
      shift: '1',
      issue: 'Sealing jaw oblak dan bergetar',
      status: 'IN_PROGRESS',
      technicianName: exampleTechnician.name,
      waktuMulai: new Date().toISOString(),
    };
    localStorage.setItem('machine-card-open-work', JSON.stringify([inProgressWork]));

    render(<TechnicianDashboard technician={exampleTechnician} onLogout={onLogout} />);

    // Pindah ke tab Pekerjaan Tengah Diambil
    const activeTabBtn = screen.getByRole('tab', { name: /Pekerjaan Tengah Diambil/i });
    fireEvent.click(activeTabBtn);

    // Spotlight Banner muncul
    expect(screen.getByText('SEDANG ANDA TANGANI SAAT INI')).toBeTruthy();
    expect(screen.getByText(/SIG 5 \(Packaging\) · Tiket: OW-20261014-99888/i)).toBeTruthy();
    expect(screen.getAllByText('Sealing jaw oblak dan bergetar').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Pause \/ Tunda Pekerjaan/i })).toBeTruthy();
  });

  it('menerima tindakan manual tanpa rekomendasi atau pengisian part otomatis', () => {
    render(<TechnicianDashboard technician={exampleTechnician} onLogout={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Ambil Pekerjaan/i })[0]);
    const input = screen.getByLabelText(/Rincian Tindakan Maintenance \/ Perbaikan \*/i) as HTMLTextAreaElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'heater diperiksa manual' } });
    expect(input.value).toBe('heater diperiksa manual');
    expect(screen.queryByText(/Smart-Typing Aktif/i)).toBeNull();
    expect(screen.queryByText(/Rekomendasi Tindakan Cepat/i)).toBeNull();
    expect(screen.queryByDisplayValue('Sealing heater')).toBeNull();
  });
});
