import { useNavigationState } from './use-navigation-state';
import ServerAuditPanel from './ServerAuditPanel';
import { legacyImportSummary, importLegacyRecords } from './storage';
import { storage } from './storage';
import { useState, useMemo, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  PackageSearch,
  Wrench,
  Cog,
  Search,
  SlidersHorizontal,
  X,
  LogOut,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Edit3,
  Power,
  Layers,
  Save,
  Check,
  Building,
  RotateCcw,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Activity,
  ClipboardList,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';
import { fallbackMachines, getStoredMachines, saveStoredMachines, MACHINE_STORAGE_KEY, type Machine } from './data';
import {
  type MachineOperatingHoursRecord,
  initialOperatingHoursRecords,
} from './SupervisorDashboard';
import {
  type Admin,
  type AppUser,
  operators as seedOperators,
  exampleOperator,
  exampleTechnician,
  exampleSupervisor,
  exampleAdmin,
} from './operator';
import './admin-portal.css';
import './dashboard-unified.css';

const isTestEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.MODE === 'test');

export type AdminDashboardProps = {
  admin: Admin;
  onLogout: () => void;
};

type ManagedUser = {
  id: string;
  nik: string;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'TEKNISI';
  password?: string;
  departments: string[];
  shifts: string[];
  machines: string[];
  active: boolean;
};

type MasterPartItem = {
  id: string;
  name: string;
  partNumber?: string;
  specification: string;
  category: string;
  position?: string;
  intervalBasis?: 'KALENDER' | 'JAM_OPERASI';
  defaultLifetimeDays: number;
};

const initialMasterParts: MasterPartItem[] = isTestEnv
  ? [
      { id: 'PART-001', name: 'Pisau I-Cut', partNumber: 'CUT-8025-HSS', specification: 'HSS 80 × 25 mm', category: 'Cutting', intervalBasis: 'KALENDER', defaultLifetimeDays: 90 },
      { id: 'PART-002', name: 'Sealing Heater', partNumber: 'HTR-220-350W', specification: '220 V / 350 W', category: 'Heating', intervalBasis: 'JAM_OPERASI', defaultLifetimeDays: 1500 },
      { id: 'PART-003', name: 'Teflon Belt', partNumber: 'BLT-PTFE-30', specification: 'PTFE Lebar 30 mm', category: 'Sealing', intervalBasis: 'KALENDER', defaultLifetimeDays: 60 },
      { id: 'PART-004', name: 'Gasket Pneumatic', partNumber: 'GSK-NBR-1825', specification: 'NBR 18 × 2.5 mm', category: 'Pneumatic', intervalBasis: 'KALENDER', defaultLifetimeDays: 120 },
      { id: 'PART-005', name: 'Sensor Inkjet', partNumber: 'SNR-OPT-24V', specification: 'Photoelectric 24 VDC', category: 'Electrical', intervalBasis: 'JAM_OPERASI', defaultLifetimeDays: 2500 },
      { id: 'PART-006', name: 'Seal Piston', partNumber: 'SL-PTFE-32FG', specification: 'Food Grade PTFE 32 mm', category: 'Filling', intervalBasis: 'JAM_OPERASI', defaultLifetimeDays: 1000 },
      { id: 'PART-007', name: 'Pisau Perforasi', partNumber: 'PRF-4M-SKD11', specification: 'Gandeng 4 Mata SKD11', category: 'Cutting', intervalBasis: 'KALENDER', defaultLifetimeDays: 60 },
      { id: 'PART-008', name: 'Proximity Sensor', partNumber: 'SNR-PRX-M12', specification: 'M12 PNP NO 24 VDC', category: 'Electrical', intervalBasis: 'JAM_OPERASI', defaultLifetimeDays: 3000 },
    ]
  : [];

export type PendingPartJustification = {
  id: string;
  ticket: string;
  machine: string;
  technicianName: string;
  technicianNik?: string;
  partName: string;
  specification: string;
  quantity: string | number;
  position: string;
  reportedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminJustification?: {
    approvedPartId: string;
    standardizedName: string;
    partNumber: string;
    category: string;
    specification: string;
    intervalBasis: 'JAM_OPERASI' | 'KALENDER';
    defaultLifetimeDays: number;
    reviewedBy: string;
    reviewedAt: string;
    notes?: string;
  };
};

const initialPendingJustifications: PendingPartJustification[] = isTestEnv
  ? [
      {
        id: 'JUSTIF-001',
        ticket: 'OW-233183',
        machine: 'Ilapak 1',
        technicianName: 'Budi Santoso',
        technicianNik: 'TEK0001',
        partName: 'Rubber Sealing Pad',
        specification: 'Silicone High-Temp 30 × 10 mm',
        quantity: '2',
        position: 'Vertical Sealer Line 1',
        reportedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
        status: 'PENDING',
      },
      {
        id: 'JUSTIF-002',
        ticket: 'OW-233174',
        machine: 'Chimei 10A',
        technicianName: 'Joko Purwanto',
        technicianNik: 'TEK0002',
        partName: 'Nozzle Tip Dispenser',
        specification: 'Stainless Steel 316L 1.2 mm',
        quantity: '1',
        position: 'Filling Head Station 2',
        reportedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        status: 'PENDING',
      },
    ]
  : [];

export type SystemAuditEntry = {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: 'ADMIN' | 'SUPERVISOR' | 'SYSTEM';
  eventType: 'USER_MANAGEMENT' | 'MACHINE_CONFIG' | 'PART_JUSTIFICATION' | 'SYSTEM_RULE' | 'SECURITY';
  action: string;
  target: string;
  details: string;
  ipAddress?: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
};

const initialSystemAuditLogs: SystemAuditEntry[] = isTestEnv
  ? [
      {
        id: 'LOG-20261025-08',
        timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        actorName: 'Siti Rahma (ADM0001)',
        actorRole: 'ADMIN',
        eventType: 'PART_JUSTIFICATION',
        action: 'Justifikasi & Standarisasi Part Baru',
        target: 'Rubber Sealing Pad (PART-009)',
        details: 'Standarisasi nama part dari tiket breakdown OW-233183 (Ilapak 1), penetapan kategori Sealing, dan rumus lifetime 1500 Jam Operasi.',
        ipAddress: '192.168.10.45 (Pulogadung Central)',
        status: 'SUCCESS',
      },
      {
        id: 'LOG-20261025-07',
        timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
        actorName: 'Siti Rahma (ADM0001)',
        actorRole: 'ADMIN',
        eventType: 'MACHINE_CONFIG',
    action: 'Pembaruan Status Operasional Mesin',
    target: 'Ilapak 1 (ILP-01)',
    details: 'Status operasional mesin diubah menjadi AKTIF (Beroperasi) setelah verifikasi logbook MTBF.',
    ipAddress: '192.168.10.45 (Pulogadung Central)',
    status: 'SUCCESS',
  },
  {
    id: 'LOG-20261025-06',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    actorName: 'Siti Rahma (ADM0001)',
    actorRole: 'ADMIN',
    eventType: 'USER_MANAGEMENT',
    action: 'Pembaruan Otorisasi Pengguna & Shift',
    target: 'Budi Santoso (TEK0001)',
    details: 'Pembaruan hak akses departemen Maintenance, penugasan Shift 1 & 2, serta cakupan akses terbuka seluruh mesin plant.',
    ipAddress: '192.168.10.45 (Pulogadung Central)',
    status: 'SUCCESS',
  },
  {
    id: 'LOG-20261025-05',
    timestamp: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
    actorName: 'Siti Rahma (ADM0001)',
    actorRole: 'ADMIN',
    eventType: 'MACHINE_CONFIG',
    action: 'Input Logbook Jam Operasi Aktual',
    target: 'Chimei 10A (CHI-01)',
    details: 'Pencatatan jam operasi aktual 148.5 Jam dari running counter shift kalender 176 Jam.',
    ipAddress: '192.168.10.45 (Pulogadung Central)',
    status: 'SUCCESS',
  },
  {
    id: 'LOG-20261025-04',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    actorName: 'Siti Rahma (ADM0001)',
    actorRole: 'ADMIN',
    eventType: 'SYSTEM_RULE',
    action: 'Revisi Aturan Ambang Batas Lifetime',
    target: 'Plant Standard Monitoring Rule',
    details: 'Ambang batas peringatan dini (Warning) ditetapkan 75% dan batas wajib penggantian (Overdue) 100%.',
    ipAddress: '192.168.10.45 (Pulogadung Central)',
    status: 'SUCCESS',
  },
  {
    id: 'LOG-20261025-03',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    actorName: 'Siti Rahma (ADM0001)',
    actorRole: 'ADMIN',
    eventType: 'USER_MANAGEMENT',
    action: 'Registrasi Akun Pengguna Baru',
    target: 'A. Dahlan (OPR0001)',
    details: 'Pendaftaran akun operator shift 1, departemen Produksi, cakupan akses terbuka seluruh lini pabrik.',
    ipAddress: '192.168.10.45 (Pulogadung Central)',
    status: 'SUCCESS',
  },
  {
    id: 'LOG-20261025-02',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    actorName: 'Siti Rahma (ADM0001)',
    actorRole: 'ADMIN',
    eventType: 'SECURITY',
    action: 'Autentikasi Sesi Login Administrator',
    target: 'Portal Administrasi Web',
    details: 'Otentikasi berhasil via RBAC Central Pulogadung, role Superadmin (ADMIN).',
    ipAddress: '192.168.10.45 (Pulogadung Central)',
    status: 'SUCCESS',
  },
  {
    id: 'LOG-20261025-01',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    actorName: 'Siti Rahma (ADM0001)',
    actorRole: 'ADMIN',
    eventType: 'USER_MANAGEMENT',
    action: 'Penonaktifan Akun Pengguna',
    target: 'Rizal (OPR0008)',
    details: 'Akun dinonaktifkan sementara terkait mutasi divisi kerja internal.',
    ipAddress: '192.168.10.45 (Pulogadung Central)',
    status: 'WARNING',
  },
] : [];

export default function AdminDashboard({ admin, onLogout }: AdminDashboardProps) {
  const safeAdmin = useMemo(() => {
    const raw = admin || ({} as Partial<Admin>);
    return {
      nik: raw.nik || 'ADM0001',
      name: raw.name || 'Administrator',
      role: 'ADMIN' as const,
      shifts: Array.isArray(raw.shifts) && raw.shifts.length > 0 ? raw.shifts : ['Shift 1'],
      departments: Array.isArray(raw.departments) && raw.departments.length > 0 ? raw.departments : ['Maintenance'],
      machines: Array.isArray(raw.machines) ? raw.machines : [],
      active: raw.active !== false,
      password: raw.password || '',
    };
  }, [admin]);

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
  const [activeTab, setActiveTab] = useNavigationState<'USERS' | 'MACHINES' | 'PARTS' | 'AUDIT'>('mc-nav-AdminDashboard-activeTab', 'USERS');

  // Users State
  const [users, setUsers] = useState<ManagedUser[]>(() => {
    try {
      const stored = storage.getItem('machine-card-managed-users');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    const list: ManagedUser[] = [
      {
        id: 'usr-admin-1',
        nik: exampleAdmin.nik,
        name: exampleAdmin.name,
        role: 'ADMIN',
        departments: exampleAdmin.departments,
        shifts: exampleAdmin.shifts,
        machines: exampleAdmin.machines,
        active: true,
      },
      {
        id: 'usr-spv-1',
        nik: exampleSupervisor.nik,
        name: exampleSupervisor.name,
        role: 'SUPERVISOR',
        departments: exampleSupervisor.departments,
        shifts: exampleSupervisor.shifts,
        machines: exampleSupervisor.machines,
        active: true,
      },
      {
        id: 'usr-tkn-1',
        nik: exampleTechnician.nik,
        name: exampleTechnician.name,
        role: 'TEKNISI',
        departments: exampleTechnician.departments,
        shifts: exampleTechnician.shifts,
        machines: [],
        active: true,
      },
      {
        id: 'usr-opr-1',
        nik: exampleOperator.nik,
        name: exampleOperator.name,
        role: 'OPERATOR' as const,
        departments: ['Produksi'],
        shifts: exampleOperator.shifts,
        machines: exampleOperator.machines,
        active: true,
      },
      ...(isTestEnv
        ? seedOperators.slice(0, 12).map((op, idx) => ({
            id: `usr-opr-${idx + 2}`,
            nik: op.nik,
            name: op.name,
            role: 'OPERATOR' as const,
            departments: ['Produksi'],
            shifts: op.shifts,
            machines: op.machines,
            active: true,
          }))
        : []),
    ];
    return list;
  });

  useEffect(() => {
    try {
      storage.setItem('machine-card-managed-users', JSON.stringify(users));
    } catch {}
  }, [users]);

  useEffect(() => {
    const saved = () => {
      const raw = storage.getItem('machine-card-managed-users');
      if (raw) setUsers(JSON.parse(raw));
    };
    window.addEventListener('mc-documents-saved', saved);
    return () => window.removeEventListener('mc-documents-saved', saved);
  }, []);

  // Machines State (persisted in localStorage & synchronized cross-role)
  const [machines, setMachines] = useState<Machine[]>(getStoredMachines);

  useEffect(() => {
    saveStoredMachines(machines);
  }, [machines]);

  useEffect(() => {
    const handleSync = (e: StorageEvent) => {
      if (e.key === MACHINE_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMachines(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Master Parts State (with localStorage persistence)
  const [parts, setParts] = useState<MasterPartItem[]>(() => {
    try {
      const stored = storage.getItem('mc-master-parts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialMasterParts;
  });

  useEffect(() => {
    try {
      storage.setItem('mc-master-parts', JSON.stringify(parts));
    } catch {}
  }, [parts]);

  // Sub-Tab on Master Part & Lifetime: Katalog vs Antrean Justifikasi Part Baru dari Breakdown
  const [partSubTab, setPartSubTab] = useNavigationState<'CATALOG' | 'JUSTIFICATIONS'>('mc-nav-AdminDashboard-partSubTab', 'CATALOG');
  const [pendingJustifications, setPendingJustifications] = useState<PendingPartJustification[]>(() => {
    try {
      const stored = storage.getItem('mc-pending-part-justifications');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialPendingJustifications;
  });

  useEffect(() => {
    try {
      storage.setItem('mc-pending-part-justifications', JSON.stringify(pendingJustifications));
    } catch {}
  }, [pendingJustifications]);

  // Sync parts replaced from breakdown work tickets into pending justification list
  useEffect(() => {
    try {
      const stored = storage.getItem('machine-card-open-work');
      if (!stored) return;
      const arr = JSON.parse(stored);
      if (!Array.isArray(arr)) return;

      const newItems: PendingPartJustification[] = [];
      arr.forEach((ticket: any) => {
        if (ticket.partReplaced && ticket.partReplaced.name) {
          const pName = ticket.partReplaced.name.trim();
          const inMaster = parts.some((p) => p.name.toLowerCase() === pName.toLowerCase());
          const inPending = pendingJustifications.some(
            (j) => j.ticket === ticket.ticket && j.partName.toLowerCase() === pName.toLowerCase()
          );
          if (!inMaster && !inPending) {
            newItems.push({
              id: `JUSTIF-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 100)}`,
              ticket: ticket.ticket,
              machine: ticket.machine || 'Mesin Plant',
              technicianName: ticket.technicianName || 'Teknisi Maintenance',
              partName: pName,
              specification: ticket.partReplaced.specification || 'Standar Spesifikasi Pabrik',
              quantity: ticket.partReplaced.quantity || '1',
              position: ticket.partReplaced.position || 'Lini Produksi',
              reportedAt: ticket.waktuSelesai || ticket.waktuMulai || new Date().toISOString(),
              status: 'PENDING',
            });
          }
        }
      });

      if (newItems.length > 0) {
        setPendingJustifications((prev) => [...newItems, ...prev]);
      }
    } catch {}
  }, [parts]);

  // Justification Modal States
  const [justificationModalOpen, setJustificationModalOpen] = useState(false);
  const [selectedJustification, setSelectedJustification] = useState<PendingPartJustification | null>(null);
  const [justificationForm, setJustificationForm] = useState({
    id: '',
    standardizedName: '',
    partNumber: '',
    category: 'Sealing',
    specification: '',
    intervalBasis: 'JAM_OPERASI' as 'JAM_OPERASI' | 'KALENDER',
    defaultLifetimeDays: 1500,
    notes: '',
  });

  // Edit Master Part Modal States
  const [editMasterPartModalOpen, setEditMasterPartModalOpen] = useState(false);
  const [editingMasterPart, setEditingMasterPart] = useState<MasterPartItem | null>(null);
  const [editMasterPartForm, setEditMasterPartForm] = useState({
    id: '',
    name: '',
    partNumber: '',
    specification: '',
    category: 'Mechanical',
    intervalBasis: 'JAM_OPERASI' as 'JAM_OPERASI' | 'KALENDER',
    defaultLifetimeDays: 1500,
  });

  // Lifetime Rules Configuration
  const [lifetimeRule, setLifetimeRule] = useState(() => {
    try { const saved = storage.getItem('machine-card-lifetime-rules'); if (saved) return JSON.parse(saved) as { warningThreshold: number; replacementLimit: number }; } catch {}
    return { warningThreshold: isTestEnv ? 75 : 80, replacementLimit: 100 };
  });
  const [editingRule, setEditingRule] = useState(false);
  const [tempRule, setTempRule] = useState(lifetimeRule);

  // User Filter & Search
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'TEKNISI'>('ALL');
  const [userSearch, setUserSearch] = useState('');

  // Machine Search & Section Filter
  const [machineSearch, setMachineSearch] = useState('');
  const [machineSectionFilter, setMachineSectionFilter] = useState('ALL');

  // Part & Audit Searches
  const [partSearch, setPartSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEventFilter, setAuditEventFilter] = useState('ALL');

  // System Audit Logs State (with localStorage persistence)
  const [systemAuditLogs, setSystemAuditLogs] = useState<SystemAuditEntry[]>(() => {
    try {
      const stored = storage.getItem('mc-system-audit-logs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialSystemAuditLogs;
  });

  useEffect(() => {
    try {
      storage.setItem('mc-system-audit-logs', JSON.stringify(systemAuditLogs));
    } catch {}
  }, [systemAuditLogs]);

  // Sinkronisasi dinamis ketika 100 skenario diinjeksi atau dibersihkan
  useEffect(() => {
    const handleInjected = () => {
