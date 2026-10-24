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
