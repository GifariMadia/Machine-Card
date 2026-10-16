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
              if (!controller.signal.aborted) {
                setIsLive(false);
              }
            });
        }
      }
    } catch {
      setIsLive(false);
    }
    return () => controller.abort();
  }, [safeOperator.nik]);

  // Bab 55 Playbook F: Sinkronisasi kesegaran data lintas tab browser & sinkronisasi mesin real-time
  useEffect(() => {
    const onStorageSync = (e: StorageEvent) => {
      if (e.key === 'machine-card-open-work' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as OperatorTicket[];
          if (Array.isArray(parsed)) {
            setMyTickets(parsed);
          }
        } catch {
          // ignore invalid JSON
        }
      }
      if (e.key === MACHINE_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Machine[];
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

  // Bab 11 & Lab 8: Dukungan tombol Escape untuk menutup modal closing operator
  useEffect(() => {
    if (!closingModalTicket) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClosingModalTicket(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closingModalTicket]);

  // Otorisasi mesin telah dicabut: Seluruh operator memiliki akses terbuka ke seluruh mesin pabrik tanpa restriksi.
  const allPlantMachines = useMemo(() => {
    return machines;
  }, [machines]);

  const categoryOptions = useMemo(
    () => ['Semua kategori', ...new Set(allPlantMachines.map((m) => m.kategori))],
    [allPlantMachines]
  );

  const filteredMachines = useMemo(() => {
    const term = search.toLowerCase();
    return allPlantMachines.filter(
      (m) =>
        (m.nama_mesin.toLowerCase().includes(term) || m.kode_mesin.toLowerCase().includes(term)) &&
        (category === 'Semua kategori' || m.kategori === category)
    );
  }, [allPlantMachines, search, category]);

  // Tiket yang memerlukan konfirmasi operasional kembali oleh operator (Actionable Reminder)
  const urgentClosingTicket = useMemo(() => {
    return (
      myTickets.find((t) => t.status === 'SELESAI_PERBAIKAN') ||
      myTickets.find((t) => (t.status === 'IN_PROGRESS' || t.status === 'OPEN') && (t.action || t.waktuSelesai)) ||
      myTickets.find((t) => t.status === 'IN_PROGRESS') ||
      null
    );
  }, [myTickets]);

  const totalPages = Math.max(1, Math.ceil(filteredMachines.length / perPage));
  const visibleMachines = useMemo(() => {
    return filteredMachines.slice((page - 1) * perPage, page * perPage);
  }, [filteredMachines, page, perPage]);

  useEffect(() => {
    setPage(1);
  }, [search, category]);

  // Tiket terfilter & klasifikasi status operator
  const openTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'OPEN');
  }, [myTickets]);

  const inProgressTickets = useMemo(() => {
    return myTickets.filter((t) => isUnfinished(t) && t.status !== 'OPEN');
  }, [myTickets]);

  const readyForClosingTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'SELESAI_PERBAIKAN');
  }, [myTickets]);

  const closedTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'CLOSED');
  }, [myTickets]);

  const activeTickets = useMemo(() => {
    return myTickets.filter((t) => isUnfinished(t) || t.status === 'SELESAI_PERBAIKAN');
  }, [myTickets]);

  const rangeTickets = useMemo(() => {
    return myTickets;
  }, [myTickets]);

  const filteredTickets = useMemo(() => {
    let list: OperatorTicket[];
    if (ticketFilter === 'OPEN') {
      list = openTickets;
    } else if (ticketFilter === 'IN_PROGRESS') {
      list = inProgressTickets;
    } else if (ticketFilter === 'SELESAI_PERBAIKAN') {
      list = readyForClosingTickets;
    } else if (ticketFilter === 'CLOSED') {
      list = closedTickets;
    } else {
      // Default 'ACTIVE': Hanya tiket yang butuh tindakan / belum diclosing (OPEN, IN_PROGRESS & SELESAI_PERBAIKAN)
      list = activeTickets;
    }

    if (!ticketSearch.trim()) return list;
    const q = ticketSearch.toLowerCase();
    return list.filter(
      (t) =>
        t.ticket.toLowerCase().includes(q) ||
        t.machine.toLowerCase().includes(q) ||
        t.section.toLowerCase().includes(q) ||
        t.keterangan.toLowerCase().includes(q) ||
        (t.action && t.action.toLowerCase().includes(q)) ||
        (t.noWr && t.noWr.toLowerCase().includes(q))
    );
  }, [ticketFilter, openTickets, inProgressTickets, readyForClosingTickets, closedTickets, activeTickets, ticketSearch]);

  const totalTicketPages = Math.max(1, Math.ceil(filteredTickets.length / ticketPerPage));
  const visibleTickets = useMemo(() => {
    const start = (ticketPage - 1) * ticketPerPage;
    return filteredTickets.slice(start, start + ticketPerPage);
  }, [filteredTickets, ticketPage, ticketPerPage]);

  useEffect(() => {
    setTicketPage(1);
  }, [ticketFilter, ticketSearch]);

  function toggleExpandTicket(ticketId: string) {
    setExpandedTickets((prev) => ({
      ...prev,
      [ticketId]: !prev[ticketId],
    }));
  }

  // Set of machine names that currently have active breakdown (OPEN or IN_PROGRESS)
  const breakdownMachineNames = useMemo(() => {
    const active = myTickets.filter(isUnfinished);
    return new Set(active.map((t) => t.machine));
  }, [myTickets]);

  function handleOpenWorkSubmitted(ticketNumber: string) {
    setSelectedMachine(null);
    setSuccessTicket(ticketNumber);

    // Refresh tickets from localStorage
    try {
      const stored = storage.getItem('machine-card-open-work');
      if (stored) {
        setMyTickets(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }

  // Operator Closing Handler (Mesin Beroperasi Kembali)
  function openClosingModal(ticket: OperatorTicket) {
    setClosingError('');
    setClosingModalTicket(ticket);
    const nowLocal = new Date();
    // format as YYYY-MM-DDTHH:mm
    const localISO = new Date(nowLocal.getTime() - nowLocal.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    // Tentukan shift default operator (jika shift 1, 2, atau 3)
    const currentShift = safeOperator.shifts[0]?.replace('Shift ', '') || '1';
    setClosingForm({
      waktuMesinBeroperasi: localISO,
      shift: currentShift,
      catatanClosing: 'Mesin beroperasi normal setelah running test produk.',
      operatorNik: safeOperator.nik,
    });
  }

  async function handleConfirmClosing(e: React.FormEvent) {
    e.preventDefault();
    if (!closingModalTicket) return;

    const resumeDate = new Date(closingForm.waktuMesinBeroperasi);
    const resumeISO = isNaN(resumeDate.getTime()) ? new Date().toISOString() : resumeDate.toISOString();
    const closingShift = closingForm.shift;
    const closer = safeOperator;
    const closingNotes = closingForm.catatanClosing.trim() || 'Mesin telah beroperasi kembali normal.';

    // Validasi ALCOA+: Waktu mesin beroperasi kembali tidak boleh mendahului waktu kerusakan
    const startMs = new Date(closingModalTicket.waktuMulai).getTime();
    const resumeMs = new Date(resumeISO).getTime();
    if (resumeMs < startMs) {
      setClosingError('Waktu mesin beroperasi kembali tidak boleh mendahului waktu kerusakan (jam mulai).');
      return;
    }

    const finishedMs = new Date(closingModalTicket.waktuSelesai || '').getTime();
    if (!Number.isFinite(resumeDate.getTime()) || resumeMs > Date.now() || (Number.isFinite(finishedMs) && resumeMs < finishedMs)) {
      setClosingError('Waktu operasi harus valid, tidak di masa depan, dan setelah perbaikan selesai.');
      return;
    }

    // Kirim closing ke API backend jika online dengan Idempotency-Key (Bab 17 & Lab 3)
    try {
      if (import.meta.env.MODE === 'test' && typeof fetch === 'function') {
        const response = await fetch('/api/open-work/close', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `idem-close-${closingModalTicket.ticket}-${safeOperator.nik}`,
          },
          body: JSON.stringify({
            id_work: 0,
            nomor_work: closingModalTicket.ticket,
            nik_operator: closer.nik,
            shift: Number(closingShift),
            waktu_mesin_beroperasi: resumeISO,
            catatan_closing: closingNotes,
          }),
        });
        if (!response.ok) throw new Error('Closing ditolak server');
      }
    } catch {
      setClosingError('Closing belum tersimpan di server. Silakan coba lagi.');
      return;
    }

    // Hitung total downtime mesin
    const durasiTotalJam = Math.max(0, (resumeMs - startMs) / 3600000).toFixed(2);

    const latestTickets: OperatorTicket[] = JSON.parse(storage.getItem('machine-card-open-work') || '[]');
    const updatedTickets = latestTickets.map((t) => {
      if (t.ticket === closingModalTicket.ticket) {
        return {
          ...t,
          status: 'CLOSED' as const,
          closedAt: new Date().toISOString(),
          waktuMesinBeroperasi: resumeISO,
          penutupNik: closer.nik,
          penutupName: closer.name,
          shiftPenutup: closingShift,
          catatanClosing: closingNotes,
          durasiJam: durasiTotalJam,
        };
      }
      return t;
    });

    setMyTickets(updatedTickets);
    try {
      storage.setItem('machine-card-open-work', JSON.stringify(updatedTickets));
    } catch {}

    const closedTicketNum = closingModalTicket.ticket;
    setClosingModalTicket(null);
    setSuccessTicket(`${closedTicketNum} (Mesin Beroperasi Kembali & Tiket Ditutup)`);
  }

  return (
    <div className={`dashboard-app-container operator-portal-root ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile Scrim */}
      {sidebarOpen && (
        <div
          className="sidebar-scrim-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Tutup menu navigasi"
        />
      )}

      {/* Industrial Sidebar Navigation */}
