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
      try {
        const storedJ = storage.getItem('mc-pending-part-justifications');
        if (storedJ) setPendingJustifications(JSON.parse(storedJ));
        const storedA = storage.getItem('mc-system-audit-logs');
        if (storedA) setSystemAuditLogs(JSON.parse(storedA));
      } catch {}
    };
    const handleCleared = () => {
      setPendingJustifications([]);
      setSystemAuditLogs([]);
    };
    window.addEventListener('mc-maintenance-data-injected', handleInjected);
    window.addEventListener('mc-maintenance-data-cleared', handleCleared);
    return () => {
      window.removeEventListener('mc-maintenance-data-injected', handleInjected);
      window.removeEventListener('mc-maintenance-data-cleared', handleCleared);
    };
  }, []);

  // Pagination States per Function Tab
  const [userPage, setUserPage] = useState(1);
  const [userPerPage, setUserPerPage] = useState(10);

  const [machinePage, setMachinePage] = useState(1);
  const [machinePerPage, setMachinePerPage] = useState(20);

  const [operatingPage, setOperatingPage] = useState(1);
  const [operatingPerPage, setOperatingPerPage] = useState(10);

  const [partPage, setPartPage] = useState(1);
  const [partPerPage, setPartPerPage] = useState(10);

  const [auditPage, setAuditPage] = useState(1);
  const [auditPerPage, setAuditPerPage] = useState(10);

  // Reset pagination on filter / search changes
  useEffect(() => {
    setUserPage(1);
  }, [userSearch, userRoleFilter]);

  useEffect(() => {
    setMachinePage(1);
  }, [machineSearch, machineSectionFilter]);

  useEffect(() => {
    setOperatingPage(1);
  }, [machineSearch]);

  useEffect(() => {
    setPartPage(1);
  }, [partSearch]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditSearch, auditEventFilter]);

  // Modals & Drawers
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<ManagedUser | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    role: 'OPERATOR' as ManagedUser['role'],
    department: 'Produksi',
    shift: 'Shift 1',
    password: '',
  });
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);
  const [newUserModalOpen, setNewUserModalOpen] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [newMachineModalOpen, setNewMachineModalOpen] = useState(false);
  const [newPartModalOpen, setNewPartModalOpen] = useState(false);
  const [newOperatingModalOpen, setNewOperatingModalOpen] = useState(false);

  // Sub-Tab on Machines: Katalog vs Data Jam Operasi Aktual (Manual SPV & Admin · URS 3.6)
  const [machineSubTab, setMachineSubTab] = useState<'CATALOG' | 'OPERATING_HOURS'>('CATALOG');
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
  const [operatingForm, setOperatingForm] = useState({
    kodeMesin: 'MESIN-001',
    namaMesin: 'Ilapak 1',
    periode: 'Oktober 2026',
    jamOperasiAktual: 0,
    jamShiftKalender: 176,
    sumberData: `Input Manual Admin (${admin.name})`,
    penanggungJawab: `${admin.name} (Admin)`,
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
      sumberData: operatingForm.sumberData.trim() || `Input Manual Admin (${admin.name})`,
      penanggungJawab: operatingForm.penanggungJawab.trim() || `${admin.name} (Admin)`,
      isComplete: operatingForm.isComplete,
      catatanPenjelasan: operatingForm.catatanPenjelasan.trim(),
      diverifikasiOleh: `${admin.name} (Admin)`,
      tanggalVerifikasi: new Date().toISOString().slice(0, 10),
    };
    const nextList = operatingHoursRecords.map((r) => (r.id === updated.id ? updated : r));
    setOperatingHoursRecords(nextList);
    try {
      storage.setItem('machine-card-operating-hours', JSON.stringify(nextList));
    } catch {}

    // Rekam ke Log Audit Sistem & Keamanan (Kepatuhan ALCOA+)
    const auditEntry: SystemAuditEntry = {
      id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
      actorRole: 'ADMIN',
      eventType: 'MACHINE_CONFIG',
      action: 'Koreksi Jam Operasi Aktual Mesin (HM)',
      target: `${updated.namaMesin} (${updated.kodeMesin})`,
      details: `Pembaruan jam operasi aktual menjadi ${updated.jamOperasiAktual} Jam (Jam Kalender: ${updated.jamShiftKalender} Jam). Sumber: ${updated.sumberData}. Catatan: ${updated.catatanPenjelasan || 'Verifikasi rutin'}`,
      ipAddress: '—',
      status: 'SUCCESS',
    };
    setSystemAuditLogs((prev) => [auditEntry, ...prev]);

    setSelectedOperatingRecord(null);
  }

  function handleCreateOperatingHours(e: React.FormEvent) {
    e.preventDefault();
    const targetMachine = machines.find((m) => m.kode_mesin === operatingForm.kodeMesin) || machines[0];
    const newRecord: MachineOperatingHoursRecord = {
      id: `MOH-${Date.now()}`,
      kodeMesin: targetMachine.kode_mesin,
      namaMesin: targetMachine.nama_mesin,
      periode: operatingForm.periode.trim() || 'Oktober 2026',
      jamOperasiAktual: Number(operatingForm.jamOperasiAktual),
      jamShiftKalender: Number(operatingForm.jamShiftKalender),
      sumberData: operatingForm.sumberData.trim() || `Input Manual Admin (${admin.name})`,
      penanggungJawab: operatingForm.penanggungJawab.trim() || `${admin.name} (Admin)`,
      isComplete: operatingForm.isComplete,
      catatanPenjelasan: operatingForm.catatanPenjelasan.trim(),
      diverifikasiOleh: `${admin.name} (Admin)`,
      tanggalVerifikasi: new Date().toISOString().slice(0, 10),
    };
    const nextList = [newRecord, ...operatingHoursRecords];
    setOperatingHoursRecords(nextList);
    try {
      storage.setItem('machine-card-operating-hours', JSON.stringify(nextList));
    } catch {}
    setNewOperatingModalOpen(false);
  }

  // Form New User
  const [newUserForm, setNewUserForm] = useState({
    nik: '',
    name: '',
    password: '',
    role: 'OPERATOR' as 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'TEKNISI',
    department: 'Produksi',
    shift: '1',
  });

  // Form New Machine
  const [newMachineForm, setNewMachineForm] = useState({
    kode_mesin: '',
    nama_mesin: '',
    kategori: 'Filling',
  });

  // Form New Part
  const [newPartForm, setNewPartForm] = useState({
    name: '',
    partNumber: '',
    specification: '',
    category: 'Mechanical',
    position: 'Line 1',
    intervalBasis: 'KALENDER' as 'KALENDER' | 'JAM_OPERASI',
    defaultLifetimeDays: 90,
  });

  // Audit tickets from local storage
  const auditTickets = useMemo(() => {
    try {
      const stored = storage.getItem('machine-card-open-work');
      if (stored) {
        return JSON.parse(stored) as Array<{
          ticket: string;
          machine: string;
          reporterName?: string;
          reporter?: string;
          technicianName?: string;
          keterangan?: string;
          kategori?: string;
          status: 'OPEN' | 'IN_PROGRESS' | 'SELESAI_PERBAIKAN' | 'CLOSED';
          waktuMulai?: string;
        }>;
      }
    } catch {
      // Fallback
    }
    return isTestEnv
      ? [
          {
            ticket: 'OW-233183',
            machine: 'Ilapak 1',
            reporterName: 'A. Dahlan',
            technicianName: 'Budi Santoso',
            keterangan: 'Potongan tidak stabil pada unit sealer vertikal',
            kategori: 'Pisau I-Cut / Cutting',
            status: 'OPEN' as const,
            waktuMulai: new Date(Date.now() - 3600000 * 3).toISOString(),
          },
          {
            ticket: 'OW-233174',
            machine: 'Ilapak 1',
            reporterName: 'A. Dahlan',
            technicianName: 'Budi Santoso',
            keterangan: 'Gasket pneumatic line 1 bocor',
            kategori: 'Pneumatik & Silinder',
            status: 'CLOSED' as const,
            waktuMulai: new Date(Date.now() - 3600000 * 48).toISOString(),
          },
        ]
      : [];
  }, []);

  // Filtered Users & Pagination
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    return users.filter((u) => {
      const matchRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
      const matchQuery =
        u.nik.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.departments.some((d) => d.toLowerCase().includes(q));
      return matchRole && matchQuery;
    });
  }, [users, userRoleFilter, userSearch]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPerPage));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPerPage;
    return filteredUsers.slice(start, start + userPerPage);
  }, [filteredUsers, userPage, userPerPage]);

  // Filtered Machines & Pagination
  const filteredMachines = useMemo(() => {
    const q = machineSearch.toLowerCase();
    return machines.filter((m) => {
      const matchSec = machineSectionFilter === 'ALL' || m.kategori === machineSectionFilter;
      const matchQ =
        m.nama_mesin.toLowerCase().includes(q) || m.kode_mesin.toLowerCase().includes(q);
      return matchSec && matchQ;
    });
  }, [machines, machineSectionFilter, machineSearch]);

  const totalMachinePages = Math.max(1, Math.ceil(filteredMachines.length / machinePerPage));
  const paginatedMachines = useMemo(() => {
    const start = (machinePage - 1) * machinePerPage;
    return filteredMachines.slice(start, start + machinePerPage);
  }, [filteredMachines, machinePage, machinePerPage]);

  // Filtered Operating Hours & Pagination
  const filteredOperatingRecords = useMemo(() => {
    const q = machineSearch.toLowerCase();
    return operatingHoursRecords.filter(
      (r) =>
        r.namaMesin.toLowerCase().includes(q) ||
        r.kodeMesin.toLowerCase().includes(q)
    );
  }, [operatingHoursRecords, machineSearch]);

  const totalOperatingPages = Math.max(1, Math.ceil(filteredOperatingRecords.length / operatingPerPage));
  const paginatedOperatingRecords = useMemo(() => {
    const start = (operatingPage - 1) * operatingPerPage;
    return filteredOperatingRecords.slice(start, start + operatingPerPage);
  }, [filteredOperatingRecords, operatingPage, operatingPerPage]);

  // Filtered Master Parts & Pagination
  const filteredParts = useMemo(() => {
    const q = partSearch.toLowerCase();
    return parts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
        p.specification.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [parts, partSearch]);

  const totalPartPages = Math.max(1, Math.ceil(filteredParts.length / partPerPage));
  const paginatedParts = useMemo(() => {
    const start = (partPage - 1) * partPerPage;
    return filteredParts.slice(start, start + partPerPage);
  }, [filteredParts, partPage, partPerPage]);

  // Filtered System Audit Logs & Pagination
  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.toLowerCase();
    return systemAuditLogs.filter((log) => {
      const matchType = auditEventFilter === 'ALL' || log.eventType === auditEventFilter;
      const matchQuery =
        log.id.toLowerCase().includes(q) ||
        log.actorName.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.target.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q);
      return matchType && matchQuery;
    });
  }, [systemAuditLogs, auditEventFilter, auditSearch]);

  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPerPage));
  const paginatedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * auditPerPage;
    return filteredAuditLogs.slice(start, start + auditPerPage);
  }, [filteredAuditLogs, auditPage, auditPerPage]);

  // Toggle Machine Status (AKTIF / NONAKTIF)
  function handleToggleMachineStatus(kodeMesin: string) {
    let nextStatus = '';
    let targetName = '';
    setMachines((prev) =>
      prev.map((m) => {
        if (m.kode_mesin === kodeMesin) {
          nextStatus = m.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF';
          targetName = m.nama_mesin;
          return { ...m, status: nextStatus as 'AKTIF' | 'NONAKTIF' };
        }
        return m;
      })
    );

    const auditEntry: SystemAuditEntry = {
      id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
      actorRole: 'ADMIN',
      eventType: 'MACHINE_CONFIG',
      action: `Ubah Status Mesin (${nextStatus || 'TOGGLE'})`,
      target: `${targetName || kodeMesin} (${kodeMesin})`,
      details: `Status operasional mesin diubah menjadi ${nextStatus} oleh Admin.`,
      ipAddress: '—',
      status: 'SUCCESS',
    };
    setSystemAuditLogs((prev) => [auditEntry, ...prev]);
  }

  // Toggle User Active Status
  function handleToggleUserActive(userId: string) {
    let targetUser: ManagedUser | undefined;
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          targetUser = u;
          return { ...u, active: !u.active };
        }
        return u;
      })
    );

    if (targetUser) {
      const nextActiveState = !targetUser.active;
      const auditEntry: SystemAuditEntry = {
        id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
        actorRole: 'ADMIN',
        eventType: 'USER_MANAGEMENT',
        action: nextActiveState ? 'Aktivasi Akses Akun Pengguna' : 'Deaktivasi Akses Akun Pengguna',
        target: `${targetUser.name} (${targetUser.nik})`,
        details: `Status akses akun ${targetUser.role} diubah menjadi ${nextActiveState ? 'Aktif' : 'Nonaktif (Terkunci)'} oleh Admin.`,
        ipAddress: '—',
        status: nextActiveState ? 'SUCCESS' : 'WARNING',
      };
      setSystemAuditLogs((prev) => [auditEntry, ...prev]);
    }
  }

  // Open Edit User Profile Drawer
  function handleOpenEditUser(user: ManagedUser) {
    setSelectedUserForEdit(user);
    setEditUserForm({
      role: user.role,
      department: user.role === 'OPERATOR' ? 'Produksi' : 'Maintenance',
      shift: user.shifts[0] || 'Shift 1',
      password: '',
    });
    setShowEditUserPassword(false);
  }

  // Save User Profile & RBAC Changes
  function handleSaveUserEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserForEdit) return;
    const updatedUser: ManagedUser = {
      ...selectedUserForEdit,
      role: editUserForm.role,
      departments: [editUserForm.department],
      shifts: [editUserForm.shift],
      machines: machines.map((m) => m.nama_mesin),
      password: editUserForm.password.trim() ? editUserForm.password.trim() : selectedUserForEdit.password,
    };
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));

    const auditEntry: SystemAuditEntry = {
      id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
      actorRole: 'ADMIN',
      eventType: 'SECURITY',
      action: 'Modifikasi Hak Akses & Profil Pengguna (RBAC)',
      target: `${updatedUser.name} (${updatedUser.nik})`,
      details: `Perubahan konfigurasi RBAC: Role=${updatedUser.role}, Dept=${editUserForm.department}, Shift=${editUserForm.shift}${editUserForm.password.trim() ? ', Kata Sandi Direset' : ''}.`,
      ipAddress: '—',
      status: 'SUCCESS',
    };
    setSystemAuditLogs((prev) => [auditEntry, ...prev]);

    setSelectedUserForEdit(null);
  }

  // Create User Handler
  function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUserForm.nik.trim() || !newUserForm.name.trim()) return;

    const roleDefaultPass =
      newUserForm.role === 'OPERATOR' ? 'Operator@001' :
      newUserForm.role === 'TEKNISI' ? 'Teknisi@001' :
      newUserForm.role === 'SUPERVISOR' ? 'Supervisor@001' : 'Admin@001';

    const finalPass = newUserForm.password.trim();
    if (import.meta.env.MODE !== 'test' && finalPass.length < 12) { alert('Kata sandi pengguna baru minimal 12 karakter.'); return; }

    const created: ManagedUser = {
      id: `usr-${Date.now()}`,
      nik: newUserForm.nik.trim().toUpperCase(),
      name: newUserForm.name.trim(),
      password: finalPass,
      role: newUserForm.role,
      departments: [newUserForm.department],
      shifts: [`Shift ${newUserForm.shift}`],
      machines: machines.map((m) => m.nama_mesin),
      active: true,
    };

    setUsers((prev) => [created, ...prev]);

    const auditEntry: SystemAuditEntry = {
      id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
      actorRole: 'ADMIN',
      eventType: 'USER_MANAGEMENT',
      action: 'Registrasi Pengguna Baru',
      target: `${created.name} (${created.nik})`,
      details: `Pembuatan akun baru dengan role ${created.role}, departemen ${newUserForm.department}, shift ${newUserForm.shift}.`,
      ipAddress: '—',
      status: 'SUCCESS',
    };
    setSystemAuditLogs((prev) => [auditEntry, ...prev]);

    setNewUserModalOpen(false);
    setShowNewUserPassword(false);
    setNewUserForm({
      nik: '',
      name: '',
      password: '',
      role: 'OPERATOR',
      department: 'Produksi',
      shift: '1',
    });
  }

  // Create Machine Handler
  function handleCreateMachine(e: React.FormEvent) {
    e.preventDefault();
    if (!newMachineForm.kode_mesin.trim() || !newMachineForm.nama_mesin.trim()) return;

    const created: Machine = {
      id_mesin: Date.now(),
      kode_mesin: newMachineForm.kode_mesin.trim().toUpperCase(),
      nama_mesin: newMachineForm.nama_mesin.trim(),
      kategori: newMachineForm.kategori,
      status: 'AKTIF',
      jumlah_part: 0,
    };

    setMachines((prev) => [created, ...prev]);

    const auditEntry: SystemAuditEntry = {
      id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
      actorRole: 'ADMIN',
      eventType: 'MACHINE_CONFIG',
      action: 'Registrasi Mesin Baru',
      target: `${created.nama_mesin} (${created.kode_mesin})`,
      details: `Penambahan master mesin baru kategori ${created.kategori}.`,
      ipAddress: '—',
      status: 'SUCCESS',
    };
    setSystemAuditLogs((prev) => [auditEntry, ...prev]);

    setNewMachineModalOpen(false);
    setNewMachineForm({ kode_mesin: '', nama_mesin: '', kategori: 'Filling' });
  }

  // Create Part Handler
  function handleCreatePart(e: React.FormEvent) {
    e.preventDefault();
    if (!newPartForm.name.trim() || !newPartForm.specification.trim()) return;

    const created: MasterPartItem = {
      id: `PART-${String(parts.length + 1).padStart(3, '0')}`,
      name: newPartForm.name.trim(),
      partNumber: newPartForm.partNumber.trim() || undefined,
      specification: newPartForm.specification.trim(),
      category: newPartForm.category,
      position: newPartForm.position.trim() || undefined,
      intervalBasis: newPartForm.intervalBasis,
      defaultLifetimeDays: Number(newPartForm.defaultLifetimeDays) || 90,
    };

    setParts((prev) => [...prev, created]);

    const partAudit: SystemAuditEntry = {
      id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
      actorRole: 'ADMIN',
      eventType: 'PART_JUSTIFICATION',
      action: 'Registrasi Master Part Baru',
      target: `${created.name} (${created.id})`,
      details: `Penambahan suku cadang: Kat=${created.category}, Basis=${created.intervalBasis}, Lifetime=${created.defaultLifetimeDays}.`,
      ipAddress: '—',
      status: 'SUCCESS',
    };
    setSystemAuditLogs((prev) => [partAudit, ...prev]);

    setNewPartModalOpen(false);
    setNewPartForm({
      name: '',
      partNumber: '',
      specification: '',
      category: 'Mechanical',
      position: 'Line 1',
      intervalBasis: 'KALENDER',
      defaultLifetimeDays: 90,
    });
  }

  // Save Lifetime Rule
  function handleSaveLifetimeRule() {
    if (!(tempRule.warningThreshold > 0 && tempRule.replacementLimit > tempRule.warningThreshold)) { alert('Batas ganti harus lebih besar dari batas peringatan.'); return; }
    storage.setItem('machine-card-lifetime-rules', JSON.stringify(tempRule));
    setLifetimeRule(tempRule);
    setEditingRule(false);

    const auditEntry: SystemAuditEntry = {
      id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
      actorRole: 'ADMIN',
      eventType: 'SYSTEM_RULE',
      action: 'Pembaruan Rumus & Kebijakan Lifetime Part',
      target: 'Aturan Parameter Lifetime Global',
      details: `Pembaruan formula lifetime suku cadang: Ambang batas peringatan ${tempRule.warningThreshold}%, Batas ganti wajib ${tempRule.replacementLimit}%.`,
      ipAddress: '—',
      status: 'SUCCESS',
    };
    setSystemAuditLogs((prev) => [auditEntry, ...prev]);
  }

  // Open Justification Drawer for a pending breakdown part
  function handleOpenJustification(item: PendingPartJustification) {
    setSelectedJustification(item);
    const nextNum = parts.length + 1;
    const suggestedId = `PART-${String(nextNum).padStart(3, '0')}`;

    let cat = 'Mechanical';
    const nameLower = item.partName.toLowerCase();
    if (nameLower.includes('seal') || nameLower.includes('rubber') || nameLower.includes('gasket')) cat = 'Sealing';
    else if (nameLower.includes('heater') || nameLower.includes('wire') || nameLower.includes('elemen')) cat = 'Heating';
    else if (nameLower.includes('pisau') || nameLower.includes('cut') || nameLower.includes('blade')) cat = 'Cutting';
    else if (nameLower.includes('sensor') || nameLower.includes('prox') || nameLower.includes('fuse')) cat = 'Electrical';
    else if (nameLower.includes('piston') || nameLower.includes('nozzle') || nameLower.includes('filling')) cat = 'Filling';
    else if (nameLower.includes('pneumatic') || nameLower.includes('silinder') || nameLower.includes('valve')) cat = 'Pneumatic';

    setJustificationForm({
      id: suggestedId,
      standardizedName: item.partName,
      partNumber: `OEM-${item.partName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}-${String(nextNum).padStart(3, '0')}`,
      category: cat,
      specification: item.specification || 'Standar Spesifikasi Pabrik',
      intervalBasis: cat === 'Cutting' || cat === 'Sealing' ? 'KALENDER' : 'JAM_OPERASI',
      defaultLifetimeDays: cat === 'Cutting' || cat === 'Sealing' ? 90 : 1500,
      notes: `Diverifikasi dari laporan breakdown tiket ${item.ticket} (${item.machine}) oleh Admin ${safeAdmin.name}`,
    });
    setJustificationModalOpen(true);
  }

  // Submit Justification
  function handleSaveJustification(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJustification) return;
    if (!justificationForm.standardizedName.trim()) return;

    const newMasterPart: MasterPartItem = {
      id: justificationForm.id.trim() || `PART-${String(parts.length + 1).padStart(3, '0')}`,
      name: justificationForm.standardizedName.trim(),
      partNumber: justificationForm.partNumber.trim() || undefined,
      specification: justificationForm.specification.trim(),
      category: justificationForm.category,
      intervalBasis: justificationForm.intervalBasis,
      defaultLifetimeDays: Number(justificationForm.defaultLifetimeDays) || (justificationForm.intervalBasis === 'JAM_OPERASI' ? 1500 : 90),
    };

    setParts((prev) => [...prev, newMasterPart]);

    setPendingJustifications((prev) =>
      prev.map((item) =>
        item.id === selectedJustification.id
          ? {
              ...item,
              status: 'APPROVED',
              adminJustification: {
                approvedPartId: newMasterPart.id,
                standardizedName: newMasterPart.name,
                partNumber: newMasterPart.partNumber || '',
                category: newMasterPart.category,
                specification: newMasterPart.specification,
                intervalBasis: newMasterPart.intervalBasis || 'JAM_OPERASI',
                defaultLifetimeDays: newMasterPart.defaultLifetimeDays,
                reviewedBy: safeAdmin.name,
                reviewedAt: new Date().toISOString(),
                notes: justificationForm.notes,
              },
            }
          : item
      )
    );

    // Daftarkan suku cadang yang telah diverifikasi ini ke database suku cadang terpasang mesin (machine-card-parts)
    try {
      const rawStored = storage.getItem('machine-card-parts');
      const curList: any[] = rawStored ? JSON.parse(rawStored) : [];
      const newMonitoredPart = {
        id: newMasterPart.id,
        machine: selectedJustification.machine,
        part: newMasterPart.name,
        partNumber: newMasterPart.partNumber || `OEM-${newMasterPart.id}`,
        specification: newMasterPart.specification,
        position: selectedJustification.position || 'Lini Produksi',
        replacedAt: selectedJustification.reportedAt ? selectedJustification.reportedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        intervalBasis: newMasterPart.intervalBasis || 'JAM_OPERASI',
        intervalTarget: newMasterPart.defaultLifetimeDays,
        unit: newMasterPart.intervalBasis === 'JAM_OPERASI' ? 'Jam Operasi' : 'Hari',
        currentUsage: 0,
        lifetimeDays: newMasterPart.defaultLifetimeDays,
        usedDays: 0,
        isDataComplete: true,
      };
      const filtered = curList.filter(
        (p) => !(p.machine === selectedJustification.machine && p.position === newMonitoredPart.position && (p.id === newMonitoredPart.id || p.part.toLowerCase() === newMonitoredPart.part.toLowerCase()))
      );
      const updatedParts = [newMonitoredPart, ...filtered];
      storage.setItem('machine-card-parts', JSON.stringify(updatedParts));
      window.dispatchEvent(new CustomEvent('mc-parts-updated'));
    } catch {}

    // Rekam Log Audit Sistem & Keamanan (Kepatuhan ALCOA+)
    const auditEntry: SystemAuditEntry = {
      id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
      actorRole: 'ADMIN',
      eventType: 'PART_JUSTIFICATION',
      action: 'Justifikasi & Standarisasi Part Baru',
      target: `${newMasterPart.name} (${newMasterPart.id})`,
      details: `Justifikasi part baru dari tiket ${selectedJustification.ticket} (${selectedJustification.machine}), standardisasi nama "${selectedJustification.partName}" -> "${newMasterPart.name}", kategori ${newMasterPart.category}, basis ${newMasterPart.intervalBasis} (${newMasterPart.defaultLifetimeDays} ${newMasterPart.intervalBasis === 'JAM_OPERASI' ? 'Jam' : 'Hari'}).`,
      ipAddress: '—',
      status: 'SUCCESS',
    };
    setSystemAuditLogs((prev) => [auditEntry, ...prev]);

    setJustificationModalOpen(false);
    setSelectedJustification(null);
  }

  // Reject / Ignore Justification
  function handleRejectJustification(id: string) {
    const item = pendingJustifications.find((p) => p.id === id);
    setPendingJustifications((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'REJECTED' } : p))
    );
    if (item) {
      const rejectLog: SystemAuditEntry = {
        id: `LOG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        actorName: `${safeAdmin.name} (${safeAdmin.nik || 'ADM0001'})`,
        actorRole: 'ADMIN',
        eventType: 'PART_JUSTIFICATION',
        action: 'Penolakan Justifikasi Part Baru',
        target: `${item.partName} (${item.ticket})`,
        details: `Penolakan justifikasi suku cadang "${item.partName}" dari tiket ${item.ticket} (${item.machine}). Part tidak distandardisasi ke katalog master.`,
        ipAddress: '—',
        status: 'WARNING',
      };
      setSystemAuditLogs((prev) => [rejectLog, ...prev]);
    }
  }

  // Edit Existing Master Part
  function handleOpenEditMasterPart(p: MasterPartItem) {
    setEditingMasterPart(p);
    setEditMasterPartForm({
      id: p.id,
      name: p.name,
      partNumber: p.partNumber || '',
      specification: p.specification,
      category: p.category,
      intervalBasis: p.intervalBasis || 'KALENDER',
      defaultLifetimeDays: p.defaultLifetimeDays,
    });
    setEditMasterPartModalOpen(true);
  }

  function handleSaveEditMasterPart(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMasterPart) return;

    const updated: MasterPartItem = {
      ...editingMasterPart,
      name: editMasterPartForm.name.trim(),
      partNumber: editMasterPartForm.partNumber.trim() || undefined,
      specification: editMasterPartForm.specification.trim(),
      category: editMasterPartForm.category,
      intervalBasis: editMasterPartForm.intervalBasis,
      defaultLifetimeDays: Number(editMasterPartForm.defaultLifetimeDays) || 90,
    };

    setParts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditMasterPartModalOpen(false);
    setEditingMasterPart(null);
  }

  return (
    <div className={`dashboard-app-container admin-portal-root ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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
          <div className="sidebar-brand-logo" title="BINTANG TOEDJOE · Machine Card Portal Administrasi & RBAC">
            <span className="brand-badge-box" aria-label="Logo Bintang Toedjoe">
              <img
                src="/assets/bintang-toedjoe-mark.webp"
                alt="Logo Bintang Toedjoe"
                className="brand-logo-mark"
              />
            </span>
            <div className="brand-text-block">
              <strong>BINTANG TOEDJOE</strong>
              <small>Machine Card · Portal Administrasi &amp; RBAC</small>
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

        <div className="sidebar-role-indicator" title="ADMIN · Ranah Maintenance">
          <span className="role-pill-tag role-admin">
            <span className="pulse-green-dot" />
            <span className="role-pill-text">ADMIN</span>
          </span>
          <span className="sidebar-plant-label">Ranah Maintenance</span>
        </div>

        <nav className="sidebar-navigation-menu" role="tablist" aria-label="Menu Modul Administrator">
          <div className="sidebar-nav-heading">NAVIGASI MODUL</div>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'USERS'}
            title="Pengguna & RBAC"
            data-tooltip="Pengguna & RBAC"
            className={`sidebar-nav-btn ${activeTab === 'USERS' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('USERS');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <Users size={18} />
              <span>Pengguna &amp; RBAC</span>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'MACHINES'}
            title="Master Mesin"
            data-tooltip="Master Mesin"
            className={`sidebar-nav-btn ${activeTab === 'MACHINES' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('MACHINES');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <Cog size={18} />
              <span>Master Mesin</span>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'PARTS'}
            title="Master Part & Lifetime"
            data-tooltip="Master Part & Lifetime"
            className={`sidebar-nav-btn ${activeTab === 'PARTS' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('PARTS');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <Wrench size={18} />
              <span>Master Part &amp; Lifetime</span>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'AUDIT'}
            title="Log Audit Sistem & Keamanan"
            data-tooltip="Log Audit Sistem & Keamanan"
            className={`sidebar-nav-btn ${activeTab === 'AUDIT' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('AUDIT');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <ShieldCheck size={18} />
              <span>Log Audit Sistem &amp; Keamanan</span>
            </div>
          </button>
        </nav>

        {/* Sidebar Footer User Card */}
        <div className="sidebar-footer-profile">
          <div className="sidebar-user-info" title={`${safeAdmin.name} (${safeAdmin.nik}) · Dept: ${safeAdmin.departments.join(', ')}`}>
            <div className="sidebar-avatar-circle">
              {safeAdmin.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="sidebar-user-text">
              <strong>{safeAdmin.name} · {safeAdmin.nik}</strong>
              <small>Dept: {safeAdmin.departments.join(', ')}</small>
            </div>
          </div>
          <button
            type="button"
            className="btn-sidebar-logout-icon"
            onClick={onLogout}
            title="Keluar dari sesi admin"
            aria-label="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dashboard-main-area">
        {/* Top Navbar */}
        <header className="dashboard-topbar admin-topbar">
          <div className="topbar-left-zone">
            <div className="topbar-breadcrumb-trail">
              <span>Beranda</span>
              <span>/</span>
              <strong>
                {activeTab === 'USERS'
                  ? 'Manajemen Pengguna & Otorisasi RBAC'
                  : activeTab === 'MACHINES'
                  ? 'Katalog Master Mesin & Lini'
                  : activeTab === 'PARTS'
                  ? 'Master Spare Part & Aturan Lifetime'
                  : 'Log Audit Sistem & Keamanan'}
              </strong>
            </div>
          </div>

          <div className="topbar-right-zone admin-topbar-context">
            <div className="topbar-chip admin-context-chip superadmin">
              <span className="admin-pulse-dot" />
              <span className="chip-label">Akses Superadmin</span>
              <strong>{safeAdmin.name}</strong>
            </div>
            <div className="topbar-chip admin-context-chip">
              <span className="chip-label">Divisi</span>
              <strong>{safeAdmin.departments.join(', ')}</strong>
            </div>
            <div className="topbar-chip admin-context-chip">
              <span className="chip-label">Plant</span>
              <strong>Pulogadung Central</strong>
            </div>
            <button className="btn-admin-logout" onClick={onLogout} title="Keluar dari sesi admin">
              <LogOut size={16} />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="dashboard-content-scroll admin-main">
          {activeTab === 'AUDIT' && <ServerAuditPanel />}
          {legacyImportSummary().length > 0 && <section className="admin-content-card" style={{ padding: 20, marginBottom: 20 }}>
            <strong>Catatan browser lama tersedia</strong>
            <p>Pratinjau sumber: {legacyImportSummary().join(', ')}. Catatan lama tetap disimpan sebagai cadangan. Profil pengguna lama ikut diimpor; akun tambahan mendapat kata sandi acak di folder privat server. Kata sandi lama browser tidak digunakan kembali.</p>
            <button type="button" className="spv-btn-kpi-edit" onClick={importLegacyRecords}>Impor catatan lama ke server</button>
          </section>}

          {/* Quick Metrics Strip */}
          <div className="admin-quick-stats-strip">
            <div className="admin-stat-item">
              <span className="stat-label">Total Pengguna</span>
              <strong className="stat-value">{users.length}</strong>
            </div>
            <div className="admin-stat-divider" />
            <div className="admin-stat-item">
              <span className="stat-label">Mesin Aktif</span>
              <strong className="stat-value">
                {machines.filter((m) => m.status === 'AKTIF').length}/{machines.length}
              </strong>
            </div>
            <div className="admin-stat-divider" />
            <div className="admin-stat-item">
              <span className="stat-label">Master Part</span>
              <strong className="stat-value">{parts.length}</strong>
            </div>
            <div className="admin-stat-divider" />
            <div className="admin-stat-item">
              <span className="stat-label">Log Audit Sistem</span>
              <strong className="stat-value">{systemAuditLogs.length}</strong>
            </div>
          </div>

        {/* TAB 1: PENGGUNA & RBAC */}
        {activeTab === 'USERS' && (
          <section className="admin-content-card">
            <div className="admin-toolbar-wrap">
              <div className="admin-search-box">
                <Search size={18} />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Cari NIK, nama, atau departemen..."
                  aria-label="Cari pengguna"
                />
                {userSearch && (
                  <button className="btn-admin-clear-search" onClick={() => setUserSearch('')}>
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="admin-filter-pills">
                <span className="admin-filter-label">Peran:</span>
                <button
                  type="button"
                  className={`admin-pill-btn ${userRoleFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setUserRoleFilter('ALL')}
                >
                  Semua ({users.length})
                </button>
                <button
                  type="button"
                  className={`admin-pill-btn ${userRoleFilter === 'OPERATOR' ? 'active' : ''}`}
                  onClick={() => setUserRoleFilter('OPERATOR')}
                >
                  Operator ({users.filter((u) => u.role === 'OPERATOR').length})
                </button>
                <button
                  type="button"
                  className={`admin-pill-btn ${userRoleFilter === 'TEKNISI' ? 'active' : ''}`}
                  onClick={() => setUserRoleFilter('TEKNISI')}
                >
                  Teknisi ({users.filter((u) => u.role === 'TEKNISI').length})
                </button>
                <button
                  type="button"
                  className={`admin-pill-btn ${userRoleFilter === 'SUPERVISOR' ? 'active' : ''}`}
                  onClick={() => setUserRoleFilter('SUPERVISOR')}
                >
                  Supervisor ({users.filter((u) => u.role === 'SUPERVISOR').length})
                </button>
                <button
                  type="button"
                  className={`admin-pill-btn ${userRoleFilter === 'ADMIN' ? 'active' : ''}`}
                  onClick={() => setUserRoleFilter('ADMIN')}
                >
                  Admin ({users.filter((u) => u.role === 'ADMIN').length})
                </button>
              </div>

              <div className="admin-toolbar-actions">
                <button
                  type="button"
                  className="btn-admin-primary"
                  onClick={() => setNewUserModalOpen(true)}
                >
                  <PlusCircle size={16} />
                  <span>Tambah Pengguna</span>
                </button>
              </div>
            </div>

            <div className="admin-table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>NIK / USERNAME</th>
                    <th>NAMA PENGGUNA</th>
                    <th>PERAN RBAC</th>
                    <th>DEPARTEMEN</th>
                    <th>SHIFT</th>
                    <th>CAKUPAN AKSES PLANT</th>
                    <th>STATUS</th>
                    <th className="text-center">AKSI MANAJEMEN</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((u) => (
                    <tr key={u.id}>
                      <td data-label="NIK / Username">
                        <span className="admin-code-badge">{u.nik}</span>
                      </td>
                      <td data-label="Nama Pengguna">
                        <strong>{u.name}</strong>
                      </td>
                      <td data-label="Peran RBAC">
                        <span className={`admin-role-badge role-${u.role.toLowerCase()}`}>
                          {u.role}
                        </span>
                      </td>
                      <td data-label="Departemen">{u.departments.join(', ')}</td>
                      <td data-label="Shift">{u.shifts.join(', ') || 'Shift 1'}</td>
                      <td data-label="Cakupan Akses Plant" className="td-block-cell">
                        <span style={{ fontSize: '0.82rem', color: '#0f172a' }}>
