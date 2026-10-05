import { storage } from './storage';
// Centralized 100 Real-World Maintenance Scenarios
// Covers end-to-end plant workflow: Operator -> Technician -> Handover -> Closing -> Supervisor Audit -> Admin Justification

export interface UnifiedMaintenanceScenario {
  ticket: string;
  machine: string;
  id_mesin?: number;
  section: string;
  reporter: string;
  reporterName?: string;
  shift: string;
  keterangan: string;
  kategori: string;
  woType: string;
  kodeProduk?: string;
  noBatch?: string;
  noWr?: string;
  waktuMulai: string;
  opened?: string;
  waktuSelesai?: string | null;
  waktuMesinBeroperasi?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'HANDOVER' | 'SELESAI_PERBAIKAN' | 'CLOSED';
  urgensi?: 'Critical' | 'High' | 'Medium' | 'Low';
  technician?: string;
  technicianName?: string;
  technicianNik?: string;
  action?: string;
  catatanClosing?: string | null;
  penutupNik?: string | null;
  penutupName?: string | null;
  shiftPenutup?: string;
  durasiJam?: string;
  durasiPerbaikanMenit?: number;
  catatanHandover?: string;
  riwayatHandover?: Array<{
    shiftAsal: string;
    shiftTujuan: string;
    teknisiAsal: string;
    teknisiPenerima: string;
    catatan: string;
    waktu: string;
  }>;
  partsReplaced?: Array<{ name: string; qty?: string | number; unit?: string }>;
  partReplaced?: {
    name: string;
    specification: string;
    quantity: string;
    position: string;
    note?: string;
  };
  isUncatalogedPart?: boolean;
  completenessAudit?: {
    isIncomplete: boolean;
    defectType: string;
    defectDescription: string;
    spvVerdict: 'APPROVED' | 'REJECTED' | 'REVISED';
    spvNotes: string;
  };
  originalOpenedAt?: string;
  createdAt: string;
}

export const INITIAL_100_MAINTENANCE_SCENARIOS: UnifiedMaintenanceScenario[] = [
  {
    "ticket": "OW-2610-001",
    "machine": "Chimei 10A/Jinsung 3",
    "id_mesin": 1,
    "section": "Filling & Sealing",
    "reporter": "OPR0001",
    "reporterName": "A. Dahlan",
    "shift": "2",
    "keterangan": "Suhu heater vertikal fluktuatif turun 18°C di bawah target SV 150°C",
    "kategori": "Sealing / Pemanas",
    "woType": "Batch",
    "kodeProduk": "LNKQA",
    "noBatch": "HM758",
    "noWr": "260001",
    "waktuMulai": "2026-10-25T20:36:00Z",
    "opened": "20.36",
    "status": "OPEN",
    "urgensi": "High",
    "createdAt": "2026-10-25T20:36:00Z"
  },
  {
    "ticket": "OW-2610-002",
    "machine": "Chimei 11A/Jinsung 4",
    "id_mesin": 2,
    "section": "Filling",
    "reporter": "OPR0002",
    "reporterName": "Siti Nurhaliza",
    "shift": "3",
    "keterangan": "Sensor photo-eye tidak sinkron menyebabkan potong sachet meleset 5mm",
    "kategori": "Sensor & Elektrikal",
    "woType": "Non Batch",
    "kodeProduk": "—",
    "noBatch": "—",
    "noWr": "260002",
    "waktuMulai": "2026-10-25T20:27:00Z",
    "opened": "20.27",
    "status": "OPEN",
    "urgensi": "Medium",
    "createdAt": "2026-10-25T20:27:00Z"
  },
  {
    "ticket": "OW-2610-003",
    "machine": "Chimei 12A/Jinsung 1",
    "id_mesin": 3,
    "section": "Sealing",
    "reporter": "OPR0003",
    "reporterName": "Rahmat Hidayat",
    "shift": "1",
    "keterangan": "Kebocoran tekanan angin pneumatic manifold valve drop ke 3.5 bar",
    "kategori": "Pneumatik & Kompresor",
    "woType": "Batch",
    "kodeProduk": "PRO09",
    "noBatch": "KB044",
    "noWr": "260003",
    "waktuMulai": "2026-10-25T20:18:00Z",
    "opened": "20.18",
    "status": "OPEN",
    "urgensi": "Critical",
    "createdAt": "2026-10-25T20:18:00Z"
  },
  {
    "ticket": "OW-2610-004",
    "machine": "Chimei 1B/SIG 6",
    "id_mesin": 4,
    "section": "Packaging",
    "reporter": "OPR0004",
    "reporterName": "Bambang Tri",
    "shift": "2",
    "keterangan": "Feeding hopper tersumbat serbuk granul menggumpal di corong inlet",
    "kategori": "Sistem Pengumpan",
    "woType": "Non Batch",
    "kodeProduk": "—",
    "noBatch": "—",
    "noWr": "260004",
    "waktuMulai": "2026-10-25T20:09:00Z",
    "opened": "20.09",
    "status": "OPEN",
    "urgensi": "Medium",
    "createdAt": "2026-10-25T20:09:00Z"
  },
  {
    "ticket": "OW-2610-005",
    "machine": "Chimei 4/Yonan",
    "id_mesin": 5,
    "section": "Filling",
    "reporter": "OPR0005",
    "reporterName": "Dewi Sartika",
    "shift": "3",
    "keterangan": "Pisau rotary tumpul meninggalkan serat film kemasan tidak terputus rapi",
    "kategori": "Pisau Potong / Cutting",
    "woType": "Batch",
    "kodeProduk": "VIT88",
    "noBatch": "VT204",
    "noWr": "260005",
    "waktuMulai": "2026-10-25T20:00:00Z",
    "opened": "20.00",
    "status": "OPEN",
    "urgensi": "High",
    "createdAt": "2026-10-25T20:00:00Z"
  },
  {
    "ticket": "OW-2610-006",
    "machine": "Chimei 4B/Jinsung 2",
    "id_mesin": 6,
    "section": "Sealing",
    "reporter": "OPR0006",
    "reporterName": "Agus Triyono",
    "shift": "1",
    "keterangan": "Vibrasi abnormal dan suara mendengung pada motor discharge conveyor",
    "kategori": "Mekanis & Transmisi",
    "woType": "Non Batch",
    "kodeProduk": "—",
    "noBatch": "—",
    "noWr": "260006",
    "waktuMulai": "2026-10-25T19:51:00Z",
    "opened": "19.51",
    "status": "OPEN",
    "urgensi": "Medium",
    "createdAt": "2026-10-25T19:51:00Z"
  },
  {
    "ticket": "OW-2610-007",
    "machine": "Chimei 5A/Ilapak 5",
    "id_mesin": 7,
    "section": "Packaging",
    "reporter": "OPR0007",
    "reporterName": "Fajar Sidik",
    "shift": "2",
    "keterangan": "Suction cup feeder no. 3 tidak vakum, karton gagal terambil dari magazine",
    "kategori": "Pneumatik & Kompresor",
    "woType": "Batch",
    "kodeProduk": "HERB3",
    "noBatch": "HB105",
    "noWr": "260007",
    "waktuMulai": "2026-10-25T19:42:00Z",
    "opened": "19.42",
    "status": "OPEN",
    "urgensi": "High",
    "createdAt": "2026-10-25T19:42:00Z"
  },
  {
    "ticket": "OW-2610-008",
    "machine": "Chimei 5B/Unifill B",
    "id_mesin": 8,
    "section": "Thermoforming",
    "reporter": "OPR0008",
    "reporterName": "Indah Permata",
    "shift": "3",
    "keterangan": "Sealing bar horizontal miring, kemasan bocor micro-leakage",
    "kategori": "Sealing / Pemanas",
    "woType": "Non Batch",
    "kodeProduk": "—",
    "noBatch": "—",
    "noWr": "260008",
    "waktuMulai": "2026-10-25T19:33:00Z",
    "opened": "19.33",
    "status": "OPEN",
    "urgensi": "High",
    "createdAt": "2026-10-25T19:33:00Z"
  },
  {
    "ticket": "OW-2610-009",
    "machine": "Chimei 6/Ilapak 1",
    "id_mesin": 9,
    "section": "Filling",
    "reporter": "OPR0009",
    "reporterName": "Hadi Santoso",
    "shift": "1",
    "keterangan": "Roller penarik film selip akibat residu bubuk pada karet traksi",
    "kategori": "Mekanis & Transmisi",
    "woType": "Batch",
    "kodeProduk": "LNKQA",
    "noBatch": "HM758",
    "noWr": "260009",
    "waktuMulai": "2026-10-25T19:24:00Z",
    "opened": "19.24",
    "status": "OPEN",
    "urgensi": "Low",
    "createdAt": "2026-10-25T19:24:00Z"
  },
  {
    "ticket": "OW-2610-010",
    "machine": "Chimei 8A/Ilapak 8",
    "id_mesin": 10,
    "section": "Sealing",
    "reporter": "OPR0010",
    "reporterName": "Nurul Aini",
    "shift": "2",
    "keterangan": "Seal mekanis agitator rembes larutan suspensi saat putaran tinggi",
    "kategori": "Mekanis & Transmisi",
    "woType": "Non Batch",
    "kodeProduk": "—",
    "noBatch": "—",
    "noWr": "260010",
    "waktuMulai": "2026-10-25T19:15:00Z",
    "opened": "19.15",
    "status": "OPEN",
    "urgensi": "Critical",
    "createdAt": "2026-10-25T19:15:00Z"
  },
  {
    "ticket": "OW-2610-011",
    "machine": "Chimei 9A/Ilapak 11",
    "id_mesin": 11,
    "section": "Packaging",
    "reporter": "OPR0001",
    "reporterName": "A. Dahlan",
    "shift": "3",
    "keterangan": "Emergency stop switch trip tiba-tiba saat pergantian roll film baru",
    "kategori": "Sensor & Elektrikal",
    "woType": "Batch",
    "kodeProduk": "PRO09",
    "noBatch": "KB044",
    "noWr": "260011",
    "waktuMulai": "2026-10-25T19:06:00Z",
    "opened": "19.06",
    "status": "OPEN",
    "urgensi": "High",
    "createdAt": "2026-10-25T19:06:00Z"
  },
  {
    "ticket": "OW-2610-012",
    "machine": "Ilapak 1",
    "id_mesin": 12,
    "section": "Filling & Sealing",
    "reporter": "OPR0002",
    "reporterName": "Siti Nurhaliza",
    "shift": "1",
    "keterangan": "Pengatur volume doser filling macet, deviasi bobot isi melebihi 3%",
    "kategori": "Sistem Pengumpan",
    "woType": "Non Batch",
    "kodeProduk": "—",
    "noBatch": "—",
    "noWr": "260012",
    "waktuMulai": "2026-10-25T18:57:00Z",
    "opened": "18.57",
    "status": "OPEN",
    "urgensi": "Medium",
    "createdAt": "2026-10-25T18:57:00Z"
  },
  {
    "ticket": "OW-2610-013",
    "machine": "Ilapak 2",
    "id_mesin": 13,
    "section": "Cutting & Sealing",
    "reporter": "OPR0003",
    "reporterName": "Rahmat Hidayat",
    "shift": "2",
    "keterangan": "Display HMI kedip dan touch response lambat saat tombol start ditekan",
    "kategori": "PLC & Kontrol",
    "woType": "Batch",
    "kodeProduk": "VIT88",
    "noBatch": "VT204",
    "noWr": "260013",
    "waktuMulai": "2026-10-25T18:48:00Z",
    "opened": "18.48",
    "status": "OPEN",
    "urgensi": "Low",
    "createdAt": "2026-10-25T18:48:00Z"
  },
  {
    "ticket": "OW-2610-014",
    "machine": "Ilapak 3",
    "id_mesin": 14,
    "section": "Vertical Sealer",
    "reporter": "OPR0004",
    "reporterName": "Bambang Tri",
    "shift": "3",
    "keterangan": "Solenoid puncher lubang hanger sachet tidak kembali ke posisi standby",
    "kategori": "Pneumatik & Kompresor",
    "woType": "Non Batch",
    "kodeProduk": "—",
    "noBatch": "—",
    "noWr": "260014",
    "waktuMulai": "2026-10-25T18:39:00Z",
    "opened": "18.39",
    "status": "OPEN",
    "urgensi": "Medium",
    "createdAt": "2026-10-25T18:39:00Z"
  },
  {
    "ticket": "OW-2610-015",
    "machine": "Ilapak 4",
    "id_mesin": 15,
    "section": "Horizontal Sealer",
    "reporter": "OPR0005",
    "reporterName": "Dewi Sartika",
    "shift": "1",
    "keterangan": "Suhu thermo-chiller thermoforming naik drastis melebihi 28°C",
    "kategori": "Sistem Pendingin",
    "woType": "Batch",
    "kodeProduk": "HERB3",
    "noBatch": "HB105",
    "noWr": "260015",
    "waktuMulai": "2026-10-25T18:30:00Z",
    "opened": "18.30",
    "status": "OPEN",
    "urgensi": "Critical",
    "createdAt": "2026-10-25T18:30:00Z"
  },
  {
    "ticket": "OW-2610-016",
    "machine": "Ilapak 5",
    "id_mesin": 16,
    "section": "Packaging",
    "reporter": "OPR0006",
    "reporterName": "Agus Triyono",
    "shift": "2",
    "keterangan": "Kendala operasional: Pembongkaran housing heater vertikal dan cek ...",
    "kategori": "Sealing / Pemanas",
    "woType": "Non Batch",
    "kodeProduk": "FLU02",
    "noBatch": "FL440",
    "noWr": "260016",
    "waktuMulai": "2026-10-25T19:45:00Z",
    "opened": "19.45",
    "status": "IN_PROGRESS",
    "technician": "TKN0001",
    "technicianName": "Budi Santoso",
    "technicianNik": "TKN0001",
    "action": "Proses diagnosa teknisi: Pembongkaran housing heater vertikal dan cek resistansi elemen thermocouple. Saat ini sedang dilakukan pembongkaran dan pengetesan beban.",
    "originalOpenedAt": "2026-10-25T19:45:00Z",
    "createdAt": "2026-10-25T19:45:00Z"
  },
  {
    "ticket": "OW-2610-017",
    "machine": "Ilapak 6",
    "id_mesin": 17,
    "section": "Cutting Unit",
    "reporter": "OPR0007",
    "reporterName": "Fajar Sidik",
    "shift": "3",
    "keterangan": "Kendala operasional: Pengecekan jalur pneumatik silinder pendorong...",
    "kategori": "Pneumatik & Kompresor",
    "woType": "Batch",
    "kodeProduk": "LNKQA",
    "noBatch": "HM758",
    "noWr": "260017",
    "waktuMulai": "2026-10-25T19:00:00Z",
    "opened": "19.00",
    "status": "IN_PROGRESS",
    "technician": "TKN0002",
    "technicianName": "Agus Setiawan",
    "technicianNik": "TKN0002",
    "action": "Proses diagnosa teknisi: Pengecekan jalur pneumatik silinder pendorong, ditemukan fitting retak mikro. Saat ini sedang dilakukan pembongkaran dan pengetesan beban.",
    "originalOpenedAt": "2026-10-25T19:00:00Z",
    "createdAt": "2026-10-25T19:00:00Z"
  },
  {
    "ticket": "OW-2610-018",
    "machine": "Ilapak 7",
    "id_mesin": 18,
    "section": "Rotary Cutter",
    "reporter": "OPR0008",
    "reporterName": "Indah Permata",
    "shift": "1",
    "keterangan": "Kendala operasional: Penyelarasan timing belt drive utama dan peng...",
    "kategori": "Mekanis & Transmisi",
    "woType": "Non Batch",
    "kodeProduk": "EXT75",
    "noBatch": "BT912",
    "noWr": "260018",
    "waktuMulai": "2026-10-25T18:30:00Z",
    "opened": "18.30",
    "status": "IN_PROGRESS",
    "technician": "TKN0003",
    "technicianName": "Dedi Prasetyo",
    "technicianNik": "TKN0003",
    "action": "Proses diagnosa teknisi: Penyelarasan timing belt drive utama dan penggantian tensioner pulley yang aus. Saat ini sedang dilakukan pembongkaran dan pengetesan beban.",
    "originalOpenedAt": "2026-10-25T18:30:00Z",
    "createdAt": "2026-10-25T18:30:00Z"
  },
  {
    "ticket": "OW-2610-019",
    "machine": "Ilapak 8",
    "id_mesin": 19,
    "section": "Film Feeding",
    "reporter": "OPR0009",
    "reporterName": "Hadi Santoso",
    "shift": "2",
    "keterangan": "Kendala operasional: Kalibrasi sensor optical register mark menggu...",
    "kategori": "Sensor & Elektrikal",
    "woType": "Batch",
    "kodeProduk": "PRO09",
    "noBatch": "KB044",
    "noWr": "260019",
    "waktuMulai": "2026-10-25T19:15:00Z",
    "opened": "19.15",
    "status": "IN_PROGRESS",
    "technician": "TKN0004",
    "technicianName": "Eko Wahyudi",
    "technicianNik": "TKN0004",
    "action": "Proses diagnosa teknisi: Kalibrasi sensor optical register mark menggunakan oscilloscope portable. Saat ini sedang dilakukan pembongkaran dan pengetesan beban.",
    "originalOpenedAt": "2026-10-25T19:15:00Z",
    "createdAt": "2026-10-25T19:15:00Z"
  },
  {
    "ticket": "OW-2610-020",
    "machine": "Ilapak 9",
    "id_mesin": 20,
    "section": "Conveyor Discharge",
    "reporter": "OPR0010",
    "reporterName": "Nurul Aini",
    "shift": "3",
    "keterangan": "Kendala operasional: Inspeksi bantalan bearing intermediate shaft ...",
    "kategori": "Mekanis & Transmisi",
    "woType": "Non Batch",
    "kodeProduk": "MED12",
    "noBatch": "EM331",
    "noWr": "260020",
    "waktuMulai": "2026-10-25T18:00:00Z",
    "opened": "18.00",
    "status": "IN_PROGRESS",
    "technician": "TKN0001",
    "technicianName": "Budi Santoso",
    "technicianNik": "TKN0001",
    "action": "Proses diagnosa teknisi: Inspeksi bantalan bearing intermediate shaft yang berderit dan bersihkan bearing seat. Saat ini sedang dilakukan pembongkaran dan pengetesan beban.",
    "originalOpenedAt": "2026-10-25T18:00:00Z",
    "createdAt": "2026-10-25T18:00:00Z"
  },
  {
    "ticket": "OW-2610-021",
    "machine": "Ilapak 10",
    "id_mesin": 21,
    "section": "Filling",
    "reporter": "OPR0001",
    "reporterName": "A. Dahlan",
    "shift": "1",
    "keterangan": "Kendala operasional: Pembersihan dan pelumasan guide rail pemotong...",
    "kategori": "Mekanis & Transmisi",
    "woType": "Batch",
    "kodeProduk": "VIT88",
    "noBatch": "VT204",
    "noWr": "260021",
    "waktuMulai": "2026-10-25T19:55:00Z",
    "opened": "19.55",
