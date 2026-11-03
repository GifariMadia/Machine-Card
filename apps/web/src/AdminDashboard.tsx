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
                          <strong>Seluruh Mesin Plant ({machines.length} Unit)</strong>{' '}
                          <small className="text-muted">(Akses Terbuka Lintas Lini)</small>
                        </span>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`admin-status-indicator ${u.active ? 'active' : 'inactive'}`}
                        >
                          <span className={`admin-status-dot ${u.active ? 'green' : 'gray'}`} />
                          {u.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td data-label="Aksi Manajemen" className="text-center td-action-cell">
                        <div className="admin-table-actions-inline">
                          <button
                            type="button"
                            className="btn-admin-action-sm btn-action-edit"
                            onClick={() => handleOpenEditUser(u)}
                            title="Edit peran RBAC, departemen, dan shift kerja pengguna"
                          >
                            <Edit3 size={13} />
                            <span>Edit Profil</span>
                          </button>
                          <button
                            type="button"
                            className={`btn-admin-action-sm ${u.active ? 'btn-action-deactivate' : 'btn-action-activate'}`}
                            onClick={() => handleToggleUserActive(u.id)}
                            title={u.active ? 'Nonaktifkan akun pengguna' : 'Aktifkan akun pengguna'}
                          >
                            <Power size={13} />
                            <span>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center" style={{ padding: '2.5rem 1rem' }}>
                        <Users size={32} color="var(--color-icon-neutral, #64748b)" />
                        <strong style={{ display: 'block', marginTop: '0.5rem' }}>
                          Tidak ada pengguna ditemukan
                        </strong>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer untuk Tabel Pengguna */}
            <footer className="table-pagination-footer">
              <div className="pagination-left-wrap">
                <span className="pagination-info">
                  Menampilkan {paginatedUsers.length ? (userPage - 1) * userPerPage + 1 : 0}–
                  {Math.min(userPage * userPerPage, filteredUsers.length)} dari {filteredUsers.length} pengguna
                </span>
                <div className="pagination-size-selector">
                  <label htmlFor="user-page-size">Per halaman:</label>
                  <select
                    id="user-page-size"
                    value={userPerPage}
                    onChange={(e) => {
                      setUserPerPage(Number(e.target.value));
                      setUserPage(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="pagination-ctrls">
                <button
                  type="button"
                  disabled={userPage === 1}
                  onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                  aria-label="Halaman pengguna sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="pagination-page-status">
                  {userPage} / {totalUserPages}
                </span>
                <button
                  type="button"
                  disabled={userPage >= totalUserPages}
                  onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                  aria-label="Halaman pengguna berikutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          </section>
        )}

        {/* TAB 2: MASTER MESIN */}
        {activeTab === 'MACHINES' && (
          <section className="admin-content-card">
            {/* SUB-NAV SELECTION */}
            <div className="admin-subnav-bar">
              <button
                type="button"
                className={`admin-subnav-btn ${machineSubTab === 'CATALOG' ? 'active' : ''}`}
                onClick={() => setMachineSubTab('CATALOG')}
              >
                Katalog &amp; Status Mesin
              </button>
              <button
                type="button"
                className={`admin-subnav-btn ${machineSubTab === 'OPERATING_HOURS' ? 'active' : ''}`}
                onClick={() => setMachineSubTab('OPERATING_HOURS')}
              >
                <Activity size={14} />
                <span>Data Jam Operasi Aktual (Input Manual SPV &amp; Admin)</span>
              </button>
            </div>

            {machineSubTab === 'CATALOG' ? (
              <>
                <div className="admin-toolbar-wrap">
                  <div className="admin-search-box">
                    <Search size={18} />
                    <input
                      type="text"
                      value={machineSearch}
                      onChange={(e) => setMachineSearch(e.target.value)}
                      placeholder="Cari kode atau nama mesin..."
                      aria-label="Cari mesin"
                    />
                  </div>

                  <div className="admin-filter-pills">
                    <span className="admin-filter-label">Section:</span>
                    {['ALL', 'Filling', 'Packaging', 'Mixing'].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        className={`admin-pill-btn ${machineSectionFilter === sec ? 'active' : ''}`}
                        onClick={() => setMachineSectionFilter(sec)}
                      >
                        {sec === 'ALL' ? 'Semua Section' : sec}
                      </button>
                    ))}
                  </div>

                  <div className="admin-toolbar-actions">
                    <button
                      type="button"
                      className="btn-admin-primary"
                      onClick={() => setNewMachineModalOpen(true)}
                    >
                      <PlusCircle size={16} />
                      <span>Tambah Mesin Baru</span>
                    </button>
                  </div>
                </div>

                <div className="admin-table-responsive">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>KODE MESIN</th>
                        <th>NAMA MESIN</th>
                        <th>SECTION / LINI PRODUKSI</th>
                        <th>STATUS OPERASIONAL</th>
                        <th>JAM OPERASI &amp; MTBF</th>
                        <th className="text-center">AKSI MASTER &amp; LOGBOOK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMachines.map((m) => {
                        const rec = operatingHoursRecords.find((r) => r.namaMesin === m.nama_mesin || r.kodeMesin === m.kode_mesin);
                        const machineTickets = auditTickets.filter((t) => t.machine === m.nama_mesin);
                        const breakdownCount = Math.max(1, machineTickets.length);
                        const rawMtbf = rec && rec.jamOperasiAktual > 0 ? (rec.jamOperasiAktual / breakdownCount).toFixed(1) : null;

                        return (
                          <tr key={m.kode_mesin}>
                            <td data-label="Kode Mesin">
                              <span className="admin-code-badge">{m.kode_mesin}</span>
                            </td>
                            <td data-label="Nama Mesin">
                              <strong>{m.nama_mesin}</strong>
                            </td>
                            <td data-label="Section / Lini">
                              <span style={{ fontWeight: 600, color: '#475569' }}>{m.kategori}</span>
                            </td>
                            <td data-label="Status Operasional">
                              <span
                                className={`admin-status-indicator ${
                                  m.status === 'AKTIF' ? 'active' : 'inactive'
                                }`}
                              >
                                <span
                                  className={`admin-status-dot ${
                                    m.status === 'AKTIF' ? 'green' : 'gray'
                                  }`}
                                />
                                {m.status === 'AKTIF' ? 'Beroperasi' : 'Nonaktif'}
                              </span>
                            </td>
                            <td data-label="Jam Operasi & MTBF">
                              {rec && rec.jamOperasiAktual > 0 ? (
                                <div className="admin-mtbf-cell">
                                  <span className="mtbf-hours-badge">{rec.jamOperasiAktual} Jam</span>
                                  <span className="mtbf-ratio">MTBF: ~{rawMtbf} Jam</span>
                                </div>
                              ) : (
                                <div className="admin-mtbf-cell muted">
                                  <span className="mtbf-hours-badge muted">0 Jam</span>
                                  <span className="mtbf-ratio muted">MTBF: —</span>
                                </div>
                              )}
                            </td>
                            <td data-label="Aksi" className="text-center td-action-cell">
                              <div className="admin-table-actions-inline">
                                <button
                                  type="button"
                                  className="btn-admin-action-sm btn-action-edit"
                                  onClick={() => {
                                    if (rec) {
                                      setSelectedOperatingRecord(rec);
                                      setOperatingForm({
                                        kodeMesin: rec.kodeMesin,
                                        namaMesin: rec.namaMesin,
                                        periode: rec.periode,
                                        jamOperasiAktual: rec.jamOperasiAktual,
                                        jamShiftKalender: rec.jamShiftKalender,
                                        sumberData: rec.sumberData,
                                        penanggungJawab: rec.penanggungJawab,
                                        isComplete: rec.isComplete,
                                        catatanPenjelasan: rec.catatanPenjelasan || '',
                                      });
                                    } else {
                                      setOperatingForm({
                                        kodeMesin: m.kode_mesin,
                                        namaMesin: m.nama_mesin,
                                        periode: 'Oktober 2026',
                                        jamOperasiAktual: 7.0,
                                        jamShiftKalender: 7.0,
                                        sumberData: `Input Manual Admin (${admin.name})`,
                                        penanggungJawab: `${admin.name} (Admin)`,
                                        isComplete: true,
                                        catatanPenjelasan: '',
                                      });
                                      setNewOperatingModalOpen(true);
                                    }
                                  }}
                                  title="Kelola jam operasi & MTBF mesin ini"
                                >
                                  <Edit3 size={12} />
                                  <span>Logbook MTBF</span>
                                </button>
                                <button
                                  type="button"
                                  className={`btn-admin-action-sm ${m.status === 'AKTIF' ? 'btn-action-deactivate' : 'btn-action-activate'}`}
                                  onClick={() => handleToggleMachineStatus(m.kode_mesin)}
                                  title="Ubah status aktif/nonaktif mesin"
                                >
                                  <Power size={12} />
                                  <span>{m.status === 'AKTIF' ? 'Set Nonaktif' : 'Set Beroperasi'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredMachines.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center" style={{ padding: '2.5rem 1rem' }}>
                            <Cog size={32} color="var(--color-icon-neutral, #64748b)" />
                            <strong style={{ display: 'block', marginTop: '0.5rem' }}>
                              Tidak ada mesin ditemukan
                            </strong>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer untuk Tabel Master Mesin */}
                <footer className="table-pagination-footer">
                  <div className="pagination-left-wrap">
                    <span className="pagination-info">
                      Menampilkan {paginatedMachines.length ? (machinePage - 1) * machinePerPage + 1 : 0}–
                      {Math.min(machinePage * machinePerPage, filteredMachines.length)} dari {filteredMachines.length} mesin
                    </span>
                    <div className="pagination-size-selector">
                      <label htmlFor="machine-page-size">Per halaman:</label>
                      <select
                        id="machine-page-size"
                        value={machinePerPage}
                        onChange={(e) => {
                          setMachinePerPage(Number(e.target.value));
                          setMachinePage(1);
                        }}
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  </div>
                  <div className="pagination-ctrls">
                    <button
                      type="button"
                      disabled={machinePage === 1}
                      onClick={() => setMachinePage((p) => Math.max(1, p - 1))}
                      aria-label="Halaman mesin sebelumnya"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="pagination-page-status">
                      {machinePage} / {totalMachinePages}
                    </span>
                    <button
                      type="button"
                      disabled={machinePage >= totalMachinePages}
                      onClick={() => setMachinePage((p) => Math.min(totalMachinePages, p + 1))}
                      aria-label="Halaman mesin berikutnya"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div>
                {/* Clean Header & Action Bar */}
                <div className="admin-subtab-header">
                  <div className="admin-subtab-header-left">
                    <div className="admin-subtab-title-row">
                      <Activity size={18} color="var(--color-icon-neutral, #64748b)" />
                      <h2>
                        Logbook Jam Operasi Aktual Mesin &amp; Basis MTBF Presisi
                      </h2>
                      <span className="admin-status-pill green">
                        Integrasi Sederhana: Input Manual Terverifikasi SPV &amp; Admin
                      </span>
                    </div>
                    <p className="admin-subtab-subtitle">
                      Pencatatan jam operasi riil per mesin untuk kalkulasi ketersediaan (Availability) dan estimasi MTBF presisi.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn-admin-primary"
                    onClick={() => {
                      setOperatingForm({
                        kodeMesin: machines[0]?.kode_mesin || 'MESIN-001',
                        namaMesin: machines[0]?.nama_mesin || 'Ilapak 1',
                        periode: 'Oktober 2026',
                        jamOperasiAktual: 7.0,
                        jamShiftKalender: 7.0,
                        sumberData: `Input Manual Admin (${admin.name})`,
                        penanggungJawab: `${admin.name} (Admin)`,
                        isComplete: true,
                        catatanPenjelasan: '',
                      });
                      setNewOperatingModalOpen(true);
                    }}
                  >
                    <PlusCircle size={15} />
                    <span>+ Input Data Jam Operasi</span>
                  </button>
                </div>

                {/* Clean Toolbar */}
                <div className="admin-toolbar-wrap" style={{ marginBottom: '1rem' }}>
                  <div className="admin-search-box" style={{ maxWidth: '300px' }}>
                    <Search size={16} />
                    <input
                      type="text"
                      value={machineSearch}
                      onChange={(e) => setMachineSearch(e.target.value)}
                      placeholder="Cari kode atau nama mesin..."
                      aria-label="Cari mesin di data jam operasi"
                    />
                  </div>
                </div>

                <div className="admin-table-responsive">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>MESIN &amp; PERIODE</th>
                        <th>JAM OPERASI AKTUAL</th>
                        <th>JAM SHIFT KALENDER</th>
                        <th>ESTIMASI MTBF</th>
                        <th>SUMBER &amp; PIC</th>
                        <th>STATUS KELENGKAPAN</th>
                        <th className="text-center">AKSI ADMIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOperatingRecords.map((rec) => {
                        const machineTickets = auditTickets.filter((t) => t.machine === rec.namaMesin);
                        const unclosedTickets = machineTickets.filter((t) => t.status !== 'CLOSED');
                        const closedTickets = machineTickets.filter((t) => t.status === 'CLOSED');
                        const breakdownCount = Math.max(1, machineTickets.length);
                        const rawMtbf = (rec.jamOperasiAktual / breakdownCount).toFixed(1);
                        const availPercent =
                          rec.jamShiftKalender > 0
                            ? Math.min(100, Math.round((rec.jamOperasiAktual / rec.jamShiftKalender) * 100))
                            : 0;

                        return (
                          <tr key={rec.id}>
                            <td data-label="Mesin & Periode">
                              <strong style={{ color: '#0f172a' }}>{rec.namaMesin}</strong>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {rec.kodeMesin} · Periode {rec.periode}
                              </div>
                            </td>
                            <td data-label="Jam Operasi Aktual">
                              {rec.jamOperasiAktual === 0 ? (
                                <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.88rem' }}>0 Jam</span>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                                    {rec.jamOperasiAktual} Jam
                                  </strong>
                                  <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                                    ({availPercent}%)
                                  </span>
                                </div>
                              )}
                            </td>
                            <td data-label="Jam Shift Kalender">
                              <span style={{ color: '#334155', fontWeight: 600 }}>{rec.jamShiftKalender} Jam</span>
                            </td>
                            <td data-label="Estimasi MTBF">
                              {rec.jamOperasiAktual === 0 ? (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              ) : !rec.isComplete ? (
                                <div>
                                  <strong style={{ color: '#334155', fontSize: '0.9rem' }}>~ {rawMtbf} Jam</strong>
                                  <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>
                                    Belum Final: Data Parsial
                                  </div>
                                </div>
                              ) : unclosedTickets.length > 0 ? (
                                <div>
                                  <strong style={{ color: '#334155', fontSize: '0.9rem' }}>~ {rawMtbf} Jam</strong>
                                  <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>
                                    Estimasi ({unclosedTickets.length} Tiket Open: {unclosedTickets.map((u) => u.ticket).join(', ')})
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{rawMtbf} Jam / Gangguan</strong>
                                  <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                                    Nilai Final ({closedTickets.length} Tiket Closed)
                                  </div>
                                </div>
                              )}
                            </td>
                            <td data-label="Sumber & PIC">
                              {rec.jamOperasiAktual === 0 ? (
                                <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>—</span>
                              ) : (
                                <div>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                                    {rec.sumberData}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    PIC: {rec.penanggungJawab}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td data-label="Status Kelengkapan">
                              {rec.isComplete ? (
                                <span className="admin-status-indicator active" style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                                  <CheckCircle2 size={13} />
                                  Data Lengkap
                                </span>
                              ) : (
                                <span className="admin-status-indicator inactive" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                                  Belum Lengkap
                                </span>
                              )}
                            </td>
                            <td data-label="Aksi Admin" className="text-center td-action-cell">
                              <div className="admin-table-actions-inline">
                                <button
                                  type="button"
                                  className="btn-admin-action-sm btn-action-edit"
                                  onClick={() => {
                                    setSelectedOperatingRecord(rec);
                                    setOperatingForm({
                                      kodeMesin: rec.kodeMesin,
                                      namaMesin: rec.namaMesin,
                                      periode: rec.periode,
                                      jamOperasiAktual: rec.jamOperasiAktual,
                                      jamShiftKalender: rec.jamShiftKalender,
                                      sumberData: rec.sumberData,
                                      penanggungJawab: rec.penanggungJawab,
                                      isComplete: rec.isComplete,
                                      catatanPenjelasan: rec.catatanPenjelasan || '',
                                    });
                                  }}
                                  title="Edit / Input data jam operasi aktual mesin"
                                >
                                  <Edit3 size={13} />
                                  <span>Edit / Input</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredOperatingRecords.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center" style={{ padding: '2.5rem 1rem' }}>
                            <Activity size={32} color="var(--color-icon-neutral, #64748b)" />
                            <strong style={{ display: 'block', marginTop: '0.5rem' }}>
                              Tidak ada data jam operasi ditemukan
                            </strong>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer untuk Logbook Jam Operasi */}
                <footer className="table-pagination-footer">
                  <div className="pagination-left-wrap">
                    <span className="pagination-info">
                      Menampilkan {paginatedOperatingRecords.length ? (operatingPage - 1) * operatingPerPage + 1 : 0}–
                      {Math.min(operatingPage * operatingPerPage, filteredOperatingRecords.length)} dari {filteredOperatingRecords.length} data operasi
                    </span>
                    <div className="pagination-size-selector">
                      <label htmlFor="operating-page-size">Per halaman:</label>
                      <select
                        id="operating-page-size"
                        value={operatingPerPage}
                        onChange={(e) => {
                          setOperatingPerPage(Number(e.target.value));
                          setOperatingPage(1);
                        }}
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  </div>
                  <div className="pagination-ctrls">
                    <button
                      type="button"
                      disabled={operatingPage === 1}
                      onClick={() => setOperatingPage((p) => Math.max(1, p - 1))}
                      aria-label="Halaman logbook sebelumnya"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="pagination-page-status">
                      {operatingPage} / {totalOperatingPages}
                    </span>
                    <button
                      type="button"
                      disabled={operatingPage >= totalOperatingPages}
                      onClick={() => setOperatingPage((p) => Math.min(totalOperatingPages, p + 1))}
                      aria-label="Halaman logbook berikutnya"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </footer>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: MASTER PART & ATURAN LIFETIME */}
        {activeTab === 'PARTS' && (
          <div>
            {/* Global Lifetime Rules Card */}
            <div className="admin-rule-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3>
                    <ShieldCheck size={20} color="var(--color-icon-neutral, #64748b)" />
                    Aturan Batas Monitoring Lifetime Spare Part (Plant Standard)
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                    Ambang batas persentase pemakaian suku cadang yang digunakan untuk memicu peringatan dini dan jadwal penggantian preventif.
                  </p>
                </div>
                {!editingRule ? (
                  <button
                    type="button"
                    className="btn-admin-secondary"
                    onClick={() => {
                      setTempRule(lifetimeRule);
                      setEditingRule(true);
                    }}
                  >
                    <Edit3 size={15} />
                    <span>Ubah Batas</span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn-admin-secondary"
                      onClick={() => setEditingRule(false)}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className="btn-admin-primary"
                      onClick={handleSaveLifetimeRule}
                    >
                      <Save size={15} />
                      Simpan Aturan
                    </button>
                  </div>
                )}
              </div>

              <div className="admin-rule-grid">
                <div className="admin-rule-box">
                  {!editingRule ? (
                    <strong>{lifetimeRule.warningThreshold}%</strong>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={tempRule.warningThreshold}
                      onChange={(e) =>
                        setTempRule({ ...tempRule, warningThreshold: Number(e.target.value) })
                      }
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        width: '80px',
                        padding: '2px 6px',
                      }}
                    />
                  )}
                  <span>Ambang Awal Peringatan (Warning Level - Indikator Kuning)</span>
                </div>

                <div className="admin-rule-box">
                  {!editingRule ? (
                    <strong>{lifetimeRule.replacementLimit}%</strong>
                  ) : (
                    <input
                      type="number"
                      min="50"
                      max="150"
                      value={tempRule.replacementLimit}
                      onChange={(e) =>
                        setTempRule({ ...tempRule, replacementLimit: Number(e.target.value) })
                      }
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        width: '80px',
                        padding: '2px 6px',
                      }}
                    />
                  )}
                  <span>Batas Wajib Penggantian / Overdue (Danger Level - Indikator Merah)</span>
                </div>
              </div>
            </div>

            {/* Banner Notifikasi Part Baru dari Breakdown yang Menunggu Justifikasi */}
            {pendingJustifications.filter((j) => j.status === 'PENDING').length > 0 && partSubTab === 'CATALOG' && (
              <div className="admin-justification-banner">
                <div className="banner-left">
                  <AlertTriangle size={20} color="#b45309" />
                  <div>
                    <strong>Terdapat {pendingJustifications.filter((j) => j.status === 'PENDING').length} Part Baru dari Laporan Breakdown Teknisi Menunggu Justifikasi</strong>
                    <p>Teknisi memasukkan penggantian part yang belum terdaftar di sistem saat perbaikan breakdown. Silakan lakukan standarisasi penamaan dan penetapan rumus lifetime mesin.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-admin-action-sm btn-action-edit"
                  onClick={() => setPartSubTab('JUSTIFICATIONS')}
                >
                  <ClipboardList size={13} />
                  <span>Buka Antrean Justifikasi ({pendingJustifications.filter((j) => j.status === 'PENDING').length})</span>
                </button>
              </div>
            )}

            {/* Sub-Navigasi Tab: Katalog Master vs Justifikasi Part Baru dari Breakdown */}
            <section className="admin-content-card">
              <div className="admin-subnav-bar">
                <button
                  type="button"
                  className={`admin-subnav-btn ${partSubTab === 'CATALOG' ? 'active' : ''}`}
                  onClick={() => setPartSubTab('CATALOG')}
                >
                  Katalog Master Spare Part ({parts.length})
                </button>
                <button
                  type="button"
                  className={`admin-subnav-btn ${partSubTab === 'JUSTIFICATIONS' ? 'active' : ''}`}
                  onClick={() => setPartSubTab('JUSTIFICATIONS')}
                >
                  <ClipboardList size={14} />
                  <span>Justifikasi Part Baru dari Breakdown</span>
                  {pendingJustifications.filter((j) => j.status === 'PENDING').length > 0 && (
                    <span className="admin-badge-count-warning">
                      {pendingJustifications.filter((j) => j.status === 'PENDING').length} Menunggu
                    </span>
                  )}
                </button>
              </div>

              {partSubTab === 'CATALOG' ? (
                <>
                  <div className="admin-toolbar-wrap">
                    <div>
                      <strong style={{ fontSize: '1rem', color: '#0a1e15' }}>
                        Katalog Master Spare Part Mesin
                      </strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                        Standar suku cadang dan target masa pakai sebelum dilakukan maintenance preventif.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div className="admin-search-box" style={{ maxWidth: '280px' }}>
                        <Search size={16} />
                        <input
                          type="text"
                          value={partSearch}
                          onChange={(e) => setPartSearch(e.target.value)}
                          placeholder="Cari suku cadang..."
                          aria-label="Cari suku cadang"
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-admin-primary"
                        onClick={() => setNewPartModalOpen(true)}
                      >
                        <PlusCircle size={16} />
                        <span>Tambah Master Part</span>
                      </button>
                    </div>
                  </div>

                  <div className="admin-table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>KODE PART</th>
                          <th>NAMA SUKU CADANG &amp; NO. PART</th>
                          <th>SPESIFIKASI / MATERIAL</th>
                          <th>KATEGORI TEKNIK</th>
                          <th>DASAR INTERVAL &amp; TARGET</th>
                          <th className="text-center th-action-cell">AKSI MASTER</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedParts.map((p) => (
                          <tr key={p.id}>
                            <td data-label="Kode Part">
                              <span className="admin-code-badge">{p.id}</span>
                            </td>
                            <td data-label="Nama Suku Cadang">
                              <strong>{p.name}</strong>
                              {p.partNumber && (
                                <div style={{ fontSize: '0.74rem', color: '#0369a1', fontWeight: 600 }}>
                                  Part No: {p.partNumber}
                                </div>
                              )}
                            </td>
                            <td data-label="Spesifikasi">{p.specification}</td>
                            <td data-label="Kategori Teknik">
                              <span className="admin-role-badge role-teknisi">{p.category}</span>
                            </td>
                            <td data-label="Dasar Interval &amp; Target">
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: p.intervalBasis === 'JAM_OPERASI' ? '#e0f2fe' : '#f1f5f9',
                                  color: p.intervalBasis === 'JAM_OPERASI' ? '#0369a1' : '#475569',
                                  fontWeight: 700,
                                  marginRight: '6px',
                                }}
                              >
                                {p.intervalBasis === 'JAM_OPERASI' ? 'Jam Operasi' : 'Kalender'}
                              </span>
                              <strong>
                                {p.intervalBasis === 'JAM_OPERASI'
                                  ? `${p.defaultLifetimeDays} Jam`
                                  : `${p.defaultLifetimeDays} Hari`}
                              </strong>
                            </td>
                            <td data-label="Aksi Master" className="text-center td-action-cell">
                              <div className="admin-table-actions-inline">
                                <button
                                  type="button"
                                  className="btn-admin-action-sm btn-action-edit"
                                  onClick={() => handleOpenEditMasterPart(p)}
                                  title="Ubah spesifikasi, nama, dan rumus lifetime master part"
                                >
                                  <Edit3 size={12} />
                                  <span>Ubah Rumus</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {filteredParts.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center" style={{ padding: '2.5rem 1rem' }}>
                              <Wrench size={32} color="var(--color-icon-neutral, #64748b)" />
                              <strong style={{ display: 'block', marginTop: '0.5rem' }}>
                                Tidak ada suku cadang ditemukan
                              </strong>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer untuk Katalog Master Part */}
                  <footer className="table-pagination-footer">
                    <div className="pagination-left-wrap">
                      <span className="pagination-info">
                        Menampilkan {paginatedParts.length ? (partPage - 1) * partPerPage + 1 : 0}–
                        {Math.min(partPage * partPerPage, filteredParts.length)} dari {filteredParts.length} suku cadang
                      </span>
                      <div className="pagination-size-selector">
                        <label htmlFor="part-page-size">Per halaman:</label>
                        <select
                          id="part-page-size"
                          value={partPerPage}
                          onChange={(e) => {
                            setPartPerPage(Number(e.target.value));
                            setPartPage(1);
                          }}
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                    </div>
                    <div className="pagination-ctrls">
                      <button
                        type="button"
                        disabled={partPage === 1}
                        onClick={() => setPartPage((p) => Math.max(1, p - 1))}
                        aria-label="Halaman suku cadang sebelumnya"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="pagination-page-status">
                        {partPage} / {totalPartPages}
                      </span>
                      <button
                        type="button"
                        disabled={partPage >= totalPartPages}
                        onClick={() => setPartPage((p) => Math.min(totalPartPages, p + 1))}
                        aria-label="Halaman suku cadang berikutnya"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </footer>
                </>
              ) : (
                /* SUB-TAB: ANTREAN JUSTIFIKASI PART BARU DARI BREAKDOWN */
                <div>
                  <div className="admin-toolbar-wrap" style={{ marginBottom: '1rem' }}>
                    <div>
                      <strong style={{ fontSize: '1rem', color: '#0a1e15' }}>
                        Antrean Justifikasi &amp; Penetapan Rumus Lifetime Part Baru
                      </strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                        Daftar penggantian part baru yang diinput teknisi dari tiket breakdown dan belum terdaftar di sistem. Admin dapat menstandarkan nama dan menetapkan rumus interval lifetimenya.
                      </p>
                    </div>
                  </div>

                  <div className="admin-table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>TIKET BREAKDOWN &amp; MESIN</th>
                          <th>PART DARI TEKNISI</th>
                          <th>SPESIFIKASI &amp; QTY</th>
                          <th>TEKNISI PELAPOR</th>
                          <th>STATUS JUSTIFIKASI</th>
                          <th className="text-center th-action-cell">AKSI JUSTIFIKASI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingJustifications.map((item) => (
                          <tr key={item.id}>
                            <td data-label="Tiket & Mesin">
                              <span className="admin-code-badge">{item.ticket}</span>
                              <strong style={{ display: 'block', marginTop: '2px', color: '#0f172a' }}>
                                {item.machine}
                              </strong>
                              <small style={{ color: '#64748b' }}>{item.position}</small>
                            </td>
                            <td data-label="Part dari Teknisi">
                              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                                {item.partName}
                              </strong>
                              {item.adminJustification && (
                                <div style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 600 }}>
                                  Resmi: {item.adminJustification.standardizedName} ({item.adminJustification.approvedPartId})
                                </div>
                              )}
                            </td>
                            <td data-label="Spesifikasi & Qty">
                              <div>{item.specification || '—'}</div>
                              <small style={{ fontWeight: 600, color: '#334155' }}>Jumlah: {item.quantity} pcs</small>
                            </td>
                            <td data-label="Teknisi Pelapor">
                              <strong>{item.technicianName}</strong>
                              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                {new Date(item.reportedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                            </td>
                            <td data-label="Status Justifikasi">
                              {item.status === 'PENDING' && (
                                <span className="admin-ticket-status-badge status-open" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
                                  Menunggu Justifikasi
                                </span>
                              )}
                              {item.status === 'APPROVED' && (
                                <span className="admin-ticket-status-badge status-closed">
                                  Telah Ditetapkan ({item.adminJustification?.intervalBasis === 'JAM_OPERASI' ? `${item.adminJustification.defaultLifetimeDays} Jam` : `${item.adminJustification?.defaultLifetimeDays} Hari`})
                                </span>
                              )}
                              {item.status === 'REJECTED' && (
                                <span className="admin-ticket-status-badge status-open">
                                  Ditolak / Diabaikan
                                </span>
                              )}
                            </td>
                            <td data-label="Aksi Justifikasi" className="text-center td-action-cell">
                              {item.status === 'PENDING' ? (
                                <div className="admin-table-actions-inline">
                                  <button
                                    type="button"
                                    className="btn-admin-action-sm btn-action-edit"
                                    onClick={() => handleOpenJustification(item)}
                                    title="Justifikasi standarisasi nama dan tetapkan rumus lifetime"
                                  >
                                    <Edit3 size={13} />
                                    <span>Justifikasi &amp; Tetapkan Rumus</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-admin-action-sm btn-action-deactivate"
                                    onClick={() => handleRejectJustification(item.id)}
                                    title="Abaikan usulan part ini"
                                  >
                                    <X size={13} />
                                    <span>Abaikan</span>
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Selesai Diproses</span>
                              )}
                            </td>
                          </tr>
                        ))}

                        {pendingJustifications.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center" style={{ padding: '2.5rem 1rem' }}>
                              <CheckCircle2 size={32} color="#059669" />
                              <strong style={{ display: 'block', marginTop: '0.5rem' }}>
                                Tidak ada antrean justifikasi part baru
                              </strong>
                              <small style={{ color: '#64748b' }}>Semua spare part dari laporan breakdown teknisi telah terdata di master part.</small>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 4: LOG AUDIT SISTEM & KEAMANAN */}
        {activeTab === 'AUDIT' && (
          <section className="admin-content-card">
            <div className="admin-toolbar-wrap">
              <div>
                <strong style={{ fontSize: '1rem', color: '#0a1e15' }}>
                  Log Audit Aktivitas Sistem &amp; Otorisasi RBAC
                </strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Rekam jejak kepatuhan (*audit trail*), otorisasi peran pengguna, status mesin, justifikasi spare part, dan perubahan konfigurasi plant.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div className="admin-search-box" style={{ maxWidth: '280px' }}>
                  <Search size={16} />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Cari ID log, aktivitas, target..."
                    aria-label="Cari log audit sistem"
                  />
                </div>
              </div>
            </div>

            {/* Filter Pills Kategori Event */}
            <div className="admin-filter-pills" style={{ marginBottom: '1rem' }}>
              <span className="admin-filter-label">Kategori Event:</span>
              {[
                { id: 'ALL', label: 'Semua Event' },
                { id: 'USER_MANAGEMENT', label: 'User & RBAC' },
                { id: 'MACHINE_CONFIG', label: 'Konfigurasi Mesin' },
                { id: 'PART_JUSTIFICATION', label: 'Justifikasi Part' },
                { id: 'SYSTEM_RULE', label: 'Aturan Plant' },
                { id: 'SECURITY', label: 'Keamanan' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`admin-pill-btn ${auditEventFilter === f.id ? 'active' : ''}`}
                  onClick={() => setAuditEventFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="admin-table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>WAKTU &amp; ID LOG</th>
                    <th>AKTOR / ADMIN</th>
                    <th>KATEGORI EVENT</th>
                    <th>AKTIVITAS &amp; TARGET</th>
                    <th>RINCIAN PERUBAHAN SISTEM</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAuditLogs.map((log) => (
                    <tr key={log.id}>
                      <td data-label="Waktu & ID Log">
                        <span className="admin-code-badge">{log.id}</span>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px' }}>
                          {new Date(log.timestamp).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} · {new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td data-label="Aktor / Admin">
                        <strong style={{ color: '#0f172a' }}>{log.actorName}</strong>
                        <div>
                          <span className="admin-role-badge role-admin" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                            {log.actorRole}
                          </span>
                        </div>
                      </td>
                      <td data-label="Kategori Event">
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background:
                              log.eventType === 'USER_MANAGEMENT'
                                ? '#faf5ff'
                                : log.eventType === 'MACHINE_CONFIG'
                                ? '#e0f2fe'
                                : log.eventType === 'PART_JUSTIFICATION'
                                ? '#ecfdf5'
                                : log.eventType === 'SECURITY'
                                ? '#fef3c7'
                                : '#f1f5f9',
                            color:
                              log.eventType === 'USER_MANAGEMENT'
                                ? '#6b21a8'
                                : log.eventType === 'MACHINE_CONFIG'
                                ? '#0369a1'
                                : log.eventType === 'PART_JUSTIFICATION'
                                ? '#047857'
                                : log.eventType === 'SECURITY'
                                ? '#92400e'
                                : '#334155',
                            border: '1px solid currentColor',
                          }}
                        >
                          {log.eventType === 'USER_MANAGEMENT'
                            ? 'User & RBAC'
                            : log.eventType === 'MACHINE_CONFIG'
                            ? 'Mesin & MTBF'
                            : log.eventType === 'PART_JUSTIFICATION'
                            ? 'Justifikasi Part'
                            : log.eventType === 'SECURITY'
                            ? 'Keamanan Sesi'
                            : 'Aturan Plant'}
                        </span>
                      </td>
                      <td data-label="Aktivitas & Target">
                        <strong style={{ display: 'block', fontSize: '0.86rem', color: '#0f172a' }}>
                          {log.action}
                        </strong>
                        <span style={{ fontSize: '0.76rem', color: '#0369a1', fontWeight: 600 }}>
                          Target: {log.target}
                        </span>
                      </td>
                      <td data-label="Rincian Perubahan" className="td-block-cell">
                        <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.45 }}>{log.details}</div>
                        {log.ipAddress && (
                          <small style={{ color: '#94a3b8', fontSize: '0.72rem' }}>IP: {log.ipAddress}</small>
                        )}
                      </td>
                      <td data-label="Status">
                        {log.status === 'SUCCESS' && (
                          <span className="admin-status-indicator active">
                            <span className="admin-status-dot green" />
                            Sukses
                          </span>
                        )}
                        {log.status === 'WARNING' && (
                          <span className="admin-status-indicator" style={{ color: '#b45309' }}>
                            <span className="admin-status-dot" style={{ background: '#f59e0b' }} />
                            Perhatian
                          </span>
                        )}
                        {log.status === 'FAILED' && (
                          <span className="admin-status-indicator inactive" style={{ color: '#be123c' }}>
                            <span className="admin-status-dot" style={{ background: '#e11d48' }} />
                            Gagal
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {filteredAuditLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center" style={{ padding: '2.5rem 1rem' }}>
                        <ShieldCheck size={32} color="var(--color-icon-neutral, #64748b)" />
                        <strong style={{ display: 'block', marginTop: '0.5rem' }}>
                          Tidak ada log audit sistem ditemukan
                        </strong>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer untuk Log Audit Sistem */}
            <footer className="table-pagination-footer">
              <div className="pagination-left-wrap">
                <span className="pagination-info">
                  Menampilkan {paginatedAuditLogs.length ? (auditPage - 1) * auditPerPage + 1 : 0}–
                  {Math.min(auditPage * auditPerPage, filteredAuditLogs.length)} dari {filteredAuditLogs.length} log audit sistem
                </span>
                <div className="pagination-size-selector">
                  <label htmlFor="audit-page-size">Per halaman:</label>
                  <select
                    id="audit-page-size"
                    value={auditPerPage}
                    onChange={(e) => {
                      setAuditPerPage(Number(e.target.value));
                      setAuditPage(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="pagination-ctrls">
                <button
                  type="button"
                  disabled={auditPage === 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  aria-label="Halaman audit sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="pagination-page-status">
                  {auditPage} / {totalAuditPages}
                </span>
                <button
                  type="button"
                  disabled={auditPage >= totalAuditPages}
                  onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
                  aria-label="Halaman audit berikutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          </section>
        )}
      </main>

      {/* DRAWER EDIT PROFIL, PERAN RBAC & SHIFT PENGGUNA */}
      {selectedUserForEdit && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-edit-user-title"
        >
          <button
            className="admin-modal-overlay"
            aria-label="Tutup panel"
            onClick={() => setSelectedUserForEdit(null)}
          />

          <aside className="admin-drawer-panel">
            <header className="admin-drawer-top">
              <div>
                <span className="admin-code-badge" style={{ background: '#059669', color: '#fff', border: 'none' }}>
                  {selectedUserForEdit.nik}
                </span>
                <h2 id="drawer-edit-user-title">Edit Profil &amp; Penugasan Shift</h2>
                <p>
                  Pengguna: <strong>{selectedUserForEdit.name}</strong>
                </p>
              </div>
              <button
                className="btn-admin-close-drawer"
                onClick={() => setSelectedUserForEdit(null)}
                aria-label="Tutup panel"
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleSaveUserEdit} className="admin-drawer-body">
              <div className="admin-form-group">
                <label htmlFor="edit-user-role">Peran RBAC</label>
                <select
                  id="edit-user-role"
                  value={editUserForm.role}
                  onChange={(e) => {
                    const nextRole = e.target.value as ManagedUser['role'];
                    setEditUserForm({
                      ...editUserForm,
                      role: nextRole,
                      department: nextRole === 'OPERATOR' ? 'Produksi' : 'Maintenance',
                    });
                  }}
                >
                  <option value="OPERATOR">OPERATOR (Ranah Produksi)</option>
                  <option value="TEKNISI">TEKNISI (Ranah Maintenance)</option>
                  <option value="SUPERVISOR">SUPERVISOR (Ranah Maintenance)</option>
                  <option value="ADMIN">ADMIN (Ranah Maintenance)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="edit-user-dept">Departemen / Ranah</label>
                <select
                  id="edit-user-dept"
                  value={editUserForm.department}
                  onChange={(e) =>
                    setEditUserForm({ ...editUserForm, department: e.target.value })
                  }
                >
                  <option value="Produksi">Produksi</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="edit-user-shift">Shift Kerja Aktif</label>
                <select
                  id="edit-user-shift"
                  value={editUserForm.shift}
                  onChange={(e) =>
                    setEditUserForm({ ...editUserForm, shift: e.target.value })
                  }
                >
                  <option value="Shift 1">Shift 1 (07:00 - 15:00)</option>
                  <option value="Shift 2">Shift 2 (15:00 - 23:00)</option>
                  <option value="Shift 3">Shift 3 (23:00 - 07:00)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="edit-user-password">Reset Kata Sandi (Opsional)</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="edit-user-password"
                    type={showEditUserPassword ? 'text' : 'password'}
                    placeholder="Kosongkan jika tidak ingin mengubah kata sandi"
                    value={editUserForm.password}
                    onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                    style={{ width: '100%', paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditUserPassword(!showEditUserPassword)}
                    aria-label={showEditUserPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    style={{
                      position: 'absolute',
                      right: '0.65rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                    }}
                  >
                    {showEditUserPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Isi hanya jika pengguna meminta pengaturan ulang (reset) kata sandi akun mereka.
                </small>
              </div>

              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '10px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  fontSize: '0.82rem',
                  color: '#166534',
                }}
              >
                <strong>Kebijakan Akses Mesin Terbuka:</strong> Seluruh operator dan teknisi memiliki akses penuh ke seluruh <strong>{machines.length} mesin produksi</strong> di plant tanpa pembatasan per individu untuk memudahkan operasional dan handover lintas shift.
              </div>

              <footer className="admin-drawer-footer" style={{ margin: 'auto -1.5rem -1.5rem' }}>
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setSelectedUserForEdit(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-primary">
                  <Check size={16} />
                  <span>Simpan Perubahan Profil</span>
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {/* MODAL TAMBAH PENGGUNA BARU */}
      {newUserModalOpen && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-user-title"
        >
          <button
            className="admin-modal-overlay"
            aria-label="Tutup formulir"
            onClick={() => setNewUserModalOpen(false)}
          />

          <aside className="admin-drawer-panel">
            <header className="admin-drawer-top">
              <div>
                <h2 id="modal-user-title">Tambah Pengguna Baru</h2>
                <p>Daftarkan akun karyawan ke sistem Machine Card</p>
              </div>
              <button
                className="btn-admin-close-drawer"
                onClick={() => setNewUserModalOpen(false)}
                aria-label="Tutup formulir"
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleCreateUser} className="admin-drawer-body">
              <div className="admin-form-group">
                <label htmlFor="user-nik">Employee ID / NIK *</label>
                <input
                  id="user-nik"
                  type="text"
                  required
                  placeholder="Contoh: OPR0099 atau TKN0005"
                  value={newUserForm.nik}
                  onChange={(e) => setNewUserForm({ ...newUserForm, nik: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="user-name">Nama Lengkap *</label>
                <input
                  id="user-name"
                  type="text"
                  required
                  placeholder="Nama lengkap karyawan"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="user-role">Peran RBAC *</label>
                <select
                  id="user-role"
                  value={newUserForm.role}
                  onChange={(e) => {
                    const nextRole = e.target.value as ManagedUser['role'];
                    setNewUserForm({
                      ...newUserForm,
                      role: nextRole,
                      department: nextRole === 'OPERATOR' ? 'Produksi' : 'Maintenance',
                    });
                  }}
                >
                  <option value="OPERATOR">OPERATOR (Ranah Produksi)</option>
                  <option value="TEKNISI">TEKNISI (Ranah Maintenance)</option>
                  <option value="SUPERVISOR">SUPERVISOR (Ranah Maintenance)</option>
                  <option value="ADMIN">ADMIN (Ranah Maintenance)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="user-dept">Departemen / Ranah</label>
                <select
                  id="user-dept"
                  value={newUserForm.department}
                  onChange={(e) => setNewUserForm({ ...newUserForm, department: e.target.value })}
                >
                  <option value="Produksi">Produksi</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="user-shift">Shift Kerja</label>
                <select
                  id="user-shift"
                  value={newUserForm.shift}
                  onChange={(e) => setNewUserForm({ ...newUserForm, shift: e.target.value })}
                >
                  <option value="1">Shift 1 (Pagi)</option>
                  <option value="2">Shift 2 (Sore)</option>
                  <option value="3">Shift 3 (Malam)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="user-password">Kata Sandi Akun</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="user-password"
                    type={showNewUserPassword ? 'text' : 'password'}
                    placeholder="Minimal 12 karakter, gunakan kata sandi unik"
                    required={import.meta.env.MODE !== 'test'}
                    minLength={import.meta.env.MODE === 'test' ? undefined : 12}
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    style={{ width: '100%', paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                    aria-label={showNewUserPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    style={{
                      position: 'absolute',
                      right: '0.65rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                    }}
                  >
                    {showNewUserPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Kosongkan jika ingin memakai kata sandi bawaan peran ({
                    newUserForm.role === 'OPERATOR' ? 'Operator@001' :
                    newUserForm.role === 'TEKNISI' ? 'Teknisi@001' :
                    newUserForm.role === 'SUPERVISOR' ? 'Supervisor@001' : 'Admin@001'
                  }).
                </small>
              </div>

              <footer className="admin-drawer-footer" style={{ margin: 'auto -1.5rem -1.5rem' }}>
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setNewUserModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-primary">
                  <Check size={16} />
                  <span>Daftarkan Pengguna</span>
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {/* MODAL TAMBAH MESIN BARU */}
      {newMachineModalOpen && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-machine-title"
        >
          <button
            className="admin-modal-overlay"
            aria-label="Tutup formulir"
            onClick={() => setNewMachineModalOpen(false)}
          />

          <aside className="admin-drawer-panel">
            <header className="admin-drawer-top">
              <div>
                <h2 id="modal-machine-title">Tambah Mesin Produksi Baru</h2>
                <p>Daftarkan mesin ke database plant Bintang Toedjoe</p>
              </div>
              <button
                className="btn-admin-close-drawer"
                onClick={() => setNewMachineModalOpen(false)}
                aria-label="Tutup formulir"
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleCreateMachine} className="admin-drawer-body">
              <div className="admin-form-group">
                <label htmlFor="machine-kode">Kode Mesin *</label>
                <input
                  id="machine-kode"
                  type="text"
                  required
                  placeholder="Contoh: M-FL-015"
                  value={newMachineForm.kode_mesin}
                  onChange={(e) =>
                    setNewMachineForm({ ...newMachineForm, kode_mesin: e.target.value })
                  }
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="machine-name">Nama Mesin *</label>
                <input
                  id="machine-name"
                  type="text"
                  required
                  placeholder="Contoh: Ilapak 12"
                  value={newMachineForm.nama_mesin}
                  onChange={(e) =>
                    setNewMachineForm({ ...newMachineForm, nama_mesin: e.target.value })
                  }
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="machine-section">Section / Lini *</label>
                <select
                  id="machine-section"
                  value={newMachineForm.kategori}
                  onChange={(e) =>
                    setNewMachineForm({ ...newMachineForm, kategori: e.target.value })
                  }
                >
                  <option value="Filling">Filling</option>
                  <option value="Packaging">Packaging</option>
                  <option value="Mixing">Mixing</option>
                  <option value="Utility">Utility</option>
                </select>
              </div>

              <footer className="admin-drawer-footer" style={{ margin: 'auto -1.5rem -1.5rem' }}>
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setNewMachineModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-primary">
                  <Check size={16} />
                  <span>Simpan Mesin</span>
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {/* MODAL TAMBAH MASTER PART */}
      {newPartModalOpen && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-part-title"
        >
          <button
            className="admin-modal-overlay"
            aria-label="Tutup formulir"
            onClick={() => setNewPartModalOpen(false)}
          />

          <aside className="admin-drawer-panel">
            <header className="admin-drawer-top">
              <div>
                <h2 id="modal-part-title">Tambah Master Suku Cadang</h2>
                <p>Definisikan komponen spare part dan target lifetime</p>
              </div>
              <button
                className="btn-admin-close-drawer"
                onClick={() => setNewPartModalOpen(false)}
                aria-label="Tutup formulir"
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleCreatePart} className="admin-drawer-body">
              <div className="admin-form-group">
                <label htmlFor="part-name">Nama Spare Part *</label>
                <input
                  id="part-name"
                  type="text"
                  required
                  placeholder="Contoh: Pisau Rotary Cutter"
                  value={newPartForm.name}
                  onChange={(e) => setNewPartForm({ ...newPartForm, name: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="part-number">Nomor Part (Bila Tersedia)</label>
                <input
                  id="part-number"
                  type="text"
                  placeholder="Contoh: CUT-8025-HSS"
                  value={newPartForm.partNumber}
                  onChange={(e) => setNewPartForm({ ...newPartForm, partNumber: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="part-spec">Spesifikasi / Ukuran / Material *</label>
                <input
                  id="part-spec"
                  type="text"
                  required
                  placeholder="Contoh: Tungsten Carbide 120 x 30 mm"
                  value={newPartForm.specification}
                  onChange={(e) =>
                    setNewPartForm({ ...newPartForm, specification: e.target.value })
                  }
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="part-category">Kategori Teknik</label>
                <select
                  id="part-category"
                  value={newPartForm.category}
                  onChange={(e) => setNewPartForm({ ...newPartForm, category: e.target.value })}
                >
                  <option value="Mechanical">Mechanical</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Pneumatic">Pneumatic</option>
                  <option value="Cutting">Cutting</option>
                  <option value="Heating">Heating</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="part-interval-basis">Dasar Perhitungan Interval *</label>
                <select
                  id="part-interval-basis"
                  value={newPartForm.intervalBasis}
                  onChange={(e) =>
                    setNewPartForm({ ...newPartForm, intervalBasis: e.target.value as any })
                  }
                >
                  <option value="KALENDER">Waktu Kalender (Hari)</option>
                  <option value="JAM_OPERASI">Jam Operasi Aktual (Jam)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="part-lifetime">
                  Target Interval Penggantian ({newPartForm.intervalBasis === 'JAM_OPERASI' ? 'Jam Operasi' : 'Hari'}) *
                </label>
                <input
                  id="part-lifetime"
                  type="number"
                  min="1"
                  required
                  value={newPartForm.defaultLifetimeDays}
                  onChange={(e) =>
                    setNewPartForm({ ...newPartForm, defaultLifetimeDays: Number(e.target.value) })
                  }
                />
              </div>

              <footer className="admin-drawer-footer" style={{ margin: 'auto -1.5rem -1.5rem' }}>
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setNewPartModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-primary">
                  <Check size={16} />
                  <span>Simpan Suku Cadang</span>
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {/* MODAL EDIT / INPUT JAM OPERASI AKTUAL OLEH ADMIN (URS 3.6 - FRIENDLY) */}
      {selectedOperatingRecord && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-edit-operating-title"
        >
          <button
            className="admin-modal-overlay"
            aria-label="Tutup formulir"
            onClick={() => setSelectedOperatingRecord(null)}
          />

          <aside className="admin-drawer-panel" style={{ maxWidth: '540px' }}>
            <header className="admin-drawer-top">
              <div>
                <span className="admin-code-badge" style={{ background: '#0284c7', color: '#fff', marginRight: '6px' }}>
                  {selectedOperatingRecord.kodeMesin}
                </span>
                <h2 id="modal-edit-operating-title">{selectedOperatingRecord.namaMesin}</h2>
                <p>Input / Verifikasi Jam Operasi Aktual Mesin · Periode {selectedOperatingRecord.periode}</p>
              </div>
              <button
                className="btn-admin-close-drawer"
                onClick={() => setSelectedOperatingRecord(null)}
                aria-label="Tutup formulir"
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleSaveOperatingHours} className="admin-drawer-body">
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1rem', fontSize: '0.82rem', color: '#475569' }}>
                Integrasi Sederhana: Input manual terpusat oleh SPV &amp; Admin (berdasarkan catatan logbook fisik shift/counter). Data ini langsung tersinkronisasi realtime dengan SPV Dashboard.
              </div>

              {/* 1. Jam Shift Kalender & Quick Presets */}
              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Jam Shift Kalender (Total Waktu Shift Terjadwal) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  value={operatingForm.jamShiftKalender}
                  onChange={(e) => setOperatingForm({ ...operatingForm, jamShiftKalender: parseFloat(e.target.value) || 0 })}
                />
                <div style={{ marginTop: '5px' }}>
                  <small style={{ color: '#64748b', display: 'block', marginBottom: '3px' }}>Preset Jam Shift:</small>
                  <div className="friendly-preset-group">
                    {[
                      { label: '7h (1 Shift)', val: 7 },
                      { label: '14h (2 Shift)', val: 14 },
                      { label: '21h (3 Shift)', val: 21 },
                      { label: '176h (1 Bulan)', val: 176 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        className={`btn-friendly-preset ${operatingForm.jamShiftKalender === p.val ? 'active' : ''}`}
                        onClick={() => setOperatingForm({ ...operatingForm, jamShiftKalender: p.val })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Jam Operasi Aktual & Stepper Buttons */}
              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Jam Operasi Aktual (Jam Riil Berputar) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  style={{ fontSize: '1.05rem', fontWeight: 700 }}
                  value={operatingForm.jamOperasiAktual}
                  onChange={(e) => setOperatingForm({ ...operatingForm, jamOperasiAktual: parseFloat(e.target.value) || 0 })}
                />
                <small style={{ color: '#64748b', display: 'block', marginTop: '3px' }}>
                  Jam operasi riil mesin berputar, terpisah dari jam shift kalender.
                </small>

                <div className="friendly-stepper-wrap" style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: Math.max(0, +(operatingForm.jamOperasiAktual - 5).toFixed(1)) })}
                  >
                    -5h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: Math.max(0, +(operatingForm.jamOperasiAktual - 1).toFixed(1)) })}
                  >
                    -1h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: Math.max(0, +(operatingForm.jamOperasiAktual - 0.5).toFixed(1)) })}
                  >
                    -0.5h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: +(operatingForm.jamOperasiAktual + 0.5).toFixed(1) })}
                  >
                    +0.5h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: +(operatingForm.jamOperasiAktual + 1).toFixed(1) })}
                  >
                    +1h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: +(operatingForm.jamOperasiAktual + 5).toFixed(1) })}
                  >
                    +5h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    style={{ marginLeft: 'auto', background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: operatingForm.jamShiftKalender })}
                  >
                    = Shift Penuh
                  </button>
                </div>
              </div>

              {/* 3. Live Calculation Preview Card */}
              {(() => {
                const calcAvail = operatingForm.jamShiftKalender > 0
                  ? ((operatingForm.jamOperasiAktual / operatingForm.jamShiftKalender) * 100).toFixed(1)
                  : '0';
                const calcDowntime = (operatingForm.jamShiftKalender - operatingForm.jamOperasiAktual).toFixed(1);
                const machineTickets = auditTickets.filter((t) => t.machine === selectedOperatingRecord.namaMesin);
                const breakdownCount = Math.max(1, machineTickets.length);
                const calcMtbf = (operatingForm.jamOperasiAktual / breakdownCount).toFixed(1);
                const isOvertime = operatingForm.jamOperasiAktual > operatingForm.jamShiftKalender;

                return (
                  <div className={`friendly-live-preview ${isOvertime ? 'warning' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.85rem', color: isOvertime ? '#92400e' : '#166534' }}>
                        {isOvertime ? '⚠️ Perhatian: Waktu Operasi Melebihi Shift' : 'Hasil kalkulasi otomatis:'}
                      </strong>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isOvertime ? '#b45309' : '#047857' }}>
                        {isOvertime ? 'Overtime Terdeteksi' : 'Normal Shift'}
                      </span>
                    </div>
                    <div className="friendly-preview-grid">
                      <div className="friendly-preview-item">
                        <div className="friendly-preview-lbl">Availability</div>
                        <div className="friendly-preview-val" style={{ color: Number(calcAvail) >= 80 ? '#047857' : '#d97706' }}>
                          {calcAvail}%
                        </div>
                      </div>
                      <div className="friendly-preview-item">
                        <div className="friendly-preview-lbl">Idle / Downtime</div>
                        <div className="friendly-preview-val" style={{ color: Number(calcDowntime) > 0 ? '#b91c1c' : '#047857' }}>
                          {calcDowntime} Jam
                        </div>
                      </div>
                      <div className="friendly-preview-item">
                        <div className="friendly-preview-lbl">Estimasi MTBF</div>
                        <div className="friendly-preview-val" style={{ color: '#0284c7' }}>
                          {calcMtbf} Jam
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3b. Status Tiket Breakdown & Operator Closing (Audit URS 3.6 & 7.6) */}
              {(() => {
                const machineTickets = auditTickets.filter((t) => t.machine === selectedOperatingRecord.namaMesin);
                const unclosedTickets = machineTickets.filter((t) => t.status !== 'CLOSED');
                const closedTickets = machineTickets.filter((t) => t.status === 'CLOSED');

                return (
                  <div style={{ marginBottom: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                        Status Tiket Breakdown &amp; Operator Closing:
                      </strong>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: unclosedTickets.length > 0 ? '#b45309' : '#047857' }}>
                        {unclosedTickets.length > 0 ? `${unclosedTickets.length} Tiket Belum Closing` : 'Semua Tiket Closed'}
                      </span>
                    </div>

                    {unclosedTickets.length > 0 ? (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#92400e', fontSize: '0.78rem', fontWeight: 700 }}>
                          <AlertTriangle size={14} />
                          <span>Perhatian: Ada {unclosedTickets.length} tiket breakdown belum di-closing oleh operator!</span>
                        </div>
                        <p style={{ margin: '4px 0 8px', fontSize: '0.73rem', color: '#78350f', lineHeight: 1.4 }}>
                          Nilai MTBF berstatus <strong>estimasi sementara</strong> sampai seluruh tiket berikut diselesaikan &amp; ditutup (closed) oleh operator:
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {unclosedTickets.map((t) => (
                            <div
                              key={t.ticket}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #fed7aa',
                                borderRadius: '5px',
                                padding: '5px 8px',
                                fontSize: '0.74rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '8px',
                              }}
                            >
                              <div>
                                <strong style={{ color: '#0284c7' }}>{t.ticket}</strong>
                                <span style={{ color: '#475569', marginLeft: '6px' }}>{t.keterangan}</span>
                                {t.reporterName && (
                                  <small style={{ color: '#94a3b8', display: 'block' }}>Pelapor: {t.reporterName}</small>
                                )}
                              </div>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  whiteSpace: 'nowrap',
                                  background: t.status === 'OPEN' ? '#ffe4e6' : '#e0f2fe',
                                  color: t.status === 'OPEN' ? '#be123c' : '#0369a1',
                                }}
                              >
                                {t.status === 'OPEN' ? 'Open (Menunggu)' : 'Sedang Dikerjakan'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '8px 10px', color: '#065f46', fontSize: '0.78rem' }}>
                        ✓ Seluruh tiket breakdown ({closedTickets.length} tiket) pada mesin ini telah di-closing oleh operator. Nilai MTBF valid dan siap difinalkan.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 4. Sumber Data & Quick Pills */}
              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Sumber Pencatatan Data *</label>
                <input
                  type="text"
                  required
                  value={operatingForm.sumberData}
                  onChange={(e) => setOperatingForm({ ...operatingForm, sumberData: e.target.value })}
                  placeholder="Contoh: Logbook Manual Produksi / Catatan Fisik Shift Admin"
                />
                <div style={{ marginTop: '5px' }}>
                  <small style={{ color: '#64748b', display: 'block', marginBottom: '3px' }}>Pilih Cepat Sumber Data:</small>
                  <div className="friendly-preset-group">
                    {[
                      '📋 Logbook Shift Fisik',
                      '🔢 Counter Running Mesin',
                      '📝 Rekap Harian Produksi',
                      '🔧 Verifikasi Fisik Admin',
                    ].map((src) => (
                      <button
                        key={src.replace(/^[📋🔢📝🔧]\s*/u, '')}
                        type="button"
                        className={`btn-friendly-preset ${operatingForm.sumberData === src ? 'active' : ''}`}
                        onClick={() => setOperatingForm({ ...operatingForm, sumberData: src })}
                      >
                        {src.replace(/^[📋🔢📝🔧]\s*/u, '')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 5. Penanggung Jawab */}
              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Penanggung Jawab / Petugas Input *</label>
                <input
                  type="text"
                  required
                  value={operatingForm.penanggungJawab}
                  onChange={(e) => setOperatingForm({ ...operatingForm, penanggungJawab: e.target.value })}
                />
              </div>

              {/* 6. Checkbox Data Lengkap */}
              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={operatingForm.isComplete}
                    onChange={(e) => setOperatingForm({ ...operatingForm, isComplete: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <strong style={{ color: '#0a1e15' }}>Tandai Data Lengkap &amp; Final (Valid untuk Basis MTBF)</strong>
                </label>
              </div>

              {/* 7. Catatan Penjelasan */}
              <div className="admin-form-group">
                <label>Catatan Penjelasan (Jika data parsial atau ada penyesuaian)</label>
                <textarea
                  rows={2}
                  value={operatingForm.catatanPenjelasan}
                  onChange={(e) => setOperatingForm({ ...operatingForm, catatanPenjelasan: e.target.value })}
                  placeholder="Catatan verifikasi logbook manual..."
                />
              </div>

              <footer className="admin-drawer-footer" style={{ margin: 'auto -1.5rem -1.5rem' }}>
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setSelectedOperatingRecord(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-primary">
                  <Check size={16} />
                  <span>Simpan Data Operasi</span>
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {/* MODAL INPUT RECORD BARU OLEH ADMIN (FRIENDLY) */}
      {newOperatingModalOpen && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-new-operating-title"
        >
          <button
            className="admin-modal-overlay"
            aria-label="Tutup formulir"
            onClick={() => setNewOperatingModalOpen(false)}
          />

          <aside className="admin-drawer-panel" style={{ maxWidth: '540px' }}>
            <header className="admin-drawer-top">
              <div>
                <h2 id="modal-new-operating-title">Input Jam Operasi Aktual Mesin</h2>
                <p>Tambah data waktu operasional riil mesin</p>
              </div>
              <button
                className="btn-admin-close-drawer"
                onClick={() => setNewOperatingModalOpen(false)}
                aria-label="Tutup formulir"
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleCreateOperatingHours} className="admin-drawer-body">
              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Pilih Mesin *</label>
                <select
                  value={operatingForm.kodeMesin}
                  onChange={(e) => {
                    const found = machines.find((m) => m.kode_mesin === e.target.value);
                    setOperatingForm({
                      ...operatingForm,
                      kodeMesin: e.target.value,
                      namaMesin: found ? found.nama_mesin : operatingForm.namaMesin,
                    });
                  }}
                >
                  {machines.map((m) => (
                    <option key={m.kode_mesin} value={m.kode_mesin}>
                      {m.kode_mesin} - {m.nama_mesin} ({m.kategori})
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Periode Waktu *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Oktober 2026 atau Shift 1 (24 Okt 2026)"
                  value={operatingForm.periode}
                  onChange={(e) => setOperatingForm({ ...operatingForm, periode: e.target.value })}
                />
              </div>

              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Jam Shift Kalender (Jam) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  value={operatingForm.jamShiftKalender}
                  onChange={(e) => setOperatingForm({ ...operatingForm, jamShiftKalender: parseFloat(e.target.value) || 0 })}
                />
                <div style={{ marginTop: '5px' }}>
                  <small style={{ color: '#64748b', display: 'block', marginBottom: '3px' }}>Preset Jam Shift:</small>
                  <div className="friendly-preset-group">
                    {[
                      { label: '7h (1 Shift)', val: 7 },
                      { label: '14h (2 Shift)', val: 14 },
                      { label: '21h (3 Shift)', val: 21 },
                      { label: '176h (1 Bulan)', val: 176 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        className={`btn-friendly-preset ${operatingForm.jamShiftKalender === p.val ? 'active' : ''}`}
                        onClick={() => setOperatingForm({ ...operatingForm, jamShiftKalender: p.val })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Jam Operasi Aktual (Jam) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  style={{ fontSize: '1.05rem', fontWeight: 700 }}
                  value={operatingForm.jamOperasiAktual}
                  onChange={(e) => setOperatingForm({ ...operatingForm, jamOperasiAktual: parseFloat(e.target.value) || 0 })}
                />

                <div className="friendly-stepper-wrap" style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: Math.max(0, +(operatingForm.jamOperasiAktual - 1).toFixed(1)) })}
                  >
                    -1h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: Math.max(0, +(operatingForm.jamOperasiAktual - 0.5).toFixed(1)) })}
                  >
                    -0.5h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: +(operatingForm.jamOperasiAktual + 0.5).toFixed(1) })}
                  >
                    +0.5h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: +(operatingForm.jamOperasiAktual + 1).toFixed(1) })}
                  >
                    +1h
                  </button>
                  <button
                    type="button"
                    className="btn-friendly-stepper"
                    style={{ marginLeft: 'auto', background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}
                    onClick={() => setOperatingForm({ ...operatingForm, jamOperasiAktual: operatingForm.jamShiftKalender })}
                  >
                    = Shift Penuh
                  </button>
                </div>
              </div>

              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Sumber Pencatatan *</label>
                <input
                  type="text"
                  required
                  value={operatingForm.sumberData}
                  onChange={(e) => setOperatingForm({ ...operatingForm, sumberData: e.target.value })}
                />
                <div style={{ marginTop: '5px' }}>
                  <div className="friendly-preset-group">
                    {[
                      '📋 Logbook Shift Fisik',
                      '🔢 Counter Running Mesin',
                      '📝 Rekap Harian Produksi',
                      '🔧 Verifikasi Fisik Admin',
                    ].map((src) => (
                      <button
                        key={src.replace(/^[📋🔢📝🔧]\s*/u, '')}
                        type="button"
                        className={`btn-friendly-preset ${operatingForm.sumberData === src ? 'active' : ''}`}
                        onClick={() => setOperatingForm({ ...operatingForm, sumberData: src })}
                      >
                        {src.replace(/^[📋🔢📝🔧]\s*/u, '')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label>Penanggung Jawab *</label>
                <input
                  type="text"
                  required
                  value={operatingForm.penanggungJawab}
                  onChange={(e) => setOperatingForm({ ...operatingForm, penanggungJawab: e.target.value })}
                />
              </div>

              <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={operatingForm.isComplete}
                    onChange={(e) => setOperatingForm({ ...operatingForm, isComplete: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <strong style={{ color: '#0a1e15' }}>Data Lengkap &amp; Final</strong>
                </label>
              </div>

              <div className="admin-form-group">
                <label>Catatan Penjelasan</label>
                <textarea
                  rows={2}
                  value={operatingForm.catatanPenjelasan}
                  onChange={(e) => setOperatingForm({ ...operatingForm, catatanPenjelasan: e.target.value })}
                  placeholder="Catatan verifikasi logbook..."
                />
              </div>

              <footer className="admin-drawer-footer" style={{ margin: 'auto -1.5rem -1.5rem' }}>
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setNewOperatingModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-primary">
                  <Check size={16} />
                  <span>Simpan Data Jam Operasi</span>
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {/* Drawer: Justifikasi Part Baru dari Breakdown */}
      {justificationModalOpen && selectedJustification && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-justif-title">
          <button
            className="admin-modal-overlay"
            aria-label="Tutup formulir justifikasi"
            onClick={() => setJustificationModalOpen(false)}
          />

          <aside className="admin-drawer-panel" style={{ maxWidth: '580px' }}>
            <header className="admin-drawer-top">
              <div>
                <span className="admin-code-badge" style={{ background: '#d97706', color: '#fff', marginRight: '6px' }}>
                  {selectedJustification.ticket}
                </span>
                <h2 id="modal-justif-title">Justifikasi Part Baru dari Breakdown</h2>
                <p>Standardisasi nama &amp; penetapan rumus lifetime mesin ({selectedJustification.machine})</p>
              </div>
              <button
                className="btn-admin-close-drawer"
                onClick={() => setJustificationModalOpen(false)}
                aria-label="Tutup formulir"
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleSaveJustification} className="admin-drawer-body">
              {/* Asal Laporan Breakdown */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wrench size={14} color="var(--color-icon-neutral, #64748b)" />
                  <span>Sumber: Penggantian Part pada Tiket Breakdown</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', color: '#64748b' }}>
                  <div>No. Tiket: <strong style={{ color: '#0f172a' }}>{selectedJustification.ticket}</strong></div>
                  <div>Mesin: <strong style={{ color: '#0f172a' }}>{selectedJustification.machine}</strong></div>
                  <div>Teknisi: <strong style={{ color: '#0f172a' }}>{selectedJustification.technicianName}</strong></div>
                  <div>Input Teknisi: <strong style={{ color: '#0f172a' }}>{selectedJustification.partName} ({selectedJustification.quantity} pcs)</strong></div>
                  <div style={{ gridColumn: 'span 2' }}>Posisi: <strong style={{ color: '#0f172a' }}>{selectedJustification.position}</strong></div>
                </div>
              </div>

              {/* Form Standarisasi */}
              <div className="admin-form-group">
                <label htmlFor="justif-id">Kode Master Part (ID Baru) *</label>
                <input
                  id="justif-id"
                  type="text"
                  required
                  value={justificationForm.id}
                  onChange={(e) => setJustificationForm({ ...justificationForm, id: e.target.value })}
                  style={{ fontFamily: 'Consolas, monospace', fontWeight: 700 }}
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="justif-name">Nama Resmi Spare Part (Hasil Standarisasi) *</label>
                <input
                  id="justif-name"
                  type="text"
                  required
                  value={justificationForm.standardizedName}
                  onChange={(e) => setJustificationForm({ ...justificationForm, standardizedName: e.target.value })}
                  placeholder="Contoh: Rubber Sealing Pad"
                />
                <small style={{ color: '#64748b', fontSize: '0.74rem', marginTop: '2px' }}>
                  Nama resmi standar plant yang akan digunakan pada katalog mesin dan laporan shift.
                </small>
              </div>

              <div className="admin-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="admin-form-group">
                  <label htmlFor="justif-part-no">Nomor Part (OEM / Part Number)</label>
                  <input
                    id="justif-part-no"
                    type="text"
                    value={justificationForm.partNumber}
                    onChange={(e) => setJustificationForm({ ...justificationForm, partNumber: e.target.value })}
                    placeholder="Contoh: RBR-SL-3010"
                  />
                </div>

                <div className="admin-form-group">
                  <label htmlFor="justif-cat">Kategori Teknik *</label>
                  <select
                    id="justif-cat"
                    value={justificationForm.category}
                    onChange={(e) => setJustificationForm({ ...justificationForm, category: e.target.value })}
                  >
                    <option value="Cutting">Cutting</option>
                    <option value="Heating">Heating</option>
                    <option value="Sealing">Sealing</option>
                    <option value="Pneumatic">Pneumatic</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Filling">Filling</option>
                    <option value="Mechanical">Mechanical</option>
                  </select>
                </div>
              </div>

              <div className="admin-form-group">
                <label htmlFor="justif-spec">Spesifikasi / Material</label>
                <input
                  id="justif-spec"
                  type="text"
                  value={justificationForm.specification}
                  onChange={(e) => setJustificationForm({ ...justificationForm, specification: e.target.value })}
                  placeholder="Contoh: Silicone High-Temp 30 x 10 mm"
                />
              </div>

              {/* Penetapan Rumus Lifetime */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#166534', marginBottom: '0.35rem', fontSize: '0.88rem' }}>
                  <Clock3 size={15} />
                  <span>Penetapan Rumus &amp; Parameter Lifetime Mesin</span>
                </div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#15803d' }}>
                  Pilih basis rumus penggantian preventif untuk suku cadang ini.
                </p>

                <div className="admin-form-group" style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontWeight: 700, color: '#166534' }}>Dasar Interval Lifetime *</label>
                  <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.25rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="justif-intervalBasis"
                        checked={justificationForm.intervalBasis === 'JAM_OPERASI'}
                        onChange={() => setJustificationForm({ ...justificationForm, intervalBasis: 'JAM_OPERASI', defaultLifetimeDays: justificationForm.defaultLifetimeDays < 200 ? 1500 : justificationForm.defaultLifetimeDays })}
                      />
                      <span><strong>Jam Operasi</strong> (Running Hours)</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="justif-intervalBasis"
                        checked={justificationForm.intervalBasis === 'KALENDER'}
                        onChange={() => setJustificationForm({ ...justificationForm, intervalBasis: 'KALENDER', defaultLifetimeDays: justificationForm.defaultLifetimeDays > 365 ? 90 : justificationForm.defaultLifetimeDays })}
                      />
                      <span><strong>Kalender</strong> (Hari)</span>
                    </label>
                  </div>
                </div>

                <div className="admin-form-group" style={{ marginBottom: '0.5rem' }}>
                  <label htmlFor="justif-lifetime" style={{ fontWeight: 700, color: '#166534' }}>
                    Target Masa Pakai Normal ({justificationForm.intervalBasis === 'JAM_OPERASI' ? 'Jam Operasi' : 'Hari Kalender'}) *
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      id="justif-lifetime"
                      type="number"
                      min="1"
                      required
                      value={justificationForm.defaultLifetimeDays}
                      onChange={(e) => setJustificationForm({ ...justificationForm, defaultLifetimeDays: Number(e.target.value) })}
                      style={{ maxWidth: '140px', fontWeight: 700, fontSize: '0.95rem' }}
                    />
                    <span style={{ fontWeight: 600, color: '#166534', fontSize: '0.84rem' }}>
                      {justificationForm.intervalBasis === 'JAM_OPERASI' ? 'Jam Operasi' : 'Hari Kalender'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #dcfce7', fontSize: '0.75rem', color: '#166534' }}>
                  <div>Ambang Peringatan ({lifetimeRule.warningThreshold}%): <strong>~{Math.round((justificationForm.defaultLifetimeDays * lifetimeRule.warningThreshold) / 100)} {justificationForm.intervalBasis === 'JAM_OPERASI' ? 'Jam' : 'Hari'}</strong> (Status Kuning)</div>
                  <div>Batas Ganti Wajib ({lifetimeRule.replacementLimit}%): <strong>{justificationForm.defaultLifetimeDays} {justificationForm.intervalBasis === 'JAM_OPERASI' ? 'Jam' : 'Hari'}</strong> (Status Merah)</div>
                </div>
              </div>

              <footer className="admin-drawer-footer" style={{ margin: 'auto -1.5rem -1.5rem' }}>
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setJustificationModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-primary">
                  <CheckCircle2 size={16} />
                  <span>Setujui &amp; Daftarkan ke Master Part</span>
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {/* Drawer: Ubah Rumus & Detail Master Part */}
      {editMasterPartModalOpen && editingMasterPart && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-edit-part-title">
          <button
            className="admin-modal-overlay"
            aria-label="Tutup formulir edit part"
            onClick={() => setEditMasterPartModalOpen(false)}
          />

          <aside className="admin-drawer-panel" style={{ maxWidth: '560px' }}>
            <header className="admin-drawer-top">
              <div>
                <span className="admin-code-badge" style={{ background: '#0284c7', color: '#fff', marginRight: '6px' }}>
                  {editingMasterPart.id}
                </span>
                <h2 id="modal-edit-part-title">Ubah Rumus &amp; Detail Master Part</h2>
                <p>Konfigurasi parameter masa pakai dan kategori suku cadang</p>
              </div>
              <button
                className="btn-admin-close-drawer"
                onClick={() => setEditMasterPartModalOpen(false)}
                aria-label="Tutup formulir"
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleSaveEditMasterPart} className="admin-drawer-body">
              <div className="admin-form-group">
                <label htmlFor="edit-part-name">Nama Spare Part *</label>
                <input
                  id="edit-part-name"
                  type="text"
                  required
                  value={editMasterPartForm.name}
                  onChange={(e) => setEditMasterPartForm({ ...editMasterPartForm, name: e.target.value })}
                />
              </div>

              <div className="admin-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="admin-form-group">
                  <label htmlFor="edit-part-number">Nomor Part (OEM)</label>
                  <input
                    id="edit-part-number"
                    type="text"
                    value={editMasterPartForm.partNumber}
                    onChange={(e) => setEditMasterPartForm({ ...editMasterPartForm, partNumber: e.target.value })}
                  />
                </div>

                <div className="admin-form-group">
                  <label htmlFor="edit-part-cat">Kategori Teknik</label>
                  <select
                    id="edit-part-cat"
                    value={editMasterPartForm.category}
                    onChange={(e) => setEditMasterPartForm({ ...editMasterPartForm, category: e.target.value })}
                  >
                    <option value="Cutting">Cutting</option>
                    <option value="Heating">Heating</option>
                    <option value="Sealing">Sealing</option>
                    <option value="Pneumatic">Pneumatic</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Filling">Filling</option>
                    <option value="Mechanical">Mechanical</option>
                  </select>
                </div>
              </div>

              <div className="admin-form-group">
                <label htmlFor="edit-part-spec">Spesifikasi / Material *</label>
                <input
                  id="edit-part-spec"
                  type="text"
                  required
                  value={editMasterPartForm.specification}
                  onChange={(e) => setEditMasterPartForm({ ...editMasterPartForm, specification: e.target.value })}
                />
              </div>

              {/* Rumus Lifetime Section */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                  Konfigurasi Rumus &amp; Batas Lifetime
                </div>

                <div className="admin-form-group" style={{ marginBottom: '0.75rem' }}>
                  <label>Dasar Perhitungan Interval *</label>
                  <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.25rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="edit-intervalBasis"
                        checked={editMasterPartForm.intervalBasis === 'JAM_OPERASI'}
                        onChange={() => setEditMasterPartForm({ ...editMasterPartForm, intervalBasis: 'JAM_OPERASI' })}
                      />
                      <span>Jam Operasi Mesin</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="edit-intervalBasis"
                        checked={editMasterPartForm.intervalBasis === 'KALENDER'}
                        onChange={() => setEditMasterPartForm({ ...editMasterPartForm, intervalBasis: 'KALENDER' })}
                      />
                      <span>Hari Kalender</span>
                    </label>
                  </div>
                </div>

                <div className="admin-form-group" style={{ marginBottom: '0.5rem' }}>
                  <label htmlFor="edit-part-lifetime">
                    Target Interval Penggantian ({editMasterPartForm.intervalBasis === 'JAM_OPERASI' ? 'Jam Operasi' : 'Hari'}) *
                  </label>
                  <input
                    id="edit-part-lifetime"
                    type="number"
                    min="1"
                    required
                    value={editMasterPartForm.defaultLifetimeDays}
                    onChange={(e) => setEditMasterPartForm({ ...editMasterPartForm, defaultLifetimeDays: Number(e.target.value) })}
                    style={{ maxWidth: '140px', fontWeight: 700 }}
                  />
                </div>
              </div>

              <footer className="admin-drawer-footer" style={{ margin: 'auto -1.5rem -1.5rem' }}>
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setEditMasterPartModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-primary">
                  <Save size={16} />
                  <span>Simpan Perubahan Rumus</span>
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {/* Footer Portal */}
      <footer className="admin-footer">
        <span>Machine Card · Portal Administrasi Sistem &amp; RBAC Bintang Toedjoe</span>
        <div className="admin-footer-status">
          <span className="admin-status-dot green" />
          <span>Sistem Otorisasi Aktif</span>
        </div>
      </footer>

      {/* Mobile & Tablet Bottom Navigation Bar (Jempol-Friendly Admin) */}
      <nav className="mobile-bottom-nav" aria-label="Navigasi Bawah Admin">
        <button
          type="button"
          className={`mobile-bottom-nav-item ${activeTab === 'USERS' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('USERS')}
          title="Manajemen Pengguna & RBAC"
        >
          <div className="bottom-nav-icon-wrap">
            <Users size={20} />
          </div>
          <span>Pengguna</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-nav-item ${activeTab === 'MACHINES' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('MACHINES')}
          title="Katalog Master Mesin & Lini"
        >
          <div className="bottom-nav-icon-wrap">
            <Cog size={20} />
          </div>
          <span>Master Mesin</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-nav-item ${activeTab === 'PARTS' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('PARTS')}
          title="Master Spare Part & Lifetime"
        >
          <div className="bottom-nav-icon-wrap">
            <Wrench size={20} />
          </div>
          <span>Spare Part</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-nav-item ${activeTab === 'AUDIT' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('AUDIT')}
          title="Audit Open Work Global"
        >
          <div className="bottom-nav-icon-wrap">
            <ShieldCheck size={20} />
            {auditTickets.filter((t) => t.status === 'OPEN').length > 0 && (
              <span className="bottom-nav-badge alert">
                {auditTickets.filter((t) => t.status === 'OPEN').length}
              </span>
            )}
          </div>
          <span>Audit Trail</span>
        </button>
      </nav>
    </div>
  </div>
);
}
