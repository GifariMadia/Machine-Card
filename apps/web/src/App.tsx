import { loadBusinessData, resetBusinessData, refreshBusinessData, backupLegacyBusinessData } from './storage';
import { storage } from './storage';
import React, { useState, useEffect, Suspense } from 'react';
import { type AppUser, type Operator, type Technician, type Supervisor, type Admin } from './operator';
import LoginPage from './LoginPage';
import OperatorDashboard from './OperatorDashboard';
import TechnicianDashboard from './TechnicianDashboard';
import SupervisorDashboard from './SupervisorDashboard';
import AdminDashboard from './AdminDashboard';
import './styles.css';
import './dashboard-unified.css';

function DashboardLoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f3f5f4',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            border: '3px solid #dce2df',
            borderTopColor: '#059669',
            borderRadius: '50%',
            animation: 'mc-spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#475569' }}>
          Menyiapkan Workspace Machine Card...
        </p>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Machine Card Runtime Error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    try {
      sessionStorage.clear();
      storage.removeItem('mc-active-tab');
      storage.removeItem('mc-sidebar-collapsed');
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            color: '#f8fafc',
            padding: '1.5rem',
            fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                margin: '0 auto 1.25rem',
              }}
            >
              ⚠️
            </div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700 }}>
              Terjadi Gangguan Tampilan Sesi
            </h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Aplikasi mendeteksi kendala pada state browser Anda. Anda dapat memuat ulang tampilan atau mereset sesi untuk melanjutkan.
            </p>
            {this.state.error?.message && (
              <pre
                style={{
                  background: '#0f172a',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  color: '#fca5a5',
                  overflowX: 'auto',
                  textAlign: 'left',
                  marginBottom: '1.5rem',
                  border: '1px solid #7f1d1d',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Muat Ulang Halaman
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Reset Sesi &amp; Login Ulang
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(() => {
    if (import.meta.env.MODE !== 'test') return null;
    try {
      const stored = sessionStorage.getItem('machine-card-session');
      if (!stored) return null;
      const parsed = JSON.parse(stored) as AppUser;
      if (!parsed || typeof parsed !== 'object' || !parsed.nik) {
        try { sessionStorage.removeItem('machine-card-session'); } catch {}
        return null;
      }
      return {
        ...parsed,
        role: parsed.role || 'OPERATOR',
      } as AppUser;
    } catch {
      try { sessionStorage.removeItem('machine-card-session'); } catch {}
      return null;
    }
  });

  const [sessionExpired, setSessionExpired] = useState(false);
  const [loading, setLoading] = useState(import.meta.env.MODE !== 'test');
  const [sync, setSync] = useState({ pending: false, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    sessionStorage.removeItem('machine-card-session');
    try { backupLegacyBusinessData(); } catch { /* Original browser records remain untouched if backup quota is exceeded. */ }
    const listener = (event: Event) => setSync((event as CustomEvent).detail);
    const expired = () => { setSessionExpired(true); };
    window.addEventListener('mc-sync-status', listener);
    window.addEventListener('mc-session-expired', expired);
    void (async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        if (response.ok) { const account = await response.json(); await loadBusinessData(); setUser(account); }
      } catch { setSync({ pending: false, error: 'Server tidak dapat dihubungi. Data lokal tetap dipertahankan.' }); }
      finally { setLoading(false); }
    })();
    return () => { window.removeEventListener('mc-sync-status', listener); window.removeEventListener('mc-session-expired', expired); };
  }, []);
  useEffect(() => {
    if (!user || import.meta.env.MODE === 'test') return;
    const poll = setInterval(() => {
      if (document.querySelector('[role=dialog]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) return;
      void refreshBusinessData().then(async (changed) => {
        if (changed) setRevision((value) => value + 1);
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        if (response.ok) { const account = await response.json(); setUser((previous) => JSON.stringify(previous) === JSON.stringify(account) ? previous : account); }
        else if (response.status === 401) setSessionExpired(true);
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(poll);
  }, [user]);
  async function signedIn(account: AppUser) {
    if (import.meta.env.MODE === 'test') { setUser(account); return; }
    setLoading(true);
    try { await loadBusinessData(); setUser(account); setSync({ pending: false, error: '' }); }
    catch (error) { setSync({ pending: false, error: String(error) }); }
    finally { setLoading(false); }
  }


  const logout = () => {
    if (import.meta.env.MODE !== 'test') { void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); resetBusinessData(); }
    try {
      sessionStorage.removeItem('machine-card-session');
    } catch {}
    setUser(null);
  };

  // Session berakhir setelah 30 menit inaktivitas keyboard/mouse
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
    let timerId = setTimeout(() => {
      setSessionExpired(true);
    }, INACTIVITY_LIMIT_MS);

    let lastHeartbeat = 0;
    const onUserActivity = () => {
      if (import.meta.env.MODE !== 'test' && Date.now() - lastHeartbeat > 60000) {
        lastHeartbeat = Date.now();
        void fetch('/api/auth/activity', { method: 'POST', credentials: 'same-origin' }).then((response) => { if (response.status === 401) setSessionExpired(true); }).catch(() => {});
      }
      clearTimeout(timerId);
      timerId = setTimeout(() => {
        setSessionExpired(true);
      }, INACTIVITY_LIMIT_MS);
    };

    window.addEventListener('mousemove', onUserActivity);
    window.addEventListener('keydown', onUserActivity);
    window.addEventListener('click', onUserActivity);
    window.addEventListener('scroll', onUserActivity);

    return () => {
      clearTimeout(timerId);
      window.removeEventListener('mousemove', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('click', onUserActivity);
      window.removeEventListener('scroll', onUserActivity);
    };
  }, [user]);

  if (loading) return <DashboardLoadingFallback />;

  if (!user) {
    return (
      <ErrorBoundary>
        {sync.error && <p role="alert">{sync.error}</p>}
        <LoginPage onLogin={(account) => void signedIn(account)} />
      </ErrorBoundary>
    );
  }

  const renderDashboard = () => {
    if (user.role === 'ADMIN') {
      return <AdminDashboard admin={user as Admin} onLogout={logout} />;
    }
    if (user.role === 'SUPERVISOR') {
      return <SupervisorDashboard supervisor={user as Supervisor} onLogout={logout} />;
    }
    if (user.role === 'TEKNISI') {
      return <TechnicianDashboard technician={user} onLogout={logout} />;
    }
    return <OperatorDashboard operator={user as Operator} onLogout={logout} />;
  };

  return (
    <ErrorBoundary>
      <Suspense fallback={<DashboardLoadingFallback />}>
        <React.Fragment key={revision}>{renderDashboard()}</React.Fragment>
      </Suspense>
      {(sync.pending || sync.error) && <div className="session-expired-overlay" role={sync.error ? 'alertdialog' : 'status'} aria-modal="true">
        <div className="session-expired-dialog"><div className="session-dialog-header">{sync.error ? 'Perubahan belum tersimpan' : 'Menyimpan ke server…'}</div>
          <div className="session-dialog-body">{sync.error || 'Tunggu sampai penyimpanan dikonfirmasi.'}</div>
          {sync.error && <div className="session-dialog-footer"><button type="button" onClick={() => window.location.reload()}>Muat data terbaru</button></div>}
        </div>
      </div>}

      {/* Modal Dialog Session Expired */}
      {sessionExpired && (
        <div className="session-expired-overlay" role="dialog" aria-modal="true" aria-label="Sesi Berakhir">
          <div className="session-expired-dialog">
            <div className="session-dialog-header">
              Sesi Keamanan Berakhir
            </div>
            <div className="session-dialog-body">
              <p style={{ margin: 0 }}>Sesi kerja Anda telah berakhir karena tidak ada aktivitas selama 30 menit. Silakan login kembali.</p>
            </div>
            <div className="session-dialog-footer">
              <button
                type="button"
                className="btn-session-ok"
                onClick={() => {
                  setSessionExpired(false);
                  logout();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
