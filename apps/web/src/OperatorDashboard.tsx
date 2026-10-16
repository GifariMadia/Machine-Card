import { isUnfinished } from './maintenance-metrics';
import { useNavigationState } from './use-navigation-state';
import { storage } from './storage';
import { useState, useMemo, useEffect, startTransition } from 'react';
import {
  PackageSearch,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock3,
  CheckCircle2,
  X,
  LogOut,
  Wrench,
  FileText,
  BookOpen,
  Activity,
  ArrowRight,
  RotateCcw,
  RefreshCw,
  Sparkles,
  PlayCircle,
  PhoneCall,
  Check,
  Tag,
} from 'lucide-react';
import { fallbackMachines, getStoredMachines, saveStoredMachines, MACHINE_STORAGE_KEY, type Machine } from './data';
import { type Operator, operators as allOperators } from './operator';
import OpenWorkDrawer from './OpenWorkDrawer';
import './operator-portal.css';
import './dashboard-unified.css';
import { INITIAL_100_MAINTENANCE_SCENARIOS } from './maintenance-scenarios';

export type OperatorDashboardProps = {
  operator: Operator;
  onLogout: () => void;
};

export type OperatorTicket = {
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
  waktuMulai: string; // Jam breakdown mulai (mesin berhenti)
  waktuSelesai?: string; // Jam perbaikan fisik teknisi selesai
  waktuMesinBeroperasi?: string; // Jam mesin mulai beroperasi kembali (closing operator)
  penutupNik?: string;
  penutupName?: string;
  shiftPenutup?: string;
  catatanClosing?: string;
  durasiJam?: string;
  createdAt: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'MENUNGGU_PART' | 'MENUNGGU_DUKUNGAN' | 'HANDOVER' | 'SELESAI_PERBAIKAN' | 'CLOSED' | 'VOID';
  action?: string;
  technicianName?: string;
};

const isTestEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.MODE === 'test');

const testOperatorSeedTickets: OperatorTicket[] = [
  {
    ticket: 'OW-233183',
    machine: 'Ilapak 1',
    section: 'Filling',
    reporter: 'OPR0001',
    shift: '1',
    woType: 'Batch',
    kategori: 'Cutting & Sealing',
    keterangan: 'Pisau potong tumpul, seal sachet bocor',
    status: 'IN_PROGRESS',
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    waktuMulai: new Date(Date.now() - 3600000 * 3).toISOString(),
    reporterName: 'A. Dahlan',
    technicianName: 'Budi Santoso',
    action: 'Penggantian pisau I-Cut baru & kalibrasi heater',
  },
  {
    ticket: 'OW-233184',
    machine: 'Ilapak 2',
    section: 'Filling',
    reporter: 'OPR0001',
    shift: '1',
    woType: 'Batch',
    kategori: 'Heater / Temperatur',
    keterangan: 'Temperatur sealing tidak stabil',
    status: 'SELESAI_PERBAIKAN',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    waktuMulai: new Date(Date.now() - 3600000 * 2).toISOString(),
    reporterName: 'A. Dahlan',
    technicianName: 'Budi Santoso',
    action: 'Kalibrasi thermocouple heater',
  },
  {
    ticket: 'OW-233174',
    machine: 'Ilapak 1',
    section: 'Filling',
    reporter: 'OPR0001',
    shift: '1',
    woType: 'Batch',
    kategori: 'Pneumatik & Silinder',
    keterangan: 'Gasket pneumatic line 1 bocor',
    status: 'CLOSED',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    waktuMulai: new Date(Date.now() - 3600000 * 48).toISOString(),
    waktuMesinBeroperasi: new Date(Date.now() - 3600000 * 46).toISOString(),
    reporterName: 'A. Dahlan',
    technicianName: 'Budi Santoso',
    action: 'Penggantian seal gasket pneumatic',
  },
];

const initialOperatorSeedTickets: OperatorTicket[] = isTestEnv ? testOperatorSeedTickets : [];

export default function OperatorDashboard({ operator, onLogout }: OperatorDashboardProps) {
  const safeOperator = useMemo(() => {
    const raw = operator || ({} as Partial<Operator>);
    return {
      no: typeof raw.no === 'number' ? raw.no : 1,
      nik: raw.nik || 'OPR0001',
      name: raw.name || 'Operator',
      password: raw.password || '',
      shifts: Array.isArray(raw.shifts) && raw.shifts.length > 0 ? raw.shifts : ['Shift 1'],
      machines: Array.isArray(raw.machines) ? raw.machines : [],
      departments: Array.isArray(raw.departments) && raw.departments.length > 0 ? raw.departments : ['Produksi'],
      role: 'OPERATOR' as const,
      active: raw.active !== false,
    };
  }, [operator]);

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
  const [machines, setMachines] = useState<Machine[]>(getStoredMachines);
  const [isLive, setIsLive] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Semua kategori');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useNavigationState<'MACHINES' | 'TICKETS'>('mc-nav-OperatorDashboard-activeTab', 'MACHINES');
  const [ticketFilter, setTicketFilter] = useState<'ACTIVE' | 'OPEN' | 'IN_PROGRESS' | 'SELESAI_PERBAIKAN' | 'CLOSED'>('ACTIVE');
  const [ticketSearch, setTicketSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'ALL' | 'SHIFT' | '24H' | '7D' | '30D'>('ALL');
  const [ticketPage, setTicketPage] = useState(1);
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({});
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [successTicket, setSuccessTicket] = useState('');
  const [closingModalTicket, setClosingModalTicket] = useState<OperatorTicket | null>(null);
  const [closingError, setClosingError] = useState('');
  const [closingForm, setClosingForm] = useState({
    waktuMesinBeroperasi: new Date().toISOString().slice(0, 19),
    shift: '1',
    catatanClosing: '',
    operatorNik: safeOperator.nik,
  });

  const [myTickets, setMyTickets] = useState<OperatorTicket[]>(() => {
    try {
      const stored = storage.getItem('machine-card-open-work');
      if (stored) {
        const parsed = JSON.parse(stored) as OperatorTicket[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fallback
    }
    return initialOperatorSeedTickets;
  });

  // Sinkronisasi dinamis ketika 100 skenario diinjeksi atau dibersihkan
  useEffect(() => {
    const handleInjected = () => {
      try {
        const stored = storage.getItem('machine-card-open-work');
        if (stored) {
          setMyTickets(JSON.parse(stored));
        }
      } catch {}
    };
    const handleCleared = () => {
      setMyTickets([]);
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

  // Shift aktif berdasarkan jam WIB (S1 06:45-15:15, S2 15:15-22:30, S3 22:30-06:45)
  const currentShiftNow = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const m = d.getHours() * 60 + d.getMinutes();
    if (m >= 405 && m < 915) return '1';
    if (m >= 915 && m < 1350) return '2';
    return '3';
  })();

  // Opsi interval pagination & persistensi preferensi operator (Lazy Loading Optimization)
  const [perPage, setPerPage] = useState<number>(() => {
    try {
      const saved = storage.getItem('mc-operator-machines-per-page');
      const num = Number(saved);
      return !isNaN(num) && num > 0 ? Math.max(5, Math.min(100, num)) : 10;
    } catch {
      return 10;
    }
  });

  const [ticketPerPage, setTicketPerPage] = useState<number>(() => {
    try {
      const saved = storage.getItem('mc-operator-tickets-per-page');
      const num = Number(saved);
      return !isNaN(num) && num > 0 ? Math.max(5, Math.min(100, num)) : 10;
    } catch {
      return 10;
    }
  });

  function handlePerPageChange(newSize: number) {
    startTransition(() => {
      setPerPage(newSize);
      setPage(1);
    });
    try {
      storage.setItem('mc-operator-machines-per-page', String(newSize));
    } catch {
      // ignore
    }
  }

  function handleTicketPerPageChange(newSize: number) {
    startTransition(() => {
      setTicketPerPage(newSize);
      setTicketPage(1);
    });
    try {
      storage.setItem('mc-operator-tickets-per-page', String(newSize));
    } catch {
      // ignore
    }
  }

  // Fetch API machines if running: Pencabutan restriksi otorisasi mesin khusus operator + AbortController (Bab 3 & Bab 14)
  useEffect(() => {
    if (import.meta.env.MODE !== 'test') { setIsLive(true); return; }
    const controller = new AbortController();
    try {
      if (typeof fetch === 'function') {
        const promise = fetch(`/api/machines?limit=100&username=${encodeURIComponent(safeOperator.nik)}`, {
          signal: controller.signal,
        });
        if (promise && typeof promise.then === 'function') {
          promise
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((payload) => {
              if (!controller.signal.aborted && payload?.data && Array.isArray(payload.data) && payload.data.length > 0) {
                const localMachines = getStoredMachines();
                const apiMap = new Map<string, Machine>(payload.data.map((m: Machine) => [m.kode_mesin, m]));
                const merged = [
                  ...payload.data,
                  ...localMachines.filter((m) => !apiMap.has(m.kode_mesin)),
                ];
                setMachines(merged);
                saveStoredMachines(merged);
                setIsLive(true);
              }
            })
            .catch(() => {
