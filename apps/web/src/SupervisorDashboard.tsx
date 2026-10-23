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
