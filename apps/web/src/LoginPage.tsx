import { storage } from './storage';
import { useState, useEffect } from 'react';
import {
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  X,
  AlertCircle,
  CheckCircle2,
  Phone,
  MessageCircle,
} from 'lucide-react';
import { authenticateUser, isUserInactive, type AppUser } from './operator';
import './organic-login.css';

export type LoginPageProps = {
  onLogin: (user: AppUser) => void;
};

const pancaSradhaItems = [
  {
    badge: '1',
    keyword: 'Trust',
    title: 'Trust is the glue of life',
    desc: 'Saling percaya adalah perekat diantara kami',
  },
  {
    badge: '2',
    keyword: 'Mindfulness',
    title: 'Mindfulness is the foundation of our action',
    desc: 'Kesadaran penuh adalah dasar setiap tindakan kami',
  },
  {
    badge: '3',
    keyword: 'Innovation',
    title: 'Innovation is the key of our success',
    desc: 'Inovasi adalah kunci keberhasilan kami',
  },
  {
    badge: '4',
    keyword: 'Strive for Best',
    title: 'Strive to be the best',
    desc: 'Bertekad untuk menjadi yang terbaik',
  },
  {
    badge: '5',
    keyword: 'Interconnectedness',
    title: 'Interconnectedness is a universal way of life',
    desc: 'Saling keterkaitan adalah panduan hidup kami',
  },
];

const visiMisiItems = [
  {
    badge: 'V',
    title: 'Vision',
    desc: 'Menjadi perusahaan produk kesehatan, yang paling dikagumi dan disegani, melalui produk-produk inovatif dan berkualitas tinggi, serta didukung oleh kemajuan teknologi dan aksesibilitas yang tinggi.',
  },
  {
    badge: 'M',
    title: 'Mission',
    desc: 'Untuk memberikan kesehatan bagi semua orang.',
  },
];

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [employeeId, setEmployeeId] = useState(() => {
    try {
      return storage.getItem('machine-card-employee-id') ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [rememberId, setRememberId] = useState(() => {
    try {
      return Boolean(storage.getItem('machine-card-employee-id'));
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    let active = true;
    let timerId: ReturnType<typeof setTimeout>;

    const tick = () => {
      timerId = setTimeout(() => {
        if (!active) return;
        setBgIndex((prev) => (prev === 0 ? 1 : 0));
        tick();
      }, 14000);
    };

    tick();
    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, []);

  const whatsappAdminUrl = `https://wa.me/6282399352567?text=${encodeURIComponent(
    'Halo Admin Machine Card PT Bintang Toedjoe, saya mengalami kendala login pada sistem. Mohon bantuannya.'
  )}`;

  function handleForgotPassword() {
    setInfoMessage('Silakan hubungi IT Helpdesk atau Supervisor Shift untuk reset kata sandi.');
    setError('');
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInfoMessage('');

    if (isBlocked) {
      return setError('Akun terkunci (BLOCKED) karena 3 kali kesalahan kata sandi. Silakan hubungi Administrator Maintenance.');
    }

    const trimmedId = employeeId.trim();
    if (!trimmedId || !password) {
      return setError('Mohon lengkapi NIK dan kata sandi Anda.');
    }

    let user: AppUser | undefined;
    if (import.meta.env.MODE === 'test') user = authenticateUser(trimmedId, password);
    else {
      setSubmitting(true);
      try {
        const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nik: trimmedId, password }) });
        if (response.ok) user = await response.json();
        else if (response.status !== 401) { setSubmitting(false); setError(response.status === 429 ? 'Terlalu banyak percobaan. Coba setelah satu menit.' : 'Server login belum tersedia. Silakan coba lagi.'); return; }
      } catch { setError('Server login tidak dapat dihubungi.'); setSubmitting(false); return; }
      setSubmitting(false);
    }
    if (!user) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= 3) {
        setIsBlocked(true);
        return setError('Akun terkunci (BLOCKED) karena 3 kali kesalahan kata sandi berturut-turut. Silakan hubungi Administrator Maintenance.');
      }
      return setError(`NIK atau kata sandi tidak sesuai. Periksa kembali atau pilih profil kerja (Percobaan ${nextAttempts}/3).`);
    }

    if (user.active === false || isUserInactive(user.nik)) {
      return setError('Akses ditolak: Akun Anda berstatus nonaktif. Silakan hubungi Administrator Maintenance.');
    }

    setFailedAttempts(0);
    setError('');
    setSubmitting(true);

    window.setTimeout(() => {
      try {
        if (rememberId) {
          storage.setItem('machine-card-employee-id', trimmedId);
        } else {
          storage.removeItem('machine-card-employee-id');
        }
      } catch {}
      try {
        sessionStorage.setItem('machine-card-session', JSON.stringify(user));
      } catch {}
      setSubmitting(false);
      onLogin(user);
    }, 300);
  }

  return (
    <div className="replica-page">
      {/* ====================================================================
          SISI KIRI: BRANDING, KALBE PANCA SRADHA, & VISI MISI
          PERSIS REFERENSI (BACKGROUND PABRIK BINTANG TOEDJOE + OVERLAY BIRU)
          ==================================================================== */}
      <section className="replica-left" aria-label="Informasi Perusahaan Bintang Toedjoe">
        {/* Background Crossfade: 2 Foto Pabrik Bintang Toedjoe + Overlay Hijau Korporat */}
        <div className="replica-bg-layer" aria-hidden="true">
          <div className={`replica-bg-slide slide-1 ${bgIndex === 0 ? 'active' : ''}`} />
          <div className={`replica-bg-slide slide-2 ${bgIndex === 1 ? 'active' : ''}`} />
          <div className="replica-bg-overlay" />
        </div>

        <div className="replica-left-inner">
          <header className="replica-left-header">
            <h1 className="company-main-title">BINTANG TOEDJOE</h1>
            <p className="company-sub-tagline">
              PT Bintang Toedjoe adalah perusahaan kesehatan konsumen yang merupakan anak perusahaan dari Grup Kalbe.
            </p>
            <div className="header-divider" />
          </header>

          <div className="replica-content-blocks">
            {/* Blok 1: Kalbe Panca Sradha (5-Pillar Industrial Bento) */}
            <div className="content-group">
              <div className="group-category-header">
                <span className="group-category-pill">NILAI INTI</span>
                <span className="group-category-title">KALBE PANCA SRADHA</span>
              </div>
              <div className="panca-sradha-strip">
                {pancaSradhaItems.map((item) => (
                  <div key={item.badge} className="sradha-pillar-card">
                    <div className="sradha-pillar-top">
                      <span className="sradha-pillar-num">{item.badge}</span>
                      <span className="sradha-pillar-tag">{item.keyword}</span>
                    </div>
                    <strong className="sradha-pillar-title">{item.title}</strong>
                    <p className="sradha-pillar-desc">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Blok 2: Visi & Misi Bintang Toedjoe (Executive Dual Banner) */}
            <div className="content-group">
              <div className="group-category-header">
                <span className="group-category-pill">KOMITMEN</span>
                <span className="group-category-title">VISI &amp; MISI BINTANG TOEDJOE</span>
              </div>
              <div className="vision-mission-row">
                {visiMisiItems.map((item) => (
                  <div key={item.badge} className="vm-card">
                    <div className="vm-badge-glow">
                      <span className="vm-badge-letter">{item.badge}</span>
                    </div>
                    <div className="vm-text">
                      <strong className="vm-title">{item.title}</strong>
                      <p className="vm-desc">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <footer className="replica-left-footer">
            <div className="footer-quick-links">
              <span>Portal Machine Card</span>
              <span className="sep">•</span>
              <span>Plant Pulogadung</span>
              <span className="sep">•</span>
              <span>Sistem Pemeliharaan Mesin</span>
              <span className="sep">•</span>
              <span>GMT+7 Jakarta</span>
            </div>
            <p className="footer-address">
              K.9, Jl. Rw. Gelam V No.9 Kw. Industri Pulogadung, RW.9, Jatinegara, Kec. Cakung, Kota Jakarta Timur, Daerah Khusus Ibukota Jakarta 13920
            </p>
            <p className="footer-contact">
              <Phone size={13} className="footer-ico" />
              <span>(021) 4605533</span>
            </p>
          </footer>
        </div>
      </section>

      {/* ====================================================================
          SISI KANAN: KARTU LOGIN PRESISI SEPERTI REFERENSI
          ==================================================================== */}
      <section className="replica-right" aria-label="Portal Login Machine Card">
        <div className="replica-card-wrapper">
          <div className="replica-card">
            {/* Logo Emblem Presisi */}
            <div className="replica-logo-container">
              <img
                src="/assets/bintang-toedjoe-logo.webp"
                alt="PT Bintang Toedjoe - A Kalbe Company"
                className="login-card-direct-logo"
              />
              <h2 className="system-title">MACHINE CARD</h2>
              <p className="system-subtitle">Maintenance Digital Information</p>
            </div>

            {/* Form Input */}
            <form className="replica-form" onSubmit={submit} noValidate>
              <div className="replica-field">
                <label htmlFor="employee-id">EMAIL / EMPLOYEE ID</label>
                <div className="field-input-wrap">
                  <UserRound size={19} className="field-ico" />
                  <input
                    id="employee-id"
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    autoComplete="username"
                    placeholder="Contoh: OPR0001, TKN0001, SPV0001, ADM0001"
                    aria-required="true"
                  />
                  {employeeId && (
                    <button
                      type="button"
                      className="field-action-btn"
                      onClick={() => setEmployeeId('')}
                      aria-label="Hapus NIK"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="replica-field">
                <label htmlFor="password">PASSWORD</label>
                <div className="field-input-wrap">
                  <LockKeyhole size={19} className="field-ico" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-required="true"
                  />
                  <button
                    type="button"
                    className="field-action-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>

              <div className="replica-options-row">
                <label className="replica-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberId}
                    onChange={(e) => setRememberId(e.target.checked)}
                  />
                  <span>Ingat saya di perangkat ini</span>
                </label>
              </div>

              <div className="replica-helper-links">
                <a
                  href={whatsappAdminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whatsapp-help-link"
                  aria-label="Hubungi Admin Machine Card via WhatsApp"
                >
                  <MessageCircle size={14} className="wa-ico" />
                  <span>Kendala login? Hubungi Admin</span>
                </a>
              </div>

              {infoMessage && (
                <div className="banner-alert info" role="status">
                  <CheckCircle2 size={16} />
                  <span>{infoMessage}</span>
                </div>
              )}

              {error && (
                <div className="banner-alert error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="submit-row">
                <button
                  type="submit"
                  className="replica-login-btn"
                  disabled={submitting}
                >
                  {submitting ? 'MEMERIKSA...' : 'LOGIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
