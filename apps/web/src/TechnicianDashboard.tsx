import { useNavigationState } from './use-navigation-state';
import { operationalDate, plantDate, repairMinutes, formatPlantTime, ticketDowntime } from './maintenance-metrics';
import { storage } from './storage';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Wrench,
  Cog,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  Play,
  Search,
  SlidersHorizontal,
  X,
  LogOut,
  PackageSearch,
  History,
  FileText,
  Layers,
  Calendar,
  Send,
  Save,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  CalendarCheck,
  CalendarClock,
  AlertCircle,
  Info,
  ArrowRightLeft,
  PlusCircle,
  BarChart3,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Inbox,
  ClipboardCheck,
  CheckSquare,
  Copy,
  Check,
} from 'lucide-react';
import { fallbackMachines, getStoredMachines, type Machine } from './data';
import { type Technician } from './operator';
import { type MachineOperatingHoursRecord, initialOperatingHoursRecords } from './SupervisorDashboard';
import './technician-portal.css';
import './dashboard-unified.css';

export type TechnicianDashboardProps = {
  technician: Technician;
  onLogout: () => void;
};

// URS 5.1 & 5.3: Keterlacakan Status & Serah-Terima Shift
export type StatusHistoryEntry = {
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  changedAt: string;
  reason?: string;
};

export type HandoverHistoryEntry = {
  shift: string;
  tanggal: string;
  pelaksanaNik: string;
  pelaksanaNama: string;
  progres: string;
  kendala: string;
  tindakLanjut: string;
  waktuDicatat: string;
  tanggungJawabShiftAsal?: string;
};

export type TechnicianWorkItem = {
  ticket: string;
  machine: string;
  id_mesin?: number;
  section: string;
  reporter?: string;
  reporterName?: string;
  shift?: string;
  issue: string;
  kategori?: string;
  woType?: string;
  kodeProduk?: string;
  noBatch?: string;
  noWr?: string;
  opened: string;
  originalOpenedAt?: string; // URS 5.2: Umur pekerjaan dihitung dari waktu awal pembukaan
  waktuMulai?: string;
  waktuSelesai?: string;
  waktuMesinBeroperasi?: string;
  waktuMulaiTeknisi?: string;
  durasiPerbaikanMenit?: number;
  waktuTungguPartMenit?: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'MENUNGGU_PART' | 'MENUNGGU_DUKUNGAN' | 'SELESAI_PERBAIKAN' | 'CLOSED';
  action?: string;
  technician?: string;
  technicianName?: string;
  technicianNik?: string;
  followup?: string;
  alasanPenundaan?: string;
  kondisiTerakhir?: string; // URS 5.2: Catatan kondisi terakhir saat pending
  rencanaTindakLanjut?: string; // URS 5.2: Rencana penanganan berikutnya
  catatanHandover?: string; // URS 5.3: Catatan serah terima shift
  waktuMulaiTunggu?: string;
  durasiTungguMenit?: number;
  statusHistory?: StatusHistoryEntry[]; // URS 5.1: Keterlacakan status & pengguna
  riwayatHandover?: HandoverHistoryEntry[]; // URS 5.3: Riwayat serah-terima lintas shift
  partsReplaced?: Array<{ name: string; qty?: string | number; unit?: string }>;
  partReplaced?: {
    name: string;
    specification: string;
    quantity: string;
    position: string;
    note?: string;
  };
};

// URS 5.2: Perhitungan Umur Pekerjaan (Ticket Aging)
function calculateTicketAging(originalOpenedAt?: string, fallbackTime?: string): string {
  const timeStr = originalOpenedAt || fallbackTime;
  if (!timeStr) return '0 jam';
  const openedTime = new Date(timeStr).getTime();
  if (isNaN(openedTime)) return 'Baru saja';
  const diffMs = Math.max(0, Date.now() - openedTime);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  if (diffDays > 0) {
    return `${diffDays} hari ${remHours} jam`;
  }
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffHours === 0) {
    return `${Math.max(1, diffMinutes)} menit`;
  }
  return `${diffHours} jam ${diffMinutes % 60} menit`;
}

export type PreventiveMaintenanceItem = {
  id: string;
  nomorPm: string;
  machine: string;
  kodeMesin: string;
  section: string;
  periode: 'Mingguan' | 'Bulanan' | '3 Bulanan' | 'Tahunan';
  kegiatan: string;
  tanggalJatuhTempo: string;
  tanggalSelesaiAktual?: string;
  pelaksanaNik?: string;
  pelaksanaNama?: string;
  hasilTemuan?: string;
  status: 'TERJADWAL' | 'DALAM_PENGERJAAN' | 'SELESAI' | 'TERLAMBAT' | 'DIRESCHEDULE';
  alasanReschedule?: string;
  tanggalSebelumReschedule?: string;
  riwayatReschedule?: Array<{
    tanggalSebelumnya: string;
    tanggalBaru: string;
    alasan: string;
    diubahOleh: string;
    waktuDiubah: string;
  }>;
};

const isTestEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.MODE === 'test');

const baseSeedPMs: PreventiveMaintenanceItem[] = [
  {
    id: 'pm-001',
    nomorPm: 'PM-2026-10-001',
    machine: 'Ilapak 1',
    kodeMesin: 'ILA-01',
    section: 'Filling',
    periode: 'Mingguan',
    kegiatan: 'Pemeriksaan kelonggaran baut sealer vertikal, pembersihan debris film, dan pelumasan bearing conveyor',
    tanggalJatuhTempo: '2026-10-22',
    status: 'TERJADWAL',
  },
  {
    id: 'pm-002',
    nomorPm: 'PM-2026-10-002',
    machine: 'SIG 6',
    kodeMesin: 'SIG-06',
    section: 'Filling',
    periode: 'Bulanan',
    kegiatan: 'Kalibrasi sensor eye-mark photoelectric, inspeksi belt timing motor servo, dan uji emergency stop',
    tanggalJatuhTempo: '2026-10-20',
    tanggalSelesaiAktual: '2026-10-20',
    pelaksanaNik: 'TKN0001',
    pelaksanaNama: 'Budi Santoso',
    hasilTemuan: 'Sensor eye-mark normal setelah dibersihkan; tegangan belt timing 120 Hz sesuai spesifikasi',
    status: 'SELESAI',
  },
  {
    id: 'pm-003',
    nomorPm: 'PM-2026-10-003',
    machine: 'Chimei 10A/Jinsung 3',
    kodeMesin: 'CHI-01',
    section: 'Chimei',
    periode: 'Mingguan',
    kegiatan: 'Pembersihan filter pneumatic regulator, pemeriksaan tekanan angin 6 bar, dan pengecekan kebocoran fitting',
    tanggalJatuhTempo: '2026-10-25',
    status: 'TERJADWAL',
  },
  {
    id: 'pm-004',
    nomorPm: 'PM-2026-10-004',
    machine: 'ST 4 RCL 1',
    kodeMesin: 'ST-04',
    section: 'ST (Sachet)',
    periode: 'Bulanan',
    kegiatan: 'Pengukuran resistansi heater sealing horizontal & vertikal, uji keseragaman temperatur thermokopel',
    tanggalJatuhTempo: '2026-10-18',
    status: 'TERLAMBAT',
  },
  {
    id: 'pm-005',
    nomorPm: 'PM-2026-10-005',
    machine: 'Unifill B',
    kodeMesin: 'OTH-04',
    section: 'Lainnya',
    periode: '3 Bulanan',
    kegiatan: 'Overhaul seal piston dosing, penggantian packing cylinder, dan uji akurasi volume pengisian liquid',
    tanggalJatuhTempo: '2026-10-28',
    status: 'DIRESCHEDULE',
    tanggalSebelumReschedule: '2026-10-15',
    alasanReschedule: 'Menunggu spare part packing kit khusus dari vendor yang baru tiba minggu depan',
    riwayatReschedule: [
      {
        tanggalSebelumnya: '2026-10-15',
        tanggalBaru: '2026-10-28',
        alasan: 'Menunggu spare part packing kit khusus dari vendor',
        diubahOleh: 'SPV0001 (Hendra Gunawan)',
        waktuDiubah: '2026-10-14 11:30 WIB',
      },
    ],
  },
];

export const initialSeedPMs: PreventiveMaintenanceItem[] = isTestEnv ? baseSeedPMs : [];

export type IntervalBasis = 'KALENDER' | 'JAM_OPERASI';

export type MachinePartHistory = {
  id?: string;
  machine: string;
  part: string;
  partNumber?: string;
  specification: string;
  position: string;
  replacedAt?: string;
  intervalBasis: IntervalBasis;
  intervalTarget: number;
  unit: string;
  currentUsage: number;
  targetDate?: string;
  lifetimeDays?: number;
  usedDays?: number;
  isDataComplete: boolean;
  incompleteReason?: string;
};

// URS 2.4: Perhitungan Target Penggantian Komponen
function calculateComponentTarget(item: {
  replacedAt?: string;
  intervalBasis: IntervalBasis;
  intervalTarget: number;
  currentUsage: number;
  isDataComplete?: boolean;
  incompleteReason?: string;
}) {
  // 1. Data Tidak Lengkap (URS 2.4)
  if (item.isDataComplete === false || !item.intervalTarget || item.intervalTarget <= 0 || (item.intervalBasis === 'KALENDER' && !item.replacedAt)) {
    return {
      targetDisplay: 'Target Belum Dapat Dihitung',
      targetSubtext: item.incompleteReason || 'Data dasar tanggal ganti atau counter belum lengkap',
      percent: 0,
      isComplete: false,
      isCalendar: item.intervalBasis === 'KALENDER',
    };
  }

  // 2. Target Kalender (URS 2.4)
  if (item.intervalBasis === 'KALENDER') {
    const baseDate = new Date(item.replacedAt!);
    let targetDateStr = '';
    if (!isNaN(baseDate.getTime())) {
      const targetTime = new Date(baseDate.getTime() + item.intervalTarget * 24 * 3600 * 1000);
      targetDateStr = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(targetTime);
    } else {
      targetDateStr = `${item.intervalTarget} hari sejak ${item.replacedAt}`;
    }
    const remainingDays = Math.max(0, item.intervalTarget - item.currentUsage);
    const percent = Math.min(100, Math.round((item.currentUsage / item.intervalTarget) * 100));

    return {
      targetDisplay: targetDateStr,
      targetSubtext: `Dasar Waktu Kalender · Sisa ${remainingDays} hari`,
      percent,
      isComplete: true,
      isCalendar: true,
      remaining: remainingDays,
    };
  }

  // 3. Target Jam Operasi (URS 2.4)
  // Apabila interval menggunakan jam operasi, sistem harus menggunakan data jam operasi terkait
  // dan TIDAK mengubahnya menjadi tanggal pasti tanpa dasar estimasi yang disetujui.
  const remainingHours = Math.max(0, item.intervalTarget - item.currentUsage);
  const percent = Math.min(100, Math.round((item.currentUsage / item.intervalTarget) * 100));

  return {
    targetDisplay: `${item.intervalTarget.toLocaleString('id-ID')} Jam Operasi`,
    targetSubtext: `Dasar Jam Operasi Aktual · Sisa ${remainingHours.toLocaleString('id-ID')} jam (tanpa konversi ke tanggal)`,
    percent,
    isComplete: true,
    isCalendar: false,
    remaining: remainingHours,
  };
}

const baseSeedWorks: TechnicianWorkItem[] = [
  {
    ticket: 'OW-233183',
    machine: 'Ilapak 1',
    section: 'Filling',
    reporter: 'OPR0001',
    reporterName: 'A. Dahlan',
    shift: '1',
    issue: 'Potongan tidak stabil pada unit sealer vertikal',
    kategori: 'Pisau I-Cut / Cutting',
    woType: 'Batch',
    kodeProduk: 'LNKQA',
    noBatch: 'HM758',
    noWr: '233183',
    opened: 'Hari ini, 08:20',
    waktuMulai: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: 'OPEN',
  },
  {
    ticket: 'OW-233229',
    machine: 'Ilapak 8',
    section: 'Filling',
    reporter: 'OPR0002',
    reporterName: 'Ramdhani',
    shift: '1',
    issue: 'Potongan tidak stabil',
    kategori: 'Unit Sealing Vertikal',
    opened: 'Hari ini, 07:00',
    status: 'OPEN',
  },
  {
    ticket: 'OW-233231',
    machine: 'SIG 6',
    section: 'Filling',
    reporter: 'OPR0007',
    reporterName: 'Suhada',
    shift: '1',
    issue: 'Inkjet error kode tidak tercetak',
    kategori: 'Sensor Eye Mark & Inkjet',
    opened: 'Hari ini, 07:30',
    status: 'IN_PROGRESS',
    action: 'Pemeriksaan sensor dan koneksi kabel inkjet outfeed',
  },
  {
    ticket: 'OW-233206',
    machine: 'Ilapak 5',
    section: 'Filling',
    reporter: 'OPR0003',
    reporterName: 'Sudarso',
    shift: '2',
    issue: 'I-Cut line 1 tumpul',
    kategori: 'Pisau I-Cut / Cutting',
    opened: 'Kemarin, 20:30',
    status: 'CLOSED',
    action: 'Penggantian pisau I-Cut HSS 80x25mm dan uji potong 50 siklus',
  },
  {
    ticket: 'OW-233248',
    machine: 'Unifill B',
    section: 'Filling',
    reporter: 'OPR0005',
    reporterName: 'Neges',
    shift: '1',
    issue: 'Piston pengisian line 2 bocor',
    kategori: 'Pneumatik & Silinder',
    opened: 'Hari ini, 09:12',
    status: 'OPEN',
    kodeProduk: 'LKKOB',
    noBatch: 'HM665',
  },
  {
    ticket: 'OW-233245',
    machine: 'Chimei 9A/Ilapak 11',
    section: 'Packaging',
    reporter: 'OPR0008',
    reporterName: 'Nita',
    shift: '1',
    issue: 'Automatic mat tidak merespons',
    kategori: 'Sensor Eye Mark & Inkjet',
    opened: 'Hari ini, 08:55',
    status: 'IN_PROGRESS',
    kodeProduk: 'LPRGQ',
    noBatch: 'HM468',
    action: 'Pemeriksaan proximity sensor M12 dan suplai pneumatik 6 bar',
  },
  {
    ticket: 'OW-233240',
    machine: 'Ilapak 3',
    section: 'Filling',
    reporter: 'OPR0004',
    reporterName: 'Muji',
    shift: '1',
    issue: 'Temperatur sealing vertikal tidak stabil',
    kategori: 'Heater / Temperatur',
    opened: 'Hari ini, 06:42',
    status: 'OPEN',
  },
  {
    ticket: 'OW-233174',
    machine: 'Ilapak 1',
    section: 'Filling',
    reporter: 'OPR0001',
    reporterName: 'A. Dahlan',
    shift: '1',
    issue: 'Gasket pneumatic line 1 bocor',
    kategori: 'Pneumatik & Silinder',
    opened: '20 Sep, 08:20',
    status: 'CLOSED',
    action: 'Penggantian gasket pneumatic NBR 18x2.5mm dan leak test',
  },
  {
    ticket: 'OW-292770',
    machine: 'FBD jaw chuan',
    section: 'Compounding',
    reporter: 'OPR0012',
    reporterName: 'Wahyudi',
    shift: '1',
    issue: 'Suhu tidak bisa naik',
    kategori: 'Heater / Temperatur',
    noWr: '~',
    opened: 'Hari ini, 07:27',
    waktuMulai: '2026-09-08T07:27:00.000Z',
    waktuSelesai: '2026-09-08T08:00:00.000Z',
    status: 'CLOSED',
    action: '• Buka valve bypass steam trap\n• Test running\n• Pemantauan mesin',
  },
  {
    ticket: 'OW-292778',
    machine: 'FBD jaw chuan',
    section: 'Compounding',
    reporter: 'OPR0012',
    reporterName: 'Wahyudi',
    shift: '1',
    issue: 'Thermocontrol tidak stabil',
    kategori: 'Heater / Temperatur',
    noWr: '292778',
    opened: 'Hari ini, 08:13',
    waktuMulai: '2026-09-08T08:13:00.000Z',
    waktuSelesai: '2026-09-08T09:00:00.000Z',
    status: 'CLOSED',
    action: '• Pengecekkan wiring thermocontrol\n• Pengencangan kabel thermocontrol\n• Test running\n• Pemantauan mesin',
  },
  {
    ticket: 'OW-292780',
    machine: 'Sig 5',
    section: 'Filling',
    reporter: 'OPR0003',
    reporterName: 'Sudarso',
    shift: '1',
    issue: 'Rubber putus',
    kategori: 'Rubber Sealing',
    noWr: '~',
    opened: 'Hari ini, 08:30',
    waktuMulai: '2026-09-08T08:30:00.000Z',
    waktuSelesai: '2026-09-08T14:30:00.000Z',
    status: 'CLOSED',
    action: '• Pembongkaran rubber all line\n• Penggantian rubber 3 line\n• Setting rubber\n• Penggantian pisau vertical 6 pcs\n• Penggantian heater sealing horizontal 2pcs right\n• Test running\n• Pemantauan mesin',
  },
  {
    ticket: 'OW-292785',
    machine: 'ILapak 5',
    section: 'Filling',
    reporter: 'OPR0001',
    reporterName: 'A. Dahlan',
    shift: '1',
    issue: 'Lanjutan shift 3, baru bongkar filling blok 3 line',
    kategori: 'Unit Pengisian / Nozzle',
    noWr: '~',
    opened: 'Hari ini, 07:45',
    waktuMulai: '2026-09-08T07:45:00.000Z',
    waktuSelesai: '2026-09-08T15:15:00.000Z',
    status: 'OPEN',
    action: '• Penggantian conus dan as 3 pcs\n• Penggantian housing as conus 3pcs\n• Penggantian oring as conus 1pcs\n• Setting penampang\n• Setting rubber\n• Test running',
    catatanHandover: 'Perlu verifikasi pengisian batch berikutnya',
  },
  {
    ticket: 'OW-292772',
    machine: 'Ilapak 12',
    section: 'Filling',
    reporter: 'OPR0006',
    reporterName: 'Kuswanto',
    shift: '1',
    issue: 'Pisau vertical sealing vertical error',
    kategori: 'Unit Sealing Vertikal',
    noWr: '292772',
    opened: 'Hari ini, 07:09',
    waktuMulai: '2026-09-08T07:09:00.000Z',
    waktuSelesai: '2026-09-08T15:00:00.000Z',
    status: 'CLOSED',
    action: '• Pengecekkan alarm heater\n• Pengecekkan heater (putus)\n• Pembongkaran heater\n• Penggantian heater\n• Connect wiring heater\n• Test running\n• Pemantauan mesin',
  },
  {
    ticket: 'OW-292790',
    machine: 'SIG 5',
    section: 'Filling',
    reporter: 'OPR0003',
    reporterName: 'Sudarso',
    shift: '1',
    issue: 'Mesin tiba tiba mati',
    kategori: 'Kelistrikan / Power',
    noWr: '292790',
    opened: 'Hari ini, 12:00',
    waktuMulai: '2026-09-08T12:00:00.000Z',
    waktuSelesai: '2026-09-08T15:00:00.000Z',
    status: 'CLOSED',
    action: '• Reset alarm\n• Setting potongan\n• Setting pisau vertical\n• Setting rubber\n• Penggantian kabel inkjet\n• Test running\n• Pemantauan mesin',
  },
  {
    ticket: 'OW-292796',
    machine: 'Chimei js 05',
    section: 'Packaging',
    reporter: 'OPR0008',
    reporterName: 'Nita',
    shift: '1',
    issue: 'Short mati',
    kategori: 'Kelistrikan / PLC',
    noWr: '~',
    opened: 'Hari ini, 09:00',
    waktuMulai: '2026-09-08T09:00:00.000Z',
    waktuSelesai: '2026-09-08T15:15:00.000Z',
    status: 'OPEN',
    action: '• Pengecekkan wiring in coming machine\n• Penggantian fuse\n• Setting opp',
    catatanHandover: 'Perlu ganti PLC pada shift berikutnya',
  },
];

const initialSeedWorks: TechnicianWorkItem[] = isTestEnv ? baseSeedWorks : [];

const featuredMachinePartHistory: MachinePartHistory[] = [
  {
    id: 'PRT-ILA1-001',
    machine: 'Ilapak 1',
    part: 'Pisau I-Cut',
    partNumber: 'CUT-8025-HSS',
    specification: 'HSS 80 × 25 mm',
    position: 'Line 1 (Sealer Vertikal)',
    replacedAt: '2026-09-18',
    intervalBasis: 'KALENDER',
    intervalTarget: 90,
    unit: 'Hari',
    currentUsage: 26,
    lifetimeDays: 90,
    usedDays: 26,
    isDataComplete: true,
  },
  {
    id: 'PRT-ILA1-002',
    machine: 'Ilapak 1',
    part: 'Sealing heater',
    partNumber: 'HTR-220-350W',
    specification: '220 V / 350 W',
    position: 'Vertikal Jaw Sealer',
    replacedAt: '2026-08-12',
    intervalBasis: 'JAM_OPERASI',
    intervalTarget: 1500,
    unit: 'Jam Operasi',
    currentUsage: 680,
    lifetimeDays: 180,
    usedDays: 63,
    isDataComplete: true,
  },
  {
    id: 'PRT-ILA1-003',
    machine: 'Ilapak 1',
    part: 'Gasket pneumatic',
    partNumber: 'GSK-NBR-1825',
    specification: 'NBR 18 x 2.5 mm',
    position: 'Cylinder line 1',
    replacedAt: '2026-09-20',
    intervalBasis: 'KALENDER',
    intervalTarget: 120,
    unit: 'Hari',
    currentUsage: 24,
    lifetimeDays: 120,
    usedDays: 24,
    isDataComplete: true,
  },
  {
    id: 'PRT-ILA1-004',
    machine: 'Ilapak 1',
    part: 'Bearing Utama Roller',
    partNumber: 'BRG-6204-2RS',
    specification: 'Deep groove ball 20x47x14 mm',
    position: 'Roller Penarik Film',
    replacedAt: undefined, // URS 2.4 Data Tidak Lengkap
    intervalBasis: 'KALENDER',
    intervalTarget: 180,
    unit: 'Hari',
    currentUsage: 0,
    lifetimeDays: 180,
    usedDays: 0,
    isDataComplete: false,
    incompleteReason: 'Tanggal pemasangan awal belum terdata di master maintenance',
  },
  {
    id: 'PRT-ILA8-001',
    machine: 'Ilapak 8',
    part: 'Teflon belt',
    partNumber: 'BLT-PTFE-30',
    specification: 'Lebar 30 mm',
    position: 'Sealer vertikal',
    replacedAt: '2026-09-02',
    intervalBasis: 'KALENDER',
    intervalTarget: 60,
    unit: 'Hari',
    currentUsage: 42,
    lifetimeDays: 60,
    usedDays: 42,
    isDataComplete: true,
  },
  {
    id: 'PRT-SIG6-001',
    machine: 'SIG 6',
    part: 'Sensor inkjet',
    partNumber: 'SNR-OPT-24V',
    specification: 'Photoelectric 24 VDC',
    position: 'Conveyor outfeed',
    replacedAt: '2026-07-30',
    intervalBasis: 'JAM_OPERASI',
    intervalTarget: 2500,
    unit: 'Jam Operasi',
    currentUsage: 1450,
    lifetimeDays: 365,
    usedDays: 76,
    isDataComplete: true,
  },
  {
    id: 'PRT-ILA5-001',
    machine: 'Ilapak 5',
    part: 'Pisau I-Cut',
    partNumber: 'CUT-8025-HSS',
    specification: 'HSS 80 × 25 mm',
    position: 'Line 1',
    replacedAt: '2026-06-10',
    intervalBasis: 'KALENDER',
    intervalTarget: 90,
    unit: 'Hari',
    currentUsage: 95,
    lifetimeDays: 90,
    usedDays: 95,
    isDataComplete: true,
  },
  {
    id: 'PRT-UNIB-001',
    machine: 'Unifill B',
    part: 'Pisau perforasi',
    partNumber: 'PRF-4M-SKD11',
    specification: 'Gandeng 4 mata, SKD11',
    position: 'Perforation unit',
    replacedAt: '2026-09-24',
    intervalBasis: 'KALENDER',
    intervalTarget: 60,
    unit: 'Hari',
    currentUsage: 20,
    lifetimeDays: 60,
    usedDays: 20,
    isDataComplete: true,
  },
  {
    id: 'PRT-UNIB-002',
    machine: 'Unifill B',
    part: 'Seal piston',
    partNumber: 'SL-PTFE-32FG',
    specification: 'Food grade PTFE 32 mm',
    position: 'Filling line 2',
    replacedAt: '2026-07-09',
    intervalBasis: 'JAM_OPERASI',
    intervalTarget: 1000,
    unit: 'Jam Operasi',
    currentUsage: 890,
    lifetimeDays: 120,
    usedDays: 97,
    isDataComplete: true,
  },
];



export default function TechnicianDashboard({ technician, onLogout }: TechnicianDashboardProps) {
  const safeTechnician = useMemo(() => {
    const raw = technician || ({} as Partial<Technician>);
    return {
      nik: raw.nik || 'TKN0001',
      name: raw.name || 'Teknisi',
      role: 'TEKNISI' as const,
      shifts: Array.isArray(raw.shifts) && raw.shifts.length > 0 ? raw.shifts : ['Shift 1'],
      departments: Array.isArray(raw.departments) && raw.departments.length > 0 ? raw.departments : ['Maintenance'],
      active: raw.active !== false,
      password: raw.password || '',
    };
  }, [technician]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return storage.getItem('mc-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  function toggleSidebarCollapse() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        storage.setItem('mc-sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  }
  const [activeTab, setActiveTab] = useNavigationState<'QUEUE' | 'ACTIVE' | 'SHIFT_REPORT' | 'WORKS' | 'MACHINES'>('mc-nav-TechnicianDashboard-activeTab', 'QUEUE');
  const [queueSearch, setQueueSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'IN_PROGRESS' | 'PENDING' | 'SELESAI_PERBAIKAN' | 'CLOSED'>('ALL');
  const [shiftReportDate, setShiftReportDate] = useNavigationState<string>(`mc-nav-report-date-${technician.nik}`, operationalDate(new Date().toISOString(), (technician.shifts[0] || 'Shift 1').replace('Shift ', '')) || plantDate());
  const [shiftClosingRecord, setShiftClosingRecord] = useState<{
    closedAt: string;
    closedBy: string;
    shift: string;
    totalWorks: number;
    complete: boolean;
  } | null>(() => {
    try {
      const stored = storage.getItem(`machine-card-shift-closing-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Preventive Maintenance (PM) state (URS 3.3)
  const [pmSchedules, setPmSchedules] = useState<PreventiveMaintenanceItem[]>(() => {
    try {
      const stored = storage.getItem('machine-card-pm-schedules');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialSeedPMs;
  });

  function savePmUpdate(updated: PreventiveMaintenanceItem) {
    const raw = storage.getItem('machine-card-pm-schedules');
    const parsed = raw ? JSON.parse(raw) : pmSchedules;
    const latest: PreventiveMaintenanceItem[] = Array.isArray(parsed) ? parsed : pmSchedules;
    const next = latest.map((item) => item.id === updated.id ? { ...item, ...updated } : item);
    storage.setItem('machine-card-pm-schedules', JSON.stringify(next));
    setPmSchedules(next);
    window.dispatchEvent(new Event('mc-pm-updated'));
  }


  useEffect(() => {
    const refresh = () => {
      try {
        const parsed = JSON.parse(storage.getItem('machine-card-pm-schedules') || '[]');
        if (Array.isArray(parsed)) setPmSchedules(parsed);
      } catch {}
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('mc-pm-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('mc-pm-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const [pmFilter, setPmFilter] = useState<'ALL' | 'TERJADWAL' | 'SELESAI' | 'TERLAMBAT' | 'DIRESCHEDULE'>('ALL');
  const [pmSearch, setPmSearch] = useState('');
  const [completePmModalOpen, setCompletePmModalOpen] = useState(false);
  const [selectedPmForComplete, setSelectedPmForComplete] = useState<PreventiveMaintenanceItem | null>(null);
  const [pmFindings, setPmFindings] = useState('');

  const [reschedulePmModalOpen, setReschedulePmModalOpen] = useState(false);
  const [selectedPmForReschedule, setSelectedPmForReschedule] = useState<PreventiveMaintenanceItem | null>(null);
  const [newPmDate, setNewPmDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Pending / Delay Modal state (URS 3.2, 3.4, 5.1 & 5.2)
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingType, setPendingType] = useState<'PENDING' | 'MENUNGGU_PART' | 'MENUNGGU_DUKUNGAN'>('MENUNGGU_PART');
  const [pendingReason, setPendingReason] = useState('');
  const [pendingKondisiTerakhir, setPendingKondisiTerakhir] = useState('');
  const [pendingRencanaTindakLanjut, setPendingRencanaTindakLanjut] = useState('');

  // Handover Modal state (URS 5.3)
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverForm, setHandoverForm] = useState({
    shift: 'Shift 2',
    tanggal: new Date().toISOString().slice(0, 10),
    progres: '',
    kendala: '',
    tindakLanjut: '',
  });
  const [works, setWorks] = useState<TechnicianWorkItem[]>(() => {
    try {
      const stored = storage.getItem('machine-card-open-work');
      if (stored) {
        const parsed = JSON.parse(stored) as Array<any>;

        // Map from operator format to technician format
        const fromOperator = parsed.map((item) => ({
          ...item,
          ticket: item.ticket,
          machine: item.machine,
          id_mesin: item.id_mesin,
          section: item.section || 'Filling',
          reporter: item.reporter,
          reporterName: item.reporterName || item.reporter,
          shift: item.shift || '1',
          issue: item.issue || item.keterangan || 'Kerusakan mesin',
          kategori: item.kategori,
          woType: item.woType,
          kodeProduk: item.kodeProduk,
          noBatch: item.noBatch,
          noWr: item.noWr,
          opened: item.waktuMulai
            ? new Intl.DateTimeFormat('id-ID', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Jakarta',
              }).format(new Date(item.waktuMulai))
            : 'Baru saja',
          waktuMulai: item.waktuMulai,
          waktuSelesai: item.waktuSelesai,
          status: item.status,
          action: item.action,
          technician: item.technician,
          technicianName: item.technicianName,
          technicianNik: item.technicianNik,
          originalOpenedAt: item.originalOpenedAt,
          alasanPenundaan: item.alasanPenundaan,
          kondisiTerakhir: item.kondisiTerakhir,
          rencanaTindakLanjut: item.rencanaTindakLanjut,
          catatanHandover: item.catatanHandover,
          statusHistory: item.statusHistory,
          riwayatHandover: item.riwayatHandover,
          partsReplaced: item.partsReplaced,
          partReplaced: item.partReplaced,
        }));

        // Combine unique by ticket
        const ticketSet = new Set(fromOperator.map((i) => i.ticket));
        const combined = [...fromOperator, ...(isTestEnv ? initialSeedWorks.filter((s) => !ticketSet.has(s.ticket)) : [])];
        return combined;
      }
    } catch {
      // Fallback
    }
    return initialSeedWorks;
  });

  const [selectedWork, setSelectedWork] = useState<TechnicianWorkItem | null>(null);

  // Sinkronisasi otomatis saat Operator melakukan closing tiket atau pembaruan (Realtime Cross-Tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'machine-card-open-work' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setWorks((prevWorks) => {
              const ticketMap = new Map(parsed.map((p: any) => [p.ticket, p]));
              return prevWorks.map((w) => {
                const fresh = ticketMap.get(w.ticket);
                if (fresh) {
                  return {
                    ...w,
                    status: fresh.status || w.status,
                    action: fresh.action || w.action,
                    technicianName: fresh.technicianName || w.technicianName,
                    waktuSelesai: fresh.waktuSelesai || w.waktuSelesai,
                  };
                }
                return w;
              });
            });
            setSelectedWork((prev) => {
              if (!prev) return null;
              const freshSelected = parsed.find((p: any) => p.ticket === prev.ticket);
              if (freshSelected) {
                return {
                  ...prev,
                  status: freshSelected.status || prev.status,
                  action: freshSelected.action || prev.action,
                  technicianName: freshSelected.technicianName || prev.technicianName,
                  waktuSelesai: freshSelected.waktuSelesai || prev.waktuSelesai,
                };
              }
              return prev;
            });
          }
        } catch {}
      }
    };
    const handleInjected = () => {
      try {
        const stored = storage.getItem('machine-card-open-work');
        if (stored) {
          const parsed = JSON.parse(stored) as Array<any>;
          const fromOperator = parsed.map((item) => ({
          ...item,
            ticket: item.ticket,
            machine: item.machine,
            id_mesin: item.id_mesin,
            section: item.section || 'Filling',
            reporter: item.reporter,
            reporterName: item.reporterName || item.reporter,
            shift: item.shift || '1',
            issue: item.issue || item.keterangan || 'Kerusakan mesin',
            kategori: item.kategori,
            woType: item.woType,
            kodeProduk: item.kodeProduk,
            noBatch: item.noBatch,
            noWr: item.noWr,
            opened: item.waktuMulai
              ? new Intl.DateTimeFormat('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Jakarta',
                }).format(new Date(item.waktuMulai))
              : 'Baru saja',
            waktuMulai: item.waktuMulai,
            waktuSelesai: item.waktuSelesai,
            status: item.status,
            action: item.action,
            technician: item.technician,
            technicianName: item.technicianName,
            technicianNik: item.technicianNik,
            originalOpenedAt: item.originalOpenedAt,
            alasanPenundaan: item.alasanPenundaan,
            kondisiTerakhir: item.kondisiTerakhir,
            rencanaTindakLanjut: item.rencanaTindakLanjut,
            catatanHandover: item.catatanHandover,
            statusHistory: item.statusHistory,
            riwayatHandover: item.riwayatHandover,
            partsReplaced: item.partsReplaced,
            partReplaced: item.partReplaced,
          }));
          setWorks(fromOperator);
        }
      } catch {}
    };

    const handleCleared = () => {
      setWorks([]);
      setSelectedWork(null);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('mc-maintenance-data-injected', handleInjected);
    window.addEventListener('mc-maintenance-data-cleared', handleCleared);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('mc-maintenance-data-injected', handleInjected);
      window.removeEventListener('mc-maintenance-data-cleared', handleCleared);
    };
  }, []);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'CLOSED'>('ALL');
  const [search, setSearch] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [quickAction, setQuickAction] = useState('');
  const [followupNotes, setFollowupNotes] = useState('');
  const [showFollowupNotes, setShowFollowupNotes] = useState(false);
  const [partForm, setPartForm] = useState({
    name: '',
    specification: '',
    quantity: '1',
    position: 'Line 1',
    note: '',
  });

  // Shift Report States (As-Is Format Auto-Merge & Hold by System)
  const [shiftMembers, setShiftMembers] = useState<string>(() => {
    try {
      const stored = storage.getItem('machine-card-shift-members');
      if (stored) return stored;
    } catch {}
    return isTestEnv ? 'PDA, RMA, DEFA, FAUZI' : technician.nik;
  });

  const [repairWorkshopNotes, setRepairWorkshopNotes] = useState<string>(() => {
    try {
      const stored = storage.getItem(`machine-card-repair-notes-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`);
      if (stored !== null) return stored;
    } catch {}
    return isTestEnv ? '1. Pembuatan wo bacth' : '';
  });

  const [pbjtNotes, setPbjtNotes] = useState<string>(() => {
    try {
      const stored = storage.getItem(`machine-card-pbjt-notes-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`);
      if (stored !== null) return stored;
    } catch {}
    return '';
  });

  const [pmNotes, setPmNotes] = useState<string>(() => {
    try {
      const stored = storage.getItem(`machine-card-pm-notes-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`);
      if (stored !== null) return stored;
    } catch {}
    return '';
  });

  const [otherNotes, setOtherNotes] = useState<string>(() => {
    try {
      const stored = storage.getItem(`machine-card-other-notes-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`);
      if (stored !== null) return stored;
    } catch {}
    return isTestEnv ? '1. Pendampingan vendor trikarya' : '';
  });

  const [customWorkOverrides, setCustomWorkOverrides] = useState<Record<string, {
    wr?: string;
    actions?: string;
    note?: string;
    timeRange?: string;
    status?: string;
  }>>(() => {
    try {
      const stored = storage.getItem(`machine-card-shift-overrides-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`);
      if (stored) return JSON.parse(stored);
    } catch {}
    return {};
  });

  const [editingWorkTicket, setEditingWorkTicket] = useState<string | null>(null);
  useEffect(() => {
    if (isTestEnv) return;
    const suffix = `${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`;
    setRepairWorkshopNotes(storage.getItem(`machine-card-repair-notes-${suffix}`) || '');
    setPbjtNotes(storage.getItem(`machine-card-pbjt-notes-${suffix}`) || '');
    setPmNotes(storage.getItem(`machine-card-pm-notes-${suffix}`) || '');
    setOtherNotes(storage.getItem(`machine-card-other-notes-${suffix}`) || '');
    setCustomWorkOverrides(JSON.parse(storage.getItem(`machine-card-shift-overrides-${suffix}`) || '{}'));
    setShiftClosingRecord(JSON.parse(storage.getItem(`machine-card-shift-closing-${suffix}`) || 'null'));
  }, [shiftReportDate, technician.nik]);

  const [reportViewMode, setReportViewMode] = useState<'CARDS' | 'RAW'>('CARDS');
  const [discordSendStatus, setDiscordSendStatus] = useState<{
    sending: boolean;
    success?: boolean;
    message?: string;
  }>({ sending: false });
  const [copiedRawText, setCopiedRawText] = useState(false);

  useEffect(() => {
    if (!isTestEnv) return;
    try {
      storage.setItem('machine-card-shift-members', shiftMembers);
    } catch {}
  }, [shiftMembers]);

  useEffect(() => {
    if (!isTestEnv) return;
    try {
      storage.setItem(`machine-card-repair-notes-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`, repairWorkshopNotes);
    } catch {}
  }, [repairWorkshopNotes]);

  useEffect(() => {
    if (!isTestEnv) return;
    try {
      storage.setItem(`machine-card-pbjt-notes-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`, pbjtNotes);
    } catch {}
  }, [pbjtNotes]);

  useEffect(() => {
    if (!isTestEnv) return;
    try {
      storage.setItem(`machine-card-pm-notes-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`, pmNotes);
    } catch {}
  }, [pmNotes]);

  useEffect(() => {
    if (!isTestEnv) return;
    try {
      storage.setItem(`machine-card-other-notes-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`, otherNotes);
    } catch {}
  }, [otherNotes]);

  useEffect(() => {
    if (!isTestEnv) return;
    try {
      storage.setItem(`machine-card-shift-overrides-${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`, JSON.stringify(customWorkOverrides));
    } catch {}
  }, [customWorkOverrides]);

  function getWorkArea(work: TechnicianWorkItem): 'COMPOUNDING' | 'FILLING' | 'PACKAGING' | 'RUANG_REPAIR' {
    const sec = (work.section || '').toLowerCase();
    const m = (work.machine || '').toLowerCase();
    if (sec.includes('compound')) return 'COMPOUNDING';
    if (sec.includes('pack')) return 'PACKAGING';
    if (sec.includes('fill')) return 'FILLING';
    if (sec.includes('repair') || sec.includes('workshop')) return 'RUANG_REPAIR';
    if (sec.includes('compound') || m.includes('fbd') || m.includes('jaw chuan') || m.includes('compounding')) return 'COMPOUNDING';
    if (sec.includes('pack') || m.includes('chimei') || m.includes('joyea') || m.includes('jinsung') || m.includes('kartoning') || m.includes('packaging')) return 'PACKAGING';
    if (sec.includes('repair') || sec.includes('workshop')) return 'RUANG_REPAIR';
    return 'FILLING';
  }

  const currentShiftSchedule = useMemo(() => {
    const s = safeTechnician.shifts && safeTechnician.shifts[0] ? safeTechnician.shifts[0].replace(/[^0-9]/g, '') || '1' : '1';
    switch (s) {
      case '1':
        return { shift: '1', label: 'Shift 1 (Pagi)', timeRange: '06:45 - 15:15', triggerTime: '15:15' };
      case '2':
        return { shift: '2', label: 'Shift 2 (Sore)', timeRange: '15:00 - 22:30', triggerTime: '22:30' };
      case '3':
        return { shift: '3', label: 'Shift 3 (Malam)', timeRange: '22:15 - 06:45', triggerTime: '06:45' };
      default:
        return { shift: '1', label: 'Shift 1 (Pagi)', timeRange: '06:45 - 15:15', triggerTime: '15:15' };
    }
  }, [safeTechnician.shifts]);

  const reportWorks = useMemo(() => isTestEnv ? works : works.filter((work) => (work.status as string) !== 'VOID' && (
    ((work.technicianNik === technician.nik || !work.technicianNik) && String(work.shift || '1') === currentShiftSchedule.shift && operationalDate(work.waktuMulai || '', currentShiftSchedule.shift) === shiftReportDate)
    || (work.riwayatHandover || []).some((entry) => entry.pelaksanaNik === technician.nik && entry.tanggal === shiftReportDate && entry.shift.replace('Shift ', '') === currentShiftSchedule.shift)
  )), [works, technician.nik, currentShiftSchedule.shift, shiftReportDate]);

  const generateShiftReportPlainText = () => {
    const shiftNum = currentShiftSchedule.shift;
    const todayDate = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    }).format(new Date());

    let lines: string[] = [];
    lines.push(`LAPORAN SHIFT ${shiftNum}`);
    lines.push(`Tanggal :${todayDate}`);
    lines.push(`Anggota : ${shiftMembers}`);
    lines.push('');

    // 1. Ruang Repair / Workshop
    lines.push('*Ruang Repair/Workshop:*');
    if (repairWorkshopNotes.trim()) {
      lines.push(repairWorkshopNotes.trim());
    }
    lines.push('');

    const formatAreaWorks = (areaWorks: TechnicianWorkItem[]) => {
      return areaWorks.map((work, idx) => {
        const ov = customWorkOverrides[work.ticket] || {};
        const wr = ov.wr !== undefined ? ov.wr : (work.noWr || '~');
        const timeStr = ov.timeRange !== undefined ? ov.timeRange : (work.waktuMulai && work.waktuSelesai ? ` (${formatPlantTime(work.waktuMulai)}-${formatPlantTime(work.waktuSelesai)})` : '');
        const rawStatus = ov.status || work.status;
        const statusStr = (rawStatus === 'CLOSED' || rawStatus === 'DONE') ? '*DONE*' : '*OPEN*';

        const actText = ov.actions !== undefined ? ov.actions : (work.action || '');
        let actionBullets: string[] = [];
        if (actText.trim()) {
          actionBullets = actText
            .split('\n')
            .map((s) => s.replace(/^[•\-\*]\s*/, '').trim())
            .filter(Boolean)
            .map((s) => `• ${s}`);
        } else {
          actionBullets = ['• Pemeriksaan & penanganan teknisi'];
        }

        if (work.partsReplaced && work.partsReplaced.length > 0) {
          work.partsReplaced.forEach((p) => {
            if (!actText.includes(p.name)) {
              actionBullets.push(`• Penggantian ${p.name} (${p.qty || 1} ${p.unit || 'pcs'})`);
            }
          });
        }

        const noteStr = ov.note !== undefined ? ov.note : (work.catatanHandover || work.rencanaTindakLanjut || work.followup || '');

        let entry = `${idx + 1}. ${work.machine} : ${work.issue}${timeStr}\nWR : ${wr}\n${actionBullets.join('\n')}\nStatus : ${statusStr}`;
        if (noteStr.trim()) {
          entry += `\nNote : ${noteStr.trim()}`;
        }
        return entry;
      });
    };

    // 2. Compounding
    lines.push('*AREA COMPOUNDING:*');
    const compWorks = reportWorks.filter((w) => getWorkArea(w) === 'COMPOUNDING');
    if (compWorks.length > 0) {
      lines.push(formatAreaWorks(compWorks).join('\n\n'));
    }
    lines.push('');

    // 3. Filling
    lines.push('*AREA FILLING:*');
    const fillWorks = reportWorks.filter((w) => getWorkArea(w) === 'FILLING');
    if (fillWorks.length > 0) {
      lines.push(formatAreaWorks(fillWorks).join('\n\n'));
    }
    lines.push('');

    // 4. Packaging
    lines.push('*AREA PACKAGING:*');
    const packWorks = reportWorks.filter((w) => getWorkArea(w) === 'PACKAGING');
    if (packWorks.length > 0) {
      lines.push(formatAreaWorks(packWorks).join('\n\n'));
    }
    lines.push('');

    // 5. PBJT
    lines.push('*PBJT :*');
    if (pbjtNotes.trim()) {
      lines.push(pbjtNotes.trim());
    }
    lines.push('');

    // 6. PM
    lines.push('*PM :*');
    if (pmNotes.trim()) {
      lines.push(pmNotes.trim());
    }
    lines.push('');

    // 7. OTHER
    lines.push('*OTHER :*');
    if (otherNotes.trim()) {
      lines.push(otherNotes.trim());
    }

    return lines.join('\n');
  };

  async function handleTestSendDiscord() {
    setDiscordSendStatus({ sending: true });
    try {
      const todayDate = new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      }).format(new Date());

      const shiftNum = currentShiftSchedule.shift;
      const ticketPayload = reportWorks.map((w) => {
        const ov = customWorkOverrides[w.ticket] || {};
        const area = getWorkArea(w);
        const actText = ov.actions !== undefined ? ov.actions : (w.action || '');
        const actions = actText
          ? actText.split('\n').map((s) => s.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
          : [];
        return {
          ticket: w.ticket,
          machine: w.machine,
          issue: w.issue,
          status: (ov.status || w.status) === 'CLOSED' ? 'DONE' : 'OPEN',
          area: area,
          wr: ov.wr || w.noWr || '~',
          actions: actions,
          note: ov.note || w.catatanHandover || w.rencanaTindakLanjut || '',
        };
      });

      const payload = {
        webhookUrl: 'https://discord.com/api/webhooks/simulate',
        supervisorName: safeTechnician.name,
        supervisorNik: safeTechnician.nik,
        department: safeTechnician.departments[0] || 'Maintenance',
        plant: 'PT Bintang Toedjoe Pulogadung',
        shift: shiftNum,
        date: todayDate,
        teamMembers: shiftMembers.split(',').map((s) => s.trim()).filter(Boolean),
        summary: generateShiftReportPlainText(),
        openTickets: ticketPayload,
      };

      const res = await fetch('/api/shift-report/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `manual:${shiftReportDate}:${currentShiftSchedule.shift}:${crypto.randomUUID()}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setDiscordSendStatus({
          sending: false,
          success: true,
          message: data.simulated
            ? 'Pengujian Berhasil! Laporan shift disimulasikan & tervalidasi pada endpoint Discord Webhook.'
            : 'Pengujian Berhasil! Laporan shift telah dikirim langsung ke Discord Webhook.',
        });
      } else {
        setDiscordSendStatus({
          sending: false,
          success: false,
          message: 'Laporan belum terkirim. Periksa koneksi dan ulangi pengiriman.',
        });
      }
    } catch {
      setDiscordSendStatus({
        sending: false,
        success: false,
        message: 'Laporan belum terkirim. Periksa koneksi dan ulangi pengiriman.',
      });
    }
  }

  function handleSaveWorkOverride(ticket: string, overrideData: { wr?: string; actions?: string; note?: string; status?: string; timeRange?: string }) {
    setCustomWorkOverrides((prev) => ({
      ...prev,
      [ticket]: {
        ...(prev[ticket] || {}),
        ...overrideData,
      },
    }));
    setEditingWorkTicket(null);
  }

  // Pekerjaan aktif yang sedang ditangani saat ini (Active Job Spotlight untuk kemudahan teknisi di lapangan)
  const activeJobItem = useMemo(() => {
    return (
      works.find(
        (w) =>
          w.status === 'IN_PROGRESS' &&
          (w.technicianName === technician.name || !w.technicianName)
      ) ||
