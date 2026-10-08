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
