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
