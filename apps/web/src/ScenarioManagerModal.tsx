import { storage } from './storage';
import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  X,
  RotateCcw,
  CheckCircle2,
  Trash2,
  Layers,
  Wrench,
  Clock3,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import {
  INITIAL_100_MAINTENANCE_SCENARIOS,
  INITIAL_PENDING_PART_JUSTIFICATIONS,
  INITIAL_SYSTEM_AUDIT_LOGS,
  inject100MaintenanceScenarios,
  clearAllMaintenanceData,
} from './maintenance-scenarios';

interface ScenarioManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole?: string;
}

export default function ScenarioManagerModal({
  isOpen,
  onClose,
  currentRole = 'OPERATOR',
}: ScenarioManagerModalProps) {
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    handover: 0,
    selesaiPerbaikan: 0,
    closed: 0,
    auditDefect: 0,
    pendingJustifications: 0,
    systemAuditLogs: 0,
  });

  const [notification, setNotification] = useState<{
    type: 'success' | 'warning' | 'info';
    message: string;
  } | null>(null);

  const [activeGuideTab, setActiveGuideTab] = useState<'OPERATOR' | 'TEKNISI' | 'SUPERVISOR' | 'ADMIN'>(
    (currentRole as any) || 'OPERATOR'
  );

  const refreshStats = () => {
    try {
      const rawTickets = storage.getItem('machine-card-open-work');
      const tickets = rawTickets ? JSON.parse(rawTickets) : [];
      const rawJustifs = storage.getItem('mc-pending-part-justifications');
      const justifs = rawJustifs ? JSON.parse(rawJustifs) : [];
      const rawAudit = storage.getItem('mc-system-audit-logs');
      const auditLogs = rawAudit ? JSON.parse(rawAudit) : [];

      if (Array.isArray(tickets)) {
        setStats({
          total: tickets.length,
          open: tickets.filter((t: any) => t.status === 'OPEN').length,
          inProgress: tickets.filter((t: any) => t.status === 'IN_PROGRESS').length,
          handover: tickets.filter((t: any) => t.status === 'HANDOVER').length,
          selesaiPerbaikan: tickets.filter((t: any) => t.status === 'SELESAI_PERBAIKAN').length,
          closed: tickets.filter((t: any) => t.status === 'CLOSED').length,
          auditDefect: tickets.filter((t: any) => Boolean(t.completenessAudit)).length,
          pendingJustifications: Array.isArray(justifs) ? justifs.length : 0,
          systemAuditLogs: Array.isArray(auditLogs) ? auditLogs.length : 0,
        });
      }
    } catch (err) {
      console.error('Gagal membaca statistik:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshStats();
    }
  }, [isOpen]);

  const handleInject = () => {
    try {
      const counts = inject100MaintenanceScenarios();
      refreshStats();
      setNotification({
        type: 'success',
        message: `Berhasil menginjeksi 100 skenario pemeliharaan! (${counts.openCount} Open, ${counts.inProgressCount} Dikerjakan, ${counts.handoverCount} Handover, ${counts.selesaiPerbaikanCount} Selesai, ${counts.closedCount} Closed, ${counts.pendingJustificationsCount} Part Menunggu Justifikasi).`,
      });
      setTimeout(() => setNotification(null), 6000);
    } catch (err) {
      setNotification({
        type: 'warning',
        message: 'Gagal menginjeksi skenario: ' + String(err),
      });
    }
  };

  const handleClear = () => {
    if (window.confirm('Yakin ingin membersihkan secara total seluruh data pemeliharaan (open work, justifikasi part, dan log audit) ke status kosong?')) {
      clearAllMaintenanceData();
      refreshStats();
      setNotification({
        type: 'info',
        message: 'Seluruh data pemeliharaan di browser telah dibersihkan menjadi kosong (clean slate).',
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="scenario-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenario-modal-title"
      onClick={onClose}
    >
      <div
        className="scenario-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="scenario-modal-header">
          <div className="scenario-modal-title-wrap">
            <div className="scenario-icon-badge">
              <FlaskConical size={20} />
            </div>
            <div>
              <h2 id="scenario-modal-title" style={{ margin: 0, fontSize: '1.15rem', color: '#0a1e15' }}>
                Pusat Uji Alur &amp; Injeksi 100 Skenario Pemeliharaan
              </h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Simulasi terpadu siklus hidup: Operator &rarr; Teknisi &rarr; Handover Shift &rarr; Closing Tiket &rarr; Supervisor Audit &rarr; Admin Justifikasi Part.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="scenario-btn-close"
            onClick={onClose}
            aria-label="Tutup jendela manajemen skenario"
          >
            <X size={18} />
          </button>
        </header>

        {/* Banner Notifikasi */}
        {notification && (
          <div className={`scenario-notification-banner ${notification.type}`}>
            <CheckCircle2 size={16} />
            <span>{notification.message}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="scenario-modal-body">
          {/* Section: Status Dataset */}
          <section className="scenario-section">
            <div className="scenario-section-header">
              <span className="scenario-section-title">
                <Layers size={16} />
                Status Dataset Pemeliharaan Saat Ini ({stats.total} Tiket Aktif)
              </span>
              <button
                type="button"
                className="scenario-btn-mini-refresh"
                onClick={refreshStats}
                title="Perbarui angka statistik"
              >
                <RotateCcw size={12} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="scenario-stats-grid">
              <div className="scenario-stat-pill">
                <div className="pill-dot open" />
                <div className="pill-content">
                  <span className="pill-value">{stats.open}</span>
                  <span className="pill-label">1. Baru Dilaporkan (Open)</span>
                </div>
              </div>

              <div className="scenario-stat-pill">
                <div className="pill-dot in-progress" />
                <div className="pill-content">
                  <span className="pill-value">{stats.inProgress}</span>
                  <span className="pill-label">2. Dikerjakan &amp; Aging</span>
                </div>
              </div>

              <div className="scenario-stat-pill">
                <div className="pill-dot handover" />
                <div className="pill-content">
                  <span className="pill-value">{stats.handover}</span>
                  <span className="pill-label">3. Handover Shift</span>
                </div>
              </div>
