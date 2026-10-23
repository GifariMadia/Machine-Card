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
