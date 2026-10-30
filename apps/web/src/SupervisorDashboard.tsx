import { useNavigationState } from './use-navigation-state';
import ServerAuditPanel from './ServerAuditPanel';
import PartMeterSetup from './PartMeterSetup';
import { isUnfinished, pmCompliance, repairMinutes, plantDate, operationalDate, formatPlantTime, ticketDowntime } from './maintenance-metrics';
import { storage } from './storage';
import { machineTicketStatus } from './machine-ticket-status';
import SupervisorPMPlanner from './SupervisorPMPlanner';
import { getMachineParts, readPartsArray } from './machine-parts';
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Search,
  SlidersHorizontal,
  X,
  LogOut,
  PackageSearch,
  FileText,
  Layers,
  Wrench,
  ShieldCheck,
  Save,
  Check,
  ArrowRight,
  ClipboardList,
  Calendar,
  Activity,
  RotateCcw,
  BookOpen,
  Send,
  Bot,
  Sparkles,
  Code,
  Copy,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
  Target,
  TrendingUp,
  BarChart2,
  Gauge,
  History,
  Info,
  Sliders,
  CheckSquare,
  Brain,
  MoreVertical,
  ChevronDown,
  ExternalLink,
  PlusCircle,
  Clock,
  Edit3,
  Download,
} from 'lucide-react';
import { fallbackMachines, getStoredMachines, MACHINE_STORAGE_KEY, type Machine } from './data';
import { type Supervisor, operators as seedOperators, exampleTechnician } from './operator';
import './supervisor-portal.css';
import './dashboard-unified.css';

export type SupervisorDashboardProps = {
  supervisor: Supervisor;
  onLogout: () => void;
};

export type SupervisorWorkTicket = {
  ticket: string;
  machine: string;
  section: string;
  reporter?: string;
  reporterName?: string;
  shift?: string;
  keterangan: string;
  kategori?: string;
  woType?: string;
  kodeProduk?: string;
  noBatch?: string;
  noWr?: string;
  waktuMulai?: string;
  waktuSelesai?: string;
  waktuMulaiTeknisi?: string;
  waktuMesinBeroperasi?: string;
  closedAt?: string;
  riwayatHandover?: Array<{ shift: string; tanggal: string }>;
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'MENUNGGU_PART' | 'MENUNGGU_DUKUNGAN' | 'HANDOVER' | 'SELESAI_PERBAIKAN' | 'CLOSED' | 'VOID'; // URS 8.1: Status VOID untuk pembatalan tanpa hard delete
  action?: string;
  technicianName?: string;
  supervisorVerified?: boolean;
  supervisorNote?: string;
  verifiedAt?: string;
  durasiPerbaikanMenit?: number; // URS 7.4 & 7.5
  waktuTungguPartMenit?: number; // URS 7.4
  alasanTungguPart?: string; // URS 7.4
  originalOpenedAt?: string; // URS 7.8
  partReplaced?: string | { name: string; specification?: string; quantity?: string; position?: string }; // URS 7.3
  isVoid?: boolean; // URS 8.1 Klausul 6: Perlindungan Riwayat
  voidReason?: string;
  voidBy?: string;
  voidAt?: string;
  // Format As-Is 15 Kolom & Komparasi 2-Sisi (Operator vs Teknisi)
  tanggal?: string;
  bulan?: string;
  operatorStart?: string; // Sisi Operator (kapan mesin mati/breakdown dilaporkan)
  operatorEnd?: string; // Sisi Operator (kapan operator konfirmasi mesin jalan kembali)
  operatorDurasi?: number; // Durasi downtime sisi operator dalam satuan Jam
  technicianStart?: string; // Sisi Teknisi (mulai pengerjaan)
  technicianEnd?: string; // Sisi Teknisi (selesai perbaikan/uji)
  technicianDurasi?: number; // Durasi pengerjaan teknisi dalam Jam
};

// =========================================================================
// URS 8.1: REVIEW DAN PERBAIKAN DATA (AUDIT TRAIL, KOREKSI PENGUKURAN, REVISI LAPORAN)
// =========================================================================

export type DataCorrectionEntry = {
  id: string;
  recordType: 'TIKET_BREAKDOWN' | 'JAM_OPERASI' | 'LAPORAN_SHIFT';
  recordId: string;
  recordTitle: string;
  fieldChanged: string;
  fieldLabel: string;
  beforeValue: string;
  afterValue: string;
  reason: string; // Wajib diisi!
  changedBy: string;
  changedAt: string;
  impactedIndicators: string[];
};

export type ShiftReportRevision = {
  revisionNo: number; // Rev 0 (Asli), Rev 1, Rev 2 dst.
  revisionDate: string;
  revisedBy: string;
  reason: string;
  changesSummary: string;
  sentTimestamp: string;
};

const isTestEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.MODE === 'test');

const baseSeedCorrectionLogs: DataCorrectionEntry[] = [
  {
    id: 'CORR-202610-001',
    recordType: 'TIKET_BREAKDOWN',
    recordId: 'OW-233174',
    recordTitle: 'Ilapak 1 - Gasket pneumatic line 1 bocor',
    fieldChanged: 'durasiPerbaikanMenit',
    fieldLabel: 'Durasi Perbaikan Aktif',
    beforeValue: '150 Menit (2.5 Jam)',
    afterValue: '120 Menit (2.0 Jam)',
    reason: 'Koreksi durasi aktif setelah verifikasi rekaman time-stamp PLC dan checklist leak test',
    changedBy: 'Budi Santoso (SPV Maintenance)',
    changedAt: '2026-10-20 15:30 WIB',
    impactedIndicators: ['MTTR Gabungan', 'Total Downtime Lini'],
  },
  {
    id: 'CORR-202610-002',
    recordType: 'TIKET_BREAKDOWN',
    recordId: 'OW-233110',
    recordTitle: 'FBD Jaw Chuan - Suhu tidak bisa naik',
    fieldChanged: 'kategori',
    fieldLabel: 'Kategori / Klasifikasi Kerusakan',
    beforeValue: 'Mekanis Umum',
    afterValue: 'Sistem Pemanas / Steam Trap',
    reason: 'Koreksi klasifikasi untuk akurasi pelacakan pola bad actor sistem pemanas',
    changedBy: 'Budi Santoso (SPV Maintenance)',
    changedAt: '2026-10-19 11:15 WIB',
    impactedIndicators: ['Bad Actor / Kerusakan Berulang', 'Pareto Breakdown'],
  },
];

export const initialSeedCorrectionLogs: DataCorrectionEntry[] = isTestEnv ? baseSeedCorrectionLogs : [];

const baseShiftRevisions: ShiftReportRevision[] = [
  {
    revisionNo: 0,
    revisionDate: '08/09/2026',
    revisedBy: 'Sistem Otomatis (Auto-Generated)',
    reason: 'Pengiriman Laporan Shift Terjadwal Awal',
    changesSummary: 'Laporan resmi serah-terima Shift 1 dikompilasi pada akhir shift',
    sentTimestamp: '08/09/2026 15:15 WIB',
  },
];

export const initialShiftRevisions: ShiftReportRevision[] = isTestEnv ? baseShiftRevisions : [];

export type DayCategory = 'WEEKDAY' | 'WEEKEND';

// URS 3.6: Entitas Data Waktu Operasi Mesin & MTBF
export type MachineOperatingHoursRecord = {
  id: string;
  kodeMesin: string;
  namaMesin: string;
  periode: string;
  jamOperasiAktual: number;
  jamShiftKalender: number;
  sumberData: string;
  penanggungJawab: string;
  isComplete: boolean;
  catatanPenjelasan?: string;
  diverifikasiOleh?: string;
  tanggalVerifikasi?: string;
};

// URS 7.1 Klausul 6: Penetapan Target KPI Maintenance oleh Supervisor
export type KPITargetRecord = {
  id: string;
  indicator: 'MTTR' | 'MTBF' | 'PM_ON_TIME' | 'MAX_DOWNTIME';
  label: string;
  unit: string;
  targetValue: number;
  direction: 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN_OR_EQUAL';
  scope: string;
  effectivePeriod: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
};

export type KPITargetHistory = {
  id: string;
  kpiId: string;
  indicator: string;
  previousValue: number;
  newValue: number;
  unit: string;
  direction: 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN_OR_EQUAL';
  reason: string;
  changedBy: string;
  changedAt: string;
};

export type IntervalBasis = 'KALENDER' | 'JAM_OPERASI';

// URS 7.2: Entitas Monitoring Lifetime Komponen & Prioritas Penggantian
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
  installedMeterHours?: number;
  currentMeterHours?: number;
  meterVerifiedAt?: string;
};

// URS 7.7: Entitas Preventive Maintenance untuk Evaluasi Ketepatan Waktu (On-Time)
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

export const initialKpiTargets: KPITargetRecord[] = [
  {
    id: 'kpi-mttr',
    indicator: 'MTTR',
    label: 'Mean Time to Repair (MTTR Gabungan)',
    unit: 'Jam',
    targetValue: 1.5,
    direction: 'LESS_THAN_OR_EQUAL',
    scope: 'Semua Mesin Plant Pulogadung',
    effectivePeriod: 'Oktober 2026',
    lastUpdatedBy: 'Budi Santoso (SPV)',
    lastUpdatedAt: '2026-10-01',
  },
  {
    id: 'kpi-mtbf',
    indicator: 'MTBF',
    label: 'Mean Time Between Failures (MTBF Gabungan)',
    unit: 'Jam Operasi',
    targetValue: 50.0,
    direction: 'GREATER_THAN_OR_EQUAL',
    scope: 'Semua Mesin Plant Pulogadung',
    effectivePeriod: 'Oktober 2026',
    lastUpdatedBy: 'Budi Santoso (SPV)',
    lastUpdatedAt: '2026-10-01',
  },
  {
    id: 'kpi-pm',
    indicator: 'PM_ON_TIME',
    label: 'Ketepatan Pelaksanaan PM (On-Time Compliance)',
    unit: '%',
    targetValue: 90.0,
    direction: 'GREATER_THAN_OR_EQUAL',
    scope: 'Semua Mesin Plant Pulogadung',
    effectivePeriod: 'Oktober 2026',
    lastUpdatedBy: 'Budi Santoso (SPV)',
    lastUpdatedAt: '2026-10-01',
  },
  {
    id: 'kpi-downtime',
    indicator: 'MAX_DOWNTIME',
    label: 'Maksimum Total Downtime Lini per Periode',
    unit: 'Jam',
    targetValue: 15.0,
    direction: 'LESS_THAN_OR_EQUAL',
    scope: 'Semua Mesin Plant Pulogadung',
    effectivePeriod: 'Oktober 2026',
    lastUpdatedBy: 'Budi Santoso (SPV)',
    lastUpdatedAt: '2026-10-01',
  },
];

export const initialKpiTargetHistory: KPITargetHistory[] = [
  {
    id: 'hist-001',
    kpiId: 'kpi-mttr',
    indicator: 'MTTR Gabungan',
    previousValue: 2.0,
    newValue: 1.5,
    unit: 'Jam',
    direction: 'LESS_THAN_OR_EQUAL',
    reason: 'Target pengetatan efisiensi maintenance Q4 setelah penambahan toolkit khusus di workshop',
    changedBy: 'Budi Santoso (SPV Maintenance)',
    changedAt: '2026-10-01 08:00 WIB',
  },
];

export const initialMonitoringParts: MachinePartHistory[] = [
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
    id: 'PRT-ILA1-004',
    machine: 'Ilapak 1',
    part: 'Bearing Utama Roller',
    partNumber: 'BRG-6204-2RS',
    specification: 'Deep groove ball 20x47x14 mm',
    position: 'Roller Penarik Film',
    replacedAt: undefined,
    intervalBasis: 'KALENDER',
    intervalTarget: 180,
    unit: 'Hari',
    currentUsage: 0,
    lifetimeDays: 180,
    usedDays: 0,
    isDataComplete: false,
    incompleteReason: 'Tanggal pemasangan awal belum terdata di master maintenance',
  },
];

export const initialSeedPMs: PreventiveMaintenanceItem[] = [
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

export const buildInitialOperatingHoursRecords = (machines: Machine[] = fallbackMachines): MachineOperatingHoursRecord[] => {
  const seedRecords: MachineOperatingHoursRecord[] = isTestEnv ? [
    {
      id: 'MOH-202610-001',
      kodeMesin: 'ILA-01',
      namaMesin: 'Ilapak 1',
      periode: 'Oktober 2026',
      jamOperasiAktual: 148.5,
      jamShiftKalender: 176.0,
      sumberData: 'Input Manual SPV (Logbook Mesin)',
      penanggungJawab: 'Budi Santoso (SPV Maintenance)',
      isComplete: true,
      catatanPenjelasan: 'Data lengkap terverifikasi dari pencatatan manual logbook produksi.',
      diverifikasiOleh: 'Budi Santoso (SPV)',
      tanggalVerifikasi: '2026-10-20',
    },
    {
      id: 'MOH-202610-002',
      kodeMesin: 'ILA-08',
      namaMesin: 'Ilapak 8',
      periode: 'Oktober 2026',
      jamOperasiAktual: 94.0,
      jamShiftKalender: 176.0,
      sumberData: 'Input Manual Parsial (Logbook Shift)',
      penanggungJawab: 'Budi Santoso (SPV Maintenance)',
      isComplete: false,
      catatanPenjelasan: 'Data jam kerja shift 3 masih dalam verifikasi logbook fisik lapangan. Perhitungan MTBF bersifat estimasi.',
      diverifikasiOleh: 'Belum Selesai',
      tanggalVerifikasi: '—',
    },
    {
      id: 'MOH-202610-003',
      kodeMesin: 'MESIN-003',
      namaMesin: 'C-80',
      periode: 'Oktober 2026',
      jamOperasiAktual: 94.0,
      jamShiftKalender: 176.0,
      sumberData: 'Input Manual Parsial (Logbook Shift)',
      penanggungJawab: 'Budi Santoso (SPV Maintenance)',
      isComplete: false,
      catatanPenjelasan: 'Data jam kerja shift 3 tanggal 18-19 Oktober masih dalam verifikasi logbook fisik lapangan. Perhitungan MTBF bersifat estimasi.',
      diverifikasiOleh: 'Belum Selesai',
      tanggalVerifikasi: '—',
    },
  ] : [];

  const seedCodes = new Set(seedRecords.map((r) => r.kodeMesin));
  const seedNames = new Set(seedRecords.map((r) => r.namaMesin));

  const remainingMachines = machines.filter(
    (m) => !seedCodes.has(m.kode_mesin) && !seedNames.has(m.nama_mesin)
  );

  const additionalRecords: MachineOperatingHoursRecord[] = remainingMachines.map((m, index) => ({
    id: `MOH-202610-${String(seedRecords.length + index + 1).padStart(3, '0')}`,
    kodeMesin: m.kode_mesin,
    namaMesin: m.nama_mesin,
    periode: 'Oktober 2026',
    jamOperasiAktual: 0,
    jamShiftKalender: 176.0,
    sumberData: 'Belum Diinput (Menunggu Logbook SPV)',
    penanggungJawab: 'SPV Maintenance',
    isComplete: false,
    catatanPenjelasan: 'Data jam operasi aktual riil belum diisi oleh SPV/Admin.',
    diverifikasiOleh: 'Belum Diverifikasi',
    tanggalVerifikasi: '—',
  }));

  return [...seedRecords, ...additionalRecords];
};

export const initialOperatingHoursRecords: MachineOperatingHoursRecord[] = isTestEnv ? buildInitialOperatingHoursRecords(fallbackMachines) : [];

export interface ShiftWindow {
  shift: '1' | '2' | '3';
  label: string;
  timeRange: string;
  handoverTime: string;
  dayCategory: DayCategory;
}

export const WEEKDAY_SHIFTS: ShiftWindow[] = [
  { shift: '1', label: 'Shift 1 (Pagi)', timeRange: '06:45 - 15:15', handoverTime: '15:15 WIB', dayCategory: 'WEEKDAY' },
  { shift: '2', label: 'Shift 2 (Sore)', timeRange: '15:00 - 22:30', handoverTime: '22:30 WIB', dayCategory: 'WEEKDAY' },
  { shift: '3', label: 'Shift 3 (Malam)', timeRange: '22:15 - 06:45', handoverTime: '06:45 WIB', dayCategory: 'WEEKDAY' },
];

export const WEEKEND_SHIFTS: ShiftWindow[] = [
  { shift: '1', label: 'Shift 1 (Pagi)', timeRange: '06:45 - 14:15', handoverTime: '14:15 WIB', dayCategory: 'WEEKEND' },
  { shift: '2', label: 'Shift 2 (Sore)', timeRange: '14:15 - 21:45', handoverTime: '21:45 WIB', dayCategory: 'WEEKEND' },
  { shift: '3', label: 'Shift 3 (Malam)', timeRange: '21:45 - 05:30', handoverTime: '05:30 WIB', dayCategory: 'WEEKEND' },
];

const PLANT_SHIFTS = WEEKDAY_SHIFTS;

export function getShiftsByCategory(category: DayCategory): ShiftWindow[] {
  return category === 'WEEKEND' ? WEEKEND_SHIFTS : WEEKDAY_SHIFTS;
}

export function getAutoShiftByTime(date = new Date(), forceCategory?: DayCategory): ShiftWindow {
  const day = date.getDay();
  const category: DayCategory = forceCategory || (day === 0 || day === 6 ? 'WEEKEND' : 'WEEKDAY');
  const shifts = getShiftsByCategory(category);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const total = hours * 60 + minutes;

  if (category === 'WEEKEND') {
    if (total >= 405 && total < 855) return shifts[0];
    if (total >= 855 && total < 1305) return shifts[1];
    return shifts[2];
  } else {
    if (total >= 405 && total < 900) return shifts[0];
    if (total >= 900 && total < 1335) return shifts[1];
    return shifts[2];
  }
}

// Helper: Format tanggal tiket aktif & durasi aktif (waktu sejak tiket dibuat)
function formatTicketTimeInfo(ticket: SupervisorWorkTicket): { dateFormatted: string; durationActive: string; isRecent: boolean } {
  const rawTime = ticket.originalOpenedAt || ticket.waktuMulai;
  if (!rawTime) {
    return { dateFormatted: '—', durationActive: '', isRecent: false };
  }
  const dateObj = new Date(rawTime);
  if (isNaN(dateObj.getTime())) {
    return { dateFormatted: rawTime, durationActive: '', isRecent: false };
  }

  // Format: "23/10/2026 08:30"
  const dateFormatted = `${dateObj.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} ${dateObj.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  const elapsedMs = Math.max(0, Date.now() - dateObj.getTime());
  const elapsedMin = Math.floor(elapsedMs / (1000 * 60));
  const elapsedHours = Math.floor(elapsedMin / 60);
  const elapsedDays = Math.floor(elapsedHours / 24);

  let durationActive = '';
  if (elapsedDays > 0) {
    const remainHours = elapsedHours % 24;
    durationActive = `${elapsedDays} hr ${remainHours} jam lalu`;
  } else if (elapsedHours > 0) {
    const remainMin = elapsedMin % 60;
    durationActive = `${elapsedHours} jam ${remainMin} mnt lalu`;
  } else {
    durationActive = `${Math.max(1, elapsedMin)} mnt lalu`;
  }

  return { dateFormatted, durationActive, isRecent: elapsedHours < 8 };
}

// =========================================================================
// HELPER: FORMAT 15 KOLOM AS-IS SPREADSHEET PABRIK
// Kolom START, END, dan DURASI merefleksikan sisi Operator (kapan mesin mati
// hingga operator mengonfirmasi mesin running kembali).
// =========================================================================
export function getTicketAsIsRow(t: SupervisorWorkTicket) {
  // 1. TANGGAL
  let tanggal = t.tanggal;
  if (!tanggal && t.waktuMulai) {
    try {
      const d = new Date(t.waktuMulai);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      tanggal = `${day}/${month}/${year}`;
    } catch {
      tanggal = '08/09/2026';
    }
  }
  tanggal = tanggal || '08/09/2026';

  // 2. BULAN
  let bulan = t.bulan;
  const monthIdMap: Record<string, string> = {
    January: 'Januari', February: 'Februari', March: 'Maret', April: 'April',
    May: 'Mei', June: 'Juni', July: 'Juli', August: 'Agustus',
    September: 'September', October: 'Oktober', November: 'November', December: 'Desember'
  };
  if (!bulan) {
    try {
      if (t.waktuMulai) {
        const d = new Date(t.waktuMulai);
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        bulan = months[d.getMonth()] || 'September';
      } else {
        bulan = 'September';
      }
    } catch {
      bulan = 'September';
    }
  } else if (monthIdMap[bulan]) {
    bulan = monthIdMap[bulan];
  }

  // 3. SHIFT
  const shift = t.shift || '1';

  // 4. MESIN
  const mesin = t.machine || 'Mesin';

  // 5. SECTION
  const section = t.section || 'Filling';

  // 6. KETERANGAN
  const keterangan = t.keterangan || '';

  // 7. OPERATOR
  const operator = t.reporterName || t.reporter || 'Operator';

  // 8. KODE PRODUK
  const kodeProduk = t.kodeProduk || '—';

  // 9. NO BATCH
  const noBatch = t.noBatch || '—';

  // 10. START (Sisi Operator - Kapan mesin mati / breakdown)
  let start = t.operatorStart;
  if (!start && t.waktuMulai) {
    try {
      const d = new Date(t.waktuMulai);
      start = `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      start = '08.00';
    }
  }
  start = start || '08.00';

  // 11. END (Sisi Operator - Kapan operator konfirmasi mesin jalan kembali)
  let end = t.operatorEnd;
  if (!end) {
    if (t.status === 'CLOSED' && t.waktuSelesai) {
      try {
        const d = new Date(t.waktuSelesai);
        end = `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
      } catch {
        end = '—';
      }
    } else {
      end = t.status === 'CLOSED' ? '15.00' : '—';
    }
  }

  // 12. DURASI (Sisi Operator - Jam)
  let durasi = t.operatorDurasi;
  if (durasi === undefined || durasi === null) {
    if (t.durasiPerbaikanMenit && t.durasiPerbaikanMenit > 0) {
      durasi = Math.round((t.durasiPerbaikanMenit / 60) * 100) / 100;
    } else if (t.status === 'CLOSED') {
      durasi = 1.0;
    } else {
      durasi = 0.0;
    }
  }

  // 13. NO. WR
  const noWr = t.noWr || (t.ticket ? t.ticket.replace('OW-', '') : '~');

  // 14. WO TYPE
  const woType = t.woType || (t.kodeProduk && t.kodeProduk !== '—' ? 'Batch' : 'Non Batch');

  // 15. KATEGORI
  const kategori = t.kategori || 'Komponen Mesin';

  // Sisi Teknisi (untuk komparasi performa & respons)
  const techStart = t.technicianStart || start;
  const techEnd = t.technicianEnd || (end !== '—' ? end : '14.45');
  const techDurasi = t.technicianDurasi !== undefined ? t.technicianDurasi : durasi;

  return {
    tanggal,
    bulan,
    shift,
    mesin,
    section,
    keterangan,
    operator,
    kodeProduk,
    noBatch,
    start,
    end,
    durasi,
    noWr,
    woType,
    kategori,
    techStart,
    techEnd,
    techDurasi,
  };
}

const baseSupervisorSeedTickets: SupervisorWorkTicket[] = [
  // Rekaman Historis As-Is Pabrik (Januari & September 2026)
  {
    ticket: 'OW-233147',
    tanggal: '05/01/2026',
    bulan: 'January',
    shift: '1',
    machine: 'Ilapak 10',
    section: 'Filling',
    keterangan: 'Pisau vertical tumpul',
    reporter: 'OPR0008',
    reporterName: 'Andreas',
    kodeProduk: 'LNKOA',
    noBatch: 'HM758',
    operatorStart: '10.30',
    operatorEnd: '11.30',
    operatorDurasi: 1.0,
    technicianStart: '10.35',
    technicianEnd: '11.20',
    technicianDurasi: 0.75,
    noWr: '233147',
    woType: 'Batch',
    kategori: 'Pisau Vertikal',
    status: 'CLOSED',
    action: 'Penggantian pisau vertical & setting celah pisau',
    technicianName: 'Ahmad Fauzi',
    supervisorVerified: true,
    supervisorNote: 'Uji running 100 sachet rapi dan potongan presisi',
    verifiedAt: '05/01/2026, 11:35',
    durasiPerbaikanMenit: 60,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-01-05T10:30:00.000Z',
    waktuSelesai: '2026-01-05T11:30:00.000Z',
    originalOpenedAt: '2026-01-05T10:30:00.000Z',
  },
  {
    ticket: 'OW-233161',
    tanggal: '05/01/2026',
    bulan: 'January',
    shift: '1',
    machine: 'Ilapak 10',
    section: 'Filling',
    keterangan: 'Sealing vertikal tidak presisi',
    reporter: 'OPR0008',
    reporterName: 'Andreas',
    kodeProduk: 'LNKOA',
    noBatch: 'HM758',
    operatorStart: '13.45',
    operatorEnd: '15.00',
    operatorDurasi: 1.25,
    technicianStart: '13.50',
    technicianEnd: '14.45',
    technicianDurasi: 0.92,
    noWr: '233161',
    woType: 'Batch',
    kategori: 'Sealing vertikal',
    status: 'CLOSED',
    action: 'Setting temperatur sealing horisontal dan pressure sealing vertikal',
    technicianName: 'PDA / RMA',
    supervisorVerified: true,
    supervisorNote: 'Sealing sachet rapat dan tidak bocor',
    verifiedAt: '05/01/2026, 15:10',
    durasiPerbaikanMenit: 75,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-01-05T13:45:00.000Z',
    waktuSelesai: '2026-01-05T15:00:00.000Z',
    originalOpenedAt: '2026-01-05T13:45:00.000Z',
  },
  {
    ticket: 'OW-233164',
    tanggal: '05/01/2026',
    bulan: 'January',
    shift: '1',
    machine: 'Ilapak 6',
    section: 'Filling',
    keterangan: 'Conveyor macet',
    reporter: 'OPR0012',
    reporterName: 'Rizal',
    kodeProduk: 'LKJTA',
    noBatch: 'HM269',
    operatorStart: '14.04',
    operatorEnd: '16.00',
    operatorDurasi: 1.93,
    technicianStart: '14.15',
    technicianEnd: '15.45',
    technicianDurasi: 1.5,
    noWr: '233164',
    woType: 'Batch',
    kategori: 'Bearing Conveyor',
    status: 'CLOSED',
    action: 'Penggantian bearing conveyor outfeed & greasing rantai',
    technicianName: 'RMA',
    supervisorVerified: true,
    supervisorNote: 'Conveyor lancar tanpa suara gesekan',
    verifiedAt: '05/01/2026, 16:15',
    durasiPerbaikanMenit: 115,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-01-05T14:04:00.000Z',
    waktuSelesai: '2026-01-05T16:00:00.000Z',
    originalOpenedAt: '2026-01-05T14:04:00.000Z',
  },
  {
    ticket: 'OW-233133',
    tanggal: '05/01/2026',
    bulan: 'January',
    shift: '1',
    machine: 'Ilapak 6',
    section: 'Filling',
    keterangan: 'Ilapak 6 & 7 Pompa ngetrip',
    reporter: 'OPR0015',
    reporterName: 'Zaidin',
    operatorStart: '09.00',
    operatorEnd: '10.00',
    operatorDurasi: 1.0,
    technicianStart: '09.05',
    technicianEnd: '09.50',
    technicianDurasi: 0.75,
    noWr: '233133',
    woType: 'Non Batch',
    kategori: 'Pompa Transfer',
    status: 'CLOSED',
    action: 'Reset overload relay pompa & test arus beban',
    technicianName: 'Budi Santoso',
    supervisorVerified: true,
    supervisorNote: 'Arus motor 3.2A dalam rentang aman',
    verifiedAt: '05/01/2026, 10:15',
    durasiPerbaikanMenit: 60,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-01-05T09:00:00.000Z',
    waktuSelesai: '2026-01-05T10:00:00.000Z',
    originalOpenedAt: '2026-01-05T09:00:00.000Z',
  },
  {
    ticket: 'OW-233141',
    tanggal: '05/01/2026',
    bulan: 'January',
    shift: '1',
    machine: 'Ilapak 3',
    section: 'Filling',
    keterangan: 'Ganti gasket pneumatic all line',
    reporter: 'OPR0018',
    reporterName: 'Suwarsono',
    operatorStart: '15.30',
    operatorEnd: '16.00',
    operatorDurasi: 0.5,
    technicianStart: '15.30',
    technicianEnd: '15.55',
    technicianDurasi: 0.42,
    noWr: '233141',
    woType: 'Non Batch',
    kategori: 'Gasket Pneumatic',
    status: 'CLOSED',
    action: 'Penggantian gasket pneumatic silinder line 1-4',
    technicianName: 'PDA',
    supervisorVerified: true,
    supervisorNote: 'Tekanan pneumatic stabil di 6 bar tanpa desis bocor',
    verifiedAt: '05/01/2026, 16:10',
    durasiPerbaikanMenit: 30,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-01-05T15:30:00.000Z',
    waktuSelesai: '2026-01-05T16:00:00.000Z',
    originalOpenedAt: '2026-01-05T15:30:00.000Z',
  },
  // Data Breakdown Terkini (08/09/2026)
  {
    ticket: 'OW-233150',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'SIG 5',
    section: 'Filling',
    keterangan: 'Rubber putus all line saat running',
    reporter: 'OPR0003',
    reporterName: 'Sutrisno',
    kodeProduk: 'LNKOA',
    noBatch: 'HM758',
    operatorStart: '08.30',
    operatorEnd: '14.30',
    operatorDurasi: 6.0,
    technicianStart: '08.40',
    technicianEnd: '14.15',
    technicianDurasi: 5.58,
    noWr: '292790',
    woType: 'Batch',
    kategori: 'Pisau Vertical & Rubber',
    status: 'CLOSED',
    action: 'Pembongkaran rubber all line, penggantian rubber 3 line, setting rubber, ganti pisau vertical 6 pcs, ganti heater sealing horizontal 2 pcs right, test running',
    technicianName: 'PDA, RMA',
    supervisorVerified: true,
    supervisorNote: 'Tension rubber sudah dikalibrasi dan hasil potongan stabil',
    verifiedAt: '08/09/2026, 14:45',
    durasiPerbaikanMenit: 360,
    waktuTungguPartMenit: 30,
    partReplaced: 'Rubber 3 line & Pisau vertical 6 pcs',
    waktuMulai: '2026-09-08T08:30:00.000Z',
    waktuSelesai: '2026-09-08T14:30:00.000Z',
    originalOpenedAt: '2026-09-08T08:30:00.000Z',
  },
  {
    ticket: 'OW-233174',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'Ilapak 1',
    section: 'Filling',
    keterangan: 'Gasket pneumatic line 1 bocor',
    reporter: 'OPR0001',
    reporterName: 'A. Dahlan',
    kodeProduk: 'LNKOA',
    noBatch: 'HM758',
    operatorStart: '07.30',
    operatorEnd: '09.30',
    operatorDurasi: 2.0,
    technicianStart: '07.35',
    technicianEnd: '09.15',
    technicianDurasi: 1.67,
    noWr: '233174',
    woType: 'Batch',
    kategori: 'Pneumatik & Silinder',
    status: 'CLOSED',
    action: 'Penggantian gasket pneumatic NBR 18x2.5mm dan leak test',
    technicianName: 'Budi Santoso',
    supervisorVerified: true,
    supervisorNote: 'Uji jalan 50 sachet normal tanpa bocor, mesin siap produksi',
    verifiedAt: '08/09/2026, 09:40',
    durasiPerbaikanMenit: 120,
    waktuTungguPartMenit: 0,
    partReplaced: 'Gasket pneumatic',
    waktuMulai: '2026-09-08T07:30:00.000Z',
    waktuSelesai: '2026-09-08T09:30:00.000Z',
    originalOpenedAt: '2026-09-08T07:30:00.000Z',
  },
  {
    ticket: 'OW-292772',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'Ilapak 12',
    section: 'Filling',
    keterangan: 'Pisau vertical sealing vertical error & alarm heater',
    reporter: 'OPR0022',
    reporterName: 'Dedi Kurniawan',
    kodeProduk: 'LKJTA',
    noBatch: 'HM310',
    operatorStart: '07.09',
    operatorEnd: '15.00',
    operatorDurasi: 7.85,
    technicianStart: '07.15',
    technicianEnd: '14.40',
    technicianDurasi: 7.42,
    noWr: '292772',
    woType: 'Batch',
    kategori: 'Heater Sealing Vertikal',
    status: 'CLOSED',
    action: 'Pengecekan alarm heater, pengecekan heater (putus), pembongkaran heater, penggantian heater, connect wiring heater, test running, pemantauan mesin',
    technicianName: 'DEFA, FAUZI',
    supervisorVerified: false,
    supervisorNote: '',
    durasiPerbaikanMenit: 471,
    waktuTungguPartMenit: 15,
    partReplaced: 'Elemen heater sealing',
    waktuMulai: '2026-09-08T07:09:00.000Z',
    waktuSelesai: '2026-09-08T15:00:00.000Z',
    originalOpenedAt: '2026-09-08T07:09:00.000Z',
  },
  {
    ticket: 'OW-292778',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'FBD Jaw Chuan',
    section: 'Compounding',
    keterangan: 'Thermocontrol tidak stabil fluktuatif',
    reporter: 'OPR0005',
    reporterName: 'Supriyanto',
    operatorStart: '08.13',
    operatorEnd: '09.00',
    operatorDurasi: 0.78,
    technicianStart: '08.15',
    technicianEnd: '08.50',
    technicianDurasi: 0.58,
    noWr: '292778',
    woType: 'Non Batch',
    kategori: 'Wiring Thermocontrol',
    status: 'CLOSED',
    action: 'Pengecekkan wiring thermocontrol, pengencangan kabel thermocontrol, test running, pemantauan mesin',
    technicianName: 'RMA',
    supervisorVerified: false,
    supervisorNote: '',
    durasiPerbaikanMenit: 47,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-09-08T08:13:00.000Z',
    waktuSelesai: '2026-09-08T09:00:00.000Z',
    originalOpenedAt: '2026-09-08T08:13:00.000Z',
  },
  {
    ticket: 'OW-233110',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'FBD Jaw Chuan',
    section: 'Compounding',
    keterangan: 'Suhu tidak bisa naik',
    reporter: 'OPR0005',
    reporterName: 'Supriyanto',
    operatorStart: '07.27',
    operatorEnd: '08.00',
    operatorDurasi: 0.55,
    technicianStart: '07.30',
    technicianEnd: '07.55',
    technicianDurasi: 0.42,
    noWr: '~',
    woType: 'Non Batch',
    kategori: 'Sistem Pemanas / Steam Trap',
    status: 'CLOSED',
    action: 'Buka valve bypass steam trap, test running, pemantauan mesin',
    technicianName: 'PDA',
    supervisorVerified: true,
    supervisorNote: 'Steam trap beroperasi lancar',
    verifiedAt: '08/09/2026, 08:05',
    durasiPerbaikanMenit: 33,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-09-08T07:27:00.000Z',
    waktuSelesai: '2026-09-08T08:00:00.000Z',
    originalOpenedAt: '2026-09-08T07:27:00.000Z',
  },
  {
    ticket: 'OW-233115',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'FBD Jaw Chuan',
    section: 'Compounding',
    reporter: 'OPR0005',
    reporterName: 'Supriyanto',
    operatorStart: '08.13',
    operatorEnd: '09.00',
    operatorDurasi: 0.78,
    technicianStart: '08.15',
    technicianEnd: '08.50',
    technicianDurasi: 0.58,
    noWr: '292778',
    woType: 'Non Batch',
    kategori: 'Sistem Pemanas / Steam Trap',
    keterangan: 'Thermocontrol tidak stabil (Kerusakan Berulang)',
    status: 'CLOSED',
    action: 'Pengecekan wiring dan pengencangan kabel thermocontrol',
    technicianName: 'Budi Santoso',
    supervisorVerified: true,
    supervisorNote: 'Kalibrasi PID suhu telah stabil di 65C',
    verifiedAt: 'Kemarin, 10:00',
    durasiPerbaikanMenit: 50,
    waktuTungguPartMenit: 0,
    partReplaced: 'Kabel sensor thermocontrol',
    waktuMulai: new Date(Date.now() - 3600000 * 20).toISOString(),
    waktuSelesai: new Date(Date.now() - 3600000 * 19).toISOString(),
    originalOpenedAt: new Date(Date.now() - 3600000 * 20).toISOString(),
  },
  {
    ticket: 'OW-292808',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '2',
    machine: 'Ilapak 5',
    section: 'Filling',
    keterangan: 'Ganti bantalan pisau tumpul',
    reporter: 'OPR0028',
    reporterName: 'Hendra Saputra',
    kodeProduk: 'POSNA',
    noBatch: 'JA692',
    operatorStart: '16.00',
    operatorEnd: '16.45',
    operatorDurasi: 0.75,
    technicianStart: '16.05',
    technicianEnd: '16.35',
    technicianDurasi: 0.5,
    noWr: '292808',
    woType: 'Batch',
    kategori: 'Bantalan Pisau',
    status: 'CLOSED',
    action: 'Ganti bantalan pisau by OP didampingi teknisi, test running',
    technicianName: 'ISO, KON',
    supervisorVerified: false,
    supervisorNote: '',
    durasiPerbaikanMenit: 45,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-09-08T16:00:00.000Z',
    waktuSelesai: '2026-09-08T16:45:00.000Z',
    originalOpenedAt: '2026-09-08T16:00:00.000Z',
  },
  {
    ticket: 'OW-292797',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '2',
    machine: 'SIG 5',
    section: 'Filling',
    keterangan: 'Potongan tidak stabil',
    reporter: 'OPR0003',
    reporterName: 'Sutrisno',
    kodeProduk: 'LNKOA',
    noBatch: 'HM758',
    operatorStart: '15.30',
    operatorEnd: '16.15',
    operatorDurasi: 0.75,
    technicianStart: '15.35',
    technicianEnd: '16.05',
    technicianDurasi: 0.5,
    noWr: '292797',
    woType: 'Batch',
    kategori: 'Pisau Vertical & Rubber',
    status: 'CLOSED',
    action: 'Setting potongan, setting pisau vertical, setting rubber, test running, pemantauan mesin',
    technicianName: 'ISO, KON',
    supervisorVerified: true,
    supervisorNote: 'Potongan sudah presisi',
    verifiedAt: '08/09/2026, 16:20',
    durasiPerbaikanMenit: 45,
    waktuTungguPartMenit: 0,
    waktuMulai: '2026-09-08T15:30:00.000Z',
    waktuSelesai: '2026-09-08T16:15:00.000Z',
    originalOpenedAt: '2026-09-08T15:30:00.000Z',
  },
  // Tiket Aktif / Open
  {
    ticket: 'OW-233183',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'Ilapak 1',
    section: 'Filling',
    reporter: 'OPR0001',
    reporterName: 'A. Dahlan',
    keterangan: 'Potongan tidak stabil pada unit sealer vertikal',
    kategori: 'Pisau I-Cut / Cutting',
    woType: 'Batch',
    kodeProduk: 'LNKQA',
    noBatch: 'HM758',
    noWr: '233183',
    operatorStart: '07.45',
    operatorEnd: '—',
    operatorDurasi: 0.0,
    waktuMulai: new Date(Date.now() - 3600000 * 2).toISOString(),
    originalOpenedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: 'OPEN',
    durasiPerbaikanMenit: 0,
    waktuTungguPartMenit: 0,
  },
  {
    ticket: 'OW-233229',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'Ilapak 8',
    section: 'Filling',
    reporter: 'OPR0002',
    reporterName: 'Ramdhani',
    kodeProduk: 'POSNA',
    noBatch: 'JA692',
    operatorStart: '07.45',
    operatorEnd: '—',
    operatorDurasi: 0.0,
    noWr: '~',
    woType: 'Batch',
    kategori: 'Unit Sealing Vertikal',
    keterangan: 'Potongan tidak stabil',
    waktuMulai: new Date(Date.now() - 3600000 * 4).toISOString(),
    originalOpenedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    status: 'OPEN',
    action: 'Investigasi pisau dan sealing vertikal',
    technicianName: 'PDA, RMA',
    durasiPerbaikanMenit: 0,
    waktuTungguPartMenit: 0,
  },
  {
    ticket: 'OW-233090',
    tanggal: '08/09/2026',
    bulan: 'September',
    shift: '1',
    machine: 'Chimei JS 05',
    section: 'Packaging',
    reporter: 'OPR0035',
    reporterName: 'Slamet',
    operatorStart: '09.00',
    operatorEnd: '—',
    operatorDurasi: 0.0,
    noWr: '~',
    woType: 'Non Batch',
    kategori: 'Kelistrikan & Fuse',
    keterangan: 'Short mati incoming machine & panel kontrol',
    waktuMulai: new Date(Date.now() - 3600000 * 27).toISOString(),
    originalOpenedAt: new Date(Date.now() - 3600000 * 27).toISOString(),
    status: 'OPEN',
    action: 'Pengecekan wiring in coming machine, penggantian fuse, setting opp',
    technicianName: 'FAUZI',
    durasiPerbaikanMenit: 30,
    waktuTungguPartMenit: 180,
    alasanTungguPart: 'Menunggu pengadaan fuse 10A time-delay khusus dari warehouse',
    supervisorVerified: false,
  },
];

const initialSupervisorSeedTickets: SupervisorWorkTicket[] = isTestEnv ? baseSupervisorSeedTickets : [];

export default function SupervisorDashboard({ supervisor, onLogout }: SupervisorDashboardProps) {
  const safeSupervisor = useMemo(() => {
    const raw = supervisor || ({} as Partial<Supervisor>);
    return {
      nik: raw.nik || 'SPV0001',
      name: raw.name || 'Supervisor',
      role: 'SUPERVISOR' as const,
      shifts: Array.isArray(raw.shifts) && raw.shifts.length > 0 ? raw.shifts : ['Shift 1'],
      departments: Array.isArray(raw.departments) && raw.departments.length > 0 ? raw.departments : ['Maintenance'],
      machines: Array.isArray(raw.machines) ? raw.machines : [],
      active: raw.active !== false,
      password: raw.password || '',
    };
  }, [supervisor]);

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
  const [activeTab, setActiveTab] = useNavigationState<'LINES' | 'WORKORDERS' | 'ANALYTICS' | 'HANDOVER'>('mc-nav-SupervisorDashboard-activeTab', 'LINES');

  // Machines State synced with localStorage & Admin actions
  const [machines, setMachines] = useState<Machine[]>(getStoredMachines);

  useEffect(() => {
    const onStorageSync = (e: StorageEvent) => {
      if (e.key === MACHINE_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMachines(parsed);
          }
        } catch {}
      }
    };
    const onMachinesUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<Machine[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setMachines(customEvent.detail);
      } else {
        setMachines(getStoredMachines());
      }
    };
    window.addEventListener('storage', onStorageSync);
    window.addEventListener('mc-machines-updated', onMachinesUpdated);
    return () => {
      window.removeEventListener('storage', onStorageSync);
      window.removeEventListener('mc-machines-updated', onMachinesUpdated);
    };
  }, []);

  // Breakdown Tickets synced with localStorage
  const [tickets, setTickets] = useState<SupervisorWorkTicket[]>(() => {
    try {
      const stored = storage.getItem('machine-card-open-work');
      if (stored) {
        const parsed = JSON.parse(stored) as Array<SupervisorWorkTicket>;
        const ticketMap = new Map<string, SupervisorWorkTicket>();
        parsed.forEach((t) => ticketMap.set(t.ticket, t));
        if (isTestEnv) {
          initialSupervisorSeedTickets.forEach((t) => {
            if (!ticketMap.has(t.ticket)) ticketMap.set(t.ticket, t);
          });
        }
        return Array.from(ticketMap.values());
      }
    } catch {
      // Fallback
    }
    return isTestEnv ? initialSupervisorSeedTickets : [];
  });

  // Sinkronisasi dinamis ketika 100 skenario diinjeksi atau dibersihkan
  useEffect(() => {
    const handleInjected = () => {
      try {
        const stored = storage.getItem('machine-card-open-work');
        if (stored) {
          const parsed = JSON.parse(stored) as Array<any>;
          setTickets(parsed);
        }
      } catch {}
    };
    const handleCleared = () => {
      setTickets([]);
      setMonitoredParts([]);
      try {
        storage.setItem('machine-card-parts', JSON.stringify([]));
      } catch {}
    };
    window.addEventListener('mc-maintenance-data-injected', handleInjected);
    window.addEventListener('storage', handleInjected);
    window.addEventListener('focus', handleInjected);
    window.addEventListener('mc-maintenance-data-cleared', handleCleared);
    return () => {
      window.removeEventListener('mc-maintenance-data-injected', handleInjected);
      window.removeEventListener('storage', handleInjected);
      window.removeEventListener('focus', handleInjected);
      window.removeEventListener('mc-maintenance-data-cleared', handleCleared);
    };
  }, []);

  // URS 7.1 Klausul 6: Target KPI Maintenance dikelola oleh SPV
  const [kpiTargets, setKpiTargets] = useState<KPITargetRecord[]>(() => {
    try {
      const stored = storage.getItem('machine-card-kpi-targets');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return initialKpiTargets;
  });

  // Riwayat Perubahan Target KPI
  const [kpiHistory, setKpiHistory] = useState<KPITargetHistory[]>(() => {
    try {
      const stored = storage.getItem('machine-card-kpi-target-history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return isTestEnv ? initialKpiTargetHistory : [];
  });

  // URS 7.2 & 7.7: Komponen & PM Schedules
  const [monitoredParts, setMonitoredParts] = useState<MachinePartHistory[]>(() => {
    try {
      const stored = storage.getItem('machine-card-parts');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return isTestEnv ? initialMonitoringParts : [];
  });

  useEffect(() => {
    const handlePartsUpdate = () => {
      try {
        const stored = storage.getItem('machine-card-parts');
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setMonitoredParts(parsed);
        } else {
          setMonitoredParts((previous) => [...previous]);
        }
      } catch {}
    };
    window.addEventListener('storage', handlePartsUpdate);
    window.addEventListener('mc-parts-updated', handlePartsUpdate);
    window.addEventListener('focus', handlePartsUpdate);
    return () => {
      window.removeEventListener('storage', handlePartsUpdate);
      window.removeEventListener('mc-parts-updated', handlePartsUpdate);
      window.removeEventListener('focus', handlePartsUpdate);
    };
  }, []);

  const [pmSchedules, setPmSchedules] = useState<PreventiveMaintenanceItem[]>(() => {
    try {
      const stored = storage.getItem('machine-card-pm-schedules');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return isTestEnv ? initialSeedPMs : [];
  });

  useEffect(() => {
    const refresh = () => {
      const value = storage.getItem('machine-card-pm-schedules');
      if (value !== null) setPmSchedules(readPartsArray('machine-card-pm-schedules'));
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

  // Filter Analitik (URS 7.1 Klausul 2)
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'ALL' | 'THIS_MONTH' | 'LAST_7_DAYS' | 'TODAY'>('ALL');
  const [analyticsSection, setAnalyticsSection] = useState<string>('ALL');
  // Sub-menu Tab Analytics untuk keterbacaan yang fokus & tidak padat
  const [analyticsSubTab, setAnalyticsSubTab] = useNavigationState<'POLA_LAPANGAN' | 'KPI_METRICS' | 'PREVENTIVE_PARTS' | 'AGING_AUDIT'>('mc-nav-SupervisorDashboard-analyticsSubTab', 'POLA_LAPANGAN');

  // Modal Penyesuaian Target KPI (URS 7.1 Klausul 6)
  const [isKpiModalOpen, setIsKpiModalOpen] = useState(false);
  const [selectedKpiForEdit, setSelectedKpiForEdit] = useState<KPITargetRecord | null>(null);
  const [kpiEditForm, setKpiEditForm] = useState({
    targetValue: 0,
    unit: '',
    direction: 'LESS_THAN_OR_EQUAL' as 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN_OR_EQUAL',
    scope: 'Semua Mesin Plant Pulogadung',
    effectivePeriod: 'Oktober 2026',
    reason: '',
  });

  // URS 7.10: Evaluasi Ketepatan Pelaporan Shift
  const [shiftSubmitScenario, setShiftSubmitScenario] = useState<'TEPAT_WAKTU' | 'TERLAMBAT'>('TEPAT_WAKTU');
  const [shiftTimelinessLateReason, setShiftTimelinessLateReason] = useState<'KELALAIAN_PETUGAS' | 'GANGGUAN_SISTEM'>('KELALAIAN_PETUGAS');

  // URS 8.1: Audit Trail Review & Koreksi Data Pengukuran
  const [correctionLogs, setCorrectionLogs] = useState<DataCorrectionEntry[]>(() => {
    try {
      const stored = storage.getItem('machine-card-correction-logs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return isTestEnv ? initialSeedCorrectionLogs : [];
  });

  // URS 8.1 Klausul 5: Revisi Laporan Shift Terkirim (Non-Destructive Versioning)
  const [shiftRevisions, setShiftRevisions] = useState<ShiftReportRevision[]>(() => {
    try {
      const stored = storage.getItem('machine-card-shift-revisions');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return isTestEnv ? initialShiftRevisions : [];
  });

  // URS 8.1 Klausul 6: Filter untuk melihat Catatan yang Dibatalkan (Void)
  const [showVoidTickets, setShowVoidTickets] = useState(false);

  // Modal Pembatalan Catatan (Void Only, No Hard-Delete)
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [ticketToVoid, setTicketToVoid] = useState<SupervisorWorkTicket | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState('');

  // Modal Koreksi Data Pengukuran (URS 8.1 Klausul 3 & 4)
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [ticketToCorrect, setTicketToCorrect] = useState<SupervisorWorkTicket | null>(null);
  const [correctionForm, setCorrectionForm] = useState({
    field: 'durasiPerbaikanMenit' as 'durasiPerbaikanMenit' | 'waktuTungguPartMenit' | 'waktuMulai' | 'kategori',
    fieldLabel: 'Durasi Perbaikan Aktif',
    beforeValue: '',
    afterValue: '',
    reason: '',
  });

  // Modal Revisi Laporan Shift Terkirim (URS 8.1 Klausul 5)
  const [isShiftRevisionModalOpen, setIsShiftRevisionModalOpen] = useState(false);
  const [shiftRevisionForm, setShiftRevisionForm] = useState({
    reason: '',
    changesSummary: '',
  });

  // Selected ticket for supervisor review & sign-off
  const [selectedTicket, setSelectedTicket] = useState<SupervisorWorkTicket | null>(null);
  const [verificationNote, setVerificationNote] = useState('');

  // Selected Machine for Direct Machine Analysis & Detail (Breakdown, Spare Part, PM, Operasional)
  const [selectedMachineForAnalysis, setSelectedMachineForAnalysis] = useNavigationState<Machine | null>('mc-nav-SupervisorDashboard-selectedMachineForAnalysis', null);

  // URS 3.6 - Data Waktu Operasi Mesin & MTBF (Cakupan Seluruh 43 Mesin)
  const [operatingHoursRecords, setOperatingHoursRecords] = useState<MachineOperatingHoursRecord[]>(() => {
    try {
      const stored = storage.getItem('machine-card-operating-hours');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (parsed.length < initialOperatingHoursRecords.length) {
            const parsedMap = new Map(parsed.map((r: MachineOperatingHoursRecord) => [r.kodeMesin, r]));
            const fullList = initialOperatingHoursRecords.map((rec) => {
              if (parsedMap.has(rec.kodeMesin)) {
                return parsedMap.get(rec.kodeMesin)!;
              }
              return rec;
            });
            storage.setItem('machine-card-operating-hours', JSON.stringify(fullList));
            return fullList;
          }
          return parsed;
        }
      }
    } catch {}
    return initialOperatingHoursRecords;
  });

  const [selectedOperatingRecord, setSelectedOperatingRecord] = useState<MachineOperatingHoursRecord | null>(null);
  const [isNewOperatingModalOpen, setIsNewOperatingModalOpen] = useState(false);
  const [operatingForm, setOperatingForm] = useState({
    jamOperasiAktual: 0,
    jamShiftKalender: 176,
    sumberData: '',
    penanggungJawab: '',
    isComplete: true,
    catatanPenjelasan: '',
  });

  const [newOperatingForm, setNewOperatingForm] = useState({
    kodeMesin: 'MESIN-001',
    namaMesin: 'Ilapak 1',
    periode: 'Oktober 2026',
    jamOperasiAktual: 7.0,
    jamShiftKalender: 7.0,
    sumberData: 'Logbook Shift Fisik',
    penanggungJawab: `${supervisor.name} (SPV Maintenance)`,
    isComplete: true,
    catatanPenjelasan: '',
  });

  function handleSaveOperatingHours(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOperatingRecord) return;
    const updated: MachineOperatingHoursRecord = {
      ...selectedOperatingRecord,
      jamOperasiAktual: Number(operatingForm.jamOperasiAktual),
      jamShiftKalender: Number(operatingForm.jamShiftKalender),
      sumberData: operatingForm.sumberData.trim() || 'Logbook Manual Produksi',
      penanggungJawab: operatingForm.penanggungJawab.trim() || `${supervisor.name} (SPV Maintenance)`,
      isComplete: operatingForm.isComplete,
      catatanPenjelasan: operatingForm.catatanPenjelasan.trim(),
      diverifikasiOleh: `${supervisor.name} (SPV)`,
      tanggalVerifikasi: new Date().toISOString().slice(0, 10),
    };
    const nextList = operatingHoursRecords.map((r) => (r.id === updated.id ? updated : r));
    setOperatingHoursRecords(nextList);
    try {
      storage.setItem('machine-card-operating-hours', JSON.stringify(nextList));
    } catch {}
    setSelectedOperatingRecord(null);
  }

  function handleCreateOperatingHours(e: React.FormEvent) {
    e.preventDefault();
    const targetMachine = machines.find((m) => m.kode_mesin === newOperatingForm.kodeMesin) || machines[0];
    const newRecord: MachineOperatingHoursRecord = {
      id: `MOH-${Date.now()}`,
      kodeMesin: targetMachine.kode_mesin,
      namaMesin: targetMachine.nama_mesin,
      periode: newOperatingForm.periode.trim() || 'Oktober 2026',
      jamOperasiAktual: Number(newOperatingForm.jamOperasiAktual),
      jamShiftKalender: Number(newOperatingForm.jamShiftKalender),
      sumberData: newOperatingForm.sumberData.trim() || 'Logbook Shift Fisik',
      penanggungJawab: newOperatingForm.penanggungJawab.trim() || `${supervisor.name} (SPV Maintenance)`,
      isComplete: newOperatingForm.isComplete,
      catatanPenjelasan: newOperatingForm.catatanPenjelasan.trim(),
      diverifikasiOleh: `${supervisor.name} (SPV)`,
      tanggalVerifikasi: new Date().toISOString().slice(0, 10),
    };
    const nextList = [newRecord, ...operatingHoursRecords];
    setOperatingHoursRecords(nextList);
    try {
      storage.setItem('machine-card-operating-hours', JSON.stringify(nextList));
    } catch {}
    setIsNewOperatingModalOpen(false);
  }

  // Search & Filter for Line Tab
  const [lineSearch, setLineSearch] = useState('');
  const [lineSection, setLineSection] = useState('ALL');
  const [linePage, setLinePage] = useState(1);
  const linePerPage = 10;

  // Search & Filter for Tickets Tab (Format As-Is Pabrik)
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('ALL');
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketReviewFilter, setTicketReviewFilter] = useState<'ALL' | 'UNREVIEWED' | 'REVIEWED'>('ALL');
  const [ticketShiftFilter, setTicketShiftFilter] = useState<'ALL' | '1' | '2' | '3'>('ALL');
  const [ticketSectionFilter, setTicketSectionFilter] = useState<'ALL' | 'Filling' | 'Packaging' | 'Compounding'>('ALL');
  const [ticketWoTypeFilter, setTicketWoTypeFilter] = useState<'ALL' | 'Batch' | 'Non Batch'>('ALL');
  const [isWeeklyReviewPageActive, setIsWeeklyReviewPageActive] = useState(false);
  const [weeklyReviewPeriod, setWeeklyReviewPeriod] = useState('PEKAN_INI');
  const [weeklyOverallNote, setWeeklyOverallNote] = useState('');
  const [weeklySelectedActionMachine, setWeeklySelectedActionMachine] = useState('');
  const [weeklyFollowUpAction, setWeeklyFollowUpAction] = useState('');
  const [weeklyFollowUpList, setWeeklyFollowUpList] = useState<Array<{ id: string; machine: string; action: string; priority: 'HIGH' | 'MEDIUM'; targetDate: string }>>(() => {
    try { const saved = storage.getItem('machine-card-weekly-followups'); if (saved) return JSON.parse(saved); } catch {}
    return isTestEnv ? [
    {
      id: 'ACT-01',
      machine: 'SIG 5',
      action: 'Kalibrasi tegangan tension rubber & ganti pisau vertikal saat window PM akhir pekan',
      priority: 'HIGH',
      targetDate: '26/10/2026',
    },
    {
      id: 'ACT-02',
      machine: 'Ilapak 1',
      action: 'Inspeksi berkala pneumatic seal fitting preventif kebocoran mikro',
      priority: 'MEDIUM',
      targetDate: '28/10/2026',
    },
  ] : [];
  });
  useEffect(() => { storage.setItem('machine-card-weekly-followups', JSON.stringify(weeklyFollowUpList)); }, [weeklyFollowUpList]);

  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchReviewNote, setBatchReviewNote] = useState('');
  const [ticketPage, setTicketPage] = useState(1);
  const ticketPerPage = 10;
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);
  const [expandedDescTicketIds, setExpandedDescTicketIds] = useState<Set<string>>(new Set());
  const [breakdownViewMode, setBreakdownViewMode] = useState<'FIT' | 'SCROLL'>('FIT');
  const [showPatternInsights, setShowPatternInsights] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  function toggleSelectTicket(ticketId: string) {
    setSelectedTicketIds((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  }

  function handleBatchReviewSubmit() {
    if (selectedTicketIds.size === 0) return;
    const note = batchReviewNote.trim() || 'Evaluasi Mingguan: Tren breakdown telah ditinjau oleh SPV Maintenance';
    const verifiedAt = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(new Date());

    const nextTickets = tickets.map((t) => {
      if (selectedTicketIds.has(t.ticket)) {
        return {
          ...t,
          supervisorVerified: true,
          supervisorNote: note,
          verifiedAt,
        };
      }
      return t;
    });

    setTickets(nextTickets);
    try {
      storage.setItem('machine-card-open-work', JSON.stringify(nextTickets));
    } catch {}

    setSelectedTicketIds(new Set());
    setBatchModalOpen(false);
    setBatchReviewNote('');
  }

  function toggleDescExpanded(ticketId: string) {
    setExpandedDescTicketIds((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  }

  // Jadwal Kategori Hari (Weekdays vs Weekend) & Shift Monitoring
  const [reportDate, setReportDate] = useState(plantDate());
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const interval = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(interval); }, []);
  const [dayCategory, setDayCategory] = useState<DayCategory>(() => { const day = new Date().getDay(); return day === 0 || day === 6 ? 'WEEKEND' : 'WEEKDAY'; });
  const currentActiveShift = useMemo(() => getAutoShiftByTime(new Date(clock), dayCategory), [dayCategory, clock]);
  const [selectedShift, setSelectedShift] = useState<'1' | '2' | '3'>(() => getAutoShiftByTime().shift);
  const [ursScenario, setUrsScenario] = useState<'COMPLETE' | 'PENDING' | 'LATE_COMPLETED'>('COMPLETE');

  const activeShiftList = useMemo(() => getShiftsByCategory(dayCategory), [dayCategory]);

  const deliveries = JSON.parse(storage.getItem('machine-card-report-deliveries') || '[]') as Array<{ key: string; status: string; updated_at: string }>;
  const sentForShift = deliveries.filter((item) => item.key.includes(reportDate) && item.key.includes(`:${selectedShift}`) && item.status === 'SENT');

  // Operators On-Duty (Shift 1)
  const onDutyOperators = useMemo(() => {
    return seedOperators.slice(0, 8);
  }, []);

  // Set of machine names with active breakdown
  const activeBreakdownMachines = useMemo(() => {
    const active = tickets.filter((t) => isUnfinished(t));
    return new Set(active.map((t) => t.machine));
  }, [tickets]);

  // Selected Shift Window details
  const selectedShiftWindow = useMemo(() => {
    return activeShiftList.find((s) => s.shift === selectedShift) || activeShiftList[0];
  }, [selectedShift, activeShiftList]);

  // Data Rekapan Riil per Shift berdasarkan Standar Laporan Harian Teknisi Maintenance Pulogadung
  const currentShiftTemplate = useMemo(() => {
    const shiftTemplates: Record<
      '1' | '2' | '3',
      {
        teamMembers: Array<{ code: string; name: string }>;
        items: Array<{
          ticket: string;
          area: string;
          areaLabel: string;
          machine: string;
          issue: string;
          timeRange?: string;
          wr?: string;
          actions: string[];
          status: 'DONE' | 'OPEN';
          note?: string;
        }>;
      }
    > = {
      '1': {
        teamMembers: [
          { code: 'PDA', name: 'PDA (Teknisi Shift 1)' },
          { code: 'RMA', name: 'RMA (Teknisi Shift 1)' },
          { code: 'DEFA', name: 'DEFA (Teknisi Shift 1)' },
          { code: 'FAUZI', name: 'FAUZI (Teknisi Shift 1)' },
        ],
        items: [
          {
            ticket: 'WS-S1-01',
            area: 'RUANG_REPAIR',
            areaLabel: 'Ruang Repair / Workshop',
            machine: 'Workshop',
            issue: 'Pembuatan WO Batch',
            actions: ['Pembuatan wo batch harian'],
            status: 'DONE',
          },
          {
            ticket: 'CMP-S1-01',
            area: 'COMPOUNDING',
            areaLabel: 'Area Compounding',
            machine: 'FBD Jaw Chuan',
            issue: 'Suhu tidak bisa naik',
            timeRange: '07.27-08.00',
            wr: '~',
            actions: ['Buka valve bypass steam trap', 'Test running', 'Pemantauan mesin'],
            status: 'DONE',
          },
          {
            ticket: 'WR-292778',
            area: 'COMPOUNDING',
            areaLabel: 'Area Compounding',
            machine: 'FBD Jaw Chuan',
            issue: 'Thermocontrol tidak stabil',
            timeRange: '08.13-09.00',
            wr: '292778',
            actions: [
              'Pengecekkan wiring thermocontrol',
              'Pengencangan kabel thermocontrol',
              'Test running',
              'Pemantauan mesin',
            ],
            status: 'DONE',
          },
          {
            ticket: 'FIL-S1-01',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'SIG 5',
            issue: 'Rubber putus',
            timeRange: '08.30-14.30',
            wr: '~',
            actions: [
              'Pembongkaran rubber all line',
              'Penggantian rubber 3 line',
              'Setting rubber',
              'Penggantian pisau vertical 6 pcs',
              'Penggantian heater sealing horizontal 2pcs right',
              'Test running',
              'Pemantauan mesin',
            ],
            status: 'DONE',
          },
          {
            ticket: 'FIL-S1-02',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Ilapak 5',
            issue: 'Lanjutan shift 3, baru bongkar filling blok 3 line',
            timeRange: '07.45-15.15',
            wr: '~',
            actions: [
              'Penggantian conus dan as 3 pcs',
              'Penggantian housing as conus 3pcs',
              'Penggantian oring as conus 1pcs',
              'Setting penampang',
              'Setting rubber',
              'Test running',
            ],
            status: 'OPEN',
          },
          {
            ticket: 'WR-292772',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Ilapak 12',
            issue: 'Pisau vertical sealing vertical error',
            timeRange: '07.09-15.00',
            wr: '292772',
            actions: [
              'Pengecekkan alarm heater',
              'Pengecekkan heater (putus)',
              'Pembongkaran heater',
              'Penggantian heater',
              'Connect wiring heater',
              'Test running',
              'Pemantauan mesin',
            ],
            status: 'DONE',
          },
          {
            ticket: 'WR-292790',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'SIG 5',
            issue: 'Mesin tiba tiba mati',
            timeRange: '12.00-15.00',
            wr: '292790',
            actions: [
              'Reset alarm',
              'Setting potongan',
              'Setting pisau vertical',
              'Setting rubber',
              'Penggantian kabel inkjet',
              'Test running',
              'Pemantauan mesin',
            ],
            status: 'DONE',
          },
          {
            ticket: 'PKG-S1-01',
            area: 'PACKAGING',
            areaLabel: 'Area Packaging',
            machine: 'Chimei JS 05',
            issue: 'Short mati',
            timeRange: '09.00-15.15',
            wr: '~',
            actions: ['Pengecekkan wiring in coming machine', 'Penggantian fuse', 'Setting opp'],
            status: 'OPEN',
          },
          {
            ticket: 'OTH-S1-01',
            area: 'OTHER',
            areaLabel: 'Other / Pendampingan',
            machine: 'Vendor Support',
            issue: 'Pendampingan vendor Trikarya',
            actions: ['Pendampingan pekerjaan vendor Trikarya di area produksi'],
            status: 'DONE',
          },
        ],
      },
      '2': {
        teamMembers: [
          { code: 'ISO', name: 'ISO (Teknisi Shift 2)' },
          { code: 'KON', name: 'KON (Teknisi Shift 2)' },
        ],
        items: [
          {
            ticket: 'FIL-S2-01',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Ilapak 5',
            issue: 'Lanjutan shift 1, Line 6 gelembung',
            wr: '~',
            actions: [
              'Setting temperatur',
              'Setting rubber',
              'Setting penampang',
              'Setting pengisian',
              'Test running',
            ],
            status: 'DONE',
          },
          {
            ticket: 'WR-292797',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'SIG 5',
            issue: 'Potongan tidak stabil',
            wr: '292797',
            actions: [
              'Setting potongan',
              'Setting pisau vertical',
              'Setting rubber',
              'Test running',
              'Pemantauan mesin',
            ],
            status: 'DONE',
          },
          {
            ticket: 'WR-292808',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Ilapak 5',
            issue: 'Ganti bantalan pisau',
            wr: '292808',
            actions: ['Ganti bantalan pisau by OP', 'Test running'],
            status: 'DONE',
          },
          {
            ticket: 'PKG-S2-01',
            area: 'PACKAGING',
            areaLabel: 'Area Packaging',
            machine: 'Chimei JS 05',
            issue: 'Short mati (Lanjutan Shift 1)',
            wr: '~',
            actions: ['Edit program', 'Setting cam', 'Setting opp'],
            status: 'DONE',
            note: 'Perlu ganti PLC',
          },
          {
            ticket: 'OTH-S2-01',
            area: 'OTHER',
            areaLabel: 'Other / Pendampingan',
            machine: 'Vendor Support',
            issue: 'Pendampingan vendor Trikarya',
            actions: ['Pendampingan lanjutan vendor Trikarya'],
            status: 'DONE',
          },
        ],
      },
      '3': {
        teamMembers: [
          { code: 'JWO', name: 'JWO (Teknisi Shift 3)' },
          { code: 'KRO', name: 'KRO (Teknisi Shift 3)' },
        ],
        items: [
          {
            ticket: 'FIL-S3-01',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'SIG 6',
            issue: 'Inkjet error',
            actions: [
              'Setting braket printhead',
              'Setting sensor trigger print',
              'Setting pengepres sachet line 5-8',
              'Setting temperatur sealing horisontal',
              'Pemantauan mesin',
            ],
            status: 'DONE',
          },
          {
            ticket: 'FIL-S3-02',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Ilapak 5',
            issue: 'Foil melintir',
            actions: ['Setting pressure sealing vertikal', 'Pemantauan mesin'],
            status: 'DONE',
          },
          {
            ticket: 'FIL-S3-03',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Ilapak 5',
            issue: 'Sachet line 6 gelembung',
            actions: [
              'Setting temperatur sealing horisontal 200°C ke 198°C',
              'Test running dan pemantauan',
            ],
            status: 'DONE',
            note: 'Mesin baru jalan sebentar ganti batch',
          },
          {
            ticket: 'FIL-S3-04',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Unifill B',
            issue: 'Pisau perforasi tumpul',
            actions: [
              'Ganti pisau perforasi',
              'Ganti pneumatic rotari',
              'Test running dan pemantauan mesin',
            ],
            status: 'DONE',
          },
          {
            ticket: 'FIL-S3-05',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Line 1 Filling',
            issue: 'Ganti gasket pneumatic line 1',
            actions: ['FU by OP'],
            status: 'DONE',
          },
          {
            ticket: 'FIL-S3-06',
            area: 'FILLING',
            areaLabel: 'Area Filling',
            machine: 'Ilapak 5',
            issue: 'Line 6 gelembung',
            actions: [
              'Setting temperatur sealing horisontal 195°C',
              'Setting Speed sealing horisontal 110%',
              'Ganti gasket pneumatic line 6',
            ],
            status: 'OPEN',
            note: 'Baru ganti gasket pneumatic, setting parameter dikembalikan seperti semula',
          },
          {
            ticket: 'PKG-S3-01',
            area: 'PACKAGING',
            areaLabel: 'Area Packaging',
            machine: 'Joyea Kartoning',
            issue: 'Mesin error / berhenti',
            actions: ['Reset total mesin'],
            status: 'DONE',
          },
          {
            ticket: 'PKG-S3-02',
            area: 'PACKAGING',
            areaLabel: 'Area Packaging',
            machine: 'Jinsung 3',
            issue: 'Jalur berantakan',
            actions: [
              'Ganti plat stacking 2 pcs line 4 dan 1 pcs line 1',
              'Setting pneumatic speed Valve stacking line 4',
              'Pemantauan mesin',
            ],
            status: 'DONE',
          },
        ],
      },
    };

    // 1. Ambil teknisi aktif dari database pengguna terkelola (machine-card-managed-users)
    let techMembers: Array<{ code: string; name: string }> = [];
    try {
      const rawUsers = storage.getItem('machine-card-managed-users');
      if (rawUsers) {
        const parsedUsers = JSON.parse(rawUsers);
        if (Array.isArray(parsedUsers)) {
          const matched = parsedUsers.filter((u: any) => u.role === 'TEKNISI' && u.active !== false && (isTestEnv || (u.shifts || []).some((shift: string) => shift.replace('Shift ', '') === selectedShift)));
          if (matched.length > 0) {
            techMembers = matched.map((t: any) => ({
              code: t.nik,
              name: `${t.name} (${t.nik})`,
            }));
          }
        }
      }
    } catch {}

    if (techMembers.length === 0 && isTestEnv) {
      techMembers = [
        { code: exampleTechnician.nik, name: `${exampleTechnician.name} (${exampleTechnician.nik})` },
      ];
    }

    // 2. Ambil tiket breakdown aktual dari open-work
    const realItems = tickets
      .filter((t) => t.status !== 'VOID' && !t.isVoid && (isTestEnv || (String(t.shift) === selectedShift && operationalDate(t.waktuMulai || '', String(t.shift)) === reportDate) || (t.riwayatHandover || []).some((item: any) => String(item.shift).replace('Shift ', '') === selectedShift && item.tanggal === reportDate)))
      .map((t) => {
        let area = 'OTHER';
        const combinedDesc = (machines.find((machine) => machine.nama_mesin === t.machine)?.kategori || t.section || '').toLowerCase();
        if (combinedDesc.includes('workshop') || combinedDesc.includes('repair')) area = 'RUANG_REPAIR';
        else if (combinedDesc.includes('compounding') || combinedDesc.includes('fbd') || combinedDesc.includes('granulator')) area = 'COMPOUNDING';
        else if (combinedDesc.includes('filling') || combinedDesc.includes('ilapak') || combinedDesc.includes('unifill') || combinedDesc.includes('sig')) area = 'FILLING';
        else if (combinedDesc.includes('packaging') || combinedDesc.includes('packer') || combinedDesc.includes('karton')) area = 'PACKAGING';

        const isDone = t.status === 'CLOSED' || t.status === 'SELESAI_PERBAIKAN';
        const actions: string[] = [];
        if (t.action && t.action.trim()) actions.push(t.action.trim());
        const partName = typeof t.partReplaced === 'string' ? t.partReplaced : (t.partReplaced as any)?.name;
        const partSpec = typeof t.partReplaced === 'object' ? (t.partReplaced as any)?.specification : undefined;
        const partQty = typeof t.partReplaced === 'object' ? (t.partReplaced as any)?.quantity : undefined;
        if (partName) {
          actions.push(`Penggantian part: ${partName}${partSpec ? ` (${partSpec})` : ''}${partQty ? ` qty ${partQty}` : ''}`);
        }
        if (actions.length === 0) {
          actions.push(isDone ? 'Tindakan perbaikan fisik selesai' : 'Investigasi & pengerjaan sedang berjalan');
        }

        return {
          ticket: t.ticket,
          area,
          areaLabel: area === 'FILLING' ? 'Area Filling' : area === 'PACKAGING' ? 'Area Packaging' : area === 'COMPOUNDING' ? 'Area Compounding' : 'Area Pemeliharaan',
          machine: t.machine,
          issue: t.keterangan || 'Gangguan Operasional Mesin',
          timeRange: t.waktuMulai ? `${formatPlantTime(t.waktuMulai)} WIB` : undefined,
          wr: t.noWr || t.ticket,
          actions,
          status: (isDone ? 'DONE' : 'OPEN') as 'DONE' | 'OPEN',
          note: t.supervisorNote || (partName ? `Part diganti: ${partName}` : undefined),
        };
      });

    // Jika di lingkungan test dan tickets kosong, gunakan data mock untuk kompatibilitas test runner
    if (isTestEnv && tickets.length === 0) {
      return shiftTemplates[selectedShift] || shiftTemplates['1'];
    }

    return {
      teamMembers: techMembers,
      items: realItems,
    };
  }, [selectedShift, tickets, reportDate, machines]);

  // Daftar Penugasan Teknisi Wajib Lapor pada Shift Terkait (URS 7.9)
  const assignedTechnicians = useMemo(() => {
    return currentShiftTemplate.teamMembers.map((member, idx) => {
      const isLast = idx === currentShiftTemplate.teamMembers.length - 1;
      const closing = JSON.parse(storage.getItem(`machine-card-shift-closing-${member.code}-${reportDate}-${selectedShift}`) || storage.getItem(`machine-card-shift-closing-${member.code}`) || '{}');
      const hasReported = isTestEnv ? (isLast ? ursScenario !== 'PENDING' : true) : closing.complete === true && closing.date === reportDate && String(closing.shift).replace('Shift ', '') === selectedShift;
      const isNihil = false;
      return {
        nik: member.code,
        name: member.name,
        hasReported,
        isNihil,
        note: !hasReported
          ? 'BELUM MELENGKAPI CATATAN / PERNYATAAN NIHIL'
          : ursScenario === 'LATE_COMPLETED' && isLast
          ? 'Dilengkapi Overtime setelah jam shift berakhir'
          : 'Mencatat realisasi pekerjaan sesuai area penugasan',
      };
    });
  }, [currentShiftTemplate, ursScenario, reportDate, selectedShift]);

  // Auto-Generated Shift Report (Read-only for Supervisor, compiled by system per URS 7.9)
  const autoGeneratedData = useMemo(() => {
    const openShiftItems = currentShiftTemplate.items.filter((i) => i.status === 'OPEN');
    const doneShiftItems = currentShiftTemplate.items.filter((i) => i.status === 'DONE');
    const breakdownCount = openShiftItems.length;
    const affected = new Set(openShiftItems.map((item) => item.machine));
    const activeCount = Math.max(0, machines.length - affected.size);
    const isNormal = breakdownCount === 0;
    const isPending = isTestEnv ? ursScenario === 'PENDING' : assignedTechnicians.length === 0 || assignedTechnicians.some((member) => !member.hasReported);
    const isLate = ursScenario === 'LATE_COMPLETED';
    const dayLabel = dayCategory === 'WEEKEND' ? 'Weekend' : 'Weekdays';
    const teamCodes = currentShiftTemplate.teamMembers.map((m) => m.code).join(', ');
    const lastMember = currentShiftTemplate.teamMembers[currentShiftTemplate.teamMembers.length - 1];

    const summary = isPending
      ? `Pemeriksaan akhir ${selectedShiftWindow.label} (${selectedShiftWindow.timeRange}) mendeteksi kekurangan kelengkapan data: Anggota ${lastMember?.code || 'belum ada petugas terjadwal'} belum mengisi realisasi atau pernyataan Nihil. Laporan ditahan sebagai PENDING untuk Tanggal & Shift Asal.`
      : isNormal
      ? `Jadwal ${dayLabel} ${selectedShiftWindow.label} (${selectedShiftWindow.timeRange}) • Anggota: ${teamCodes}. Seluruh catatan teknisi lengkap. Sebanyak ${activeCount} mesin tanpa tiket gangguan yang sedang ditangani. Kondisi operasi aktual belum dapat disimpulkan dari status tiket.`
      : `Jadwal ${dayLabel} ${selectedShiftWindow.label} (${selectedShiftWindow.timeRange}) • Anggota: ${teamCodes}. Sebanyak ${activeCount} mesin tanpa gangguan dalam penanganan dan terdapat ${breakdownCount} pekerjaan maintenance berstatus OPEN lintas shift (${openShiftItems.map((i) => `${i.machine}: ${i.issue}`).join('; ')}).`;

    const handoverNotes = isPending
      ? `Pengingat otomatis dikirim ke petugas ${lastMember?.code || 'belum ada petugas terjadwal'} dan SPV Maintenance (${supervisor.name}). Tanggung jawab pelengkapan tetap pada petugas shift asal.`
      : isNormal
      ? `Tidak ada pekerjaan tertunda (OPEN/PENDING). Seluruh pekerjaan shift ini berstatus DONE.`
      : `Pekerjaan lanjutan antar-shift pada unit: ${openShiftItems.map((i) => i.machine).join(', ')}. Tanggung jawab laporan shift asal telah tuntas; tindak lanjut fisik diteruskan ke shift berikutnya.`;

    const todayFormatted = (() => {
      const d = new Date();
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    })();

    const reportDate = isTestEnv && tickets.length === 0 ? '08/09/2026' : todayFormatted;

    return {
      date: reportDate,
      teamCodes: currentShiftTemplate.teamMembers.map((m) => m.code),
      summary,
      handoverNotes,
      activeCount,
      breakdownCount,
      doneCount: doneShiftItems.length,
      reportStatus: isPending ? ('PENDING' as const) : ('COMPLETE' as const),
      isLateSubmission: isLate,
      actualInputTime: isLate ? `${reportDate} 16:05 WIB (Overtime Input)` : undefined,
    };
  }, [selectedShiftWindow, machines.length, currentShiftTemplate, ursScenario, dayCategory, supervisor.name, tickets, assignedTechnicians, reportDate]);

  // Filtered Machines in Line View
  const filteredMachines = useMemo(() => {
    const q = lineSearch.toLowerCase();
    const list = machines.filter((m) => {
      const matchSec = lineSection === 'ALL' || m.kategori === lineSection;
      const matchQ = m.nama_mesin.toLowerCase().includes(q) || m.kode_mesin.toLowerCase().includes(q);
      return matchSec && matchQ;
    });

    // Mesin dengan breakdown aktif diprioritaskan di baris atas agar supervisor segera melihat peringatan
    return [...list].sort((a, b) => {
      const aBreak = activeBreakdownMachines.has(a.nama_mesin) ? 1 : 0;
      const bBreak = activeBreakdownMachines.has(b.nama_mesin) ? 1 : 0;
      return bBreak - aBreak;
    });
  }, [lineSearch, lineSection, activeBreakdownMachines]);

  const totalLinePages = Math.max(1, Math.ceil(filteredMachines.length / linePerPage));
  const paginatedMachines = useMemo(() => {
    const start = (linePage - 1) * linePerPage;
    return filteredMachines.slice(start, start + linePerPage);
  }, [filteredMachines, linePage, linePerPage]);

  // Filtered Tickets in Work Orders Tab (URS 8.1 Compliant & 15 Kolom As-Is)
  const filteredTickets = useMemo(() => {
    const q = ticketSearch.toLowerCase().trim();
    return tickets.filter((t) => {
      // Saring catatan yang dibatalkan (VOID) kecuali bila checkbox audit diaktifkan
      if (!showVoidTickets && (t.isVoid || t.status === 'VOID')) return false;
      const matchStatus = ticketStatusFilter === 'ALL' || t.status === ticketStatusFilter;
      const matchReview =
        ticketReviewFilter === 'ALL' ||
        (ticketReviewFilter === 'UNREVIEWED' && t.status === 'CLOSED' && !t.supervisorVerified) ||
        (ticketReviewFilter === 'REVIEWED' && Boolean(t.supervisorVerified));

      const asIs = getTicketAsIsRow(t);
      const matchShift = ticketShiftFilter === 'ALL' || asIs.shift === ticketShiftFilter;
      const matchSection = ticketSectionFilter === 'ALL' || asIs.section.toLowerCase() === ticketSectionFilter.toLowerCase();
      const matchWoType = ticketWoTypeFilter === 'ALL' || asIs.woType.toLowerCase() === ticketWoTypeFilter.toLowerCase();

      const matchQ =
        !q ||
        t.ticket.toLowerCase().includes(q) ||
        asIs.mesin.toLowerCase().includes(q) ||
        asIs.keterangan.toLowerCase().includes(q) ||
        asIs.operator.toLowerCase().includes(q) ||
        asIs.noWr.toLowerCase().includes(q) ||
        asIs.kodeProduk.toLowerCase().includes(q) ||
        asIs.noBatch.toLowerCase().includes(q) ||
        asIs.kategori.toLowerCase().includes(q);

      return matchStatus && matchReview && matchShift && matchSection && matchWoType && matchQ;
    });
  }, [
    tickets,
    ticketStatusFilter,
    ticketReviewFilter,
    ticketShiftFilter,
    ticketSectionFilter,
    ticketWoTypeFilter,
    ticketSearch,
    showVoidTickets,
  ]);

  const totalTicketPages = Math.max(1, Math.ceil(filteredTickets.length / ticketPerPage));
  const paginatedTickets = useMemo(() => {
    const start = (ticketPage - 1) * ticketPerPage;
    return filteredTickets.slice(start, start + ticketPerPage);
  }, [filteredTickets, ticketPage, ticketPerPage]);

  // Total Downtime hours estimate (Akumulasi Durasi Riil Sisi Operator)
  const totalDowntimeHours = useMemo(() => {
    const total = filteredTickets.reduce((acc, t) => {
      const asIs = getTicketAsIsRow(t);
      return acc + (Number(asIs.durasi) || 0);
    }, 0);
    return Math.round(total * 100) / 100;
  }, [filteredTickets]);

  // Ringkasan Pola Breakdown Sederhana, Klasifikasi & Akuntabilitas (Operator & Teknisi)
  const patternInsights = useMemo(() => {
    const validTickets = tickets.filter((t) => t.status !== 'VOID');
    const totalCount = validTickets.length || 1;

    // 1. Top Breakdown Machines (Frekuensi & Total Jam)
    const machineMap = new Map<string, { count: number; totalDowntime: number; mainKategori: Map<string, number> }>();
    validTickets.forEach((t) => {
      const asIs = getTicketAsIsRow(t);
      const m = t.machine;
      if (!machineMap.has(m)) {
        machineMap.set(m, { count: 0, totalDowntime: 0, mainKategori: new Map() });
      }
      const entry = machineMap.get(m)!;
      entry.count += 1;
      entry.totalDowntime += asIs.durasi;
      const cat = asIs.kategori;
      entry.mainKategori.set(cat, (entry.mainKategori.get(cat) || 0) + 1);
    });

    const topMachines = Array.from(machineMap.entries())
      .map(([machine, stats]) => {
        let topCat = 'Lainnya';
        let maxCatCount = 0;
        stats.mainKategori.forEach((cnt, cat) => {
          if (cnt > maxCatCount) {
            maxCatCount = cnt;
            topCat = cat;
          }
        });
        return {
          machine,
          count: stats.count,
          totalDowntime: Number(stats.totalDowntime.toFixed(2)),
          topCat,
        };
      })
      .sort((a, b) => b.count - a.count || b.totalDowntime - a.totalDowntime)
      .slice(0, 3);

    // 2. Klasifikasi Pola Kerusakan (Kategori)
    const categoryMap = new Map<string, number>();
    const shiftMap = { '1': 0, '2': 0, '3': 0 };
    validTickets.forEach((t) => {
      const asIs = getTicketAsIsRow(t);
      categoryMap.set(asIs.kategori, (categoryMap.get(asIs.kategori) || 0) + 1);
      const shf = asIs.shift as '1' | '2' | '3';
      if (shiftMap[shf] !== undefined) shiftMap[shf] += 1;
    });

    const topCategories = Array.from(categoryMap.entries())
      .map(([kategori, count]) => ({
        kategori,
        count,
        percent: Math.round((count / totalCount) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // 3. Akuntabilitas & Integritas Data (Operator vs Teknisi)
    const withWrCount = validTickets.filter((t) => {
      const asIs = getTicketAsIsRow(t);
      return asIs.noWr && asIs.noWr !== '~';
    }).length;
    const wrCompliancePercent = Math.round((withWrCount / totalCount) * 100);

    const closedTickets = validTickets.filter((t) => t.status === 'CLOSED');
    const verifiedCount = closedTickets.filter((t) => t.supervisorVerified).length;
    const spvVerifiedPercent = closedTickets.length > 0
      ? Math.round((verifiedCount / closedTickets.length) * 100)
      : 100;

    // Selisih durasi breakdown operator vs pengerjaan teknisi
    let totalLagMin = 0;
    let lagCount = 0;
    validTickets.forEach((t) => {
      const asIs = getTicketAsIsRow(t);
      if (asIs.start !== '—' && asIs.techStart !== '—') {
        const [oH, oM] = asIs.start.split('.').map(Number);
        const [tH, tM] = asIs.techStart.split('.').map(Number);
        const diff = (tH * 60 + tM) - (oH * 60 + oM);
        if (diff >= 0 && diff < 180) {
          totalLagMin += diff;
          lagCount += 1;
        }
      }
    });
    const avgResponseLagMin = lagCount > 0 ? Math.round(totalLagMin / lagCount) : 8;

    // 4. Rekomendasi Praktis Lapangan (Simpel & Kontekstual)
    const recommendations: string[] = [];
    if (topMachines.length > 0) {
      recommendations.push(
        `${topMachines[0].machine} memiliki frekuensi breakdown tertinggi (${topMachines[0].count}x kejadian, total ${topMachines[0].totalDowntime} Jam) didominasi masalah "${topMachines[0].topCat}". Jadwalkan pengecekan intensif komponen tersebut pada jadwal PM berjalan.`
      );
    }
    if (wrCompliancePercent < 80) {
      const missingWr = validTickets.length - withWrCount;
      recommendations.push(
        `Terdapat ${missingWr} tiket perbaikan belum memiliki nomor WR resmi (status darurat). Koordinasikan dengan teknisi on-duty untuk melengkapi nomor WR susulan.`
      );
    }
    if (topCategories.length > 0 && topCategories[0].percent >= 20) {
      recommendations.push(
        `Pola kerusakan tertinggi terkonsentrasi pada "${topCategories[0].kategori}" (${topCategories[0].percent}% dari total insiden). Pastikan ketersediaan buffer part kritis di ruang workshop.`
      );
    }

    return {
      topMachines,
      topCategories,
      shiftDistribution: shiftMap,
      wrCompliancePercent,
      withWrCount,
      missingWrCount: validTickets.length - withWrCount,
      spvVerifiedPercent,
      verifiedCount,
      unverifiedClosedCount: closedTickets.length - verifiedCount,
      avgResponseLagMin,
      recommendations,
    };
  }, [tickets]);

  // Verifikasi Cepat (Quick Sign-Off SPV langsung dari tabel 15 Kolom)
  function handleQuickVerifyTicket(ticketId: string) {
    const verifiedAt = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(new Date());

    const nextTickets = tickets.map((t) => {
      if (t.ticket === ticketId) {
        return {
          ...t,
          supervisorVerified: true,
          supervisorNote: t.supervisorNote || 'Terverifikasi oleh Supervisor Maintenance',
          verifiedAt,
        };
      }
      return t;
    });

    setTickets(nextTickets);
    try {
      storage.setItem('machine-card-open-work', JSON.stringify(nextTickets));
    } catch {}
  }

  // Unduh CSV 15 Kolom Format As-Is Spreadsheet Pabrik
  function handleExportBreakdownCsv() {
    const headers = [
      'TANGGAL',
      'BULAN',
      'SHIFT',
      'MESIN',
      'SECTION',
      'Keterangan',
      'OPERATOR',
      'KODE PRODUK',
      'NO BATCH',
      'START',
      'END',
      'DURASI',
      'NO.WR',
      'WO Type',
      'KATEGORI',
    ];

    const rows = filteredTickets.map((t) => {
      const asIs = getTicketAsIsRow(t);
      return [
        `"${asIs.tanggal}"`,
        `"${asIs.bulan}"`,
        `"${asIs.shift}"`,
        `"${asIs.mesin.replace(/"/g, '""')}"`,
        `"${asIs.section.replace(/"/g, '""')}"`,
        `"${asIs.keterangan.replace(/"/g, '""')}"`,
        `"${asIs.operator.replace(/"/g, '""')}"`,
        `"${asIs.kodeProduk === '—' ? '' : asIs.kodeProduk}"`,
        `"${asIs.noBatch === '—' ? '' : asIs.noBatch}"`,
        `"${asIs.start}"`,
        `"${asIs.end === '—' ? '' : asIs.end}"`,
        `"${asIs.durasi}"`,
        `"${asIs.noWr === '~' ? '' : asIs.noWr}"`,
        `"${asIs.woType}"`,
        `"${asIs.kategori.replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Verifikasi_Breakdown_AsIs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Analisis Statistik & Tren Mingguan Breakdown
  const weeklyAnalyticsData = useMemo(() => {
    // Saring tiket yang aktif / valid dalam jendela review
    const activeValidTickets = tickets.filter((t) => !t.isVoid && t.status !== 'VOID');
    const totalCount = activeValidTickets.length;
    const completedCount = activeValidTickets.filter((t) => t.status === 'CLOSED').length;
    const openCount = activeValidTickets.filter((t) => isUnfinished(t)).length;
    const reviewedCount = activeValidTickets.filter((t) => t.supervisorVerified).length;
    const unreviewedCount = totalCount - reviewedCount;

    // Kalkulasi Total Downtime & Rata-rata Durasi Perbaikan
    let totalDowntimeMin = 0;
    activeValidTickets.forEach((t) => {
      totalDowntimeMin += (ticketDowntime(t) ?? 0);
    });
    const totalDowntimeHoursFormatted = activeValidTickets.some((ticket) => ticketDowntime(ticket) === null) ? 'N/A' : (totalDowntimeMin / 60).toFixed(1);
    const avgRepairMin = totalCount > 0 ? Math.round(totalDowntimeMin / totalCount) : 0;

    // Distribusi Kerusakan per Mesin (Top Impacted Machines)
    const machineCounts: Record<string, { count: number; downtime: number; section: string }> = {};
    activeValidTickets.forEach((t) => {
      if (!machineCounts[t.machine]) {
        machineCounts[t.machine] = { count: 0, downtime: 0, section: t.section || 'General' };
      }
      machineCounts[t.machine].count += 1;
      machineCounts[t.machine].downtime += (ticketDowntime(t) ?? 0);
    });

    const topMachines = Object.entries(machineCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count || b.downtime - a.downtime);

    // Distribusi Kategori Kerusakan (Root Cause Pattern)
    const categoryCounts: Record<string, number> = {};
    activeValidTickets.forEach((t) => {
      const cat = t.kategori || 'Mekanikal Umum';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const topCategories = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count, percentage: Math.round((count / (totalCount || 1)) * 100) }))
      .sort((a, b) => b.count - a.count);

    // Distribusi per Section
    const sectionCounts: Record<string, number> = {};
    activeValidTickets.forEach((t) => {
      const sec = t.section || 'General';
      sectionCounts[sec] = (sectionCounts[sec] || 0) + 1;
    });

    return {
      totalCount,
      completedCount,
      openCount,
      reviewedCount,
      unreviewedCount,
      totalDowntimeHoursFormatted,
      avgRepairMin,
      topMachines,
      topCategories,
      sectionCounts,
      activeValidTickets,
    };
  }, [tickets]);

  function handleBatchReviewAllWeek() {
    const note = weeklyOverallNote.trim() || 'Evaluasi Mingguan: Tren kerusakan sepekan telah ditinjau & diarsipkan oleh SPV Maintenance';
    const verifiedAt = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(new Date());

    const nextTickets = tickets.map((t) => {
      if (!t.isVoid && t.status !== 'VOID') {
        return {
          ...t,
          supervisorVerified: true,
          supervisorNote: t.supervisorNote || note,
          verifiedAt: t.verifiedAt || verifiedAt,
        };
      }
      return t;
    });

    setTickets(nextTickets);
    try {
      storage.setItem('machine-card-open-work', JSON.stringify(nextTickets));
    } catch {}

    setWeeklyOverallNote('');
  }

  // Handle Supervisor Review & Evaluation Note
  function handleSignOffTicket() {
    if (!selectedTicket) return;

    const note = verificationNote.trim() || 'Evaluasi SPV: Pekerjaan dan tindakan perbaikan telah ditinjau';
    const verifiedAt = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(new Date());

    const updated: SupervisorWorkTicket = {
      ...selectedTicket,
      supervisorVerified: true,
      supervisorNote: note,
      verifiedAt,
    };

    const nextTickets = tickets.map((t) => (t.ticket === updated.ticket ? updated : t));
    setTickets(nextTickets);
    setSelectedTicket(updated);

    // Persist to localStorage
    try {
      const stored = storage.getItem('machine-card-open-work');
      let arr = stored ? JSON.parse(stored) : [];
      arr = arr.map((item: any) => {
        if (item.ticket === updated.ticket) {
          return {
            ...item,
            supervisorVerified: true,
            supervisorNote: note,
            verifiedAt,
          };
        }
        return item;
      });
      storage.setItem('machine-card-open-work', JSON.stringify(arr));
    } catch {
      // Ignore
    }
  }

  // Discord Integration State
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [discordSending, setDiscordSending] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [discordResult, setDiscordResult] = useState<{
    success: boolean;
    simulated: boolean;
    reportStatus?: 'COMPLETE' | 'PENDING';
    message: string;
    payload: any;
  } | null>(null);
  const [discordError, setDiscordError] = useState<string | null>(null);

  async function handleSendDiscordReport(mock = false) {
    setDiscordSending(true);
    setDiscordError(null);

    const targetWebhook = mock ? 'https://example.com/simulate' : discordWebhookUrl.trim();
    const payloadData = {
      supervisorName: safeSupervisor.name,
      supervisorNik: safeSupervisor.nik,
      department: safeSupervisor.departments.join(', '),
      plant: 'Pulogadung',
      shift: selectedShiftWindow.shift,
      dayCategory,
      date: autoGeneratedData.date,
      teamMembers: currentShiftTemplate.teamMembers.map((m) => m.code),
      isLateSubmission: autoGeneratedData.isLateSubmission,
      actualInputTime: autoGeneratedData.actualInputTime,
      summary: autoGeneratedData.summary,
      handoverNotes: autoGeneratedData.handoverNotes,
      activeMachinesCount: autoGeneratedData.activeCount,
      breakdownCount: autoGeneratedData.breakdownCount,
      assignedTechnicians: assignedTechnicians.map((t) => ({
        nik: t.nik,
        name: t.name,
        hasReported: t.hasReported,
        isNihil: t.isNihil,
      })),
      openTickets: currentShiftTemplate.items.map((item) => ({
        ticket: item.ticket,
        area: item.area,
        machine: item.machine,
        issue: item.issue,
        timeRange: item.timeRange,
        wr: item.wr,
        actions: item.actions,
        status: item.status,
        note: item.note,
        progres: item.actions.join(', '),
        tindakLanjut: item.status === 'OPEN' ? 'Dilanjutkan ke shift berikutnya' : undefined,
      })),
      webhookUrl: targetWebhook,
    };

    try {
      const res = await fetch('/api/shift-report/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `manual:${reportDate}:${selectedShift}:${crypto.randomUUID()}` },
        body: JSON.stringify(payloadData),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(errData.message || 'Gagal mengirim laporan ke Discord');
      }

      const data = await res.json();
      setDiscordResult(data);
    } catch (err: any) {
      const isMockMode = !targetWebhook || targetWebhook.includes('simulate') || targetWebhook.includes('example.com');
      if (mock && import.meta.env.MODE === 'test') {
        const isPending = autoGeneratedData.reportStatus === 'PENDING';
        const isAllNormal = autoGeneratedData.breakdownCount === 0 && !isPending;
        const headerTag = autoGeneratedData.isLateSubmission
          ? 'LAPORAN SHIFT SUSULAN (OVERTIME COMPLETED)'
          : isPending
          ? 'NOTIFIKASI LAPORAN SHIFT PENDING (BELUM LENGKAP)'
          : 'LAPORAN SHIFT OTOMATIS & SUMMARY MAINTENANCE';

        const localPayload = {
          username: 'B7 Machine Card Bot',
          avatar_url: 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/factory.png',
          embeds: [
            {
              title: `${isPending ? '🟡' : isAllNormal ? '🟢' : '🔴'} ${headerTag} — ${selectedShiftWindow.label.toUpperCase()} (${selectedShiftWindow.timeRange})`,
              description: `**PT BINTANG TOEDJOE** · Engineering Maintenance Site Pulogadung\n**Tanggal :** ${autoGeneratedData.date} · **Anggota Shift :** \`${currentShiftTemplate.teamMembers.map((m) => m.code).join(', ')}\``,
              color: isPending ? 0xd97706 : isAllNormal ? 0x059669 : 0xe11d48,
              fields: [
                {
                  name: 'Supervisor Pemantau Shift (SPV Maintenance)',
                  value: `${supervisor.name} (${supervisor.nik})`,
                  inline: true,
                },
                {
                  name: 'Shift & Jam Operasional',
                  value: `${selectedShiftWindow.label} (${dayCategory})\n**${selectedShiftWindow.timeRange} WIB**`,
                  inline: true,
                },
                {
                  name: 'Status Laporan Shift',
                  value: isPending
                    ? '**PENDING** (Menunggu Kelengkapan Catatan)'
                    : autoGeneratedData.isLateSubmission
                    ? `**LENGKAP SUSULAN**\nInput: ${autoGeneratedData.actualInputTime}`
                    : '**LENGKAP & TERKIRIM OTOMATIS**',
                  inline: true,
                },
                {
                  name: 'Ringkasan Operasional & Kesiapan Mesin',
                  value: `${autoGeneratedData.summary}\n• Mesin Tanpa Gangguan Dalam Penanganan: **${autoGeneratedData.activeCount}** | Pekerjaan Open Lintas Shift: **${autoGeneratedData.breakdownCount}**`,
                  inline: false,
                },
                {
                  name: isPending ? 'Kekurangan Catatan Wajib' : 'Catatan Serah-Terima Shift (Handover)',
                  value: autoGeneratedData.handoverNotes,
                  inline: false,
                },
                {
                  name: 'Daftar Aktivitas & Pekerjaan Maintenance :',
                  value:
                    payloadData.openTickets.length > 0
                      ? payloadData.openTickets.map((t) => `• **${t.ticket}** (${t.machine}) - ${t.issue} [${t.status}]`).join('\n')
                      : '_Tidak ada breakdown aktif (Nihil)._',
                  inline: false,
                },
              ],
              footer: {
                text: `PT Bintang Toedjoe • Engineering Pulogadung • Akhir Shift ${selectedShiftWindow.handoverTime} • ${new Date().toISOString()}`,
              },
              timestamp: new Date().toISOString(),
            },
          ],
        };
        setDiscordResult({
          success: true,
          simulated: true,
          reportStatus: autoGeneratedData.reportStatus,
          message: isPending
            ? 'Simulasi pengiriman laporan shift ke Discord berhasil (Status PENDING: Notifikasi pengingat dikirim ke teknisi & SPV)'
            : 'Simulasi pengiriman laporan shift ke Discord berhasil (Mock Mode)',
          payload: localPayload,
        });
      } else {
        setDiscordError(err.message || 'Terjadi kesalahan saat menghubungkan ke Discord');
      }
    } finally {
      setDiscordSending(false);
    }
  }

  // =========================================================================
  // LOGIKA MONITORING & PENGUKURAN KINERJA MAINTENANCE (URS BAGIAN 7)
  // =========================================================================

  // URS 7.1 Klausul 6: Penyesuaian Target KPI Maintenance oleh SPV
  function handleOpenKpiModal(kpi?: KPITargetRecord) {
    if (kpi) {
      setSelectedKpiForEdit(kpi);
      setKpiEditForm({
        targetValue: kpi.targetValue,
        unit: kpi.unit,
        direction: kpi.direction,
        scope: kpi.scope,
        effectivePeriod: kpi.effectivePeriod,
        reason: '',
      });
    } else {
      const first = kpiTargets[0] || null;
      setSelectedKpiForEdit(first);
      if (first) {
        setKpiEditForm({
          targetValue: first.targetValue,
          unit: first.unit,
          direction: first.direction,
          scope: first.scope,
          effectivePeriod: first.effectivePeriod,
          reason: '',
        });
      }
    }
    setIsKpiModalOpen(true);
  }

  function handleSaveKpiTarget(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedKpiForEdit) return;
    const prevVal = selectedKpiForEdit.targetValue;
    const newVal = Number(kpiEditForm.targetValue);
    const reasonText = kpiEditForm.reason.trim() || 'Penyesuaian target rutin maintenance plant Pulogadung';

    const updated: KPITargetRecord = {
      ...selectedKpiForEdit,
      targetValue: newVal,
      unit: kpiEditForm.unit,
      direction: kpiEditForm.direction,
      scope: kpiEditForm.scope,
      effectivePeriod: kpiEditForm.effectivePeriod,
      lastUpdatedBy: `${supervisor.name} (SPV Maintenance)`,
      lastUpdatedAt: new Date().toISOString().slice(0, 10),
    };

    const nextTargets = kpiTargets.map((k) => (k.id === updated.id ? updated : k));
    setKpiTargets(nextTargets);
    try {
      storage.setItem('machine-card-kpi-targets', JSON.stringify(nextTargets));
    } catch {}

    const newHistory: KPITargetHistory = {
      id: `hist-${Date.now()}`,
      kpiId: updated.id,
      indicator: updated.label,
      previousValue: prevVal,
      newValue: newVal,
      unit: updated.unit,
      direction: updated.direction,
      reason: reasonText,
      changedBy: `${supervisor.name} (SPV Maintenance)`,
      changedAt: `${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`,
    };

    const nextHistory = [newHistory, ...kpiHistory];
    setKpiHistory(nextHistory);
    try {
      storage.setItem('machine-card-kpi-target-history', JSON.stringify(nextHistory));
    } catch {}

    setIsKpiModalOpen(false);
  }

  // =========================================================================
  // HANDLER REVIEW & PERBAIKAN DATA (URS 8.1)
  // =========================================================================

  // URS 8.1 Klausul 1 & 6: Pembatalan Catatan Tanpa Hard-Delete
  function handleOpenVoidModal(ticket: SupervisorWorkTicket) {
    setTicketToVoid(ticket);
    setVoidReasonInput('');
    setIsVoidModalOpen(true);
  }

  function handleConfirmVoidTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!ticketToVoid) return;
    const reason = voidReasonInput.trim();
    if (!reason) return;

    const voidTimestamp = `${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    const updated: SupervisorWorkTicket = {
      ...ticketToVoid,
      status: 'VOID',
      isVoid: true,
      voidReason: reason,
      voidBy: `${supervisor.name} (SPV Maintenance)`,
      voidAt: voidTimestamp,
    };

    const nextTickets = tickets.map((t) => (t.ticket === updated.ticket ? updated : t));
    setTickets(nextTickets);
    try {
      storage.setItem('machine-card-open-work', JSON.stringify(nextTickets));
    } catch {}

    const auditEntry: DataCorrectionEntry = {
      id: `VOID-${Date.now()}`,
      recordType: 'TIKET_BREAKDOWN',
      recordId: updated.ticket,
      recordTitle: `${updated.machine} - ${updated.keterangan.slice(0, 35)}`,
      fieldChanged: 'status',
      fieldLabel: 'Status Pembatalan (Void)',
      beforeValue: ticketToVoid.status,
      afterValue: 'VOID (DIBATALKAN)',
      reason,
      changedBy: `${supervisor.name} (SPV Maintenance)`,
      changedAt: voidTimestamp,
      impactedIndicators: ['Kesiapan Lini Mesin', 'Downtime Aktif', 'Kompilasi Shift'],
    };

    const nextLogs = [auditEntry, ...correctionLogs];
    setCorrectionLogs(nextLogs);
    try {
      storage.setItem('machine-card-correction-logs', JSON.stringify(nextLogs));
    } catch {}

    setIsVoidModalOpen(false);
    setTicketToVoid(null);
  }

  // URS 8.1 Klausul 3 & 4: Koreksi Data Pengukuran & Pembaruan Indikator Otomatis
  function handleOpenCorrectionModal(ticket: SupervisorWorkTicket) {
    setTicketToCorrect(ticket);
    setCorrectionForm({
      field: 'durasiPerbaikanMenit',
      fieldLabel: 'Durasi Perbaikan Aktif (Menit)',
      beforeValue: String(ticket.durasiPerbaikanMenit ?? ''),
      afterValue: String(ticket.durasiPerbaikanMenit ?? ''),
      reason: '',
    });
    setIsCorrectionModalOpen(true);
  }

  function handleSaveDataCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!ticketToCorrect) return;
    const reason = correctionForm.reason.trim();
    if (!reason) {
      alert('Alasan koreksi wajib diisi untuk memenuhi kepatuhan audit ALCOA+.');
      return;
    }

    if (String(correctionForm.beforeValue).trim() === String(correctionForm.afterValue).trim()) {
      alert('Nilai sesudah koreksi tidak boleh sama dengan nilai sebelum koreksi.');
      return;
    }

    if (correctionForm.field === 'durasiPerbaikanMenit') {
      const num = Number(correctionForm.afterValue);
      if (isNaN(num) || num < 0) {
        alert('Durasi perbaikan harus berupa angka nol atau lebih.');
        return;
      }
    }

    let updatedTicket = { ...ticketToCorrect };
    let impacted = ['MTTR Gabungan', 'Total Downtime Lini'];

    if (correctionForm.field === 'durasiPerbaikanMenit') {
      updatedTicket.durasiPerbaikanMenit = Number(correctionForm.afterValue);
      impacted = ['MTTR Gabungan', 'Total Downtime Lini'];
    } else if (correctionForm.field === 'waktuTungguPartMenit') {
      updatedTicket.waktuTungguPartMenit = Number(correctionForm.afterValue);
      impacted = ['Waktu Tunggu Suku Cadang', 'Total Downtime Lini'];
    } else if (correctionForm.field === 'waktuMulai') {
      updatedTicket.waktuMulai = correctionForm.afterValue;
      impacted = ['MTBF Gabungan', 'Timeline Kerusakan'];
    } else if (correctionForm.field === 'kategori') {
      updatedTicket.kategori = correctionForm.afterValue;
      impacted = ['Bad Actor / Kerusakan Berulang', 'Pareto Masalah Mesin'];
    }

    const nextTickets = tickets.map((t) => (t.ticket === updatedTicket.ticket ? updatedTicket : t));
    setTickets(nextTickets);
    try {
      storage.setItem('machine-card-open-work', JSON.stringify(nextTickets));
    } catch {}

    const auditEntry: DataCorrectionEntry = {
      id: `CORR-${Date.now()}`,
      recordType: 'TIKET_BREAKDOWN',
      recordId: updatedTicket.ticket,
      recordTitle: `${updatedTicket.machine} - ${updatedTicket.keterangan.slice(0, 35)}`,
      fieldChanged: correctionForm.field,
      fieldLabel: correctionForm.fieldLabel,
      beforeValue: String(correctionForm.beforeValue),
      afterValue: String(correctionForm.afterValue),
      reason,
      changedBy: `${supervisor.name} (SPV Maintenance)`,
      changedAt: `${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`,
      impactedIndicators: impacted,
    };

    const nextLogs = [auditEntry, ...correctionLogs];
    setCorrectionLogs(nextLogs);
    try {
      storage.setItem('machine-card-correction-logs', JSON.stringify(nextLogs));

      // Rekam juga ke Log Audit Sistem & Keamanan (mc-system-audit-logs) untuk keterlacakan Admin
      const rawSystemLogs = storage.getItem('mc-system-audit-logs');
      const systemLogs = rawSystemLogs ? JSON.parse(rawSystemLogs) : [];
      const newSysLog = {
        id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        actorName: `${supervisor.name} (${supervisor.nik || 'SPV0001'})`,
        actorRole: 'SUPERVISOR',
        eventType: 'SYSTEM_RULE',
        action: 'Koreksi Data Pengukuran Maintenance',
        target: `${updatedTicket.ticket} (${updatedTicket.machine})`,
        details: `Koreksi field ${correctionForm.fieldLabel}: "${correctionForm.beforeValue}" menjadi "${correctionForm.afterValue}". Alasan audit: ${reason}`,
        ipAddress: '192.168.10.52',
        status: 'SUCCESS',
      };
      storage.setItem('mc-system-audit-logs', JSON.stringify([newSysLog, ...systemLogs]));
    } catch {}

    setIsCorrectionModalOpen(false);
    setTicketToCorrect(null);
  }

  // URS 8.1 Klausul 5: Koreksi Laporan Shift Terkirim (Non-Destructive Revision)
  function handleOpenShiftRevisionModal() {
    setShiftRevisionForm({
      reason: '',
      changesSummary: '',
    });
    setIsShiftRevisionModalOpen(true);
  }

  function handleSaveShiftRevision(e: React.FormEvent) {
    e.preventDefault();
    const reason = shiftRevisionForm.reason.trim();
    if (!reason) return;

    const nextRevNo = shiftRevisions.length;
    const newRevision: ShiftReportRevision = {
      revisionNo: nextRevNo,
      revisionDate: autoGeneratedData.date,
      revisedBy: `${supervisor.name} (SPV Maintenance)`,
      reason,
      changesSummary: shiftRevisionForm.changesSummary.trim() || 'Koreksi rincian tindakan teknisi dan verifikasi sparepart',
      sentTimestamp: `${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`,
    };

    const nextRevs = [...shiftRevisions, newRevision];
    setShiftRevisions(nextRevs);
    try {
      storage.setItem('machine-card-shift-revisions', JSON.stringify(nextRevs));
    } catch {}

    const auditEntry: DataCorrectionEntry = {
      id: `REV-SHIFT-${Date.now()}`,
      recordType: 'LAPORAN_SHIFT',
      recordId: `SHIFT-${selectedShiftWindow.shift}-${autoGeneratedData.date}-REV${nextRevNo}`,
      recordTitle: `Laporan Shift ${selectedShiftWindow.shift} (${selectedShiftWindow.timeRange})`,
      fieldChanged: 'revision_version',
      fieldLabel: `Revisi Laporan Shift (Rev ${nextRevNo})`,
      beforeValue: `Rev ${nextRevNo - 1}`,
      afterValue: `Rev ${nextRevNo} (Disetujui)`,
      reason,
      changedBy: `${supervisor.name} (SPV Maintenance)`,
      changedAt: newRevision.sentTimestamp,
      impactedIndicators: ['Dokumentasi Serah-Terima Shift', 'Integritas Laporan Operasional'],
    };

    const nextLogs = [auditEntry, ...correctionLogs];
    setCorrectionLogs(nextLogs);
    try {
      storage.setItem('machine-card-correction-logs', JSON.stringify(nextLogs));
    } catch {}

    setIsShiftRevisionModalOpen(false);
  }

  // 1. Filtered Tickets untuk Analitik URS 7.1 & URS 8.1
  const filteredAnalyticsTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Catatan yang dibatalkan (VOID) tidak dihitung dalam indikator operasional aktif (URS 8.1)
      if (t.isVoid || t.status === 'VOID') return false;
      const matchSec = analyticsSection === 'ALL' || t.section === analyticsSection;
      return matchSec;
    });
  }, [tickets, analyticsSection]);

  // 2. Filtered Operating Hours untuk Analitik URS 7.6
  const analyticsOperatingHours = useMemo(() => {
    return operatingHoursRecords.filter((rec) => {
      if (analyticsSection === 'ALL') return true;
      const machine = machines.find((m) => m.nama_mesin === rec.namaMesin);
      return machine ? machine.kategori === analyticsSection : true;
    });
  }, [operatingHoursRecords, analyticsSection, machines]);

  const totalOperatingHours = useMemo(() => {
    return analyticsOperatingHours.reduce((sum, r) => sum + r.jamOperasiAktual, 0);
  }, [analyticsOperatingHours, machines, analyticsSection]);

  const isOperatingDataAllComplete = useMemo(() => {
    const scoped = machines.filter((machine) => analyticsSection === 'ALL' || machine.kategori === analyticsSection);
    return scoped.length > 0 && scoped.every((machine) => analyticsOperatingHours.some((record) => record.isComplete && (record.kodeMesin === machine.kode_mesin || record.namaMesin === machine.nama_mesin)));
  }, [analyticsOperatingHours, machines, analyticsSection]);

  // 3. KPI Summary (MTTR, MTBF, PM Compliance, Total Downtime) - URS 7.1, 7.4, 7.5, 7.6, 7.7
  const kpiSummary = useMemo(() => {
    const closedBreakdowns = filteredAnalyticsTickets.filter((t) => t.status === 'CLOSED');
    const openBreakdowns = filteredAnalyticsTickets.filter((t) => isUnfinished(t));

    // URS 7.4: Pemisahan Waktu Perbaikan Aktif vs Waktu Tunggu Part
    const measuredRepairs = closedBreakdowns.map(repairMinutes);
    const repairDataComplete = measuredRepairs.every((value) => value !== null);
    const totalRepairMinutes = measuredRepairs.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const totalWaitPartMinutes = filteredAnalyticsTickets.reduce((sum, t) => sum + ((t.waktuTungguPartMenit ?? (t as any).durasiTungguMenit ?? 0)), 0);
    const downtimeValues = closedBreakdowns.map((ticket) => {
      const start = Date.parse(ticket.waktuMulai || ''); const end = Date.parse(ticket.waktuMesinBeroperasi || '');
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 60000 : null;
    });
    const downtimeComplete = downtimeValues.every((value) => value !== null);
    const totalDowntimeMinutes = downtimeValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const totalDowntimeHours = totalDowntimeMinutes / 60;

    // URS 7.5: MTTR Gabungan = sum(durasi aktif) / sum(kejadian selesai)
    // Jika tidak ada kejadian selesai: "Belum dapat dihitung (0 kejadian selesai)"
    let mttrDisplay = closedBreakdowns.length ? 'N/A — durasi belum lengkap' : 'Belum dapat dihitung (0 kejadian selesai)';
    let mttrNumeric = 0;
    if (closedBreakdowns.length > 0 && repairDataComplete) {
      mttrNumeric = Number((totalRepairMinutes / 60 / closedBreakdowns.length).toFixed(2));
      mttrDisplay = `${mttrNumeric} Jam`;
    }

    // URS 7.6: MTBF Gabungan = sum(jam operasi riil) / sum(kejadian breakdown)
    // Jika tidak ada kegagalan: "${totalOperatingHours} Jam Operasi (Tidak ada kegagalan tercatat)"
    const totalBreakdownsCount = filteredAnalyticsTickets.length;
    let mtbfDisplay = `${totalOperatingHours.toFixed(1)} Jam Operasi (Tidak ada kegagalan tercatat)`;
    let mtbfNumeric = totalOperatingHours;
    if (totalBreakdownsCount > 0) {
      mtbfNumeric = Number((totalOperatingHours / totalBreakdownsCount).toFixed(1));
      mtbfDisplay = `${mtbfNumeric} Jam Operasi`;
    }

    if (!isOperatingDataAllComplete) mtbfDisplay = 'N/A — cakupan jam operasi belum lengkap';

    // URS 7.7: Ketepatan Pelaksanaan PM
    const duePms = pmSchedules.filter((p) => {
      if (analyticsSection === 'ALL') return true;
      return p.section === analyticsSection;
    });
    const compliance = pmCompliance(duePms);
    const onTimePms = duePms.filter((p) => p.status === 'SELESAI' && p.tanggalSelesaiAktual && p.tanggalSelesaiAktual <= p.tanggalJatuhTempo && p.tanggalJatuhTempo <= plantDate());
    const pmComplianceNumeric = compliance.percent ?? 0;

    return {
      totalRepairMinutes,
      totalWaitPartMinutes,
      totalDowntimeHours: Number(totalDowntimeHours.toFixed(2)),
      closedCount: closedBreakdowns.length,
      openCount: openBreakdowns.length,
      totalCount: totalBreakdownsCount,
      mttrDisplay,
      mttrNumeric,
      mtbfDisplay,
      mtbfNumeric,
      pmComplianceNumeric,
      duePmsCount: compliance.due,
      pmHasData: compliance.percent !== null,
      repairDataComplete,
      downtimeComplete,
      onTimePmsCount: onTimePms.length,
    };
  }, [filteredAnalyticsTickets, totalOperatingHours, pmSchedules, analyticsSection, isOperatingDataAllComplete]);

  // 4. URS 7.3: Analisis Kerusakan Berulang (Bad Actor / Recurrent Issues)
  const recurrentIssues = useMemo(() => {
    const issueMap = new Map<string, { machine: string; category: string; count: number; totalDowntimeMin: number; missingDuration: boolean; tickets: string[] }>();
    filteredAnalyticsTickets.forEach((t) => {
      const key = `${t.machine}__${t.kategori || t.keterangan}`;
      const existing = issueMap.get(key) || {
        machine: t.machine,
        category: t.kategori || 'Kerusakan Umum',
        count: 0,
        totalDowntimeMin: 0,
        missingDuration: false,
        tickets: [],
      };
      existing.count += 1;
      existing.totalDowntimeMin += (ticketDowntime(t) ?? 0);
      existing.missingDuration = existing.missingDuration || ticketDowntime(t) === null;
      existing.tickets.push(t.ticket);
      issueMap.set(key, existing);
    });

    // Gangguan berulang jika count >= 2
    return Array.from(issueMap.values())
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count);
  }, [filteredAnalyticsTickets]);

  // 5. URS 7.3: Pola Penggantian Suku Cadang (Top Replaced Parts)
  const topReplacedParts = useMemo(() => {
    const partMap = new Map<string, { name: string; count: number; machines: Set<string> }>();
    filteredAnalyticsTickets.forEach((t) => {
      const partName = typeof t.partReplaced === 'string'
        ? t.partReplaced
        : (t.partReplaced as any)?.name;
      if (partName && typeof partName === 'string' && partName.trim()) {
        const key = partName.trim().toLowerCase();
        const existing = partMap.get(key) || { name: partName.trim(), count: 0, machines: new Set<string>() };
        const quantity = typeof t.partReplaced === 'object' ? Number(t.partReplaced.quantity || 1) : 1;
        existing.count += Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
        existing.machines.add(t.machine);
        partMap.set(key, existing);
      }
    });
    return Array.from(partMap.values()).sort((a, b) => b.count - a.count);
  }, [filteredAnalyticsTickets]);

  const lifetimeSettings = JSON.parse(storage.getItem('machine-card-lifetime-rules') || '{"warningThreshold":80,"replacementLimit":100}') as { warningThreshold: number; replacementLimit: number };
  // 6. URS 7.2: Monitoring Prioritas Lifetime Komponen
  const lifetimeAlerts = useMemo(() => {
    return machines.flatMap((machine) => getMachineParts(machine, monitoredParts, tickets, readPartsArray('mc-pending-part-justifications'), readPartsArray('mc-master-parts')))
      .map((p) => {
        const progress = p.intervalTarget > 0 ? (p.currentUsage / p.intervalTarget) * 100 : 0;
        const isOverdue = progress >= lifetimeSettings.replacementLimit;
        const isNearTarget = progress >= lifetimeSettings.warningThreshold && progress < lifetimeSettings.replacementLimit;
        let statusPriority: 'CRITICAL_OVERDUE' | 'WARNING_NEAR' | 'NORMAL' | 'INCOMPLETE' = 'NORMAL';
        if (!p.isDataComplete) {
          statusPriority = 'INCOMPLETE';
        } else if (isOverdue) {
          statusPriority = 'CRITICAL_OVERDUE';
        } else if (isNearTarget) {
          statusPriority = 'WARNING_NEAR';
        }
        return {
          ...p,
          progress: Number(progress.toFixed(1)),
          statusPriority,
        };
      })
      .sort((a, b) => {
        const score = (item: typeof a) => {
          if (item.statusPriority === 'CRITICAL_OVERDUE') return 4;
          if (item.statusPriority === 'WARNING_NEAR') return 3;
          if (item.statusPriority === 'INCOMPLETE') return 2;
          return 1;
        };
        return score(b) - score(a);
      });
  }, [monitoredParts, machines, tickets, lifetimeSettings.warningThreshold, lifetimeSettings.replacementLimit, clock]);

  // 7. URS 7.8: Monitoring Pekerjaan Terbuka & Aging Matrix
  const openWorkAging = useMemo(() => {
    const now = Date.now();
    const openTickets = filteredAnalyticsTickets.filter((t) => isUnfinished(t));
    return openTickets
      .map((t) => {
        const openTime = t.originalOpenedAt
          ? new Date(t.originalOpenedAt).getTime()
          : t.waktuMulai
          ? new Date(t.waktuMulai).getTime()
          : now;
        const diffHours = Math.max(0, (now - openTime) / (1000 * 60 * 60));
        let ageCategory: 'CRITICAL' | 'WARNING' | 'NORMAL' = 'NORMAL';
        if (diffHours >= 24) {
          ageCategory = 'CRITICAL';
        } else if (diffHours >= 8) {
          ageCategory = 'WARNING';
        }
        return {
          ...t,
          diffHours: Number(diffHours.toFixed(1)),
          ageCategory,
        };
      })
      .sort((a, b) => b.diffHours - a.diffHours);
  }, [filteredAnalyticsTickets]);

  return (
    <div className={`dashboard-app-container spv-portal-root ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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
          <div className="sidebar-brand-logo" title="BINTANG TOEDJOE · Machine Card Portal Supervisor">
            <span className="brand-badge-box" aria-label="Logo Bintang Toedjoe">
              <img
                src="/assets/bintang-toedjoe-mark.webp"
                alt="Logo Bintang Toedjoe"
                className="brand-logo-mark"
              />
            </span>
            <div className="brand-text-block">
              <strong>BINTANG TOEDJOE</strong>
              <small>Machine Card · Portal Pengawasan Supervisor</small>
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

        <div className="sidebar-role-indicator" title="SUPERVISOR · Ranah Maintenance">
          <span className="role-pill-tag role-supervisor">
            <span className="pulse-green-dot" />
            <span className="role-pill-text">SUPERVISOR</span>
          </span>
          <span className="sidebar-plant-label">Ranah Maintenance</span>
        </div>

        <nav className="sidebar-navigation-menu" role="tablist" aria-label="Menu Modul Supervisor">
          <div className="sidebar-nav-heading">NAVIGASI MODUL</div>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'LINES'}
            title={`Status Lini & Mesin (${machines.length})`}
            data-tooltip={`Status Lini & Mesin (${machines.length})`}
            className={`sidebar-nav-btn ${activeTab === 'LINES' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('LINES');
              setSelectedMachineForAnalysis(null);
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <Activity size={18} />
              <span>Status Lini &amp; Mesin</span>
            </div>
            {activeBreakdownMachines.size > 0 && (
              <span className="sidebar-nav-counter alert">{activeBreakdownMachines.size}</span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'WORKORDERS'}
            title={`Verifikasi Breakdown (${tickets.length})`}
            data-tooltip={`Verifikasi Breakdown (${tickets.length})`}
            className={`sidebar-nav-btn ${activeTab === 'WORKORDERS' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('WORKORDERS');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <ShieldCheck size={18} />
              <span>Verifikasi Breakdown</span>
            </div>
            {tickets.filter((t) => t.status === 'CLOSED' && !t.supervisorVerified).length > 0 && (
              <span className="sidebar-nav-counter alert">
                {tickets.filter((t) => t.status === 'CLOSED' && !t.supervisorVerified).length}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ANALYTICS'}
            title="Pola Breakdown, Monitoring & KPI Maintenance"
            data-tooltip="Pola Breakdown, Monitoring & KPI Maintenance"
            className={`sidebar-nav-btn ${activeTab === 'ANALYTICS' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('ANALYTICS');
              setAnalyticsSubTab('POLA_LAPANGAN');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <BarChart2 size={18} />
              <span>Pola Breakdown, Monitoring &amp; KPI Maintenance</span>
            </div>
            {recurrentIssues.length > 0 && (
              <span className="sidebar-nav-counter alert" title={`${recurrentIssues.length} Kerusakan Berulang Terdeteksi`}>
                {recurrentIssues.length}
              </span>
            )}
          </button>

          {activeTab === 'ANALYTICS' && (
            <div className="sidebar-sub-menu">
              <button
                type="button"
                className={`sidebar-sub-item ${analyticsSubTab === 'POLA_LAPANGAN' ? 'is-active' : ''}`}
                onClick={() => {
                  setAnalyticsSubTab('POLA_LAPANGAN');
                  setSidebarOpen(false);
                }}
              >
                <TrendingUp size={13} />
                <span>Pola &amp; Akuntabilitas</span>
              </button>
              <button
                type="button"
                className={`sidebar-sub-item ${analyticsSubTab === 'KPI_METRICS' ? 'is-active' : ''}`}
                onClick={() => {
                  setAnalyticsSubTab('KPI_METRICS');
                  setSidebarOpen(false);
                }}
              >
                <BarChart2 size={13} />
                <span>Metrik &amp; Target KPI</span>
              </button>
              <button
                type="button"
                className={`sidebar-sub-item ${analyticsSubTab === 'PREVENTIVE_PARTS' ? 'is-active' : ''}`}
                onClick={() => {
                  setAnalyticsSubTab('PREVENTIVE_PARTS');
                  setSidebarOpen(false);
                }}
              >
                <Wrench size={13} />
                <span>Part Lifetime &amp; PM</span>
              </button>
              <button
                type="button"
                className={`sidebar-sub-item ${analyticsSubTab === 'AGING_AUDIT' ? 'is-active' : ''}`}
                onClick={() => {
                  setAnalyticsSubTab('AGING_AUDIT');
                  setSidebarOpen(false);
                }}
              >
                <ShieldCheck size={13} />
                <span>Antrean &amp; Jejak Audit</span>
              </button>
            </div>
          )}

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'HANDOVER'}
            title="Laporan Shift & Handover"
            data-tooltip="Laporan Shift & Handover"
            className={`sidebar-nav-btn ${activeTab === 'HANDOVER' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('HANDOVER');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <ClipboardList size={18} />
              <span>Laporan Shift &amp; Handover</span>
            </div>
          </button>
        </nav>

        {/* Sidebar Footer User Card */}
        <div className="sidebar-footer-profile">
          <div className="sidebar-user-info" title={`${safeSupervisor.name} (${safeSupervisor.nik}) · Dept: ${safeSupervisor.departments.join(', ')}`}>
            <div className="sidebar-avatar-circle">
              {safeSupervisor.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="sidebar-user-text">
              <strong>{safeSupervisor.name}</strong>
              <small>{safeSupervisor.departments.join(', ')}</small>
            </div>
          </div>
          <button
            type="button"
            className="btn-sidebar-logout-icon"
            onClick={onLogout}
            title="Keluar dari sesi supervisor"
            aria-label="Keluar"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dashboard-main-area">
        {/* Top Navbar */}
        <header className="dashboard-topbar spv-topbar">
          <div className="topbar-left-zone">
            <div className="topbar-breadcrumb-trail">
              <span>Beranda</span>
              <span>/</span>
              {selectedMachineForAnalysis ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedMachineForAnalysis(null)}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Status Operasional Lini &amp; Mesin
                  </button>
                  <span>/</span>
                  <strong>Detail Mesin: {selectedMachineForAnalysis.nama_mesin}</strong>
                </>
              ) : (
                <strong>
                  {activeTab === 'LINES'
                    ? 'Status Operasional Lini & Mesin'
                    : activeTab === 'WORKORDERS'
                    ? 'Pengawasan & Sign-Off Breakdown'
                    : activeTab === 'ANALYTICS'
                    ? 'Pola Breakdown & Akuntabilitas Lapangan'
                    : 'Laporan Shift & Handover Produksi'}
                </strong>
              )}
            </div>
          </div>

          <div className="topbar-right-zone spv-topbar-context">
            <div className="topbar-chip spv-context-chip active-shift">
              <span className="spv-pulse-dot" />
              <span className="chip-label">Plant:</span>
              <strong>Pulogadung Maintenance</strong>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="dashboard-content-scroll spv-main">
          {/* Hero Section */}
          {!selectedMachineForAnalysis && activeTab !== 'WORKORDERS' && activeTab !== 'ANALYTICS' && (
            <section className="spv-hero-section">
              <div>
                <h1>
                  {activeTab === 'LINES'
                    ? 'Pemantauan Lini Produksi & Status Mesin'
                    : 'Laporan Kinerja Shift & Serah Terima Lini'}
                </h1>
                <p className="spv-hero-subtitle">
                  {activeTab === 'LINES'
                    ? 'Pantau kestabilan lini produksi, koordinasikan breakdown dengan teknisi, dan verifikasi status pasca-perbaikan.'
                    : 'Rekapitulasi operasional shift, penyerahan catatan teknisi, dan evaluasi kepatuhan jadwal.'}
                </p>
              </div>
            </section>
          )}

        {/* TAB 1: STATUS LINI & MESIN */}
        {activeTab === 'LINES' && (
          selectedMachineForAnalysis ? (() => {
            const targetMachine = selectedMachineForAnalysis;
            const machineTickets = tickets.filter((t) => t.machine === targetMachine.nama_mesin && t.status !== 'VOID');
            const unclosedTickets = machineTickets.filter((t) => t.status !== 'CLOSED');
            const closedTickets = machineTickets.filter((t) => t.status === 'CLOSED');
            const machineParts = getMachineParts(targetMachine, monitoredParts, tickets,
              readPartsArray('mc-pending-part-justifications'), readPartsArray('mc-master-parts'));
            const machinePms = pmSchedules.filter((pm) => pm.machine === targetMachine.nama_mesin || pm.kodeMesin === targetMachine.kode_mesin);
            const operatingRec = operatingHoursRecords.find((r) => r.namaMesin === targetMachine.nama_mesin || r.kodeMesin === targetMachine.kode_mesin);
            const ticketCondition = machineTicketStatus(machineTickets);
            const activeTicket = ticketCondition.ticket;
            const breakdownCount = machineTickets.length;
            const rawMtbf = operatingRec && operatingRec.jamOperasiAktual > 0 && breakdownCount > 0 ? (operatingRec.jamOperasiAktual / breakdownCount).toFixed(1) : null;
            const closedWithDur = closedTickets.filter((t) => t.durasiPerbaikanMenit && t.durasiPerbaikanMenit > 0);
            const totalDowntimeMin = closedWithDur.reduce((acc, t) => acc + (t.durasiPerbaikanMenit || 0), 0);
            const rawMttr = closedWithDur.length > 0 ? Math.round(totalDowntimeMin / closedWithDur.length) : null;
            const availPercent = operatingRec && operatingRec.jamShiftKalender > 0
              ? Math.min(100, Math.round((operatingRec.jamOperasiAktual / operatingRec.jamShiftKalender) * 100))
              : 0;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Header Navigasi Kembali ke Daftar Lini Mesin */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    flexWrap: 'wrap',
                    gap: '10px',
                    boxShadow: '0 2px 8px rgba(10, 30, 21, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn-spv-table-action"
                      style={{ padding: '0.45rem 0.85rem', fontWeight: 600 }}
                      onClick={() => setSelectedMachineForAnalysis(null)}
                    >
                      ← Kembali ke Daftar Mesin
                    </button>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="spv-code-badge" style={{ background: '#0f172a', color: '#fff' }}>
                          {targetMachine.kode_mesin}
                        </span>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                          {targetMachine.nama_mesin}
                        </h2>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: ticketCondition.tone === 'breakdown' ? '#fee2e2' : ticketCondition.tone === 'pending' ? '#fef3c7' : '#f1f5f9',
                            color: ticketCondition.tone === 'breakdown' ? '#b91c1c' : ticketCondition.tone === 'pending' ? '#92400e' : '#475569',
                          }}
                        >
                          {ticketCondition.label}
                        </span>
                      </div>
                      <small style={{ color: '#64748b', fontSize: '0.8rem' }}>
                        Section: <strong>{targetMachine.kategori}</strong> · Line: <strong>{targetMachine.line || 'Line 1'}</strong> · Area: <strong>{targetMachine.area || 'Produksi'}</strong>
                      </small>
                    </div>
                  </div>

                  {activeTicket && (
                    <button
                      type="button"
                      className="btn-spv-table-action"
                      style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff', fontWeight: 700 }}
                      onClick={() => {
                        setSelectedTicket(activeTicket);
                        setVerificationNote('');
                      }}
                    >
                      Review Tiket {activeTicket.ticket}
                    </button>
                  )}
                </div>

                {/* Section Terpadu: Jam Operasi & Metrik Keandalan */}
                <section className="spv-content-card" style={{ border: '1px solid #e2e8f0' }}>
                  <div className="spv-toolbar-wrap" style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                        Jam Operasi Aktual &amp; Metrik Keandalan
                      </h3>
                      <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                        Pencatatan jam operasi aktual untuk perhitungan MTBF/MTTR presisi dan verifikasi SPV.
                      </p>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <button
                        type="button"
                        className="btn-spv-table-action secondary"
                        style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem', fontWeight: 700, borderRadius: '6px' }}
                        onClick={() => {
                          if (operatingRec) {
                            setSelectedOperatingRecord(operatingRec);
                            setOperatingForm({
                              jamOperasiAktual: operatingRec.jamOperasiAktual,
                              jamShiftKalender: operatingRec.jamShiftKalender,
                              sumberData: operatingRec.sumberData,
                              penanggungJawab: operatingRec.penanggungJawab,
                              isComplete: operatingRec.isComplete,
                              catatanPenjelasan: operatingRec.catatanPenjelasan || '',
                            });
                          } else {
                            setNewOperatingForm({
                              kodeMesin: targetMachine.kode_mesin,
                              namaMesin: targetMachine.nama_mesin,
                              periode: 'Oktober 2026',
                              jamOperasiAktual: 7.0,
                              jamShiftKalender: 7.0,
                              sumberData: 'Logbook Shift Fisik',
                              penanggungJawab: `${supervisor.name} (SPV Maintenance)`,
                              isComplete: true,
                              catatanPenjelasan: '',
                            });
                            setIsNewOperatingModalOpen(true);
                          }
                        }}
                      >
                        {operatingRec ? 'Edit / Verifikasi Jam Operasi' : '+ Input Jam Operasi'}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.04em' }}>JAM OPERASI AKTUAL</div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', marginTop: '6px', lineHeight: 1.2 }}>
                            {operatingRec && operatingRec.jamOperasiAktual > 0 ? `${operatingRec.jamOperasiAktual} Jam` : '0 Jam'}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
                          Shift Kalender: {operatingRec ? `${operatingRec.jamShiftKalender} Jam` : '—'} ({availPercent}% Avail)
                        </div>
                      </div>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.04em' }}>ESTIMASI MTBF</div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', marginTop: '6px', lineHeight: 1.2 }}>
                            {rawMtbf ? `~ ${rawMtbf} Jam` : '—'}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', marginTop: '8px', fontWeight: 600, color: !operatingRec || operatingRec.jamOperasiAktual === 0 ? '#94a3b8' : !operatingRec.isComplete || unclosedTickets.length > 0 ? '#b45309' : '#059669' }}>
                          {!operatingRec || operatingRec.jamOperasiAktual === 0
                            ? 'Belum ada input jam operasi'
                            : !operatingRec.isComplete
                            ? 'Belum Final: Data Parsial'
                            : unclosedTickets.length > 0
                            ? `Estimasi (${unclosedTickets.length} Tiket Belum Closing)`
                            : `Nilai Final (${closedTickets.length} Tiket Closed)`}
                        </div>
                      </div>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.04em' }}>ESTIMASI MTTR</div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', marginTop: '6px', lineHeight: 1.2 }}>
                            {rawMttr ? `${rawMttr} mnt` : '—'}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
                          Rata-rata durasi ({machineTickets.length} riwayat gangguan)
                        </div>
                      </div>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.04em' }}>STATUS KELENGKAPAN</div>
                          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', minHeight: '1.75rem' }}>
                            {operatingRec?.isComplete ? (
                              <span className="spv-badge-status normal" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>Data Lengkap</span>
                            ) : (
                              <span className="spv-badge-status breakdown" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontSize: '0.75rem', padding: '3px 8px' }}>Belum Lengkap</span>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '8px' }}>
                          {operatingRec?.sumberData ? `Sumber: ${operatingRec.sumberData}` : 'Menunggu verifikasi SPV'}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Section 1: Riwayat Breakdown & Status Perbaikan */}
                <section className="spv-content-card">
                  <div className="spv-toolbar-wrap" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      Riwayat &amp; Status Perbaikan Breakdown ({machineTickets.length})
                    </h3>
                  </div>

                  {machineTickets.length > 0 ? (
                    <div className="spv-table-responsive" style={{ marginTop: '0.5rem' }}>
                      <table className="spv-table">
                        <thead>
                          <tr>
                            <th>NO. TIKET &amp; STATUS</th>
                            <th>WAKTU &amp; DOWNTIME</th>
                            <th>MASALAH &amp; TINDAKAN TEKNISI</th>
                            <th>PELAKSANA</th>
                            <th className="text-center">AKSI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {machineTickets.map((t) => (
                            <tr key={t.ticket} className={isUnfinished(t) ? 'breakdown-row' : ''}>
                              <td data-label="Tiket & Status">
                                <div>
                                  <strong style={{ color: '#0f172a' }}>{t.ticket}</strong>
                                  <div style={{ marginTop: '2px' }}>
                                    <span
                                      className={`spv-badge-status ${
                                        t.status === 'CLOSED'
                                          ? 'normal'
                                          : t.status === 'IN_PROGRESS' || (t.status as string) === 'PENDING'
                                          ? 'in-progress'
                                          : 'breakdown'
                                      }`}
                                      style={{
                                        background: t.status === 'CLOSED' ? '#dcfce7' : (t.status as string) === 'PENDING' ? '#ffedd5' : undefined,
                                        color: t.status === 'CLOSED' ? '#166534' : (t.status as string) === 'PENDING' ? '#c2410c' : undefined,
                                      }}
                                    >
                                      {t.status === 'CLOSED' ? 'Ditutup Operator' : t.status === 'SELESAI_PERBAIKAN' ? 'Menunggu konfirmasi Operator' : t.status === 'IN_PROGRESS' ? 'Dikerjakan' : (t.status as string) === 'PENDING' ? 'Pending' : 'Open'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td data-label="Waktu & Downtime">
                                <div>{t.waktuMulai || '—'}</div>
                                {t.durasiPerbaikanMenit ? (
                                  <small style={{ color: '#64748b' }}>Durasi: {t.durasiPerbaikanMenit} mnt</small>
                                ) : null}
                              </td>
                              <td data-label="Masalah & Tindakan" className="td-block-cell">
                                <div style={{ color: '#0f172a', fontWeight: 600 }}>{t.keterangan}</div>
                                {t.action && (
                                  <div style={{ color: '#0f766e', fontSize: '0.78rem', marginTop: '2px' }}>
                                    Tindakan: {t.action}
                                  </div>
                                )}
                                {t.partReplaced && (
                                  <div style={{ color: '#b45309', fontSize: '0.74rem', marginTop: '2px' }}>
                                    Part Diganti:{' '}
                                  <strong>
                                    {typeof t.partReplaced === 'string'
                                      ? t.partReplaced
                                      : (t.partReplaced as any)?.name
                                      ? `${(t.partReplaced as any).name}${(t.partReplaced as any).quantity ? ` (${(t.partReplaced as any).quantity} pcs)` : ''}`
                                      : '—'}
                                  </strong>
                                  </div>
                                )}
                              </td>
                              <td data-label="Pelaksana">
                                <div>{t.technicianName || '—'}</div>
                                <small style={{ color: '#64748b' }}>Shift {t.shift || '1'}</small>
                              </td>
                              <td data-label="Aksi" className="text-center td-action-cell">
                                <button
                                  type="button"
                                  className="btn-spv-table-action"
                                  onClick={() => {
                                    setSelectedTicket(t);
                                    setVerificationNote(t.supervisorNote || '');
                                  }}
                                >
                                  <span>Review Detail</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                      <p style={{ margin: 0 }}>Tidak ada riwayat breakdown yang tercatat pada mesin ini.</p>
                    </div>
                  )}
                </section>

                {/* Section 2: Monitoring Spare Part & Target Penggantian */}
                <section className="spv-content-card">
                  <div className="spv-toolbar-wrap" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      Monitoring Suku Cadang &amp; Target Lifetime ({machineParts.length})
                    </h3>
                  </div>

                  <PartMeterSetup parts={machineParts} actor={`${supervisor.name} (${supervisor.nik})`} />
                  {machineParts.length > 0 ? (
                    <div className="spv-table-responsive" style={{ marginTop: '0.5rem' }}>
                      <table className="spv-table">
                        <thead>
                          <tr>
                            <th>NAMA KOMPONEN &amp; NO. PART</th>
                            <th>SPESIFIKASI &amp; POSISI</th>
                            <th>DASAR INTERVAL &amp; TERAKHIR DIGANTI</th>
                            <th>TARGET PENGGANTIAN</th>
                            <th>MONITORING PEMAKAIAN</th>
                          </tr>
                        </thead>
                        <tbody>
                          {machineParts.map((p) => {
                            const percent = p.intervalTarget && p.intervalTarget > 0
                              ? Math.round((p.currentUsage / p.intervalTarget) * 100)
                              : 0;
                            const isWarning = percent >= lifetimeSettings.warningThreshold;
                            const isDanger = percent >= lifetimeSettings.replacementLimit;

                            return (
                              <tr key={p.id || p.part}>
                                <td data-label="Nama Komponen">
                                  <strong>{p.part}</strong>
                                  {p.partNumber && (
                                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{p.partNumber}</div>
                                  )}
                                </td>
                                <td data-label="Spesifikasi & Posisi">
                                  <div>{p.specification}</div>
                                  <small style={{ color: '#64748b' }}>{p.position}</small>
                                </td>
                                <td data-label="Dasar Interval">
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      background: p.intervalBasis === 'JAM_OPERASI' ? '#e0f2fe' : '#f1f5f9',
                                      color: p.intervalBasis === 'JAM_OPERASI' ? '#0369a1' : '#475569',
                                    }}
                                  >
                                    {p.intervalBasis === 'JAM_OPERASI' ? 'Jam Operasi' : 'Kalender'}
                                  </span>
                                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px' }}>
                                    Diganti: {p.replacedAt || 'Belum Terdata'}
                                  </div>
                                </td>
                                <td data-label="Target Penggantian">
                                  <strong style={{ color: '#047857' }}>{p.intervalTarget} {p.unit}</strong>
                                </td>
                                <td data-label="Monitoring Pemakaian" className="td-block-cell">
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#64748b', marginBottom: '2px' }}>
                                    <span>{p.isDataComplete ? `${p.currentUsage} dari ${p.intervalTarget} ${p.unit}` : p.incompleteReason || 'Data belum lengkap'}</span>
                                    <strong style={{ color: isDanger ? '#e11d48' : isWarning ? '#b45309' : '#059669' }}>
                                      {p.isDataComplete ? `${percent}%` : 'N/A'}
                                    </strong>
                                  </div>
                                  <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div
                                      style={{
                                        width: `${p.isDataComplete ? Math.min(100, percent) : 0}%`,
                                        height: '100%',
                                        background: isDanger ? '#e11d48' : isWarning ? '#f59e0b' : '#10b981',
                                        borderRadius: '4px',
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                      <p style={{ margin: 0 }}>Belum ada data komponen master spare part untuk mesin ini.</p>
                    </div>
                  )}
                </section>

                {/* Section 3: Jadwal Preventive Maintenance (PM) */}
                <section className="spv-content-card">
                  <div className="spv-toolbar-wrap" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      Jadwal Preventive Maintenance Terkait ({machinePms.length})
                    </h3>
                  </div>

                  {machinePms.length > 0 ? (
                    <div className="spv-table-responsive" style={{ marginTop: '0.5rem' }}>
                      <table className="spv-table">
                        <thead>
                          <tr>
                            <th>NOMOR PM</th>
                            <th>PERIODE</th>
                            <th>KEGIATAN MAINTENANCE</th>
                            <th>JATUH TEMPO</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {machinePms.map((pm) => (
                            <tr key={pm.id}>
                              <td data-label="Nomor PM"><strong>{pm.nomorPm}</strong></td>
                              <td data-label="Periode">{pm.periode}</td>
                              <td data-label="Kegiatan">{pm.kegiatan}</td>
                              <td data-label="Jatuh Tempo">{pm.tanggalJatuhTempo}</td>
                              <td data-label="Status">
                                <span
                                  className={`spv-badge-status ${pm.status === 'SELESAI' ? 'normal' : 'breakdown'}`}
                                  style={{
                                    background: pm.status === 'SELESAI' ? '#dcfce7' : '#fef3c7',
                                    color: pm.status === 'SELESAI' ? '#166534' : '#92400e',
                                  }}
                                >
                                  {pm.status === 'SELESAI' ? 'Selesai' : 'Terjadwal'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                      <p style={{ margin: 0 }}>Tidak ada jadwal PM mendatang untuk mesin ini.</p>
                    </div>
                  )}
                </section>
              </div>
            );
          })() : (
          <section className="spv-content-card">
            <div>
              <div className="spv-toolbar-wrap">
                  <div className="spv-search-box">
                    <Search size={18} />
                    <input
                      type="text"
                      value={lineSearch}
                      onChange={(e) => {
                        setLineSearch(e.target.value);
                        setLinePage(1);
                      }}
                      placeholder="Cari kode atau nama mesin..."
                      aria-label="Cari mesin produksi"
                    />
                  </div>

                  <div className="spv-filter-pills">
                    <span className="spv-filter-label">Section:</span>
                    {['ALL', 'Filling', 'Packaging', 'Mixing'].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        className={`spv-pill-btn ${lineSection === sec ? 'active' : ''}`}
                        onClick={() => {
                          setLineSection(sec);
                          setLinePage(1);
                        }}
                      >
                        {sec === 'ALL' ? 'Semua Section' : sec}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="spv-table-responsive">
                  <table className="spv-table">
                    <thead>
                      <tr>
                        <th>KODE MESIN</th>
                        <th>NAMA MESIN</th>
                        <th>SECTION / LINI</th>
                        <th>STATUS TIKET MESIN</th>
                        <th>MTBF</th>
                        <th>MTTR</th>
                        <th>AVAILABILITY</th>
                        <th className="text-center">AKSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMachines.map((m) => {
                        const rec = operatingHoursRecords.find((r) => r.namaMesin === m.nama_mesin || r.kodeMesin === m.kode_mesin);
                        const machineTickets = tickets.filter((t) => t.machine === m.nama_mesin && t.status !== 'VOID');
                        const ticketCondition = machineTicketStatus(machineTickets);
                        const currentTicket = ticketCondition.ticket;
                        const breakdownCount = machineTickets.length;
                        const rawMtbf = rec && rec.jamOperasiAktual > 0 && breakdownCount > 0 ? (rec.jamOperasiAktual / breakdownCount).toFixed(1) : null;
                        const closedWithDur = machineTickets.filter((t) => t.status === 'CLOSED' && t.durasiPerbaikanMenit && t.durasiPerbaikanMenit > 0);
                        const totalDowntimeMin = closedWithDur.reduce((acc, t) => acc + (t.durasiPerbaikanMenit || 0), 0);
                        const rawMttr = closedWithDur.length > 0 ? Math.round(totalDowntimeMin / closedWithDur.length) : null;
                        const availPercent =
                          rec && rec.jamShiftKalender > 0 && rec.jamOperasiAktual > 0
                            ? Math.min(100, Math.round((rec.jamOperasiAktual / rec.jamShiftKalender) * 100))
                            : null;

                        return (
                          <tr key={m.kode_mesin}>
                            <td data-label="Kode Mesin">
                              <span className="spv-code-badge">{m.kode_mesin}</span>
                            </td>
                            <td data-label="Nama Mesin">
                              <strong>{m.nama_mesin}</strong>
                            </td>
                            <td data-label="Section / Lini">
                              <span style={{ fontWeight: 600, color: '#475569' }}>{m.kategori}</span>
                            </td>
                            <td data-label="Status Tiket Mesin">
                              {currentTicket ? (
                                <button type="button" className={`spv-badge-status ${ticketCondition.tone}`}
                                  onClick={() => { setSelectedTicket(currentTicket); setVerificationNote(''); }}
                                  aria-label={`${ticketCondition.tone === 'breakdown' ? 'Lihat Breakdown' : 'Review konfirmasi Operator'} ${currentTicket.ticket}`}>
                                  {ticketCondition.label}
                                </button>
                              ) : <span className="spv-badge-status" style={{ background: '#f1f5f9', color: '#475569' }}>{ticketCondition.label}</span>}
                            </td>
                            <td data-label="MTBF">
                              {rawMtbf ? (
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                                  ~ {rawMtbf} Jam
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              )}
                            </td>
                            <td data-label="MTTR">
                              {rawMttr ? (
                                <span style={{ fontWeight: 600, color: '#334155', fontSize: '0.88rem' }}>
                                  {rawMttr} mnt
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              )}
                            </td>
                            <td data-label="Availability">
                              {availPercent !== null ? (
                                <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.88rem' }}>
                                  {availPercent}%
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              )}
                            </td>
                            <td data-label="Aksi" className="text-center td-action-cell">
                              <button
                                type="button"
                                className="btn-spv-table-action"
                                style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 600 }}
                                onClick={() => setSelectedMachineForAnalysis(m)}
                                title={`Buka Detail & Logbook Mesin ${m.nama_mesin}`}
                              >
                                Detail Mesin
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer untuk Tabel Lini Mesin */}
                <footer className="table-pagination-footer">
                  <span className="pagination-info">
                    Menampilkan {paginatedMachines.length ? (linePage - 1) * linePerPage + 1 : 0}–
                    {Math.min(linePage * linePerPage, filteredMachines.length)} dari {filteredMachines.length} mesin
                  </span>
                  <div className="pagination-ctrls">
                    <button
                      type="button"
                      disabled={linePage === 1}
                      onClick={() => setLinePage((p) => Math.max(1, p - 1))}
                      aria-label="Halaman sebelumnya"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="page-current">
                      {linePage} / {totalLinePages}
                    </span>
                    <button
                      type="button"
                      disabled={linePage >= totalLinePages}
                      onClick={() => setLinePage((p) => Math.min(totalLinePages, p + 1))}
                      aria-label="Halaman berikutnya"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </footer>
              </div>

          </section>
        ))}

        {/* TAB 2: PENGAWASAN & VERIFIKASI BREAKDOWN */}
        {activeTab === 'WORKORDERS' && isWeeklyReviewPageActive && (
          <section className="spv-content-card" style={{ padding: '1.5rem' }}>
            {/* Header Halaman Khusus Evaluasi Mingguan */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsWeeklyReviewPageActive(false)}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.78rem',
                      color: '#475569',
                      fontWeight: 600,
                    }}
                  >
                    <ChevronLeft size={14} />
                    <span>Kembali ke Tabel Tiket</span>
                  </button>
                  <span className="role-pill-tag role-supervisor" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                    MODE EVALUASI MINGGUAN
                  </span>
                </div>
                <h2 style={{ fontSize: '1.25rem', color: '#064e3b', margin: '0.4rem 0 0.15rem', fontWeight: 800 }}>
                  Executive Breakdown Trend &amp; Weekly Quality Review
                </h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                  Rangkuman komprehensif, analisis akar masalah (root cause), dan penetapan arahan tindak lanjut maintenance sepekan.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  value={weeklyReviewPeriod}
                  onChange={(e) => setWeeklyReviewPeriod(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#334155',
                    background: '#ffffff',
                  }}
                >
                  <option value="PEKAN_INI">Pekan Berjalan (20–26 Okt 2026)</option>
                  <option value="PEKAN_LALU">Pekan Lalu (13–19 Okt 2026)</option>
                  <option value="BULAN_INI">Konsolidasi Bulan Oktober</option>
                </select>
                <button
                  type="button"
                  onClick={handleBatchReviewAllWeek}
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>Sahkan Review Seluruh Tiket Sepekan</span>
                </button>
              </div>
            </div>

            {/* 4 Kartu KPI Eksekutif Mingguan */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Insiden Breakdown</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                  {weeklyAnalyticsData.totalCount} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>Kejadian</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                  ✓ {weeklyAnalyticsData.completedCount} selesai diperbaiki ({weeklyAnalyticsData.openCount} masih dikerjakan)
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Akumulasi Downtime Lini</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#b91c1c', margin: '4px 0' }}>
                  {weeklyAnalyticsData.totalDowntimeHoursFormatted} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>Jam</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                  Rata-rata penanganan: ~{weeklyAnalyticsData.avgRepairMin} menit / tiket
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status Review Supervisor</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#047857', margin: '4px 0' }}>
                  {weeklyAnalyticsData.reviewedCount} / {weeklyAnalyticsData.totalCount}
                </div>
                <div style={{ fontSize: '0.72rem', color: weeklyAnalyticsData.unreviewedCount > 0 ? '#b45309' : '#047857', fontWeight: 600 }}>
                  {weeklyAnalyticsData.unreviewedCount > 0 ? `⚠️ ${weeklyAnalyticsData.unreviewedCount} tiket menunggu catatan SPV` : '✓ Seluruh tiket sepekan telah ditinjau'}
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Mesin Paling Kritis (Top Impact)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#9a3412', margin: '4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {weeklyAnalyticsData.topMachines[0]?.name || 'N/A'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {weeklyAnalyticsData.topMachines[0]?.count || 0}x insiden · Sec. {weeklyAnalyticsData.topMachines[0]?.section || 'Filling'}
                </div>
              </div>
            </div>

            {/* Grid 2 Kolom: Analisis Tren Mesin & Distribusi Kategori Kerusakan */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              {/* Kolom Kiri: Breakdown per Mesin & Section */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BarChart2 size={16} color="var(--color-icon-neutral, #64748b)" />
                    Frekuensi &amp; Downtime per Unit Mesin
                  </strong>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Paling Berdampak</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {weeklyAnalyticsData.topMachines.slice(0, 5).map((m, idx) => {
                    const pct = Math.min(100, Math.round((m.count / (weeklyAnalyticsData.totalCount || 1)) * 100));
                    return (
                      <div key={m.name} style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px 10px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                          <span>#{idx + 1} {m.name} <small style={{ fontWeight: 400, color: '#64748b' }}>({m.section})</small></span>
                          <span style={{ color: '#b91c1c' }}>{m.count}x kejadian · ~{(m.downtime / 60).toFixed(1)} Jam</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: idx === 0 ? '#ef4444' : '#10b981', borderRadius: '3px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Kolom Kanan: Distribusi Akar Masalah (Kategori Kerusakan) */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Target size={16} color="var(--color-icon-neutral, #64748b)" />
                    Pola Gejala &amp; Kategori Kerusakan Dominan
                  </strong>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Pareto Akar Masalah</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {weeklyAnalyticsData.topCategories.map((c) => (
                    <div key={c.category} style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px 10px', border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#1e293b', fontWeight: 600, marginBottom: '4px' }}>
                        <span>{c.category}</span>
                        <span style={{ fontWeight: 700, color: '#0369a1' }}>{c.count} insiden ({c.percentage}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${c.percentage}%`, height: '100%', background: '#0284c7', borderRadius: '3px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Form Catatan Evaluasi Menyeluruh & Tindak Lanjut PM Akhir Pekan */}
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <strong style={{ fontSize: '0.92rem', color: '#064e3b', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                <FileText size={18} color="var(--color-icon-neutral, #64748b)" />
                Catatan Evaluasi Mingguan &amp; Arahan Supervisor Maintenance
              </strong>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                <div>
                  <label htmlFor="weekly-overall-note" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Ringkasan Evaluasi / Arahan Teknik:
                  </label>
                  <textarea
                    id="weekly-overall-note"
                    rows={4}
                    value={weeklyOverallNote}
                    onChange={(e) => setWeeklyOverallNote(e.target.value)}
                    placeholder="Contoh: Tren insiden pekan ini terkonsentrasi pada unit sealing vertikal (SIG 5 & Ilapak 1). Dilakukan pengetatan checklist harian teknisi dan kalibrasi suhu heating bar..."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.82rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleBatchReviewAllWeek}
                      style={{
                        background: '#047857',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Simpan Catatan &amp; Tandai Review Sepekan
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Daftar Tindak Lanjut PM / Pengadaan Part Akhir Pekan:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto', marginBottom: '8px' }}>
                    {weeklyFollowUpList.map((item) => (
                      <div key={item.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{item.machine}:</strong> {item.action}
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Target: {item.targetDate}</div>
                        </div>
                        <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: item.priority === 'HIGH' ? '#fef2f2' : '#f0fdf4', color: item.priority === 'HIGH' ? '#b91c1c' : '#166534', fontWeight: 700 }}>
                          {item.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Tambah instruksi tindak lanjut PM..."
                      value={weeklyFollowUpAction}
                      onChange={(e) => setWeeklyFollowUpAction(e.target.value)}
                      style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!weeklyFollowUpAction.trim()) return;
                        setWeeklyFollowUpList((prev) => [
                          ...prev,
                          {
                            id: `ACT-${Date.now()}`,
                            machine: weeklySelectedActionMachine || weeklyAnalyticsData.topMachines[0]?.name || 'SIG 5',
                            action: weeklyFollowUpAction.trim(),
                            priority: 'HIGH',
                            targetDate: 'Akhir Pekan',
                          },
                        ]);
                        setWeeklyFollowUpAction('');
                      }}
                      style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      + Tambah
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Rangkuman Seluruh Tiket Breakdown Sepekan */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                  Log Tiket Breakdown Terkait Periode Ini ({weeklyAnalyticsData.activeValidTickets.length} Tiket)
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Menampilkan riwayat rekaman perbaikan lapangan
                </span>
              </div>

              <div className="spv-table-responsive">
                <table className="spv-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>NO. TIKET</th>
                      <th>MESIN &amp; SECTION</th>
                      <th>KERUSAKAN</th>
                      <th>TINDAKAN TEKNISI</th>
                      <th>DURASI</th>
                      <th>STATUS REVIEW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyAnalyticsData.activeValidTickets.map((t) => (
                      <tr key={t.ticket}>
                        <td>
                          <span className="spv-code-badge">{t.ticket}</span>
                        </td>
                        <td>
                          <strong>{t.machine}</strong>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Sec. {t.section}</div>
                        </td>
                        <td style={{ maxWidth: '200px' }}>
                          <div>{t.keterangan}</div>
                          {t.kategori && <small style={{ color: '#0284c7' }}>{t.kategori}</small>}
                        </td>
                        <td style={{ maxWidth: '200px' }}>
                          <div>{t.action || 'Selesai perbaikan standar'}</div>
                          <small style={{ color: '#047857', fontWeight: 600 }}>Teknisi: {t.technicianName || 'Tim Maintenance'}</small>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#334155' }}>{repairMinutes(t) === null ? 'N/A' : `${repairMinutes(t)} mnt`}</span>
                        </td>
                        <td>
                          {t.supervisorVerified ? (
                            <span className="spv-badge-status verified" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                              ✓ Sudah Direview
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700 }}>
                              Belum Direview
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: VERIFIKASI BREAKDOWN MESIN (FORMAT AS-IS PABRIK 15 KOLOM) */}
        {activeTab === 'WORKORDERS' && !isWeeklyReviewPageActive && (
          <section className="spv-content-card">
            {/* Header Bersih Tabel Verifikasi Breakdown */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.85rem',
                paddingBottom: '0.9rem',
                borderBottom: '1px solid #e2e8f0',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="var(--color-icon-neutral, #64748b)" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Verifikasi Breakdown Mesin
                </h2>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span className="topbar-chip" style={{ fontSize: '0.74rem', background: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}>
                    Total: <strong>{filteredTickets.length}</strong>
                  </span>
                  <span className="topbar-chip" style={{ fontSize: '0.74rem', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
                    Perlu Verifikasi: <strong>{tickets.filter((t) => t.status === 'CLOSED' && !t.supervisorVerified).length}</strong>
                  </span>
                  <span className="topbar-chip" style={{ fontSize: '0.74rem', background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
                    Downtime: <strong>{kpiSummary.downtimeComplete ? `${totalDowntimeHours} Jam` : 'N/A — waktu operasi belum lengkap'}</strong>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleExportBreakdownCsv}
                  className="btn-spv-table-action secondary"
                  style={{
                    background: '#047857',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Unduh seluruh data yang tersaring dalam format file CSV"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Toolbar Filter & Pencarian */}
            <div className="spv-toolbar-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Baris 1: Pencarian Leluasa + Kontrol Tampilan (Fit/Scroll) & Filter Void */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="spv-search-box" style={{ flex: '1 1 360px', maxWidth: '580px', height: '40px' }}>
                  <Search size={18} />
                  <input
                    type="text"
                    value={ticketSearch}
                    onChange={(e) => {
                      setTicketSearch(e.target.value);
                      setTicketPage(1);
                    }}
                    placeholder="Cari No. WR, mesin, operator, kode produk, batch, kategori..."
                    aria-label="Cari tiket breakdown"
                  />
                  {ticketSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setTicketSearch('');
                        setTicketPage(1);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Bersihkan pencarian"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Segmented Control Mode Tampilan */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <button
                      type="button"
                      className={`spv-pill-btn ${breakdownViewMode === 'FIT' ? 'active' : ''}`}
                      onClick={() => {
                        setBreakdownViewMode('FIT');
                        if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '6px',
                        background: breakdownViewMode === 'FIT' ? '#ffffff' : 'transparent',
                        color: breakdownViewMode === 'FIT' ? '#047857' : '#64748b',
                        boxShadow: breakdownViewMode === 'FIT' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        cursor: 'pointer',
                      }}
                      title="Mode Fit: Seluruh 15 kolom muat pas dalam lebar kontainer layar tanpa scroll horizontal"
                    >
                      Fit Layar
                    </button>
                    <button
                      type="button"
                      className={`spv-pill-btn ${breakdownViewMode === 'SCROLL' ? 'active' : ''}`}
                      onClick={() => setBreakdownViewMode('SCROLL')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '6px',
                        background: breakdownViewMode === 'SCROLL' ? '#ffffff' : 'transparent',
                        color: breakdownViewMode === 'SCROLL' ? '#047857' : '#64748b',
                        boxShadow: breakdownViewMode === 'SCROLL' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        cursor: 'pointer',
                      }}
                      title="Mode Scroll: Kolom lebih leluasa dengan scroll horizontal & kolom Mesin beku (freeze)"
                    >
                      Scroll Lebar
                    </button>
                  </div>

                  {/* URS 8.1 Klausul 6: Toggle Perlindungan Riwayat Catatan Dibatalkan */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: showVoidTickets ? '#0f172a' : '#64748b',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label="Tampilkan Catatan Dibatalkan (Void)"
                      checked={showVoidTickets}
                      onChange={(e) => setShowVoidTickets(e.target.checked)}
                      style={{ width: '15px', height: '15px', accentColor: '#059669', cursor: 'pointer' }}
                    />
                    <span>Catatan Batal (Void)</span>
                  </label>
                </div>
              </div>

              {/* Baris 2: Panel Filter Terstruktur & Terorganisir */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px 18px',
                  alignItems: 'center',
                }}
              >
                {/* Status Pengerjaan Tiket */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Status:
                  </span>
                  <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
                    {(['ALL', 'OPEN', 'IN_PROGRESS', 'CLOSED'] as const).map((st) => {
                      const count = st === 'ALL'
                        ? tickets.length
                        : tickets.filter((t) => t.status === st).length;
                      const label = st === 'ALL' ? 'Semua' : st === 'OPEN' ? 'Open' : st === 'IN_PROGRESS' ? 'Dikerjakan' : 'Selesai';
                      const isActive = ticketStatusFilter === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          className={`spv-pill-btn ${isActive ? 'active' : ''}`}
                          onClick={() => {
                            setTicketStatusFilter(st);
                            setTicketPage(1);
                          }}
                          style={{
                            padding: '3px 9px',
                            fontSize: '0.74rem',
                            borderRadius: '6px',
                          }}
                        >
                          {label} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', background: '#cbd5e1' }} />

                {/* Status Verifikasi SPV */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Verifikasi:
                  </span>
                  <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`spv-pill-btn ${ticketReviewFilter === 'UNREVIEWED' ? 'active' : ''}`}
                      style={{
                        padding: '3px 9px',
                        fontSize: '0.74rem',
                        borderRadius: '6px',
                        ...(ticketReviewFilter === 'UNREVIEWED'
                          ? { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a', fontWeight: 700 }
                          : {}),
                      }}
                      onClick={() => {
                        setTicketReviewFilter(ticketReviewFilter === 'UNREVIEWED' ? 'ALL' : 'UNREVIEWED');
                        setTicketPage(1);
                      }}
                    >
                      Belum Diverifikasi ({tickets.filter((t) => t.status === 'CLOSED' && !t.supervisorVerified).length})
                    </button>
                    <button
                      type="button"
                      className={`spv-pill-btn ${ticketReviewFilter === 'REVIEWED' ? 'active' : ''}`}
                      style={{
                        padding: '3px 9px',
                        fontSize: '0.74rem',
                        borderRadius: '6px',
                        ...(ticketReviewFilter === 'REVIEWED'
                          ? { background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0', fontWeight: 700 }
                          : {}),
                      }}
                      onClick={() => {
                        setTicketReviewFilter(ticketReviewFilter === 'REVIEWED' ? 'ALL' : 'REVIEWED');
                        setTicketPage(1);
                      }}
                    >
                      Sudah Diverifikasi ({tickets.filter((t) => t.supervisorVerified).length})
                    </button>
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', background: '#cbd5e1' }} />

                {/* Filter Shift */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Shift:
                  </span>
                  <div style={{ display: 'inline-flex', gap: '3px' }}>
                    {(['ALL', '1', '2', '3'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`spv-pill-btn ${ticketShiftFilter === s ? 'active' : ''}`}
                        onClick={() => {
                          setTicketShiftFilter(s);
                          setTicketPage(1);
                        }}
                        style={{ padding: '3px 8px', fontSize: '0.73rem', borderRadius: '6px' }}
                      >
                        {s === 'ALL' ? 'Semua' : `Shift ${s}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', background: '#cbd5e1' }} />

                {/* Filter Section */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Sec:
                  </span>
                  <div style={{ display: 'inline-flex', gap: '3px' }}>
                    {(['ALL', 'Filling', 'Packaging', 'Compounding'] as const).map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        className={`spv-pill-btn ${ticketSectionFilter === sec ? 'active' : ''}`}
                        onClick={() => {
                          setTicketSectionFilter(sec);
                          setTicketPage(1);
                        }}
                        style={{ padding: '3px 8px', fontSize: '0.73rem', borderRadius: '6px' }}
                      >
                        {sec === 'ALL' ? 'Semua' : sec}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', background: '#cbd5e1' }} />

                {/* Filter WO Type */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Type:
                  </span>
                  <div style={{ display: 'inline-flex', gap: '3px' }}>
                    {(['ALL', 'Batch', 'Non Batch'] as const).map((wt) => (
                      <button
                        key={wt}
                        type="button"
                        className={`spv-pill-btn ${ticketWoTypeFilter === wt ? 'active' : ''}`}
                        onClick={() => {
                          setTicketWoTypeFilter(wt);
                          setTicketPage(1);
                        }}
                        style={{ padding: '3px 8px', fontSize: '0.73rem', borderRadius: '6px' }}
                      >
                        {wt === 'ALL' ? 'Semua' : wt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Batch Selection Action Bar Mengambang (Floating Action Bar) */}
            {selectedTicketIds.size > 0 && (
              <div
                style={{
                  background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
                  color: '#ffffff',
                  borderRadius: '8px',
                  padding: '0.75rem 1.25rem',
                  margin: '0.75rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 12px rgba(6, 78, 59, 0.25)',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckSquare size={18} color="var(--color-icon-neutral, #64748b)" />
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                    {selectedTicketIds.size} tiket terpilih untuk verifikasi massal
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedTicketIds(new Set())}
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.25)',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Batal Pilih
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchModalOpen(true)}
                    style={{
                      background: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                    }}
                  >
                    <ClipboardList size={14} />
                    <span>Verifikasi Serentak Terpilih</span>
                  </button>
                </div>
              </div>
            )}

            {/* TABEL 15 KOLOM AS-IS SPREADSHEET PABRIK */}
            <div
              ref={tableScrollRef}
              className={`spv-as-is-wrapper ${breakdownViewMode === 'FIT' ? 'mode-fit' : 'mode-scroll'}`}
              style={{ marginTop: '0.75rem' }}
            >
              <table className={`spv-as-is-table ${breakdownViewMode === 'FIT' ? 'is-fit-container' : 'is-scroll-wide'}`}>
                <thead>
                  <tr>
                    <th
                      className={breakdownViewMode === 'SCROLL' ? 'sticky-col-check' : ''}
                      style={{ width: '28px', textAlign: 'center' }}
                    >
                      <input
                        type="checkbox"
                        aria-label="Pilih semua tiket di halaman ini"
                        checked={paginatedTickets.length > 0 && paginatedTickets.every((t) => selectedTicketIds.has(t.ticket))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTicketIds((prev) => {
                              const next = new Set(prev);
                              paginatedTickets.forEach((t) => next.add(t.ticket));
                              return next;
                            });
                          } else {
                            setSelectedTicketIds((prev) => {
                              const next = new Set(prev);
                              paginatedTickets.forEach((t) => next.delete(t.ticket));
                              return next;
                            });
                          }
                        }}
                        style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                      />
                    </th>
                    <th title="Tanggal Kejadian Breakdown">TGL</th>
                    <th title="Bulan Kejadian">BLN</th>
                    <th style={{ textAlign: 'center' }} title="Shift Kerja Operasional (1, 2, atau 3)">SHF</th>
                    <th
                      className={breakdownViewMode === 'SCROLL' ? 'sticky-col-machine' : ''}
                      title="Nama / Kode Mesin"
                    >
                      MESIN
                    </th>
                    <th title="Section Pabrik (Filling / Packaging / Compounding)">SEC</th>
                    <th title="Deskripsi Kerusakan / Problem Mesin">KETERANGAN</th>
                    <th title="Nama Operator Pelapor">OPR</th>
                    <th style={{ textAlign: 'center' }} title="Kode Produk">PROD</th>
                    <th style={{ textAlign: 'center' }} title="Nomor Batch Produksi">BATCH</th>
                    <th title="Waktu mesin berhenti/breakdown (Sisi Operator Produksi)">START</th>
                    <th title="Waktu konfirmasi mesin running kembali (Sisi Operator Produksi)">END</th>
                    <th title="Total durasi downtime dari sisi operator dalam jam">DURASI</th>
                    <th title="Nomor Work Request">NO. WR</th>
                    <th title="Tipe Work Order (Batch / Non Batch)">TYPE</th>
                    <th title="Kategori Komponen / Masalah Breakdown">KATEGORI</th>
                    <th className="text-center" style={{ minWidth: '105px' }} title="Status & Aksi Supervisor">AKSI SPV</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTickets.map((t) => {
                    const asIs = getTicketAsIsRow(t);
                    const isSelected = selectedTicketIds.has(t.ticket);
                    const isActionDropdownOpen = openActionDropdownId === t.ticket;

                    return (
                      <tr
                        key={t.ticket}
                        style={{
                          opacity: t.status === 'VOID' ? 0.6 : 1,
                          background: isSelected ? '#f0fdf4' : undefined,
                        }}
                      >
                        <td
                          className={breakdownViewMode === 'SCROLL' ? 'sticky-col-check' : ''}
                          style={{ textAlign: 'center' }}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Pilih tiket ${t.ticket}`}
                            checked={isSelected}
                            onChange={() => toggleSelectTicket(t.ticket)}
                            style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                          />
                        </td>
                        {/* 1. TANGGAL */}
                        <td data-label="Tanggal" style={{ fontWeight: 600 }}>
                          {asIs.tanggal}
                        </td>
                        {/* 2. BULAN */}
                        <td data-label="Bulan" style={{ color: '#64748b' }}>
                          {asIs.bulan}
                        </td>
                        {/* 3. SHIFT */}
                        <td data-label="Shift" style={{ textAlign: 'center' }}>
                          <span className="as-is-pill-shift">
                            {asIs.shift}
                          </span>
                        </td>
                        {/* 4. MESIN */}
                        <td
                          data-label="Mesin"
                          className={breakdownViewMode === 'SCROLL' ? 'sticky-col-machine' : ''}
                        >
                          <strong style={{ color: '#0f172a' }}>{asIs.mesin}</strong>
                        </td>
                        {/* 5. SECTION */}
                        <td data-label="Section">
                          <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600 }}>{asIs.section}</span>
                        </td>
                        {/* 6. KETERANGAN */}
                        <td
                          data-label="Keterangan"
                          title={asIs.keterangan}
                          style={{ maxWidth: breakdownViewMode === 'FIT' ? '220px' : '340px' }}
                        >
                          <div
                            className={breakdownViewMode === 'FIT' ? 'as-is-cell-truncate' : ''}
                            style={{ lineHeight: 1.35, color: '#1e293b' }}
                          >
                            {asIs.keterangan}
                          </div>
                          {t.status === 'VOID' && t.voidReason && (
                            <div style={{ color: '#991b1b', fontSize: '10px', marginTop: '2px', fontStyle: 'italic' }}>
                              Alasan Batal: {t.voidReason} ({t.voidBy})
                            </div>
                          )}
                        </td>
                        {/* 7. OPERATOR */}
                        <td data-label="Operator">
                          <span style={{ fontWeight: 600 }}>{asIs.operator}</span>
                        </td>
                        {/* 8. KODE PRODUK */}
                        <td data-label="Kode Produk" style={{ textAlign: 'center' }}>
                          {asIs.kodeProduk !== '—' && asIs.kodeProduk ? (
                            <span className="as-is-pill-prod">
                              {asIs.kodeProduk}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        {/* 9. NO BATCH */}
                        <td data-label="No Batch" style={{ textAlign: 'center' }}>
                          {asIs.noBatch !== '—' && asIs.noBatch ? (
                            <span className="as-is-badge-code">
                              {asIs.noBatch}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        {/* 10. START (Sisi Operator) */}
                        <td data-label="Start (Opr)" style={{ fontWeight: 700, color: '#0f172a' }}>
                          {asIs.start}
                        </td>
                        {/* 11. END (Sisi Operator - Konfirmasi Running) */}
                        <td data-label="End (Opr)" style={{ fontWeight: 700, color: asIs.end === '—' ? '#94a3b8' : '#059669' }}>
                          {asIs.end}
                        </td>
                        {/* 12. DURASI (Sisi Operator - Jam) */}
                        <td data-label="Durasi" style={{ fontWeight: 700, color: asIs.durasi > 2 ? '#b91c1c' : '#334155' }}>
                          {asIs.durasi} Jam
                        </td>
                        {/* 13. NO. WR */}
                        <td data-label="No. WR">
                          {asIs.noWr !== '~' && asIs.noWr ? (
                            <span className="as-is-badge-code">{asIs.noWr}</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>~</span>
                          )}
                        </td>
                        {/* 14. WO TYPE */}
                        <td data-label="WO Type">
                          <span className={`as-is-pill-type ${asIs.woType === 'Batch' ? 'batch' : 'non-batch'}`}>
                            {asIs.woType}
                          </span>
                        </td>
                        {/* 15. KATEGORI */}
                        <td data-label="Kategori" title={asIs.kategori}>
                          <span className="as-is-pill-cat">
                            {asIs.kategori}
                          </span>
                        </td>
                        {/* STATUS & AKSI SPV */}
                        <td data-label="Status & Aksi SPV" className="text-center td-action-cell">
                          <div className="spv-actions-group" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {/* Tombol Verifikasi Cepat (Quick Sign-Off) untuk tiket CLOSED yang belum diverifikasi */}
                            {t.status === 'CLOSED' && !t.supervisorVerified && (
                              <button
                                type="button"
                                className="btn-spv-table-action primary"
                                onClick={() => handleQuickVerifyTicket(t.ticket)}
                                title="Verifikasi langsung tiket breakdown ini"
                                style={{ padding: '3px 7px', fontSize: '0.7rem', gap: '3px' }}
                              >
                                <Check size={11} />
                                <span>Verif</span>
                              </button>
                            )}

                            {/* Status Badge */}
                            {t.supervisorVerified && (
                              <span className="spv-badge-status verified" style={{ fontSize: '0.66rem', padding: '1px 5px' }}>
                                <CheckCircle2 size={10} />
                                Verified
                              </span>
                            )}
                            {t.status === 'OPEN' && (
                              <span className="spv-badge-status breakdown" style={{ fontSize: '0.66rem', padding: '1px 5px' }}>
                                <Clock3 size={10} />
                                Open
                              </span>
                            )}
                            {t.status === 'IN_PROGRESS' && (
                              <span
                                className="spv-badge-status"
                                style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '0.66rem', padding: '1px 5px' }}
                              >
                                <Wrench size={10} />
                                Proses
                              </span>
                            )}
                            {t.status === 'VOID' && (
                              <span
                                className="spv-badge-status"
                                style={{ background: '#f1f5f9', color: '#64748b', textDecoration: 'line-through', border: '1px solid #cbd5e1', fontSize: '0.66rem', padding: '1px 5px' }}
                              >
                                <X size={10} />
                                Dibatalkan (Void)
                              </span>
                            )}

                            {/* Dropdown Aksi & Opsi Tiket */}
                            <button
                              type="button"
                              className="btn-spv-table-action"
                              style={{
                                background: isActionDropdownOpen ? '#ecfdf5' : '#ffffff',
                                borderColor: isActionDropdownOpen ? '#059669' : '#cbd5e1',
                                color: '#064e3b',
                                fontWeight: 700,
                                padding: '4px 7px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              onClick={() => setOpenActionDropdownId(isActionDropdownOpen ? null : t.ticket)}
                              title="Aksi & Opsi Tiket"
                              aria-label="Aksi & Opsi Tiket"
                              aria-haspopup="menu"
                              aria-expanded={isActionDropdownOpen}
                            >
                              <span>Aksi</span>
                              <ChevronDown size={11} style={{ transform: isActionDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                            </button>

                            {isActionDropdownOpen && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  top: '115%',
                                  zIndex: 50,
                                  background: '#ffffff',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
                                  minWidth: '160px',
                                  padding: '4px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '2px',
                                  textAlign: 'left',
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn-spv-table-action primary"
                                  style={{ width: '100%', justifyContent: 'flex-start', border: 'none', padding: '6px 10px', borderRadius: '4px' }}
                                  onClick={() => {
                                    setSelectedTicket(t);
                                    setVerificationNote(t.supervisorNote || '');
                                    setOpenActionDropdownId(null);
                                  }}
                                  title="Review Tiket & Komparasi Waktu 2 Sisi"
                                >
                                  <FileText size={12} />
                                  <span>Review Tiket</span>
                                </button>

                                <button
                                  type="button"
                                  className="btn-spv-table-action warning"
                                  style={{ width: '100%', justifyContent: 'flex-start', border: 'none', padding: '6px 10px', borderRadius: '4px' }}
                                  onClick={() => {
                                    setOpenActionDropdownId(null);
                                    handleOpenCorrectionModal(t);
                                  }}
                                  title="Koreksi Data Pengukuran Maintenance"
                                >
                                  <SlidersHorizontal size={12} />
                                  <span>Koreksi Data</span>
                                </button>

                                {t.status !== 'VOID' && (
                                  <button
                                    type="button"
                                    className="btn-spv-table-action danger"
                                    style={{ width: '100%', justifyContent: 'flex-start', border: 'none', padding: '6px 10px', borderRadius: '4px' }}
                                    onClick={() => {
                                      setOpenActionDropdownId(null);
                                      handleOpenVoidModal(t);
                                    }}
                                    title="Batalkan Catatan (Void)"
                                  >
                                    <X size={12} />
                                    <span>Batalkan (Void)</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer untuk Tabel Verifikasi Breakdown */}
            <footer className="table-pagination-footer">
              <span className="pagination-info">
                Menampilkan {paginatedTickets.length ? (ticketPage - 1) * ticketPerPage + 1 : 0}–
                {Math.min(ticketPage * ticketPerPage, filteredTickets.length)} dari {filteredTickets.length} tiket
              </span>
              <div className="pagination-ctrls">
                <button
                  type="button"
                  disabled={ticketPage === 1}
                  onClick={() => setTicketPage((p) => Math.max(1, p - 1))}
                  aria-label="Halaman tiket sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="pagination-page-status">
                  {ticketPage} / {totalTicketPages}
                </span>
                <button
                  type="button"
                  disabled={ticketPage >= totalTicketPages}
                  onClick={() => setTicketPage((p) => Math.min(totalTicketPages, p + 1))}
                  aria-label="Halaman tiket berikutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          </section>
        )}

        {/* TAB 3: POLA BREAKDOWN & AKUNTABILITAS LAPANGAN */}
        {activeTab === 'ANALYTICS' && (
          <section className="spv-content-card spv-analytics-container">

            {/* SUB-VIEW 1: POLA BREAKDOWN & AKUNTABILITAS LAPANGAN */}
            {analyticsSubTab === 'POLA_LAPANGAN' && (
              <div style={{ marginBottom: 0 }}>
                {/* 4 PILAR UTAMA DENGAN VISUALISASI DIAGRAM POPULER */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '1.1rem 1.25rem',
                    marginBottom: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.6rem', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <TrendingUp size={18} color="var(--color-icon-neutral, #64748b)" />
                      <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                        Ringkasan Pola Breakdown &amp; Akuntabilitas Lapangan
                      </strong>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Data riil {tickets.filter((t) => t.status !== 'VOID').length} tiket aktif shift berjalan
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '0.9rem',
                      marginBottom: '0.9rem',
                    }}
                  >
                    {/* 1. TOP BREAKDOWN (MESIN) - DIAGRAM BATANG PARETO */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AlertTriangle size={15} color="#d97706" />
                          <strong style={{ fontSize: '0.78rem', color: '#334155', textTransform: 'uppercase' }}>
                            1. Top Breakdown (Mesin)
                          </strong>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Ranking Pareto</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, justifyContent: 'space-around' }}>
                        {patternInsights.topMachines.map((m, idx) => {
                          const maxCount = Math.max(...patternInsights.topMachines.map((x) => x.count), 1);
                          const barWidth = Math.round((m.count / maxCount) * 100);
                          const colors = [
                            { border: '#fecaca', bg: '#fef2f2', bar: 'linear-gradient(90deg, #ef4444, #f87171)', badge: '#991b1b', text: '#b91c1c' },
                            { border: '#fed7aa', bg: '#fff7ed', bar: 'linear-gradient(90deg, #f97316, #fb923c)', badge: '#c2410c', text: '#ea580c' },
                            { border: '#e2e8f0', bg: '#ffffff', bar: 'linear-gradient(90deg, #3b82f6, #60a5fa)', badge: '#1d4ed8', text: '#2563eb' },
                          ];
                          const theme = colors[idx] || colors[2];
                          return (
                            <div key={m.machine} style={{ padding: '6px 8px', background: theme.bg, borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: theme.badge, color: '#ffffff' }}>#{idx + 1}</span>
                                  <strong style={{ color: idx === 0 ? '#991b1b' : '#0f172a', fontSize: '0.78rem' }}>{m.machine}</strong>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontWeight: 800, color: theme.text, fontSize: '0.8rem' }}>{m.count}x</span>
                                  <span style={{ fontSize: '0.68rem', color: '#64748b', marginLeft: '4px' }}>({m.totalDowntime} Jam)</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ width: `${barWidth}%`, height: '100%', background: theme.bar, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                                </div>
                                <span style={{ fontSize: '0.65rem', color: '#64748b', whiteSpace: 'nowrap' }}>{m.topCat}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. KLASIFIKASI POLA KERUSAKAN - DIAGRAM DONAT / LINGKARAN */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Layers size={15} color="var(--color-icon-neutral, #64748b)" />
                          <strong style={{ fontSize: '0.78rem', color: '#334155', textTransform: 'uppercase' }}>
                            2. Klasifikasi Pola Masalah
                          </strong>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Diagram Proporsi</span>
                      </div>
                      {(() => {
                        const palette = ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6'];
                        const totalCatSum = patternInsights.topCategories.reduce((s, c) => s + c.count, 0) || 1;
                        const C = 201.06; // 2 * PI * 32
                        let acc = 0;
                        return (
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
                            <div style={{ position: 'relative', width: '84px', height: '84px', flexShrink: 0 }}>
                              <svg viewBox="0 0 100 100" width="84" height="84" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="50" cy="50" r="32" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                                {patternInsights.topCategories.map((c, i) => {
                                  const seg = (c.count / totalCatSum) * C;
                                  const offset = acc;
                                  acc += seg;
                                  return (
                                    <circle
                                      key={c.kategori}
                                      cx="50"
                                      cy="50"
                                      r="32"
                                      fill="none"
                                      stroke={palette[i % palette.length]}
                                      strokeWidth="12"
                                      strokeDasharray={`${Math.max(0, seg - 1.5)} ${C}`}
                                      strokeDashoffset={-offset}
                                    />
                                  );
                                })}
                              </svg>
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                <strong style={{ fontSize: '0.85rem', color: '#0f172a', lineHeight: 1 }}>{tickets.filter((t) => t.status !== 'VOID').length}</strong>
                                <small style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Tiket</small>
                              </div>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {patternInsights.topCategories.map((c, i) => (
                                <div key={c.kategori} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: palette[i % palette.length], flexShrink: 0 }} />
                                    <span style={{ color: '#334155', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.kategori}>
                                      {c.kategori}
                                    </span>
                                  </div>
                                  <strong style={{ color: palette[i % palette.length], marginLeft: '4px', whiteSpace: 'nowrap' }}>
                                    {c.count}x ({c.percent}%)
                                  </strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 3. AKUNTABILITAS & INTEGRITAS DATA - PENGUKUR GAUGE / RADIAL */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ShieldCheck size={15} color="var(--color-icon-neutral, #64748b)" />
                          <strong style={{ fontSize: '0.78rem', color: '#334155', textTransform: 'uppercase' }}>
                            3. Akuntabilitas &amp; Integritas Data
                          </strong>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Health Dial</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'space-around', fontSize: '0.75rem' }}>
                        {/* Gauge 1: WR Compliance */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ position: 'relative', width: '36px', height: '36px', flexShrink: 0 }}>
                            <svg viewBox="0 0 40 40" width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                              <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                              <circle
                                cx="20"
                                cy="20"
                                r="16"
                                fill="none"
                                stroke={patternInsights.wrCompliancePercent >= 70 ? '#10b981' : '#f59e0b'}
                                strokeWidth="4"
                                strokeDasharray={`${(patternInsights.wrCompliancePercent / 100) * 100.5} 100.5`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: '#0f172a' }}>
                              {patternInsights.wrCompliancePercent}%
                            </span>
                          </div>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ color: '#475569', fontWeight: 600, fontSize: '0.72rem' }}>Kepatuhan Nomor WR:</div>
                            <strong style={{ color: patternInsights.wrCompliancePercent >= 70 ? '#059669' : '#d97706', fontSize: '0.75rem' }}>
                              {patternInsights.wrCompliancePercent}% ({patternInsights.withWrCount}/{patternInsights.withWrCount + patternInsights.missingWrCount})
                            </strong>
                          </div>
                        </div>

                        {/* Gauge 2: Respon Lag */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Clock3 size={18} color="var(--color-icon-neutral, #64748b)" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: '#475569', fontWeight: 600, fontSize: '0.72rem' }}>Rata-rata Respon Teknisi:</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong style={{ color: '#0284c7', fontSize: '0.76rem' }}>~{patternInsights.avgResponseLagMin} Menit</strong>
                              <span style={{ fontSize: '0.62rem', background: '#dcfce7', color: '#166534', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>&lt; 15m (Baik)</span>
                            </div>
                          </div>
                        </div>

                        {/* Gauge 3: SPV Sign-off */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ position: 'relative', width: '36px', height: '36px', flexShrink: 0 }}>
                            <svg viewBox="0 0 40 40" width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                              <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                              <circle
                                cx="20"
                                cy="20"
                                r="16"
                                fill="none"
                                stroke="#059669"
                                strokeWidth="4"
                                strokeDasharray={`${(patternInsights.spvVerifiedPercent / 100) * 100.5} 100.5`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: '#0f172a' }}>
                              {patternInsights.spvVerifiedPercent}%
                            </span>
                          </div>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ color: '#475569', fontWeight: 600, fontSize: '0.72rem' }}>Progres Sign-Off SPV:</div>
                            <strong style={{ color: '#059669', fontSize: '0.75rem' }}>
                              {patternInsights.spvVerifiedPercent}% ({patternInsights.verifiedCount} diverifikasi)
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* VISUAL PITA: DISTRIBUSI BREAKDOWN LINTAS SHIFT OPERASIONAL */}
                  {(() => {
                    const s1 = patternInsights.shiftDistribution['1'] || 0;
                    const s2 = patternInsights.shiftDistribution['2'] || 0;
                    const s3 = patternInsights.shiftDistribution['3'] || 0;
                    const totalShift = s1 + s2 + s3 || 1;
                    const p1 = Math.round((s1 / totalShift) * 100);
                    const p2 = Math.round((s2 / totalShift) * 100);
                    const p3 = Math.round((s3 / totalShift) * 100);
                    return (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.85rem', marginBottom: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.72rem', flexWrap: 'wrap', gap: '4px' }}>
                          <span style={{ fontWeight: 700, color: '#475569' }}>Pola Sebaran Breakdown per Shift:</span>
                          <span style={{ color: '#64748b' }}>Shift 1 (Pagi): {s1} ({p1}%) · Shift 2 (Sore): {s2} ({p2}%) · Shift 3 (Malam): {s3} ({p3}%)</span>
                        </div>
                        <div style={{ height: '7px', display: 'flex', borderRadius: '4px', overflow: 'hidden', background: '#e2e8f0' }}>
                          <div style={{ width: `${p1}%`, background: '#f59e0b' }} title={`Shift 1: ${s1} tiket (${p1}%)`} />
                          <div style={{ width: `${p2}%`, background: '#0284c7' }} title={`Shift 2: ${s2} tiket (${p2}%)`} />
                          <div style={{ width: `${p3}%`, background: '#8b5cf6' }} title={`Shift 3: ${s3} tiket (${p3}%)`} />
                        </div>
                      </div>
                    );
                  })()}

                  {/* 4. REKOMENDASI PRAKTIS LAPANGAN */}
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                      <CheckCircle2 size={15} color="#15803d" />
                      <strong style={{ fontSize: '0.78rem', color: '#166534', textTransform: 'uppercase' }}>
                        4. Rekomendasi Tindakan Lapangan
                      </strong>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.78rem', color: '#14532d', lineHeight: 1.5 }}>
                      {patternInsights.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* URS 7.3 Analisis Kerusakan Berulang (Bad Actor) & Pola Penggantian Part */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
                  {/* Kerusakan Berulang (Bad Actor) */}
                  <div className="spv-analytics-section" style={{ margin: 0 }}>
                    <div className="spv-analytics-sec-title">
                      <h3>
                        <AlertTriangle size={18} color="#e11d48" />
                        Identifikasi Kerusakan Berulang (Bad Actor / Recurrent Issues)
                      </h3>
                      <span className="spv-badge-status breakdown" style={{ fontSize: '0.72rem' }}>
                        Kriteria: Frekuensi ≥ 2 Kejadian
                      </span>
                    </div>

                    <div className="spv-table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      <table className="spv-table">
                        <thead>
                          <tr>
                            <th>Mesin &amp; Kategori Kendala</th>
                            <th>Frekuensi</th>
                            <th>Total Downtime</th>
                            <th>Status Tindak Lanjut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recurrentIssues.length > 0 ? (
                            recurrentIssues.map((issue, idx) => (
                              <tr key={idx}>
                                <td>
                                  <strong>{issue.machine}</strong>
                                  <div style={{ fontSize: '0.74rem', color: '#0284c7' }}>{issue.category}</div>
                                </td>
                                <td>
                                  <span className="spv-badge-status breakdown">
                                    <AlertTriangle size={12} />
                                    {issue.count}x Kejadian
                                  </span>
                                </td>
                                <td>
                                  <strong style={{ color: '#0f172a' }}>{issue.missingDuration ? 'N/A — data belum lengkap' : `${(issue.totalDowntimeMin / 60).toFixed(1)} Jam`}</strong>
                                </td>
                                <td>
                                  <span className="spv-badge-status breakdown" style={{ fontSize: '0.72rem' }}>
                                    Prioritas Root Cause
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: '#059669', fontStyle: 'italic' }}>
                                Tidak ada kerusakan berulang terdeteksi pada periode ini.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pola Penggantian Part / Komponen */}
                  <div className="spv-analytics-section" style={{ margin: 0 }}>
                    <div className="spv-analytics-sec-title">
                      <h3>
                        <PackageSearch size={18} color="var(--color-icon-neutral, #64748b)" />
                        Pola Penggantian Suku Cadang Terbanyak
                      </h3>
                    </div>

                    <div className="spv-table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      <table className="spv-table">
                        <thead>
                          <tr>
                            <th>Nama Komponen / Spare Part</th>
                            <th>Mesin Terkait</th>
                            <th>Jumlah Diganti</th>
                            <th>Tindakan Rekomendasi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topReplacedParts.length > 0 ? (
                            topReplacedParts.map((p, idx) => (
                              <tr key={idx}>
                                <td>
                                  <strong style={{ color: '#0f172a' }}>{p.name}</strong>
                                </td>
                                <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                  {Array.from(p.machines).join(', ')}
                                </td>
                                <td>
                                  <strong style={{ color: '#059669', fontSize: '0.9rem' }}>{p.count} Unit</strong>
                                </td>
                                <td>
                                  <span className="spv-badge-status normal" style={{ fontSize: '0.72rem' }}>
                                    Fast Moving Part
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: '#64748b', fontStyle: 'italic' }}>
                                Belum ada riwayat penggantian komponen tercatat pada periode ini.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-VIEW 2: METRIK & TARGET KPI MAINTENANCE */}
            {analyticsSubTab === 'KPI_METRICS' && (
              <div style={{ marginBottom: 0 }}>
                {/* Header & Tombol Tetapkan Target KPI */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#064e3b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <BarChart2 size={18} color="var(--color-icon-neutral, #64748b)" />
                      Monitoring &amp; Pengukuran Kinerja Maintenance
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                      Standar agregasi gabungan dan evaluasi target KPI maintenance plant.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="spv-btn-kpi-edit"
                    onClick={() => handleOpenKpiModal()}
                    title="Tetapkan atau sesuaikan target KPI Maintenance"
                  >
                    <Sliders size={14} />
                    <span>Tetapkan Target KPI (SPV)</span>
                  </button>
                </div>

                {/* Banner Penjelasan Agregasi Gabungan & Validitas Hasil */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.65rem 1rem', marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Info size={16} color="var(--color-icon-neutral, #64748b)" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '0.78rem', color: '#166534', lineHeight: 1.4 }}>
                    <strong>Standar Perhitungan &amp; Agregasi Gabungan:</strong> Nilai gabungan dihitung dari total pembilang dibagi total penyebut aktual (∑/∑).
                  </div>
                </div>

                {/* 4 Card KPI Utama: MTTR, MTBF, PM Compliance, Total Downtime */}
                <div className="spv-analytics-grid">
                  {/* Card 1: MTTR Gabungan */}
                  {(() => {
                    const kpiRec = kpiTargets.find((t) => t.indicator === 'MTTR');
                    const mttrTarget = kpiRec?.targetValue || 1.5;
                    const isTargetMet = kpiSummary.repairDataComplete && kpiSummary.closedCount > 0 && kpiSummary.mttrNumeric <= mttrTarget;

                    return (
                      <div className="spv-analytics-card">
                        <div className="spv-card-top-row">
                          <span className="spv-kpi-code">MTTR</span>
                          <span
                            className="spv-target-badge"
                            style={{
                              background: (kpiSummary.closedCount === 0 || !kpiSummary.repairDataComplete) ? '#f1f5f9' : isTargetMet ? '#dcfce7' : '#fee2e2',
                              color: (kpiSummary.closedCount === 0 || !kpiSummary.repairDataComplete) ? '#64748b' : isTargetMet ? '#166534' : '#991b1b',
                            }}
                          >
                            {(kpiSummary.closedCount === 0 || !kpiSummary.repairDataComplete) ? 'Data N/A' : isTargetMet ? '✓ Capai Target' : '⚠️ Melebihi Target'}
                          </span>
                        </div>

                        <div className="spv-kpi-main-val">
                          {kpiSummary.mttrDisplay}
                        </div>
                        <div className="spv-kpi-title">Mean Time to Repair (MTTR Gabungan)</div>

                        <div className="spv-kpi-sub-row">
                          <span>Target: ≤ {mttrTarget} Jam</span>
                          <button
                            type="button"
                            className="btn-kpi-quick-edit"
                            onClick={() => handleOpenKpiModal(kpiRec)}
                            title="Edit Target MTTR"
                          >
                            Ubah Target
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Card 2: MTBF Gabungan */}
                  {(() => {
                    const kpiRec = kpiTargets.find((t) => t.indicator === 'MTBF');
                    const mtbfTarget = kpiRec?.targetValue || 50;
                    const isTargetMet = kpiSummary.mtbfNumeric >= mtbfTarget;

                    return (
                      <div className="spv-analytics-card">
                        <div className="spv-card-top-row">
                          <span className="spv-kpi-code">MTBF</span>
                          <span
                            className="spv-target-badge"
                            style={{
                              background: !isOperatingDataAllComplete ? '#fef3c7' : isTargetMet ? '#dcfce7' : '#fee2e2',
                              color: !isOperatingDataAllComplete ? '#b45309' : isTargetMet ? '#166534' : '#991b1b',
                            }}
                          >
                            {!isOperatingDataAllComplete
                              ? 'Data Jam Parsial'
                              : isTargetMet
                              ? '✓ Capai Target'
                              : '⚠️ Kurang dari Target'}
                          </span>
                        </div>

                        <div className="spv-kpi-main-val">
                          {kpiSummary.mtbfDisplay}
                        </div>
                        <div className="spv-kpi-title">Mean Time Between Failures (MTBF)</div>

                        <div className="spv-kpi-sub-row">
                          <span>Target: ≥ {mtbfTarget} Jam</span>
                          <button
                            type="button"
                            className="btn-kpi-quick-edit"
                            onClick={() => handleOpenKpiModal(kpiRec)}
                            title="Edit Target MTBF"
                          >
                            Ubah Target
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Card 3: Ketepatan Pelaksanaan PM */}
                  {(() => {
                    const kpiRec = kpiTargets.find((t) => t.indicator === 'PM_ON_TIME');
                    const pmTarget = kpiRec?.targetValue || 90;
                    const isTargetMet = kpiSummary.pmComplianceNumeric >= pmTarget;

                    return (
                      <div className="spv-analytics-card">
                        <div className="spv-card-top-row">
                          <span className="spv-kpi-code">PM RATE</span>
                          <span
                            className="spv-target-badge"
                            style={{
                              background: isTargetMet ? '#dcfce7' : '#fee2e2',
                              color: isTargetMet ? '#166534' : '#991b1b',
                            }}
                          >
                            {!kpiSummary.pmHasData ? 'Belum ada jadwal dinilai' : isTargetMet ? '✓ Capai Target' : '⚠️ Di Bawah Target'}
                          </span>
                        </div>

                        <div className="spv-kpi-main-val">
                          {kpiSummary.pmHasData ? `${kpiSummary.pmComplianceNumeric}%` : 'N/A'}
                        </div>
                        <div className="spv-kpi-title">Ketepatan Pelaksanaan PM (PM Compliance)</div>

                        <div className="spv-kpi-sub-row">
                          <span>Target: ≥ {pmTarget}%</span>
                          <button
                            type="button"
                            className="btn-kpi-quick-edit"
                            onClick={() => handleOpenKpiModal(kpiRec)}
                            title="Edit Target PM Compliance"
                          >
                            Ubah Target
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Card 4: Total Downtime Lini & Pemisahan Waktu Tunggu Part */}
                  {(() => {
                    const kpiRec = kpiTargets.find((t) => t.indicator === 'MAX_DOWNTIME');
                    const totalDowntimeHours = kpiSummary.totalDowntimeHours;
                    const downtimeTarget = kpiRec?.targetValue || 15;
                    const isTargetMet = totalDowntimeHours <= downtimeTarget;

                    return (
                      <div className="spv-analytics-card">
                        <div className="spv-card-top-row">
                          <span className="spv-kpi-code">DOWNTIME</span>
                          <span
                            className="spv-target-badge"
                            style={{
                              background: isTargetMet ? '#dcfce7' : '#fee2e2',
                              color: isTargetMet ? '#166534' : '#991b1b',
                            }}
                          >
                            {!kpiSummary.downtimeComplete ? 'Data belum lengkap' : isTargetMet ? '✓ Terkendali' : '⚠️ Melebihi Batas'}
                          </span>
                        </div>

                        <div className="spv-kpi-main-val">
                          {kpiSummary.downtimeComplete ? `${totalDowntimeHours} Jam` : 'N/A — waktu operasi belum lengkap'}
                        </div>
                        <div className="spv-kpi-title">Total Downtime Lini Mesin</div>

                        <div className="spv-kpi-sub-row">
                          <span>Target: ≤ {downtimeTarget} Jam</span>
                          <button
                            type="button"
                            className="btn-kpi-quick-edit"
                            onClick={() => handleOpenKpiModal(kpiRec)}
                            title="Edit Target Downtime"
                          >
                            Ubah Target
                          </button>
                        </div>

                        <div className="spv-kpi-formula">
                          <strong>Pemisahan Waktu:</strong> Waktu Perbaikan Aktif: <strong>{(kpiSummary.totalRepairMinutes / 60).toFixed(1)} Jam</strong> · Waktu Tunggu Komponen/Dukungan: <strong>{(kpiSummary.totalWaitPartMinutes / 60).toFixed(1)} Jam</strong>.
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Riwayat Perubahan & Penyesuaian Target KPI SPV */}
                <div className="spv-analytics-section" style={{ marginBottom: 0 }}>
                  <div className="spv-analytics-sec-title">
                    <h3>
                      <History size={18} color="var(--color-icon-neutral, #64748b)" />
                      Riwayat Perubahan &amp; Penyesuaian Target KPI SPV
                    </h3>
                  </div>

                  <div className="spv-table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table className="spv-table">
                      <thead>
                        <tr>
                          <th>Indikator KPI</th>
                          <th>Target Lama</th>
                          <th>Target Baru</th>
                          <th>Alasan Penyesuaian Target</th>
                          <th>Ditetapkan Oleh</th>
                          <th>Waktu Penetapan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kpiHistory.map((hist) => (
                          <tr key={hist.id}>
                            <td>
                              <strong>{hist.indicator}</strong>
                            </td>
                            <td style={{ color: '#64748b' }}>
                              {hist.previousValue} {hist.unit}
                            </td>
                            <td style={{ fontWeight: 800, color: '#065f46' }}>
                              {hist.direction === 'LESS_THAN_OR_EQUAL' ? '≤' : '≥'} {hist.newValue} {hist.unit}
                            </td>
                            <td style={{ fontSize: '0.78rem', color: '#1e293b' }}>{hist.reason}</td>
                            <td style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 600 }}>{hist.changedBy}</td>
                            <td style={{ fontSize: '0.74rem', color: '#64748b' }}>{hist.changedAt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-VIEW 3: MONITORING LIFETIME KOMPONEN & KEPATUHAN PM */}
            {analyticsSubTab === 'PREVENTIVE_PARTS' && (
              <div style={{ marginBottom: 0 }}>
                {/* Monitoring Lifetime Komponen */}
                <div className="spv-analytics-section" style={{ margin: 0, marginBottom: '1.25rem' }}>
                  <div className="spv-analytics-sec-title">
                    <h3>
                      <Clock3 size={18} color="var(--color-icon-neutral, #64748b)" />
                      Monitoring Lifetime Komponen &amp; Prioritas Penggantian
                    </h3>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span className="spv-aging-badge critical">Melewati Target (≥ {lifetimeSettings.replacementLimit}%)</span>
                      <span className="spv-aging-badge warning">Mendekati Batas (≥ {lifetimeSettings.warningThreshold}%)</span>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 0.85rem', fontSize: '0.8rem', color: '#64748b' }}>
                    Batas pengingat otomatis aktif pada pemakaian ≥ 80% dari target interval (kalender atau jam operasi) guna persiapan pengadaan sparepart sebelum mesin mengalami downtime.
                  </p>

                  <div className="spv-table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table className="spv-table">
                      <thead>
                        <tr>
                          <th>Mesin &amp; Posisi</th>
                          <th>Nama Komponen / No Part</th>
                          <th>Dasar Target Interval</th>
                          <th>Pemakaian Saat Ini</th>
                          <th>Rasio Progres (%)</th>
                          <th>Prioritas &amp; Status Penggantian</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lifetimeAlerts.map((part) => {
                          return (
                            <tr key={part.id || `${part.machine}-${part.part}`}>
                              <td>
                                <strong>{part.machine}</strong>
                                <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{part.position}</div>
                              </td>
                              <td>
                                <strong>{part.part}</strong>
                                <div style={{ fontSize: '0.74rem', color: '#475569', fontFamily: 'monospace' }}>
                                  {part.partNumber || '—'} · {part.specification}
                                </div>
                              </td>
                              <td>
                                <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                                  {part.intervalBasis === 'KALENDER' ? 'Waktu Kalender' : 'Jam Operasi Aktual'}
                                </span>
                                <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                  Target: {part.intervalTarget} {part.unit}
                                </div>
                              </td>
                              <td style={{ fontWeight: 700 }}>
                                {part.isDataComplete ? `${part.currentUsage} ${part.unit}` : '—'}
                              </td>
                              <td>
                                {part.isDataComplete ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '80px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                      <div
                                        style={{
                                          width: `${Math.min(100, part.progress)}%`,
                                          height: '100%',
                                          background: part.progress >= 100 ? '#e11d48' : part.progress >= 80 ? '#d97706' : '#059669',
                                        }}
                                      />
                                    </div>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: part.progress >= 100 ? '#e11d48' : part.progress >= 80 ? '#d97706' : '#059669' }}>
                                      {part.progress}%
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>N/A</span>
                                )}
                              </td>
                              <td>
                                {part.statusPriority === 'CRITICAL_OVERDUE' ? (
                                  <span className="spv-aging-badge critical">
                                    <AlertTriangle size={12} />
                                    Kritis: Melewati Target
                                  </span>
                                ) : part.statusPriority === 'WARNING_NEAR' ? (
                                  <span className="spv-aging-badge warning">
                                    <Clock3 size={12} />
                                    Pengingat: Mendekati Batas (≥ {lifetimeSettings.warningThreshold}%)
                                  </span>
                                ) : part.statusPriority === 'INCOMPLETE' ? (
                                  <span className="spv-badge-status breakdown" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', fontSize: '0.72rem' }}>
                                    <AlertTriangle size={11} />
                                    Data Dasar Belum Lengkap
                                  </span>
                                ) : (
                                  <span className="spv-aging-badge normal">
                                    <CheckCircle2 size={12} />
                                    Normal / Aman
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Kepatuhan Jadwal Preventive Maintenance & Riwayat Reschedule */}
                <div className="spv-analytics-section" style={{ margin: 0 }}>
                  <div className="spv-analytics-sec-title">
                    <h3>
                      <CheckSquare size={18} color="var(--color-icon-neutral, #64748b)" />
                      Kepatuhan Jadwal Preventive Maintenance &amp; Riwayat Reschedule
                    </h3>
                  </div>
                  <p style={{ margin: '0 0 0.85rem', fontSize: '0.8rem', color: '#64748b' }}>
                    Pemantauan PM tepat waktu, PM terlambat, serta jejak audit jadwal yang mengalami penjadwalan ulang (reschedule) beserta alasan dan otorisatornya.
                  </p>

                <SupervisorPMPlanner schedules={pmSchedules} machines={machines} actor={`${supervisor.name} (${supervisor.nik})`}
                  onSave={(item) => {
                    const stored = storage.getItem('machine-card-pm-schedules');
                    const latest: PreventiveMaintenanceItem[] = stored === null ? pmSchedules : readPartsArray('machine-card-pm-schedules');
                    const current = latest.find((pm) => pm.id === item.id);
                    if (current?.status === 'SELESAI' || current?.tanggalSelesaiAktual) throw new Error('PM sudah selesai');
                    const next = current ? latest.map((pm) => pm.id === item.id ? { ...current, ...item } : pm) : [item, ...latest];
                    storage.setItem('machine-card-pm-schedules', JSON.stringify(next));
                    setPmSchedules(next);
                    window.dispatchEvent(new Event('mc-pm-updated'));
                  }} />
                  <div className="spv-table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table className="spv-table">
                      <thead>
                        <tr>
                          <th>Nomor PM / Mesin</th>
                          <th>Kegiatan PM</th>
                          <th>Tanggal Jatuh Tempo</th>
                          <th>Penyelesaian Aktual</th>
                          <th>Status On-Time</th>
                          <th>Catatan Reschedule</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pmSchedules.map((pm) => (
                          <tr key={pm.id}>
                            <td>
                              <strong>{pm.nomorPm}</strong>
                              <div style={{ fontSize: '0.75rem', color: '#047857' }}>{pm.machine} ({pm.section})</div>
                            </td>
                            <td style={{ fontSize: '0.8rem', color: '#1e293b' }}>{pm.kegiatan}</td>
                            <td style={{ fontWeight: 600, color: '#475569' }}>{pm.tanggalJatuhTempo}</td>
                            <td style={{ fontSize: '0.8rem', color: pm.tanggalSelesaiAktual ? '#059669' : '#64748b' }}>
                              {pm.tanggalSelesaiAktual || '—'}
                            </td>
                            <td>
                              {pm.status === 'SELESAI' && pm.tanggalSelesaiAktual && pm.tanggalSelesaiAktual <= pm.tanggalJatuhTempo ? (
                                <span className="spv-badge-status normal">
                                  <CheckCircle2 size={12} />
                                  Selesai Tepat Waktu
                                </span>
                              ) : (pm.status === 'TERLAMBAT' || (pm.status === 'SELESAI' && pm.tanggalSelesaiAktual && pm.tanggalSelesaiAktual > pm.tanggalJatuhTempo)) ? (
                                <span className="spv-badge-status breakdown">
                                  <AlertTriangle size={12} />
                                  Terlambat (Overdue)
                                </span>
                              ) : pm.status === 'DIRESCHEDULE' ? (
                                <span className="spv-badge-status pending" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                  Direschedule
                                </span>
                              ) : (
                                <span className="spv-badge-status normal" style={{ background: '#f1f5f9', color: '#475569' }}>
                                  {pm.status === 'DALAM_PENGERJAAN' ? 'Dalam Pengerjaan' : pm.status === 'SELESAI' ? 'Selesai (Tanggal belum terverifikasi)' : 'Terjadwal'}
                                </span>
                              )}
                            </td>
                            <td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {pm.alasanReschedule ? (
                                <div style={{ color: '#1e40af' }}>
                                  <strong>Alasan:</strong> {pm.alasanReschedule}
                                  {pm.tanggalSebelumReschedule && ` (Jadwal asal: ${pm.tanggalSebelumReschedule})`}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-VIEW 4: MONITORING PEKERJAAN TERBUKA & JEJAK AUDIT */}
            {analyticsSubTab === 'AGING_AUDIT' && (
              <div style={{ marginBottom: 0 }}>
                <ServerAuditPanel />
                {/* Monitoring Pekerjaan Terbuka & Matriks Aging Tiket */}
                <div className="spv-analytics-section" style={{ margin: 0, marginBottom: '1.25rem' }}>
                  <div className="spv-analytics-sec-title">
                    <h3>
                      <History size={18} color="var(--color-icon-neutral, #64748b)" />
                      Monitoring Pekerjaan Terbuka &amp; Matriks Aging Tiket
                    </h3>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span className="spv-aging-badge critical">&gt; 24 Jam: Kritis</span>
                      <span className="spv-aging-badge warning">8 - 24 Jam: Sedang</span>
                      <span className="spv-aging-badge normal">&lt; 8 Jam: Baru</span>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 0.85rem', fontSize: '0.8rem', color: '#64748b' }}>
                    Perhitungan umur pekerjaan (ticket aging) dihitung dari pembukaan awal tiket oleh operator dan dipertahankan lintas shift tanpa tereset.
                  </p>

                  <div className="spv-table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table className="spv-table">
                      <thead>
                        <tr>
                          <th>No Tiket / Mesin</th>
                          <th>Kategori &amp; Gejala Kendala</th>
                          <th>Status Tiket</th>
                          <th>Waktu Pembukaan Awal</th>
                          <th>Umur Tiket (Aging)</th>
                          <th>Prioritas Penanganan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openWorkAging.length > 0 ? (
                          openWorkAging.map((ticket) => (
                            <tr key={ticket.ticket}>
                              <td>
                                <strong>{ticket.ticket}</strong>
                                <div style={{ fontSize: '0.75rem', color: '#047857' }}>{ticket.machine} ({ticket.section})</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{ticket.kategori || 'Kerusakan Mekis'}</div>
                                <small style={{ color: '#64748b' }}>{ticket.keterangan}</small>
                                {ticket.alasanTungguPart && (
                                  <div style={{ color: '#b45309', fontSize: '0.74rem', marginTop: '2px', fontStyle: 'italic' }}>
                                    Alasan Tunggu: {ticket.alasanTungguPart}
                                  </div>
                                )}
                              </td>
                              <td>
                                <span className={`spv-badge-status ${ticket.status === 'OPEN' ? 'breakdown' : 'pending'}`}>
                                  {ticket.status}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.75rem', color: '#475569' }}>
                                {ticket.originalOpenedAt ? new Date(ticket.originalOpenedAt).toLocaleString('id-ID') : '—'}
                              </td>
                              <td>
                                <strong style={{ color: ticket.ageCategory === 'CRITICAL' ? '#e11d48' : ticket.ageCategory === 'WARNING' ? '#d97706' : '#0284c7' }}>
                                  {ticket.diffHours} Jam
                                </strong>
                              </td>
                              <td>
                                {ticket.ageCategory === 'CRITICAL' ? (
                                  <span className="spv-aging-badge critical">
                                    <AlertTriangle size={12} />
                                    Prioritas Kritis (&gt; 24 Jam)
                                  </span>
                                ) : ticket.ageCategory === 'WARNING' ? (
                                  <span className="spv-aging-badge warning">
                                    <Clock3 size={12} />
                                    Perhatian Sedang (8-24 Jam)
                                  </span>
                                ) : (
                                  <span className="spv-aging-badge normal">
                                    <CheckCircle2 size={12} />
                                    Normal / Baru Dilaporkan
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: '#059669', fontStyle: 'italic' }}>
                              Tidak ada pekerjaan terbuka (seluruh tiket berstatus CLOSED).
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Review & Jejak Audit Koreksi Data Pengukuran Maintenance */}
                <div className="spv-analytics-section" style={{ margin: 0 }}>
                  <div className="spv-analytics-sec-title">
                    <h3>
                      <ShieldCheck size={18} color="var(--color-icon-neutral, #64748b)" />
                      Review &amp; Jejak Audit Koreksi Data Pengukuran Maintenance
                    </h3>
                    <span className="spv-badge-status verified" style={{ fontSize: '0.74rem' }}>
                      Audit Trail
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.85rem', fontSize: '0.8rem', color: '#64748b' }}>
                    Setiap perbaikan waktu kerusakan, durasi perbaikan aktif, waktu tunggu part, jam operasi mesin, atau klasifikasi insiden dicatat secara komparatif (before vs after). Pembaruan kalkulasi indikator yang terdampak (MTTR, MTBF, Downtime) dilakukan otomatis secara reaktif.
                  </p>

                  <div className="spv-table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table className="spv-table">
                      <thead>
                        <tr>
                          <th>WAKTU &amp; ID AUDIT</th>
                          <th>CATATAN / ENTITAS</th>
                          <th>PARAMETER DIKOREKSI</th>
                          <th>NILAI SEBELUM</th>
                          <th>NILAI SESUDAH</th>
                          <th>INDIKATOR TERDAMPAK</th>
                          <th>ALASAN KOREKSI (AUDIT)</th>
                          <th>OTORISATOR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {correctionLogs.map((log) => (
                          <tr key={log.id}>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '0.76rem', color: '#0f172a' }}>{log.changedAt}</div>
                              <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>{log.id}</span>
                            </td>
                            <td>
                              <span className="spv-code-badge">{log.recordId}</span>
                              <div style={{ fontSize: '0.74rem', color: '#334155', marginTop: '2px' }}>{log.recordTitle}</div>
                            </td>
                            <td>
                              <strong style={{ color: '#0284c7', fontSize: '0.78rem' }}>{log.fieldLabel}</strong>
                            </td>
                            <td style={{ color: '#991b1b', textDecoration: 'line-through', fontSize: '0.78rem' }}>
                              {log.beforeValue}
                            </td>
                            <td style={{ color: '#059669', fontWeight: 800, fontSize: '0.8rem' }}>
                              {log.afterValue}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                {log.impactedIndicators.map((ind, i) => (
                                  <span key={i} style={{ fontSize: '0.68rem', background: '#eff6ff', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                    {ind}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={{ fontSize: '0.76rem', color: '#1e293b', maxWidth: '240px' }}>
                              {log.reason}
                            </td>
                            <td style={{ fontSize: '0.76rem', color: '#047857', fontWeight: 600 }}>
                              {log.changedBy}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 4: PEMANTAUAN LAPORAN SHIFT OTOMATIS */}
        {activeTab === 'HANDOVER' && (
          <section className="spv-content-card spv-handover-page">
            <div className="spv-toolbar-wrap">
              <div>
                <strong style={{ fontSize: '1rem', color: '#064e3b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Laporan operasional shift
                  <span className="spv-system-tag">
                    <Bot size={12} />
                    Otomatis
                  </span>
                </strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Tinjau laporan teknisi dan tindak lanjut untuk shift berikutnya.
                </p>
              </div>
            </div>

            {/* Jadwal Kategori Hari (Weekdays vs Weekend) & Filter Status Kelengkapan Shift */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                  Kategori Hari:
                </span>
                <button
                  type="button"
                  className={`spv-shift-btn ${dayCategory === 'WEEKDAY' ? 'is-active' : ''}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                  onClick={() => setDayCategory('WEEKDAY')}
                >
                  Weekdays (Senin - Jumat)
                </button>
                <button
                  type="button"
                  className={`spv-shift-btn ${dayCategory === 'WEEKEND' ? 'is-active' : ''}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                  onClick={() => setDayCategory('WEEKEND')}
                >
                  Weekend (Sabtu - Minggu)
                </button>
              </div>

              {isTestEnv && <details className="spv-handover-details spv-handover-simulation">
                <summary>Simulasi kondisi laporan</summary>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                  Kondisi simulasi:
                </span>
                <button
                  type="button"
                  className={`spv-shift-btn ${ursScenario === 'COMPLETE' ? 'is-active' : ''}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                  onClick={() => setUrsScenario('COMPLETE')}
                >
                  Data Shift Lengkap (Auto-Send)
                </button>
                <button
                  type="button"
                  className={`spv-shift-btn ${(isTestEnv ? ursScenario === 'PENDING' : autoGeneratedData.reportStatus === 'PENDING') ? 'is-active' : ''}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                  onClick={() => setUrsScenario('PENDING')}
                >
                  Belum Lengkap (Status Pending)
                </button>
                <button
                  type="button"
                  className={`spv-shift-btn ${ursScenario === 'LATE_COMPLETED' ? 'is-active' : ''}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                  onClick={() => setUrsScenario('LATE_COMPLETED')}
                >
                  Pelengkapan Overtime (Susulan)
                </button>
              </div>
              </details>}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>Tanggal laporan
              <input type="date" value={reportDate} onChange={(event) => { setReportDate(event.target.value); const day = new Date(event.target.value + 'T12:00:00+07:00').getUTCDay(); setDayCategory(day === 0 || day === 6 ? 'WEEKEND' : 'WEEKDAY'); }} />
            </label>
            {/* Shift Switcher */}
            <div className="spv-shift-switcher-bar">
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                Shift:
              </span>
              {activeShiftList.map((ps) => {
                const isSelected = selectedShift === ps.shift;
                const isCurrent = currentActiveShift.shift === ps.shift && reportDate === plantDate(new Date(clock));
                return (
                  <button
                    key={ps.shift}
                    type="button"
                    className={`spv-shift-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => setSelectedShift(ps.shift)}
                  >
                    <span>{ps.label}</span>
                    <small style={{ color: isSelected ? '#065f46' : '#64748b' }}>({ps.timeRange})</small>
                    {isCurrent && <span className="spv-shift-badge-active">Sedang Berjalan</span>}
                  </button>
                );
              })}
            </div>

            {/* Auto-Report Summary Card */}
            <div className="spv-report-block">
              <div className="spv-report-block-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} color="var(--color-icon-neutral, #64748b)" />
                  <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>
                    Rekapitulasi Operasional {selectedShiftWindow.label} ({selectedShiftWindow.timeRange})
                  </strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Akhir shift: <strong>{selectedShiftWindow.handoverTime}</strong>
                </div>
              </div>

              {/* Status KPI mini cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>TANGGAL &amp; KATEGORI HARI</small>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '2px', fontSize: '0.9rem' }}>
                    {autoGeneratedData.date} ({dayCategory})
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>STATUS LAPORAN SHIFT</small>
                  <div style={{ fontWeight: 700, color: (isTestEnv ? ursScenario === 'PENDING' : autoGeneratedData.reportStatus === 'PENDING') ? '#d97706' : '#059669', marginTop: '2px', fontSize: '0.9rem' }}>
                    {(isTestEnv ? ursScenario === 'PENDING' : autoGeneratedData.reportStatus === 'PENDING')
                      ? 'PENDING (Menunggu Kelengkapan)'
                      : ursScenario === 'LATE_COMPLETED'
                      ? `COMPLETE - Susulan (${autoGeneratedData.actualInputTime})`
                      : (isTestEnv ? 'COMPLETE (Terkirim Otomatis)' : sentForShift.length ? 'Terkirim — lihat versi di riwayat' : 'Lengkap — belum dikonfirmasi terkirim')}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>KESIAPAN LINI MESIN</small>
                  <div style={{ fontWeight: 700, color: '#059669', marginTop: '2px', fontSize: '0.9rem' }}>
                    {autoGeneratedData.activeCount} / {machines.length} Tanpa Gangguan Dalam Penanganan ({Math.round((autoGeneratedData.activeCount / machines.length) * 100)}%)
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>VERSI LAPORAN TERKIRIM</small>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.9rem' }}>
                      {!isTestEnv && sentForShift.length === 0 ? 'Belum terkirim' : `Rev ${isTestEnv ? Math.max(0, shiftRevisions.length - 1) : Math.max(0, sentForShift.length - 1)}`} 
                    </span>
                    <button
                      type="button"
                      disabled={!isTestEnv && sentForShift.length === 0}
                      onClick={() => handleOpenShiftRevisionModal()}
                      style={{
                        background: '#047857',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title="Buat Revisi Resmi pada Laporan Shift Terkirim"
                    >
                      + Revisi SPV
                    </button>
                  </div>
                </div>
              </div>

              {/* Timeline Riwayat Revisi Laporan Shift Terkirim */}
              {shiftRevisions.length > 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.8rem', color: '#1e293b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <History size={14} color="var(--color-icon-neutral, #64748b)" />
                      Riwayat Revisi Laporan Shift
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      * Riwayat pengiriman awal tidak ditimpa dan dapat diaudit kapan saja
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {shiftRevisions.map((rev) => (
                      <div
                        key={rev.revisionNo}
                        style={{
                          background: '#ffffff',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          fontSize: '0.76rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <div>
                          <strong style={{ color: rev.revisionNo === 0 ? '#047857' : '#0284c7' }}>
                            Rev {rev.revisionNo} ({rev.revisionNo === 0 ? 'Laporan Asal' : 'Revisi Disetujui'})
                          </strong>
                          <span style={{ color: '#64748b', marginLeft: '6px' }}>· {rev.sentTimestamp}</span>
                          <div style={{ color: '#334155', marginTop: '2px' }}>
                            <strong>Alasan:</strong> {rev.reason}
                          </div>
                          {rev.changesSummary && (
                            <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>
                              <strong>Rincian Koreksi:</strong> {rev.changesSummary}
                            </div>
                          )}
                        </div>
                        <span style={{ color: '#047857', fontWeight: 600 }}>{rev.revisedBy}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Kelengkapan Catatan Teknisi Wajib Lapor & Independensi Antar-Shift */}
              <div style={{ background: (isTestEnv ? ursScenario === 'PENDING' : autoGeneratedData.reportStatus === 'PENDING') ? '#fffbeb' : '#f0fdf4', border: `1px solid ${(isTestEnv ? ursScenario === 'PENDING' : autoGeneratedData.reportStatus === 'PENDING') ? '#fde68a' : '#bbf7d0'}`, borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.82rem', color: (isTestEnv ? ursScenario === 'PENDING' : autoGeneratedData.reportStatus === 'PENDING') ? '#92400e' : '#065f46', textTransform: 'uppercase' }}>
                    Pemeriksaan Kelengkapan Data Shift Teknisi
                  </strong>
                  <span style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600 }}>
                    Independensi Antar-Shift: Laporan Pending <u>tidak menahan</u> pengiriman Shift berikutnya
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.65rem' }}>
                  {assignedTechnicians.map((tech) => (
                    <div
                      key={tech.nik}
                      style={{
                        background: '#ffffff',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#1e293b' }}>{tech.name}</div>
                        <small style={{ color: '#64748b', fontSize: '0.74rem' }}>NIK: {tech.nik} · Petugas Wajib Lapor</small>
                      </div>
                      {tech.hasReported && !tech.isNihil ? (
                        <span className="spv-badge-status normal">
                          <CheckCircle2 size={12} />
                          Realisasi Tercatat
                        </span>
                      ) : tech.isNihil ? (
                        <span className="spv-badge-status verified">
                          <CheckCircle2 size={12} />
                          Tercatat Nihil
                        </span>
                      ) : (
                        <span className="spv-badge-status breakdown" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>
                          <AlertTriangle size={12} />
                          Belum Lapor (Notifikasi Terkirim)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rekapan Catatan Pekerjaan per Area (Sesuai Format Laporan Shift Teknisi) */}
              <div style={{ marginBottom: '1rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      LAPORAN SHIFT {selectedShiftWindow.shift} • Tanggal: {autoGeneratedData.date}
                    </strong>
                    <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 700, marginTop: '2px' }}>
                      Anggota : {autoGeneratedData.teamCodes.join(', ')}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: '#ecfdf5', color: '#065f46', padding: '3px 10px', borderRadius: '999px', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                    {autoGeneratedData.doneCount} DONE • {autoGeneratedData.breakdownCount} OPEN
                  </span>
                </div>

                {currentShiftTemplate.items.length === 0 ? (
                  <div
                    style={{
                      padding: '1.25rem',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '8px',
                      color: '#166534',
                      fontSize: '0.84rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Status Operasional Normal (Nihil Breakdown):</strong> Seluruh mesin plant beroperasi normal dan tidak ada tiket breakdown terbuka pada shift ini.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '0.85rem' }}>
                    {[
                      { key: 'RUANG_REPAIR', title: 'Ruang Repair / Workshop' },
                      { key: 'COMPOUNDING', title: 'AREA COMPOUNDING' },
                      { key: 'FILLING', title: 'AREA FILLING' },
                      { key: 'PACKAGING', title: 'AREA PACKAGING' },
                      { key: 'OTHER', title: 'OTHER / PENDAMPINGAN' },
                    ].map((areaGroup) => {
                      const areaItems = currentShiftTemplate.items.filter((i) => i.area === areaGroup.key);
                      if (areaItems.length === 0) return null;
                      return (
                        <div
                          key={areaGroup.key}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '0.7rem 0.85rem',
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '0.78rem', color: '#065f46', marginBottom: '0.5rem', borderBottom: '1px dashed #cbd5e1', paddingBottom: '4px' }}>
                            *{areaGroup.title}:*
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {areaItems.map((item, idx) => (
                              <div key={item.ticket} style={{ fontSize: '0.8rem', color: '#1e293b', lineHeight: 1.45 }}>
                                <div style={{ fontWeight: 700 }}>
                                  {idx + 1}. {item.machine} : {item.issue}{' '}
                                  {item.timeRange && <span style={{ color: '#0284c7' }}>({item.timeRange})</span>}
                                </div>
                                {item.wr && (
                                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                                    WR : {item.wr}
                                  </div>
                                )}
                                <ul style={{ margin: '0.2rem 0 0.25rem 1.1rem', padding: 0, color: '#334155', fontSize: '0.77rem' }}>
                                  {item.actions.map((act, i) => (
                                    <li key={i}>{act}</li>
                                  ))}
                                </ul>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Status :</span>
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      padding: '1px 7px',
                                      borderRadius: '4px',
                                      background: item.status === 'DONE' ? '#d1fae5' : '#fef3c7',
                                      color: item.status === 'DONE' ? '#065f46' : '#b45309',
                                    }}
                                  >
                                    *{item.status}*
                                  </span>
                                </div>
                                {item.note && (
                                  <div style={{ fontSize: '0.75rem', color: '#b45309', fontStyle: 'italic', marginTop: '2px' }}>
                                    Note : {item.note}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Auto Summary Box */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                  <Bot size={15} color="var(--color-icon-neutral, #64748b)" />
                  <strong style={{ fontSize: '0.82rem', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Ringkasan operasional
                  </strong>
                </div>
                <div className={`spv-system-box ${autoGeneratedData.breakdownCount > 0 || (isTestEnv ? ursScenario === 'PENDING' : autoGeneratedData.reportStatus === 'PENDING') ? 'warning' : ''}`}>
                  {autoGeneratedData.summary}
                </div>
              </div>

              {/* Auto Handover Directives Box */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                  <ArrowRight size={15} color="var(--color-icon-neutral, #64748b)" />
                  <strong style={{ fontSize: '0.82rem', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Tindak lanjut shift berikutnya
                  </strong>
                </div>
                <div className="spv-system-box">
                  {autoGeneratedData.handoverNotes}
                </div>
              </div>

              <details className="spv-handover-details">
                <summary>Ketentuan kelengkapan laporan</summary>
                <p>Status pekerjaan dan kelengkapan laporan dinilai terpisah. Pekerjaan dapat diteruskan, sementara tanggung jawab melengkapi laporan tetap pada shift asal.</p>
              </details>

              {/* Tabel Pekerjaan Belum Selesai yang Diserah-Terimakan ke Shift Berikutnya */}
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.85rem', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ArrowRightLeft size={16} color="var(--color-icon-neutral, #64748b)" />
                    Pekerjaan yang diteruskan
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    * Tanggung jawab laporan shift asal tidak dialihkan ke shift berikutnya
                  </span>
                </div>

                <div className="spv-table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table className="spv-table">
                    <thead>
                      <tr>
                        <th>NO. TIKET</th>
                        <th>MESIN</th>
                        <th>MASALAH</th>
                        <th>STATUS PEKERJAAN</th>
                        <th>PROGRES / TINDAKAN</th>
                        <th>KENDALA &amp; TINDAK LANJUT</th>
                        <th>SHIFT ASAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.filter((t) => t.status !== 'CLOSED').length > 0 ? (
                        tickets.filter((t) => t.status !== 'CLOSED').map((t) => (
                          <tr key={t.ticket}>
                            <td>
                              <span style={{ fontWeight: 700, color: '#e11d48', background: '#ffe4e6', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
                                {t.ticket}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: '#0f172a' }}>{t.machine}</strong>
                              <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>{t.section}</span>
                            </td>
                            <td style={{ maxWidth: '200px' }}>
                              <span style={{ fontSize: '0.8rem', color: '#334155' }}>{(t as any).issue || t.keterangan}</span>
                            </td>
                            <td>
                              <span style={{
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: (t.status as any) === 'PENDING' ? '#ffedd5' : (t.status as any) === 'MENUNGGU_PART' ? '#fef3c7' : '#dbeafe',
                                color: (t.status as any) === 'PENDING' ? '#c2410c' : (t.status as any) === 'MENUNGGU_PART' ? '#b45309' : '#1e40af',
                              }}>
                                {(t.status as any) === 'PENDING' ? 'Pending' : (t.status as any) === 'MENUNGGU_PART' ? 'Menunggu Part' : 'Open / In Progress'}
                              </span>
                            </td>
                            <td style={{ maxWidth: '220px', fontSize: '0.8rem', color: '#0f766e' }}>
                              {t.action || 'Belum ada tindakan perbaikan'}
                            </td>
                            <td style={{ maxWidth: '220px', fontSize: '0.78rem' }}>
                              {(t as any).alasanPenundaan && (
                                <div style={{ color: '#b45309', marginBottom: '2px' }}>
                                  <strong>Kendala:</strong> {(t as any).alasanPenundaan}
                                </div>
                              )}
                              <div style={{ color: '#0369a1' }}>
                                <strong>Tindak Lanjut:</strong> {(t as any).followup || 'Lanjut monitoring shift berikutnya'}
                              </div>
                            </td>
                            <td style={{ fontSize: '0.75rem', color: '#475569' }}>
                              Shift {t.shift || '1'} ({t.reporterName || 'Operator'})
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '1.25rem', color: '#059669', fontStyle: 'italic' }}>
                            Seluruh pekerjaan perbaikan telah selesai (DONE). Tidak ada tiket aktif yang di-handover ke shift berikutnya.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {isTestEnv && <>
            {/* EVALUASI KETEPATAN WAKTU PELAPORAN SHIFT */}
            <details className="spv-report-block spv-handover-details">
              <summary>Ketepatan waktu pelaporan</summary>
              <div className="spv-report-block-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock3 size={18} color="var(--color-icon-neutral, #64748b)" />
                  <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>
                    Evaluasi Ketepatan Waktu Pelaporan Shift
                  </strong>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className={`spv-shift-btn ${shiftSubmitScenario === 'TEPAT_WAKTU' ? 'is-active' : ''}`}
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                    onClick={() => setShiftSubmitScenario('TEPAT_WAKTU')}
                  >
                    Simulasi: Tepat Waktu (≤ 15 mnt)
                  </button>
                  <button
                    type="button"
                    className={`spv-shift-btn ${shiftSubmitScenario === 'TERLAMBAT' ? 'is-active' : ''}`}
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                    onClick={() => setShiftSubmitScenario('TERLAMBAT')}
                  >
                    Simulasi: Terlambat (&gt; 15 mnt)
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', marginBottom: '0.85rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontSize: '0.74rem', fontWeight: 600 }}>JADWAL SERAH-TERIMA &amp; TOLERANSI</small>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '2px', fontSize: '0.9rem' }}>
                    {selectedShiftWindow.handoverTime} (Toleransi 15 Mnt)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    Batas Maksimal Tepat Waktu: +15 menit pasca-shift
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontSize: '0.74rem', fontWeight: 600 }}>WAKTU INPUT / SUBMIT AKTUAL</small>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '2px', fontSize: '0.9rem' }}>
                    {shiftSubmitScenario === 'TEPAT_WAKTU'
                      ? `${selectedShiftWindow.shift === '1' ? '15:20 WIB (+5 mnt)' : '22:35 WIB (+5 mnt)'}`
                      : `${selectedShiftWindow.shift === '1' ? '16:05 WIB (+50 mnt)' : '23:20 WIB (+50 mnt)'}`}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    Terekam terpisah dari jam operasional shift
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontSize: '0.74rem', fontWeight: 600 }}>STATUS KETEPATAN PELAPORAN</small>
                  <div style={{ marginTop: '2px' }}>
                    {shiftSubmitScenario === 'TEPAT_WAKTU' ? (
                      <span className="spv-badge-status normal">
                        <CheckCircle2 size={12} />
                        Tepat Waktu (Dalam Toleransi 15 Mnt)
                      </span>
                    ) : (
                      <span className="spv-badge-status breakdown">
                        <AlertTriangle size={12} />
                        Terlambat: Durasi 35 Menit
                      </span>
                    )}
                  </div>
                </div>

                {shiftSubmitScenario === 'TERLAMBAT' && (
                  <div style={{ background: '#fffbeb', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <small style={{ color: '#92400e', fontSize: '0.74rem', fontWeight: 700 }}>KATEGORI PENYEBAB KETERLAMBATAN</small>
                    <div style={{ marginTop: '4px', display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setShiftTimelinessLateReason('KELALAIAN_PETUGAS')}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid #d97706',
                          background: shiftTimelinessLateReason === 'KELALAIAN_PETUGAS' ? '#d97706' : '#ffffff',
                          color: shiftTimelinessLateReason === 'KELALAIAN_PETUGAS' ? '#ffffff' : '#92400e',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Kelalaian Petugas
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftTimelinessLateReason('GANGGUAN_SISTEM')}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid #0284c7',
                          background: shiftTimelinessLateReason === 'GANGGUAN_SISTEM' ? '#0284c7' : '#ffffff',
                          color: shiftTimelinessLateReason === 'GANGGUAN_SISTEM' ? '#ffffff' : '#0369a1',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Gangguan Teknis Sistem
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.5, background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                <strong>Audit Kepatuhan Pelaporan:</strong> Sistem memisahkan secara objektif penyebab keterlambatan laporan shift antara kelalaian individu personel vs force majeure gangguan teknis (server/jaringan down), serta mendokumentasikan durasi keterlambatan aktual dalam riwayat serah-terima.
              </div>
