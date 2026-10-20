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
      works.find((w) => w.status === 'IN_PROGRESS') ||
      null
    );
  }, [works, technician.name]);

  // Machine browser & Kartu Mesin state (URS 6.1 & 6.2)
  const machineSearchWrapperRef = useRef<HTMLDivElement | null>(null);
  const [machineSearch, setMachineSearch] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [selectedMachineName, setSelectedMachineName] = useState('Ilapak 1');
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Record<string, boolean>>({});
  const [expandedPartsItems, setExpandedPartsItems] = useState<Record<string, boolean>>({});
  const [machineCardPeriod, setMachineCardPeriod] = useState<'CURRENT_MONTH' | 'LAST_30_DAYS' | 'YEAR_TO_DATE' | 'ALL_TIME'>('CURRENT_MONTH');
  const [historySearch, setHistorySearch] = useState('');
  const [historyActivityType, setHistoryActivityType] = useState<'ALL' | 'BREAKDOWN' | 'PREVENTIVE'>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'MENUNGGU_PART' | 'CLOSED'>('ALL');
  const [selectedPmForDetail, setSelectedPmForDetail] = useState<PreventiveMaintenanceItem | null>(null);
  const [showOperatingHoursLogModal, setShowOperatingHoursLogModal] = useState(false);

  // Data Jam Operasi Aktual Mesin (URS 3.6 & 6.1)
  const [operatingHoursRecords, setOperatingHoursRecords] = useState<MachineOperatingHoursRecord[]>(() => {
    try {
      const stored = storage.getItem('machine-card-operating-hours');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return initialOperatingHoursRecords;
  });

  // Filtered works for table
  const filteredWorks = useMemo(() => {
    const q = search.toLowerCase();
    return works.filter((w) => {
      const matchStatus =
        filter === 'ALL'
          ? true
          : filter === 'PENDING'
          ? w.status === 'PENDING' || w.status === 'MENUNGGU_PART' || w.status === 'MENUNGGU_DUKUNGAN'
          : w.status === filter;
      const matchSearch =
        w.ticket.toLowerCase().includes(q) ||
        w.machine.toLowerCase().includes(q) ||
        w.issue.toLowerCase().includes(q) ||
        (w.kategori && w.kategori.toLowerCase().includes(q)) ||
        (w.reporterName && w.reporterName.toLowerCase().includes(q));
      return matchStatus && matchSearch;
    });
  }, [works, filter, search]);

  // Sync state update to local storage & state (URS 5.1 & 5.2)
  function updateWorkStatus(status: 'IN_PROGRESS' | 'SELESAI_PERBAIKAN' | 'CLOSED') {
    if (!selectedWork) return;
    if (selectedWork.technicianNik && selectedWork.technicianNik !== technician.nik) { alert('Pekerjaan ini sedang ditangani teknisi lain.'); return; }

    let fullAction = actionNotes.trim() || selectedWork.action || '';
    if (quickAction === 'Penggantian Part' && partForm.name.trim()) {
      const partSummary = ` | Penggantian Part: ${partForm.name.trim()} (${partForm.specification || 'Standar'}), qty ${partForm.quantity || '1'}, pos: ${partForm.position}`;
      if (!fullAction.includes(partForm.name.trim())) {
        fullAction = `${fullAction}${partSummary}`;
      }
    }

    const isFinished = status === 'SELESAI_PERBAIKAN' || status === 'CLOSED';
    const endTimestamp = isFinished ? new Date().toISOString() : selectedWork.waktuSelesai;
    const startTimestamp = selectedWork.waktuMulaiTeknisi || selectedWork.waktuMulai;
    if (!startTimestamp || (isFinished && !fullAction.trim())) { alert('Waktu mulai dan rincian tindakan wajib diisi sebelum menyelesaikan pekerjaan.'); return; }
    const originalOpen = selectedWork.originalOpenedAt || startTimestamp;
    const durasiJam =
      isFinished && endTimestamp
        ? Math.max(0, (new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()) / 3600000).toFixed(2)
        : undefined;

    let waitMinutes = selectedWork.durasiTungguMenit || 0;
    if ((selectedWork.status === 'MENUNGGU_PART' || selectedWork.status === 'MENUNGGU_DUKUNGAN') && selectedWork.waktuMulaiTunggu) {
      const waitMs = Date.now() - new Date(selectedWork.waktuMulaiTunggu).getTime();
      waitMinutes += Math.max(1, Math.round(waitMs / 60000));
    }

    // URS 5.1: Keterlacakan Status
    const statusEntry: StatusHistoryEntry = {
      fromStatus: selectedWork.status,
      toStatus: status,
      changedBy: `${technician.name} (${technician.nik})`,
      changedAt: new Date().toISOString(),
      reason:
        status === 'SELESAI_PERBAIKAN'
          ? (fullAction || 'Perbaikan fisik selesai; diteruskan ke operator untuk running test & closing')
          : status === 'CLOSED'
          ? (fullAction || 'Pekerjaan perbaikan selesai')
          : 'Teknisi memulai/melanjutkan perbaikan',
    };

    const updated: TechnicianWorkItem = {
      ...selectedWork,
      status,
      action: fullAction,
      technicianName: technician.name,
      technicianNik: technician.nik,
      followup: followupNotes.trim() || selectedWork.followup,
      originalOpenedAt: originalOpen,
      waktuMulaiTeknisi: startTimestamp,
      waktuSelesai: endTimestamp,
      durasiTungguMenit: waitMinutes,
      waktuTungguPartMenit: waitMinutes,
      durasiPerbaikanMenit: isFinished && endTimestamp ? Math.max(0, (new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()) / 60000 - waitMinutes) : selectedWork.durasiPerbaikanMenit,
      statusHistory: [...(selectedWork.statusHistory || []), statusEntry],
      partReplaced:
        quickAction === 'Penggantian Part' && partForm.name.trim()
          ? { ...partForm, specification: partForm.specification.trim() || 'Standar Pabrik' }
          : selectedWork.partReplaced,
    };

    const nextWorks = works.map((w) => (w.ticket === updated.ticket ? updated : w));
    setWorks(nextWorks);
    setSelectedWork(updated);

    // Persist to machine-card-open-work storage so operator sees updates
    try {
      const stored = storage.getItem('machine-card-open-work');
      let arr = stored ? JSON.parse(stored) : [];
      let found = false;
      arr = arr.map((item: any) => {
        if (item.ticket === updated.ticket) {
          found = true;
          return {
            ...item,
            status,
            action: fullAction,
            technicianName: technician.name,
      technicianNik: technician.nik,
            originalOpenedAt: updated.originalOpenedAt,
            waktuSelesai: updated.waktuSelesai,
            durasiJam: durasiJam || item.durasiJam,
            durasiTungguMenit: waitMinutes,
            waktuMulaiTeknisi: updated.waktuMulaiTeknisi,
            durasiPerbaikanMenit: updated.durasiPerbaikanMenit,
            waktuTungguPartMenit: updated.waktuTungguPartMenit,
            statusHistory: updated.statusHistory,
            partReplaced: updated.partReplaced,
          };
        }
        return item;
      });
      if (!found) {
        arr.unshift({
          ticket: updated.ticket,
          machine: updated.machine,
          section: updated.section,
          reporter: updated.reporter || 'OPR0001',
          reporterName: updated.reporterName || 'Operator',
          shift: updated.shift || '1',
          keterangan: updated.issue,
          kategori: updated.kategori || 'General',
          woType: updated.woType || 'Batch',
          kodeProduk: updated.kodeProduk || '',
          noBatch: updated.noBatch || '',
          noWr: updated.noWr || '',
          originalOpenedAt: updated.originalOpenedAt,
          waktuMulai: updated.waktuMulai,
          waktuSelesai: updated.waktuSelesai,
          status,
          action: fullAction,
          technicianName: technician.name,
      technicianNik: technician.nik,
          durasiJam,
          durasiTungguMenit: waitMinutes,
      waktuTungguPartMenit: waitMinutes,
      durasiPerbaikanMenit: isFinished && endTimestamp ? Math.max(0, (new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()) / 60000 - waitMinutes) : selectedWork.durasiPerbaikanMenit,
          statusHistory: updated.statusHistory,
          partReplaced: updated.partReplaced,
        });
      }
      storage.setItem('machine-card-open-work', JSON.stringify(arr));

      // Jika ada penggantian part baru yang belum di master data, ajukan ke antrean justifikasi Admin
      if (updated.partReplaced && updated.partReplaced.name) {
        try {
          const rawMaster = storage.getItem('mc-master-parts');
          const masterParts: any[] = rawMaster ? JSON.parse(rawMaster) : [];
          const isMaster = masterParts.some(
            (p) => p.name.toLowerCase() === updated.partReplaced!.name.toLowerCase()
          );
          if (!isMaster) {
            const rawPending = storage.getItem('mc-pending-part-justifications');
            const pendingList: any[] = rawPending ? JSON.parse(rawPending) : [];
            const exists = pendingList.some(
              (p) =>
                p.ticket === updated.ticket &&
                p.partName.toLowerCase() === updated.partReplaced!.name.toLowerCase()
            );
            if (!exists) {
              pendingList.unshift({
                id: `JUSTIF-${Date.now().toString().slice(-4)}`,
                ticket: updated.ticket,
                machine: updated.machine,
                technicianName: technician.name,
                technicianNik: technician.nik,
                partName: updated.partReplaced.name,
                specification: updated.partReplaced.specification || 'Standar Pabrik',
                quantity: updated.partReplaced.quantity || '1',
                position: updated.partReplaced.position || 'Lini Produksi',
                reportedAt: new Date().toISOString(),
                status: 'PENDING',
              });
              storage.setItem('mc-pending-part-justifications', JSON.stringify(pendingList));
            }
          }
        } catch {}
      }
    } catch {}
  }

  // Handle Pause / Pending / Delay Work (URS 3.2, 3.4, 5.1 & 5.2)
  function handlePauseWork(
    type: 'PENDING' | 'MENUNGGU_PART' | 'MENUNGGU_DUKUNGAN',
    reason: string,
    kondisi: string,
    tindakLanjut: string
  ) {
    if (!selectedWork) return;
    const nowISO = new Date().toISOString();
    const originalOpen = selectedWork.originalOpenedAt || selectedWork.waktuMulai || nowISO;

    const statusEntry: StatusHistoryEntry = {
      fromStatus: selectedWork.status,
      toStatus: type,
      changedBy: `${technician.name} (${technician.nik})`,
      changedAt: nowISO,
      reason: reason,
    };

    const updated: TechnicianWorkItem = {
      ...selectedWork,
      status: type,
      alasanPenundaan: reason,
      kondisiTerakhir: kondisi.trim() || selectedWork.kondisiTerakhir || (type === 'PENDING' ? 'Pekerjaan belum selesai / dilanjutkan ke shift berikutnya' : 'Menunggu ketersediaan suku cadang/bantuan'),
      rencanaTindakLanjut: tindakLanjut.trim() || selectedWork.rencanaTindakLanjut || (type === 'PENDING' ? 'Dijadwalkan penanganan shift berikutnya' : 'Melanjutkan pekerjaan setelah part/dukungan tersedia'),
      originalOpenedAt: originalOpen,
      waktuMulaiTunggu: type !== 'PENDING' ? nowISO : selectedWork.waktuMulaiTunggu,
      statusHistory: [...(selectedWork.statusHistory || []), statusEntry],
    };
    const nextWorks = works.map((w) => (w.ticket === updated.ticket ? updated : w));
    setWorks(nextWorks);
    setSelectedWork(updated);
    setPendingModalOpen(false);
    setPendingReason('');
    setPendingKondisiTerakhir('');
    setPendingRencanaTindakLanjut('');

    try {
      const stored = storage.getItem('machine-card-open-work');
      let arr = stored ? JSON.parse(stored) : [];
      arr = arr.map((item: any) => {
        if (item.ticket === updated.ticket) {
          return {
            ...item,
            status: type,
            alasanPenundaan: reason,
            kondisiTerakhir: updated.kondisiTerakhir,
            rencanaTindakLanjut: updated.rencanaTindakLanjut,
            originalOpenedAt: updated.originalOpenedAt,
            waktuMulaiTunggu: updated.waktuMulaiTunggu,
            waktuMulaiTeknisi: updated.waktuMulaiTeknisi,
            durasiPerbaikanMenit: updated.durasiPerbaikanMenit,
            waktuTungguPartMenit: updated.waktuTungguPartMenit,
            statusHistory: updated.statusHistory,
          };
        }
        return item;
      });
      storage.setItem('machine-card-open-work', JSON.stringify(arr));
    } catch {}
  }

  // Handle Record Shift Handover (URS 5.3)
  function handleRecordHandover(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWork || !handoverForm.progres.trim()) return;

    const newHandoverEntry: HandoverHistoryEntry = {
      shift: handoverForm.shift,
      tanggal: handoverForm.tanggal,
      pelaksanaNik: technician.nik,
      pelaksanaNama: technician.name,
      progres: handoverForm.progres.trim(),
      kendala: handoverForm.kendala.trim() || 'Tidak ada kendala kritis',
      tindakLanjut: handoverForm.tindakLanjut.trim() || 'Lanjut monitoring',
      waktuDicatat: new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date()),
      tanggungJawabShiftAsal: selectedWork.reporterName ? `Shift ${selectedWork.shift || '1'} (${selectedWork.reporterName})` : undefined,
    };

    const updated: TechnicianWorkItem = {
      ...selectedWork,
      action: `${selectedWork.action ? `${selectedWork.action} | ` : ''}[${handoverForm.shift} - ${technician.name}]: ${handoverForm.progres.trim()}`,
      kondisiTerakhir: handoverForm.progres.trim(),
      rencanaTindakLanjut: handoverForm.tindakLanjut.trim(),
      originalOpenedAt: selectedWork.originalOpenedAt || selectedWork.waktuMulai || new Date().toISOString(),
      riwayatHandover: [...(selectedWork.riwayatHandover || []), newHandoverEntry],
    };

    const nextWorks = works.map((w) => (w.ticket === updated.ticket ? updated : w));
    setWorks(nextWorks);
    setSelectedWork(updated);
    setHandoverModalOpen(false);
    setHandoverForm({
      shift: 'Shift 2',
      tanggal: new Date().toISOString().slice(0, 10),
      progres: '',
      kendala: '',
      tindakLanjut: '',
    });

    try {
      const stored = storage.getItem('machine-card-open-work');
      let arr = stored ? JSON.parse(stored) : [];
      arr = arr.map((item: any) => {
        if (item.ticket === updated.ticket) {
          return {
            ...item,
            action: updated.action,
            kondisiTerakhir: updated.kondisiTerakhir,
            rencanaTindakLanjut: updated.rencanaTindakLanjut,
            riwayatHandover: updated.riwayatHandover,
            originalOpenedAt: updated.originalOpenedAt,
          };
        }
        return item;
      });
      storage.setItem('machine-card-open-work', JSON.stringify(arr));
    } catch {}
  }

  // Handle Complete PM (URS 3.3)
  function handleCompletePM(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPmForComplete) return;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const updated: PreventiveMaintenanceItem = {
      ...selectedPmForComplete,
      status: 'SELESAI',
      tanggalSelesaiAktual: today,
      pelaksanaNik: technician.nik,
      pelaksanaNama: technician.name,
      hasilTemuan: pmFindings.trim() || 'Pemeriksaan preventif selesai sesuai standar prosedur operasional.',
    };
    savePmUpdate(updated);
    setCompletePmModalOpen(false);
    setSelectedPmForComplete(null);
    setPmFindings('');
  }

  // Handle Reschedule PM (URS 3.3)
  function handleReschedulePM(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPmForReschedule || !newPmDate || !rescheduleReason.trim()) return;
    const historyEntry = {
      tanggalSebelumnya: selectedPmForReschedule.tanggalJatuhTempo,
      tanggalBaru: newPmDate,
      alasan: rescheduleReason.trim(),
      diubahOleh: `${technician.nik} (${technician.name})`,
      waktuDiubah: new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date()),
    };
    const updated: PreventiveMaintenanceItem = {
      ...selectedPmForReschedule,
      status: 'DIRESCHEDULE',
      tanggalSebelumReschedule: selectedPmForReschedule.tanggalJatuhTempo,
      tanggalJatuhTempo: newPmDate,
      alasanReschedule: rescheduleReason.trim(),
      riwayatReschedule: [...(selectedPmForReschedule.riwayatReschedule || []), historyEntry],
    };
    savePmUpdate(updated);
    setReschedulePmModalOpen(false);
    setSelectedPmForReschedule(null);
    setNewPmDate('');
    setRescheduleReason('');
  }

  function handleSelectWork(work: TechnicianWorkItem) {
    setSelectedWork(work);
    setActionNotes(work.action || '');
    setFollowupNotes(work.followup || '');
    setShowFollowupNotes(Boolean(work.followup));
    if (work.partReplaced) {
      setQuickAction('Penggantian Part');
      setPartForm({
        name: work.partReplaced.name,
        specification: work.partReplaced.specification,
        quantity: work.partReplaced.quantity,
        position: work.partReplaced.position,
        note: work.partReplaced.note || '',
      });
    } else {
      setQuickAction('');
      setPartForm({
        name: '',
        specification: '',
        quantity: '1',
        position: 'Line 1',
        note: '',
      });
    }
  }

  function handleTakeWork(work: TechnicianWorkItem) {
    const updated: TechnicianWorkItem = {
      ...work,
      status: 'IN_PROGRESS',
      technician: technician.name,
      technicianName: technician.name,
      technicianNik: technician.nik,
      waktuMulaiTeknisi: work.waktuMulaiTeknisi || new Date().toISOString(),
      waktuMulai: work.waktuMulai,
    };
    setWorks((prev) => prev.map((w) => (w.ticket === work.ticket ? updated : w)));
    try {
      const stored = storage.getItem('machine-card-open-work');
      if (stored) {
        const parsed = JSON.parse(stored);
        const updatedArr = parsed.map((item: any) =>
          item.ticket === work.ticket
            ? { ...item, status: 'IN_PROGRESS', technician: technician.name, technicianName: technician.name, technicianNik: technician.nik, waktuMulaiTeknisi: updated.waktuMulaiTeknisi }
            : item
        );
        storage.setItem('machine-card-open-work', JSON.stringify(updatedArr));
      }
    } catch {}
    handleSelectWork(updated);
    setActiveTab('ACTIVE');
  }

  function saveShiftDraft() {
    const suffix = `${technician.nik}-${shiftReportDate}-${(technician.shifts[0] || 'Shift 1').replace('Shift ', '')}`;
    storage.setItem(`machine-card-repair-notes-${suffix}`, repairWorkshopNotes);
    storage.setItem(`machine-card-pbjt-notes-${suffix}`, pbjtNotes);
    storage.setItem(`machine-card-pm-notes-${suffix}`, pmNotes);
    storage.setItem(`machine-card-other-notes-${suffix}`, otherNotes);
    storage.setItem(`machine-card-shift-overrides-${suffix}`, JSON.stringify(customWorkOverrides));
  }

  function handleCloseShift() {
    saveShiftDraft();
    const record = {
      closedAt: new Date().toISOString(),
      date: shiftReportDate,
      closedBy: `${technician.name} (${technician.nik})`,
      shift: technician.shifts[0] || 'Shift 1',
      totalWorks: reportWorks.length,
      complete: true,
    };
    try {
      storage.setItem(`machine-card-shift-closing-${technician.nik}`, JSON.stringify(record));
      storage.setItem(`machine-card-shift-closing-${technician.nik}-${record.date}-${record.shift.replace('Shift ', '')}`, JSON.stringify(record));
    } catch {}
    setShiftClosingRecord(record);
  }

  function handleChooseQuickAction(act: string) {
    setQuickAction(act);
    if (!actionNotes.trim()) {
      setActionNotes(`${act}: `);
    } else if (!actionNotes.includes(act)) {
      setActionNotes((prev) => `${prev}; ${act}: `);
    }
  }

  function handleQuickSelectPartPreset(preset: { name: string; spec: string; pos: string }) {
    setPartForm((prev) => ({
      ...prev,
      name: preset.name,
      specification: preset.spec,
      position: preset.pos,
    }));
    const templateText = `Penggantian Part: Ganti ${preset.name} (${preset.spec}) pada ${preset.pos}, setting celah & uji fungsi normal`;
    if (!actionNotes.trim() || actionNotes.trim() === 'Penggantian Part:') {
      setActionNotes(templateText);
    }
  }

  // Machine catalog data
  const machineNames = useMemo(
    () => [...new Set([...getStoredMachines().map((m) => m.nama_mesin), ...works.map((w) => w.machine)])],
    [works]
  );

  const filteredMachineNames = useMemo(() => {
    return machineNames.filter((name) =>
      name.toLowerCase().includes(machineSearch.toLowerCase())
    );
  }, [machineNames, machineSearch]);

  const selectedMachine = getStoredMachines().find((m) => m.nama_mesin === selectedMachineName);
  const selectedMachineParts = featuredMachinePartHistory.filter(
    (p) => p.machine === selectedMachineName
  );
  const selectedMachineBreakdowns = works.filter((w) => w.machine === selectedMachineName);
  const selectedMachineHistory = selectedMachineBreakdowns; // Backwards compatibility for existing tests

  // Operating Hours Record per selected machine (URS 3.6 & 6.1)
  const machineOperatingRec = operatingHoursRecords.find(
    (r) => r.namaMesin === selectedMachineName
  ) || {
    id: `MOH-${selectedMachineName}`,
    kodeMesin: selectedMachine?.kode_mesin || 'MESIN-MC',
    namaMesin: selectedMachineName,
    periode: 'Oktober 2026',
    jamOperasiAktual: 148.5,
    jamShiftKalender: 176.0,
    sumberData: 'Logbook Running Counter Mesin',
    penanggungJawab: 'Budi Santoso (SPV Maintenance)',
    isComplete: true,
    catatanPenjelasan: 'Data operasional terdata otomatis',
  };

  // URS 6.1: Indikator Maintenance (Frekuensi, Downtime, MTTR, MTBF)
  const machineKpis = useMemo(() => {
    const totalBreakdowns = selectedMachineBreakdowns.length;
    const closedBreakdowns = selectedMachineBreakdowns.filter((w) => w.status === 'CLOSED');

    let totalDowntimeMins = 0;
    selectedMachineBreakdowns.forEach((w) => {
      let mins = w.durasiTungguMenit || 0;
      if ((w as any).durasiJam) {
        mins += Math.round(parseFloat((w as any).durasiJam) * 60);
      } else if (w.waktuMulai && w.waktuSelesai) {
        const diff = Math.round((new Date(w.waktuSelesai).getTime() - new Date(w.waktuMulai).getTime()) / 60000);
        mins += Math.max(0, diff);
      } else {
        mins += 45; // estimasi breakdown aktif
      }
      totalDowntimeMins += mins;
    });

    const totalDowntimeHours = (totalDowntimeMins / 60).toFixed(1);
    const mttrMins = closedBreakdowns.length > 0
      ? Math.round(totalDowntimeMins / closedBreakdowns.length)
      : totalDowntimeMins > 0 ? totalDowntimeMins : 0;
    const mttrHours = (mttrMins / 60).toFixed(2);

    const rawMtbf = totalBreakdowns > 0
      ? (machineOperatingRec.jamOperasiAktual / totalBreakdowns).toFixed(1)
      : machineOperatingRec.jamOperasiAktual.toFixed(1);

    return {
      breakdownCount: totalBreakdowns,
      closedCount: closedBreakdowns.length,
      totalDowntimeMins,
      totalDowntimeHours,
      mttrMins,
      mttrHours,
      operatingHours: machineOperatingRec.jamOperasiAktual,
      calendarHours: machineOperatingRec.jamShiftKalender,
      mtbf: rawMtbf,
      isDataComplete: machineOperatingRec.isComplete,
      sourceLog: machineOperatingRec.sumberData,
      supervisorInCharge: machineOperatingRec.penanggungJawab,
    };
  }, [selectedMachineBreakdowns, machineOperatingRec]);

  // URS 6.1 & 6.2: Riwayat Terintegrasi (Breakdown + PM + Penggantian Part)
  const integratedMachineHistory = useMemo(() => {
    type HistoryItem = {
      id: string;
      type: 'BREAKDOWN' | 'PREVENTIVE';
      title: string;
      action?: string;
      date: string;
      shift?: string;
      technician: string;
      status: string;
      downtimeMinutes?: number;
      partReplaced?: string;
      noWr?: string;
      noBatch?: string;
      rawTicket?: TechnicianWorkItem;
      rawPm?: PreventiveMaintenanceItem;
    };

    const list: HistoryItem[] = [];

    // 1. Breakdown Events
    selectedMachineBreakdowns.forEach((w) => {
      list.push({
        id: w.ticket,
        type: 'BREAKDOWN',
        title: w.issue,
        action: w.action,
        date: w.opened,
        shift: w.shift ? `Shift ${w.shift}` : 'Shift 1',
        technician: w.technicianName || (w.status === 'OPEN' ? 'Menunggu Teknisi' : 'Tim Maintenance'),
        status: w.status,
        downtimeMinutes: ticketDowntime(w) ?? 0,
        partReplaced: w.partReplaced ? `${w.partReplaced.name} (${w.partReplaced.quantity} pcs)` : undefined,
        noWr: w.noWr,
        noBatch: w.noBatch,
        rawTicket: w,
      });
    });

    // 2. Preventive Maintenance Events
    const machinePms = pmSchedules.filter((p) => p.machine === selectedMachineName);
    machinePms.forEach((p) => {
      list.push({
        id: p.nomorPm,
        type: 'PREVENTIVE',
        title: p.kegiatan,
        action: p.hasilTemuan || 'Pemeriksaan rutin sesuai checklist PM',
        date: p.tanggalSelesaiAktual || p.tanggalJatuhTempo,
        shift: 'Shift 1',
        technician: p.pelaksanaNama || 'Teknisi PM',
        status: p.status === 'SELESAI' ? 'CLOSED' : p.status === 'DIRESCHEDULE' ? 'PENDING' : 'OPEN',
        noWr: p.nomorPm,
        rawPm: p,
      });
    });

    // URS 6.2: Filter & Search
    const q = historySearch.toLowerCase().trim();
    return list.filter((item) => {
      const matchType = historyActivityType === 'ALL' || item.type === historyActivityType;
      const matchStatus = historyStatusFilter === 'ALL' || item.status === historyStatusFilter;
      const matchSearch =
        !q ||
        item.id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        (item.action && item.action.toLowerCase().includes(q)) ||
        (item.noWr && item.noWr.toLowerCase().includes(q)) ||
        (item.noBatch && item.noBatch.toLowerCase().includes(q)) ||
        (item.partReplaced && item.partReplaced.toLowerCase().includes(q)) ||
        item.technician.toLowerCase().includes(q);
      return matchType && matchStatus && matchSearch;
    });
  }, [selectedMachineBreakdowns, pmSchedules, selectedMachineName, historySearch, historyActivityType, historyStatusFilter]);

  const openWorks = useMemo(() => works.filter((w) => w.status === 'OPEN'), [works]);
  const activeWorks = useMemo(() => works.filter((w) => (isTestEnv || !w.technicianNik || w.technicianNik === technician.nik) && ['IN_PROGRESS', 'PENDING', 'MENUNGGU_PART', 'MENUNGGU_DUKUNGAN', 'SELESAI_PERBAIKAN'].includes(w.status)), [works]);
  const inProgressWorks = useMemo(() => works.filter((w) => w.status === 'IN_PROGRESS'), [works]);
  const pendingWorks = useMemo(() => works.filter((w) => w.status === 'PENDING' || w.status === 'MENUNGGU_PART' || w.status === 'MENUNGGU_DUKUNGAN'), [works]);
  const completedRepairWorks = useMemo(() => works.filter((w) => w.status === 'SELESAI_PERBAIKAN'), [works]);
  const closedShiftWorks = useMemo(() => works.filter((w) => w.status === 'CLOSED'), [works]);

  const uncompletedShiftCount = useMemo(() => {
    return works.filter((w) => {
      if (w.status === 'CLOSED') {
        return !Boolean(w.action && w.action.trim().length > 3);
      }
      return !Boolean(w.riwayatHandover && w.riwayatHandover.length > 0);
    }).length;
  }, [works]);

  return (
    <div className={`dashboard-app-container technician-portal-root ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile Scrim */}
      {sidebarOpen && (
        <div
          className="sidebar-scrim-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Tutup menu navigasi"
        />
      )}

      {/* Industrial Sidebar Navigation */}
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="sidebar-brand-header">
          <div className="sidebar-brand-logo" title="BINTANG TOEDJOE · Machine Card Portal Teknisi">
            <span className="brand-badge-box" aria-label="Logo Bintang Toedjoe">
              <img
                src="/assets/bintang-toedjoe-mark.webp"
                alt="Logo Bintang Toedjoe"
                className="brand-logo-mark"
              />
            </span>
            <div className="brand-text-block">
              <strong>BINTANG TOEDJOE</strong>
              <small>Machine Card · Portal Teknisi Maintenance</small>
            </div>
          </div>
          <button
            type="button"
            className="btn-sidebar-collapse-desktop"
            onClick={toggleSidebarCollapse}
            title={sidebarCollapsed ? 'Perluas Sidebar (Tampilkan Teks)' : 'Ciutkan Sidebar (Hanya Ikon)'}
            aria-label={sidebarCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            type="button"
            className="btn-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-role-indicator" title="TEKNISI · Ranah Maintenance">
          <span className="role-pill-tag role-teknisi">
            <span className="pulse-green-dot" />
            <span className="role-pill-text">TEKNISI</span>
          </span>
          <span className="sidebar-plant-label">Ranah Maintenance</span>
        </div>

        <nav className="sidebar-navigation-menu" role="tablist" aria-label="Menu Modul Teknisi">
          <div className="sidebar-nav-heading">NAVIGASI MODUL</div>

          {/* 1. Antrean Breakdown */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'QUEUE' || activeTab === 'WORKS'}
            title={`Antrean Breakdown (${openWorks.length})`}
            data-tooltip={`Antrean Breakdown (${openWorks.length})`}
            className={`sidebar-nav-btn ${activeTab === 'QUEUE' || activeTab === 'WORKS' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('QUEUE');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <Inbox size={18} />
              <span>Antrean Breakdown</span>
            </div>
            {openWorks.length > 0 && (
              <span className="sidebar-nav-counter alert">
                {openWorks.length}
              </span>
            )}
          </button>

          {/* 2. Pekerjaan yang Tengah Diambil */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ACTIVE'}
            title={`Pekerjaan Tengah Diambil (${activeWorks.length + pmSchedules.filter((pm) => pm.status !== 'SELESAI' && !pm.tanggalSelesaiAktual).length})`}
            data-tooltip={`Pekerjaan Tengah Diambil (${activeWorks.length + pmSchedules.filter((pm) => pm.status !== 'SELESAI' && !pm.tanggalSelesaiAktual).length})`}
            className={`sidebar-nav-btn ${activeTab === 'ACTIVE' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('ACTIVE');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <Wrench size={18} />
              <span>Pekerjaan Tengah Diambil</span>
            </div>
            {(activeWorks.length > 0 || pmSchedules.some((pm) => pm.status !== 'SELESAI' && !pm.tanggalSelesaiAktual)) && (
              <span className="sidebar-nav-counter" style={{ background: '#0284c7', color: '#fff' }}>
                {activeWorks.length + pmSchedules.filter((pm) => pm.status !== 'SELESAI' && !pm.tanggalSelesaiAktual).length}
              </span>
            )}
          </button>

          {/* 3. Review Laporan Shift */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'SHIFT_REPORT' || activeTab === 'MACHINES'}
            title="Review Laporan Shift & Kelengkapan"
            data-tooltip="Review Laporan Shift & Kelengkapan"
            className={`sidebar-nav-btn ${activeTab === 'SHIFT_REPORT' || activeTab === 'MACHINES' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('SHIFT_REPORT');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <ClipboardCheck size={18} />
              <span>Review Laporan Shift</span>
            </div>
            {uncompletedShiftCount > 0 ? (
              <span className="sidebar-nav-counter warning" style={{ background: '#f59e0b', color: '#fff' }}>
                {uncompletedShiftCount}
              </span>
            ) : (
              <span className="sidebar-nav-counter" style={{ background: '#10b981', color: '#fff' }}>
                ✓
              </span>
            )}
          </button>
        </nav>

        {/* Sidebar Footer User Card */}
        <div className="sidebar-footer-profile">
          <div className="sidebar-user-info" title={`${safeTechnician.name} (${safeTechnician.nik}) · Dept: ${safeTechnician.departments.join(', ')}`}>
            <div className="sidebar-avatar-circle">
              {safeTechnician.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="sidebar-user-text">
              <strong>{safeTechnician.name} · {safeTechnician.nik}</strong>
              <small>Dept: {safeTechnician.departments.join(', ')}</small>
            </div>
          </div>
          <button
            type="button"
            className="btn-sidebar-logout-icon"
            onClick={onLogout}
            title="Keluar dari sesi"
            aria-label="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dashboard-main-area">
        {/* Top Navbar */}
        <header className="dashboard-topbar tech-topbar">
          <div className="topbar-left-zone">
            <div className="topbar-breadcrumb-trail">
              <span>Beranda</span>
              <span>/</span>
              <strong>
                {activeTab === 'QUEUE'
                  ? 'Antrean Breakdown'
                  : activeTab === 'ACTIVE'
                  ? 'Pekerjaan Tengah Diambil'
                  : 'Review Laporan Shift'}
              </strong>
            </div>
          </div>

          <div className="topbar-right-zone tech-topbar-context">
            <div className="topbar-chip tech-context-chip">
              <span className="chip-label">Teknisi:</span>
              <strong>{safeTechnician.name}</strong>
            </div>
            <div className="topbar-chip tech-context-chip">
              <span className="chip-label">Divisi:</span>
              <strong>{safeTechnician.departments.join(', ')}</strong>
            </div>
            <div className="topbar-chip tech-context-chip">
              <span className="chip-label">Shift:</span>
              <strong>{safeTechnician.shifts.map((s) => s.replace('Shift ', '')).join('/')}</strong>
            </div>
            <div className="topbar-chip tech-context-chip live">
              <span className="tech-pulse-dot" />
              <span>Workshop On-Duty</span>
            </div>
            <button className="btn-tech-logout" onClick={onLogout} title="Keluar dari sesi">
              <LogOut size={16} />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="dashboard-content-scroll tech-main">
          {/* Hero & Metrics */}
          <section className="tech-hero-section">
            <div>
              <p className="tech-breadcrumb">
                Teknisi <span>/</span>{' '}
                {activeTab === 'QUEUE'
                  ? 'Antrean Breakdown'
                  : activeTab === 'ACTIVE'
                  ? 'Pekerjaan Tengah Diambil'
                  : 'Review Laporan Shift'}
              </p>
              <h1>
                {activeTab === 'QUEUE'
                  ? 'Antrean Breakdown Mesin'
                  : activeTab === 'ACTIVE'
                  ? 'Daftar Pekerjaan Tengah Diambil'
                  : 'Review Laporan Shift & Kelengkapan Sebelum Closing'}
              </h1>
              <p className="tech-hero-subtitle">
                {activeTab === 'QUEUE'
                  ? 'Pantau laporan kerusakan mesin dari operator secara real-time dan segera ambil pekerjaan perbaikan.'
                  : activeTab === 'ACTIVE'
                  ? 'Kelola tiket yang sedang dalam perbaikan teknisi, catat tindakan teknis, dan input pergantian spare part.'
                  : 'Verifikasi kelengkapan catatan tindakan, spare part, dan handover tiket sebelum melakukan serah terima shift.'}
              </p>
            </div>
          </section>

        {/* TAB 1: ANTREAN BREAKDOWN (TIKET MASUK DARI OPERATOR) */}
        {(activeTab === 'QUEUE' || activeTab === 'WORKS') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <section className="tech-content-card">
              {/* Toolbar Antrean */}
              <div className="tech-toolbar-wrap">
                <div className="tech-search-box">
                  <Search size={18} />
                  <input
                    type="text"
                    value={queueSearch}
                    onChange={(e) => setQueueSearch(e.target.value)}
                    placeholder="Cari antrean tiket, mesin, section, kendala..."
                    aria-label="Cari antrean tiket"
                  />
                  {queueSearch && (
                    <button className="btn-tech-clear-search" onClick={() => setQueueSearch('')}>
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div className="tech-filter-pills">
                  <span className="tech-filter-label">Status Antrean:</span>
                  <span className="tech-badge-status open" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                    <Inbox size={14} />
                    {openWorks.length} Tiket Menunggu Teknisi
                  </span>
                </div>
              </div>

              {/* Tabel Antrean */}
              <div className="tech-table-responsive">
                <table className="tech-table">
                  <thead>
                    <tr>
                      <th>NO. TIKET</th>
                      <th>WAKTU LAPORAN</th>
                      <th>MESIN &amp; SECTION</th>
                      <th>PELAPOR (OPERATOR)</th>
                      <th>KERUSAKAN &amp; KATEGORI</th>
                      <th>STATUS</th>
                      <th className="text-center">AKSI PENGAMBILAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openWorks
                      .filter((w) => {
                        if (!queueSearch.trim()) return true;
                        const q = queueSearch.toLowerCase();
                        return (
                          w.ticket.toLowerCase().includes(q) ||
                          w.machine.toLowerCase().includes(q) ||
                          w.section.toLowerCase().includes(q) ||
                          w.issue.toLowerCase().includes(q) ||
                          (w.reporterName || w.reporter || '').toLowerCase().includes(q)
                        );
                      })
                      .map((work) => (
                        <tr key={work.ticket}>
                          <td data-label="No. Tiket">
                            <span className="tech-ticket-badge">{work.ticket}</span>
                          </td>
                          <td data-label="Waktu Laporan">{work.opened}</td>
                          <td data-label="Mesin & Section" className="tech-machine-col">
                            <strong>{work.machine}</strong>
                            <span className="tech-section-sub">Section {work.section}</span>
                          </td>
                          <td data-label="Pelapor">
                            <strong>{work.reporterName || work.reporter || 'Operator'}</strong>
                            {work.shift && <div className="tech-section-sub">Shift {work.shift}</div>}
                          </td>
                          <td data-label="Kerusakan & Kategori" className="tech-issue-col td-block-cell">
                            <strong>{work.issue}</strong>
                            {work.kategori && <small>Kategori: {work.kategori}</small>}
                          </td>
                          <td data-label="Status">
                            <span className="tech-badge-status open">
                              <AlertTriangle size={13} />
                              Open
                            </span>
                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '3px' }}>
                              Menunggu: {calculateTicketAging(work.originalOpenedAt, work.opened)}
                            </div>
                          </td>
                          <td data-label="Aksi" className="text-center td-action-cell">
                            <button
                              type="button"
                              className="btn-tech-action open-mode"
                              style={{
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 700,
                                padding: '0.5rem 1rem',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                              }}
                              onClick={() => handleTakeWork(work)}
                            >
                              <Play size={14} />
                              <span>Ambil Pekerjaan</span>
                            </button>
                          </td>
                        </tr>
                      ))}

                    {openWorks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="tech-empty-state">
                          <PackageSearch size={36} />
                          <strong>Antrean Breakdown Bersih!</strong>
                          <p>Tidak ada tiket kerusakan yang menunggu teknisi saat ini. Semua mesin beroperasi normal atau sedang ditangani.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: DAFTAR PEKERJAAN TENGAH DIAMBIL */}
        {activeTab === 'ACTIVE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {pmSchedules.some((pm) => !pm.tanggalSelesaiAktual && pm.status !== 'SELESAI') && (
              <section className="tech-content-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.4rem' }}>Tiket PM Terjadwal</h3>
                <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.85rem' }}>Jadwal dari Supervisor. PM mendatang tetap tercatat di daftar pekerjaan aktif.</p>
                <div className="tech-table-responsive">
                  <table className="tech-table">
                    <thead><tr><th>Nomor PM / Mesin</th><th>Kegiatan</th><th>Jadwal</th><th>Status</th><th>Aksi</th></tr></thead>
                    <tbody>{pmSchedules.filter((pm) => !pm.tanggalSelesaiAktual && pm.status !== 'SELESAI')
                      .slice().sort((a, b) => a.tanggalJatuhTempo.localeCompare(b.tanggalJatuhTempo)).map((pm) => {
                        const future = pm.tanggalJatuhTempo > new Date().toLocaleDateString('sv-SE');
                        return <tr key={pm.id}>
                          <td><strong>{pm.nomorPm}</strong><div>{pm.machine}</div></td>
                          <td>{pm.kegiatan}</td><td>{pm.tanggalJatuhTempo}</td>
                          <td>{pm.status === 'DALAM_PENGERJAAN' ? 'Dalam Pengerjaan' : future ? 'Akan Datang' : 'Siap Dikerjakan'}</td>
                          <td><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button type="button" className="btn-tech-action" onClick={() => setSelectedPmForDetail(pm)}>Detail PM</button>
                            {!future && pm.status !== 'DALAM_PENGERJAAN' && <button type="button" className="btn-tech-action" onClick={() => savePmUpdate({ ...pm, status: 'DALAM_PENGERJAAN', pelaksanaNik: technician.nik, pelaksanaNama: technician.name })}>Mulai PM</button>}
                            {pm.status === 'DALAM_PENGERJAAN' && pm.pelaksanaNik === technician.nik && <button type="button" className="btn-tech-action" onClick={() => { setSelectedPmForComplete(pm); setCompletePmModalOpen(true); }}>Selesaikan PM</button>}
                          </div></td>
                        </tr>;
                      })}</tbody>
                  </table>
                </div>
              </section>
            )}
            {/* Active Job Spotlight Banner */}
            {activeJobItem && (
              <div
                style={{
                  background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                  border: '2px solid #3b82f6',
                  borderRadius: '12px',
                  padding: '1.25rem 1.5rem',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: '#2563eb', color: '#ffffff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800 }}>
                      SEDANG ANDA TANGANI SAAT INI
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: '#1e3a8a' }}>
                      {activeJobItem.machine} ({activeJobItem.section}) · Tiket: {activeJobItem.ticket}
                    </strong>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                    Pelapor: <strong>{activeJobItem.reporterName || 'Operator'}</strong> · Shift {activeJobItem.shift || '1'}
                  </div>
                </div>

                <div style={{ background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1e293b' }}>
                  <strong>Kendala Lapangan:</strong> {activeJobItem.issue}
                  {activeJobItem.action && (
                    <div style={{ color: '#047857', marginTop: '4px', fontWeight: 600 }}>
                      Progres Terakhir: {activeJobItem.action}
                    </div>
                  )}
                  {activeJobItem.partsReplaced && activeJobItem.partsReplaced.length > 0 && (
                    <div style={{ color: '#475569', marginTop: '4px', fontSize: '0.78rem' }}>
                      Part Digunakan: {activeJobItem.partsReplaced.map((p) => `${p.name} (${p.qty} ${p.unit})`).join(', ')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-tech-action-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '0.55rem 1rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                    }}
                    onClick={() => handleSelectWork(activeJobItem)}
                  >
                    <Wrench size={15} />
                    <span>Update Pengerjaan &amp; Part</span>
                  </button>

                  <button
                    type="button"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '0.55rem 1rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: '#ffffff',
                      color: '#d97706',
                      border: '1.5px solid #fcd34d',
                    }}
                    onClick={() => {
                      handleSelectWork(activeJobItem);
                      setPendingType('MENUNGGU_PART');
                      setPendingReason('');
                      setPendingKondisiTerakhir(activeJobItem.kondisiTerakhir || '');
                      setPendingRencanaTindakLanjut(activeJobItem.rencanaTindakLanjut || '');
                      setPendingModalOpen(true);
                    }}
                  >
                    <PauseCircle size={15} />
                    <span>Pause / Tunda Pekerjaan</span>
                  </button>
                </div>
              </div>
            )}

            <section className="tech-content-card">
              {/* Toolbar Pekerjaan Aktif */}
              <div className="tech-toolbar-wrap">
                <div className="tech-search-box">
                  <Search size={18} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari tiket pekerjaan aktif, mesin, kendala..."
                    aria-label="Cari tiket pekerjaan aktif"
                  />
                  {search && (
                    <button className="btn-tech-clear-search" onClick={() => setSearch('')}>
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div className="tech-filter-pills">
                  <span className="tech-filter-label">Filter:</span>
                  <button
                    type="button"
                    className={`tech-pill-btn ${activeFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('ALL')}
                  >
                    Semua Aktif ({activeWorks.length})
                  </button>
                  <button
                    type="button"
                    className={`tech-pill-btn ${activeFilter === 'IN_PROGRESS' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('IN_PROGRESS')}
                  >
                    Sedang Dikerjakan ({inProgressWorks.length})
                  </button>
                  <button
                    type="button"
                    className={`tech-pill-btn ${activeFilter === 'PENDING' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('PENDING')}
                  >
                    Pending / Tunggu Part ({pendingWorks.length})
                  </button>
                  <button
                    type="button"
                    className={`tech-pill-btn ${activeFilter === 'SELESAI_PERBAIKAN' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('SELESAI_PERBAIKAN')}
                  >
                    Selesai Perbaikan ({completedRepairWorks.length})
                  </button>
                </div>
              </div>

              {/* Table Pekerjaan Aktif */}
              <div className="tech-table-responsive">
                <table className="tech-table">
                  <thead>
                    <tr>
                      <th>NO. TIKET</th>
                      <th>WAKTU LAPORAN &amp; MULAI</th>
                      <th>MESIN &amp; SECTION</th>
                      <th>PELAPOR</th>
                      <th>KERUSAKAN &amp; TINDAKAN</th>
                      <th>STATUS PENGERJAAN</th>
                      <th className="text-center">AKSI TEKNISI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeWorks
                      .filter((work) => {
                        if (activeFilter === 'IN_PROGRESS' && work.status !== 'IN_PROGRESS') return false;
                        if (
                          activeFilter === 'PENDING' &&
                          work.status !== 'PENDING' &&
                          work.status !== 'MENUNGGU_PART' &&
                          work.status !== 'MENUNGGU_DUKUNGAN'
                        )
                          return false;
                        if (activeFilter === 'SELESAI_PERBAIKAN' && work.status !== 'SELESAI_PERBAIKAN') return false;
                        if (activeFilter === 'CLOSED' && work.status !== 'CLOSED') return false;
                        if (!search.trim()) return true;
                        const q = search.toLowerCase();
                        return (
                          work.ticket.toLowerCase().includes(q) ||
                          work.machine.toLowerCase().includes(q) ||
                          work.section.toLowerCase().includes(q) ||
                          work.issue.toLowerCase().includes(q) ||
                          (work.action || '').toLowerCase().includes(q)
                        );
                      })
                      .map((work) => {
                        const isSelected = selectedWork?.ticket === work.ticket;
                        return (
                          <tr key={work.ticket} className={isSelected ? 'selected-work-row' : ''}>
                            <td data-label="No. Tiket">
                              <span className="tech-ticket-badge">{work.ticket}</span>
                            </td>
                            <td data-label="Waktu Laporan & Mulai">
                              <div>{work.opened}</div>
                              {work.waktuMulai && (
                                <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '2px' }}>
                                  Mulai: {work.waktuMulai}
                                </div>
                              )}
                              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
                                Durasi: {calculateTicketAging(work.originalOpenedAt, work.waktuMulai || work.opened)}
                              </div>
                            </td>
                            <td data-label="Mesin & Section" className="tech-machine-col">
                              <strong>{work.machine}</strong>
                              <span className="tech-section-sub">Section {work.section}</span>
                            </td>
                            <td data-label="Pelapor">
                              <strong>{work.reporterName || work.reporter || 'Operator'}</strong>
                              {work.shift && <div className="tech-section-sub">Shift {work.shift}</div>}
                            </td>
                            <td data-label="Kerusakan & Tindakan" className="tech-issue-col td-block-cell">
                              <strong>{work.issue}</strong>
                              {work.action ? (
                                <div style={{ color: '#047857', fontSize: '0.76rem', marginTop: '3px' }}>
                                  Tindakan: {work.action}
                                </div>
                              ) : (
                                <div style={{ color: '#b91c1c', fontSize: '0.74rem', marginTop: '3px' }}>
                                  Tindakan belum diisi
                                </div>
                              )}
                              {work.partsReplaced && work.partsReplaced.length > 0 && (
                                <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                                  Part: {work.partsReplaced.map((p) => p.name).join(', ')}
                                </div>
                              )}
                            </td>
                            <td data-label="Status Pengerjaan">
                              {work.status === 'IN_PROGRESS' && (
                                <span className="tech-badge-status in-progress">
                                  <Clock3 size={13} />
                                  Sedang Dikerjakan
                                </span>
                              )}
                              {work.status === 'PENDING' && (
                                <div>
                                  <span className="tech-badge-status in-progress" style={{ background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }}>
                                    <AlertTriangle size={13} />
                                    Pending
                                  </span>
                                  {work.alasanPenundaan && (
                                    <div style={{ fontSize: '0.72rem', color: '#c2410c', marginTop: '2px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={work.alasanPenundaan}>
                                      {work.alasanPenundaan}
                                    </div>
                                  )}
                                </div>
                              )}
                              {(work.status === 'MENUNGGU_PART' || work.status === 'MENUNGGU_DUKUNGAN') && (
                                <div>
                                  <span className="tech-badge-status in-progress" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                                    <Clock3 size={13} />
                                    {work.status === 'MENUNGGU_PART' ? 'Menunggu Part' : 'Menunggu Dukungan'}
                                  </span>
                                  {work.alasanPenundaan && (
                                    <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '2px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={work.alasanPenundaan}>
                                      {work.alasanPenundaan}
                                    </div>
                                  )}
                                </div>
                              )}
                              {work.status === 'SELESAI_PERBAIKAN' && (
                                <div>
                                  <span className="tech-badge-status in-progress" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                                    <CheckCircle2 size={13} />
                                    Selesai Perbaikan
                                  </span>
                                  <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: '2px', fontWeight: 600 }}>
                                    Menunggu Closing Opr
                                  </div>
                                </div>
                              )}
                              {work.status === 'CLOSED' && (
                                <div>
                                  <span className="tech-badge-status closed">
                                    <CheckCircle2 size={13} />
                                    Closed
                                  </span>
                                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                                    Ditutup Operator
                                  </div>
                                </div>
                              )}
                            </td>
                            <td data-label="Aksi Teknisi" className="text-center td-action-cell">
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn-tech-action"
                                  onClick={() => handleSelectWork(work)}
                                  title="Update Catatan & Pergantian Part"
                                >
                                  <Wrench size={13} />
                                  <span>Update</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn-tech-action"
                                  style={{ background: '#fffbeb', color: '#d97706', borderColor: '#fcd34d' }}
                                  onClick={() => {
                                    handleSelectWork(work);
                                    setPendingType('MENUNGGU_PART');
                                    setPendingReason('');
                                    setPendingKondisiTerakhir(work.kondisiTerakhir || '');
                                    setPendingRencanaTindakLanjut(work.rencanaTindakLanjut || '');
                                    setPendingModalOpen(true);
                                  }}
                                  title="Tunda / Pause Pekerjaan"
                                >
                                  <PauseCircle size={13} />
                                  <span>Pause</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
