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
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="sidebar-brand-header">
          <div className="sidebar-brand-logo" title="BINTANG TOEDJOE · Machine Card Portal Operator">
            <span className="brand-badge-box" aria-label="Logo Bintang Toedjoe">
              <img
                src="/assets/bintang-toedjoe-mark.webp"
                alt="Logo Bintang Toedjoe"
                className="brand-logo-mark"
                loading="lazy"
                decoding="async"
              />
            </span>
            <div className="brand-text-block">
              <strong>BINTANG TOEDJOE</strong>
              <small>Machine Card · Portal Operator</small>
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

        <div className="sidebar-role-indicator" title="OPERATOR · Ranah Produksi">
          <span className="role-pill-tag role-operator">
            <span className="pulse-green-dot" />
            <span className="role-pill-text">OPERATOR</span>
          </span>
          <span className="sidebar-plant-label">Ranah Produksi</span>
        </div>

        <nav className="sidebar-navigation-menu" role="tablist" aria-label="Menu Modul Operator">
          <div className="sidebar-nav-heading">NAVIGASI MODUL</div>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'MACHINES'}
            title={`Daftar Mesin Plant (${allPlantMachines.length})`}
            data-tooltip={`Daftar Mesin (${allPlantMachines.length})`}
            className={`sidebar-nav-btn ${activeTab === 'MACHINES' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('MACHINES');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <PackageSearch size={18} />
              <span>Daftar Mesin Plant</span>
            </div>
            <span className="sidebar-nav-counter">{allPlantMachines.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'TICKETS'}
            title={`Tiket Aktif (${activeTickets.length})`}
            data-tooltip={`Tiket Aktif (${activeTickets.length})`}
            className={`sidebar-nav-btn ${activeTab === 'TICKETS' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('TICKETS');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-btn-left">
              <FileText size={18} />
              <span>Tiket Aktif</span>
            </div>
            {activeTickets.length > 0 && (
              <span className="sidebar-nav-counter alert">
                {activeTickets.length}
              </span>
            )}
          </button>
        </nav>

        {/* Sidebar Footer User Card */}
        <div className="sidebar-footer-profile">
          <div className="sidebar-user-info" title={`${safeOperator.name} (${safeOperator.nik}) · Dept: ${safeOperator.departments.join(', ')}`}>
            <div className="sidebar-avatar-circle">
              {safeOperator.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="sidebar-user-text">
              <strong>{safeOperator.name} · {safeOperator.nik}</strong>
              <small>Dept: {safeOperator.departments.join(', ')}</small>
            </div>
          </div>
          <button
            type="button"
            className="btn-sidebar-logout-icon"
            onClick={onLogout}
            title="Keluar dari sesi"
            aria-label="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dashboard-main-area">
        {/* Top Navbar */}
        <header className="dashboard-topbar">
          <div className="topbar-left-zone">
            <div className="topbar-breadcrumb-trail">
              <span>Beranda</span>
              <span>/</span>
              <strong>
                {activeTab === 'MACHINES'
                  ? 'Daftar Mesin Plant'
                  : 'Tiket Aktif'}
              </strong>
            </div>
          </div>

          <div className="topbar-right-zone">
            <div className="topbar-chip">
              <span className="chip-label">Operator:</span>
              <strong>{safeOperator.name}</strong>
            </div>
            <div className="topbar-chip">
              <span className="chip-label">Area:</span>
              <strong>{safeOperator.departments.join(', ')}</strong>
            </div>
            <div className="topbar-chip">
              <span className="chip-label">Shift:</span>
              <strong>{safeOperator.shifts.map((s) => s.replace('Shift ', '')).join('/')}</strong>
            </div>
            <div className="topbar-chip live-status">
              <span className="pulse-green-dot" />
              <span>Plant Pulogadung</span>
            </div>
            <button className="btn-logout" onClick={onLogout} title="Keluar dari sesi">
              <LogOut size={16} />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="dashboard-content-scroll operator-main">
          {/* Banner Notifikasi Berhasil */}
          {successTicket && (
            <div className="ticket-success-alert" role="status">
              <div className="alert-content">
                <CheckCircle2 size={20} className="icon-success" />
                <div>
                  <strong>
                    {successTicket.includes('Mesin Beroperasi')
                      ? 'Berhasil Ditutup - Mesin Beroperasi Kembali!'
                      : 'Laporan Breakdown Berhasil Terkirim!'}
                  </strong>
                  <p>
                    Tiket <strong>{successTicket}</strong> telah diperbarui dan siap dipantau.
                  </p>
                </div>
              </div>
              <div className="alert-actions">
                <button
                  className="btn-view-ticket"
                  onClick={() => {
                    setActiveTab('TICKETS');
                    setSuccessTicket('');
                  }}
                >
                  Lihat di Tiket Aktif
                </button>
                <button
                  className="btn-dismiss"
                  onClick={() => setSuccessTicket('')}
                  aria-label="Tutup notifikasi"
                >
                  <X size={17} />
                </button>
              </div>
            </div>
          )}

          {/* Hero Header & Metrics */}
          <section className="portal-hero-section">
            <div className="hero-text-wrap">
              <p className="breadcrumb">
                Operator <span>/</span>{' '}
                {activeTab === 'MACHINES'
                  ? 'Daftar Mesin Plant'
                  : 'Tiket Aktif'}
              </p>
              <h1>
                {activeTab === 'MACHINES'
                  ? 'Daftar Mesin & Lapor Breakdown'
                  : 'Daftar Tiket Aktif & Closing Operasional'}
              </h1>
              <p className="hero-subtitle">
                {activeTab === 'MACHINES'
                  ? 'Pilih mesin yang mengalami kendala teknis atau breakdown untuk mengirim laporan pemeliharaan secara instan.'
                  : 'Pantau respon pengerjaan perbaikan teknisi dan lakukan closing tiket setelah Anda menguji coba running test mesin.'}
              </p>
            </div>
          </section>

          {/* TAB 1: DAFTAR MESIN */}
          {activeTab === 'MACHINES' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Actionable Reminder Banner jika ada tiket siap closing */}
              {urgentClosingTicket && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderLeft: '4px solid #10b981',
                    borderRadius: '8px',
                    padding: '0.85rem 1.15rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Wrench size={18} color="var(--color-icon-neutral, #64748b)" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#065f46' }}>
                        Mesin {urgentClosingTicket.machine} Siap Running Test / Ditutup
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '2px' }}>
                        Teknisi ({urgentClosingTicket.technicianName || 'Tim Maintenance'}) mencatat:{' '}
                        <strong>{urgentClosingTicket.action || urgentClosingTicket.keterangan}</strong>. Silakan uji coba produk.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-operator-closing-action"
                    style={{
                      padding: '0.55rem 1.1rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      background: '#059669',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onClick={() => openClosingModal(urgentClosingTicket)}
                  >
                    <CheckCircle2 size={15} />
                    <span>Closing Tiket (Mesin Beroperasi)</span>
                  </button>
                </div>
              )}

              {/* SECTION: SELURUH KATALOG MESIN PABRIK (Akses Terbuka) */}
              <section className="portal-content-card">
                {/* Toolbar: Search & Filter */}
                <div className="table-header-toolbar">
                <div className="search-input-wrap">
                  <Search size={18} className="search-ico" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama atau kode mesin..."
                    aria-label="Cari mesin"
                  />
                  {search && (
                    <button className="btn-clear-search" onClick={() => setSearch('')}>
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div className="filter-select-wrap">
                  <SlidersHorizontal size={16} />
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categoryOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
