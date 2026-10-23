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
