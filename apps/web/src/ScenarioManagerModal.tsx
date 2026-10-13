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

              <div className="scenario-stat-pill">
                <div className="pill-dot ready-close" />
                <div className="pill-content">
                  <span className="pill-value">{stats.selesaiPerbaikan}</span>
                  <span className="pill-label">4. Siap Closing Operator</span>
                </div>
              </div>

              <div className="scenario-stat-pill">
                <div className="pill-dot closed" />
                <div className="pill-content">
                  <span className="pill-value">{stats.closed}</span>
                  <span className="pill-label">5. Mesin Running (Closed)</span>
                </div>
              </div>

              <div className="scenario-stat-pill highlight-defect">
                <div className="pill-dot defect" />
                <div className="pill-content">
                  <span className="pill-value">{stats.auditDefect}</span>
                  <span className="pill-label">6. Cacat Data (Audit SPV)</span>
                </div>
              </div>
            </div>

            <div className="scenario-submetrics-strip">
              <div className="submetric-item">
                <Wrench size={14} color="var(--color-icon-neutral, #64748b)" />
                <span>Antrean Justifikasi Part Baru: <strong>{stats.pendingJustifications} part</strong></span>
              </div>
              <div className="submetric-divider" />
              <div className="submetric-item">
                <ShieldCheck size={14} color="var(--color-icon-neutral, #64748b)" />
                <span>Log Audit Sistem &amp; Keamanan: <strong>{stats.systemAuditLogs} entri</strong></span>
              </div>
            </div>
          </section>

          {/* Section: Tombol Kontrol Cepat */}
          <section className="scenario-section">
            <span className="scenario-section-title">
              <RotateCcw size={16} />
              Aksi Injeksi &amp; Pembersihan Data
            </span>

            <div className="scenario-actions-row">
              <button
                type="button"
                className="scenario-btn-inject-action"
                onClick={handleInject}
              >
                <FlaskConical size={16} />
                <div>
                  <strong>Injeksi 100 Skenario Lengkap</strong>
                  <small>Populasikan 100 kasus riil seluruh mesin pabrik</small>
                </div>
              </button>

              <button
                type="button"
                className="scenario-btn-clear-action"
                onClick={handleClear}
              >
                <Trash2 size={16} />
                <div>
                  <strong>Bersihkan Total Data Maintenance</strong>
                  <small>Hapus seluruh data open work &amp; log audit</small>
                </div>
              </button>
            </div>
          </section>

          {/* Section: Panduan Pengujian per Peran */}
          <section className="scenario-section">
            <span className="scenario-section-title">
              <ShieldCheck size={16} />
              Matriks Panduan Pengujian Alur Terpadu
            </span>

            <div className="scenario-role-tabs">
              <button
                type="button"
                className={`scenario-role-tab ${activeGuideTab === 'OPERATOR' ? 'active' : ''}`}
                onClick={() => setActiveGuideTab('OPERATOR')}
              >
                Peran Operator
              </button>
              <button
                type="button"
                className={`scenario-role-tab ${activeGuideTab === 'TEKNISI' ? 'active' : ''}`}
                onClick={() => setActiveGuideTab('TEKNISI')}
              >
                Peran Teknisi
              </button>
              <button
                type="button"
                className={`scenario-role-tab ${activeGuideTab === 'SUPERVISOR' ? 'active' : ''}`}
                onClick={() => setActiveGuideTab('SUPERVISOR')}
              >
                Peran Supervisor
              </button>
              <button
                type="button"
                className={`scenario-role-tab ${activeGuideTab === 'ADMIN' ? 'active' : ''}`}
                onClick={() => setActiveGuideTab('ADMIN')}
              >
                Peran Admin
              </button>
            </div>

            <div className="scenario-guide-content">
              {activeGuideTab === 'OPERATOR' && (
                <div className="scenario-guide-pane">
                  <p className="scenario-guide-lead">
                    <strong>Alur Kerja Operator:</strong> Pelaporan Open Work &rarr; Pemantauan Perbaikan &rarr; Uji Coba &amp; Closing Tiket Mesin.
                  </p>
                  <ol className="scenario-step-list">
                    <li>
                      <strong>Pelaporan Kerusakan (Breakdown):</strong> Klik tombol <em>"Laporkan Open Work (Breakdown)"</em> pada mesin lini yang mengalami masalah (misal: suhu drop, kebocoran tekanan angin, pisau tumpul).
                    </li>
                    <li>
                      <strong>Pemantauan Status Tiket:</strong> Filter tab Tiket berdasarkan <code>Menunggu Respon (OPEN)</code> atau <code>Sedang Dikerjakan (IN_PROGRESS)</code>.
                    </li>
                    <li>
                      <strong>Verifikasi &amp; Closing Tiket:</strong> Lihat banner hijau peringatan <em>"Siap Uji Coba &amp; Closing"</em> (status <code>SELESAI_PERBAIKAN</code>). Klik tombol hijau <strong>"Uji Coba &amp; Closing Tiket"</strong> untuk mengonfirmasi mesin beroperasi normal dan catat hasil uji coba 15 menit.
                    </li>
                  </ol>
                </div>
              )}

              {activeGuideTab === 'TEKNISI' && (
                <div className="scenario-guide-pane">
                  <p className="scenario-guide-lead">
                    <strong>Alur Kerja Teknisi:</strong> Respons Laporan Masuk &rarr; Penanganan &amp; Aging &rarr; Handover Lintas Shift &rarr; Catat Part Baru.
                  </p>
                  <ol className="scenario-step-list">
                    <li>
                      <strong>Mulai Pengerjaan:</strong> Pilih tiket <code>OPEN</code> lalu klik <em>"Mulai Dikerjakan"</em> untuk mengubah status menjadi <code>IN_PROGRESS</code> dan mengaktifkan penghitung ticket aging.
                    </li>
                    <li>
                      <strong>Operan Antar Shift (Handover):</strong> Untuk pekerjaan kompleks yang membutuhkan suku cadang atau bantuan shift berikutnya, klik <em>"Handover / Operan Shift"</em> untuk mencatat kronologi dan status komponen.
                    </li>
                    <li>
                      <strong>Penyelesaian Fisik &amp; Part Baru:</strong> Klik <em>"Selesaikan Perbaikan Fisik"</em>. Masukkan tindakan perbaikan dan sparepart yang diganti. Jika part belum ada di katalog (misal: <em>Heater Custom 500W</em>), sistem akan otomatis mendaftarkannya ke antrean justifikasi Admin.
                    </li>
                  </ol>
                </div>
              )}

              {activeGuideTab === 'SUPERVISOR' && (
                <div className="scenario-guide-pane">
                  <p className="scenario-guide-lead">
                    <strong>Alur Kerja Supervisor:</strong> Evaluasi Kelengkapan Laporan &rarr; Audit Koreksi Data &rarr; Review &amp; Sign-off.
                  </p>
                  <ol className="scenario-step-list">
                    <li>
                      <strong>Pemeriksaan 10 Kasus Cacat Data:</strong> Buka tab <em>"Review &amp; Audit Koreksi Data"</em>. Periksa kasus <code>OW-2610-091</code> s.d. <code>OW-2610-100</code> yang memuat anomali durasi 0 menit, catatan ambigu ("sudah dibenerin"), dan kuantitas part nol.
                    </li>
                    <li>
                      <strong>Koreksi Data Pengukuran:</strong> Klik tombol <em>"Koreksi Data"</em> pada tiket bermasalah, masukkan nilai yang benar disertai alasan audit kepatuhan. Log koreksi akan otomatis tercatat permanen.
                    </li>
                    <li>
                      <strong>Sign-off &amp; Laporan Shift Discord:</strong> Review tiket breakdown, verifikasi target KPI MTTR/MTBF, dan simulasikan pengiriman laporan ringkasan shift terverifikasi ke Discord.
                    </li>
                  </ol>
                </div>
              )}

              {activeGuideTab === 'ADMIN' && (
                <div className="scenario-guide-pane">
                  <p className="scenario-guide-lead">
                    <strong>Alur Kerja Admin:</strong> Justifikasi Sparepart Baru &rarr; Penetapan Rumus Lifetime &rarr; Log Audit Kepatuhan &amp; Keamanan.
                  </p>
                  <ol className="scenario-step-list">
                    <li>
                      <strong>Antrean Justifikasi Part Baru:</strong> Masuk ke tab <em>"Master Part &amp; Lifetime"</em> &rarr; sub-tab <em>"Antrean Justifikasi Part Baru"</em>. Periksa 8 part uncataloged hasil input teknisi dari laporan perbaikan.
                    </li>
                    <li>
                      <strong>Standardisasi &amp; Penetapan Rumus:</strong> Klik tombol <em>"Justifikasi &amp; Tetapkan Rumus"</em>. Lakukan standardisasi nama part, tetapkan nomor OEM, dan pilih basis umur <code>JAM_OPERASI</code> atau <code>KALENDER</code> beserta batas pakainya.
                    </li>
                    <li>
                      <strong>Log Audit Sistem &amp; Keamanan:</strong> Masuk ke tab <em>"Log Audit Sistem &amp; Keamanan"</em> untuk melihat rekam jejak audit trail kepatuhan, pembaruan RBAC, dan justifikasi rumus yang baru dilakukan.
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="scenario-modal-footer">
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Total 100 Skenario Pemeliharaan mencakup 30 mesin plant Pulogadung
          </div>
          <button
            type="button"
            className="btn-scenario-done"
            onClick={onClose}
          >
            Tutup Jendela
          </button>
        </footer>
      </div>
    </div>
  );
}
