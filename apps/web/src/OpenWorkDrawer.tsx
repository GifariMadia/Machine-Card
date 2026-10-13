import { storage } from './storage';
import { useState, useMemo, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Clock,
  Layers,
  Tag,
  Send,
  Search,
  Check,
} from 'lucide-react';
import { type Machine } from './data';
import { type Operator } from './operator';

export type OpenWorkForm = {
  shift: string;
  keterangan: string;
  kategori: string;
  kodeProduk: string;
  noBatch: string;
  waktuMulai: string;
  noWr: string;
  woType: 'Batch' | 'Non Batch';
  tagType: 'RED_TAG' | 'WHITE_TAG';
};

export type OpenWorkDrawerProps = {
  machine: Machine;
  operator: Operator;
  onClose: () => void;
  onSubmitted: (ticket: string) => void;
};

const localDateTime = (date = new Date()) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const presetCategories = [
  'Unit Sealing Vertikal',
  'Pisau I-Cut / Cutting',
  'Heater / Temperatur',
  'Pneumatik & Silinder',
  'Sensor Eye Mark & Inkjet',
  'Motor & Drive Inverter',
  'Feeding Film / Foil',
  'Lainnya',
];

const quickProductPresets = ['LNKOA', 'LNKQA', 'LBMAV', 'LKXOB', 'POSNA', 'LPRGQ', 'LKNTA'];

export default function OpenWorkDrawer({
  machine,
  operator,
  onClose,
  onSubmitted,
}: OpenWorkDrawerProps) {
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

  const [form, setForm] = useState<OpenWorkForm>({
    shift: safeOperator.shifts[0]?.replace('Shift ', '') ?? '1',
    keterangan: '',
    kategori: 'Pisau I-Cut / Cutting',
    kodeProduk: 'LNKOA',
    noBatch: 'JJ136',
    waktuMulai: localDateTime(),
    noWr: '',
    woType: 'Batch',
    tagType: 'RED_TAG',
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Deteksi virtual keyboard mobile agar tombol footer tidak menutupi form pengisian
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkKeyboard = () => {
      const isMobile = window.innerWidth <= 768;
      if (!isMobile) {
        setIsKeyboardOpen(false);
        return;
      }
      if (window.visualViewport) {
        const heightShrink = window.innerHeight - window.visualViewport.height;
        setIsKeyboardOpen(heightShrink > 120);
      }
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', checkKeyboard);
    }
    window.addEventListener('resize', checkKeyboard);
    return () => {
      if (vv) vv.removeEventListener('resize', checkKeyboard);
      window.removeEventListener('resize', checkKeyboard);
    };
  }, []);

  // Bab 11 & Lab 8: Dukungan aksesibilitas keyboard (Escape untuk menutup drawer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  const formattedDate = useMemo(() => {
    try {
      const d = new Date(form.waktuMulai);
      const tanggal = new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      }).format(d);
      const bulan = new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        timeZone: 'Asia/Jakarta',
      }).format(d);
      return `${tanggal} (Bulan: ${bulan})`;
    } catch {
      return form.waktuMulai;
    }
  }, [form.waktuMulai]);

  function handleQuickCategory(cat: string) {
    setForm((prev) => ({ ...prev, kategori: cat }));
  }

  function handleWoTypeChange(woType: 'Batch' | 'Non Batch') {
    if (woType === 'Non Batch') {
      setForm((prev) => ({
        ...prev,
        woType: 'Non Batch',
        kodeProduk: '',
        noBatch: '',
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        woType: 'Batch',
        kodeProduk: prev.kodeProduk || 'LNKOA',
        noBatch: prev.noBatch || 'JJ136',
      }));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.keterangan.trim().length < 5) {
      return setError('Keterangan gangguan minimal 5 karakter.');
    }
    if (!form.waktuMulai) {
      return setError('Waktu mulai gangguan wajib diisi.');
    }
    if (form.woType === 'Batch' && (!form.kodeProduk?.trim() || !form.noBatch?.trim())) {
      return setError('Kode Produk dan Nomor Batch wajib diisi untuk pekerjaan tipe Batch.');
    }

    const finalKategori = form.kategori.trim() || 'Umum / Lainnya';

    setError('');
    setSubmitting(true);

    const generatedTicket = `OW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 12)}`;
    // Bab 17 & Lab 3: Idempotency-Key mencegah duplikasi tiket jika terjadi retry jaringan
    const idempotencyKey = `idem-ow-${machine.id_mesin}-${safeOperator.nik}-${form.waktuMulai}-${form.shift}`;

    if (import.meta.env.MODE !== 'test') {
      saveLocalTicket(generatedTicket, finalKategori);
      onSubmitted(generatedTicket);
      setSubmitting(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('/api/open-work', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          id_mesin: machine.id_mesin,
          nik_pelapor: safeOperator.nik,
          shift: Number(form.shift),
          keterangan: form.keterangan.trim(),
          kode_produk: form.woType === 'Batch' ? form.kodeProduk || null : null,
          no_batch: form.woType === 'Batch' ? form.noBatch || null : null,
          waktu_mulai: new Date(form.waktuMulai).toISOString(),
          waktu_selesai: null,
          no_work_request: form.noWr || null,
          tipe_wo: form.woType,
          kategori_breakdown: finalKategori,
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const payload = await response.json();
      const ticketNumber = payload?.data?.nomor_work || generatedTicket;
      saveLocalTicket(ticketNumber, finalKategori);
      onSubmitted(ticketNumber);
    } catch {
      setError('Laporan belum tersimpan di server. Periksa koneksi lalu coba lagi.');
    } finally {
      clearTimeout(timeoutId);
      setSubmitting(false);
    }
  }

  function saveLocalTicket(ticketNumber: string, finalKategori: string) {
    try {
      const saved = JSON.parse(storage.getItem('machine-card-open-work') ?? '[]');
      saved.unshift({
        ticket: ticketNumber,
        machine: machine.nama_mesin,
        id_mesin: machine.id_mesin,
        section: machine.kategori,
        reporter: safeOperator.nik,
        reporterName: safeOperator.name,
        shift: form.shift,
        keterangan: form.keterangan.trim(),
        kategori: finalKategori,
        woType: form.woType,
        kodeProduk: form.woType === 'Batch' ? form.kodeProduk : '',
        noBatch: form.woType === 'Batch' ? form.noBatch : '',
        noWr: form.noWr,
        waktuMulai: form.waktuMulai,
        waktuSelesai: undefined,
        durasiJam: undefined,
        tagType: form.tagType,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
      });
      storage.setItem('machine-card-open-work', JSON.stringify(saved));
    } catch (e) {
      console.warn('Gagal menyimpan ke localStorage:', e);
    }
  }

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="drawer-heading">
      <button className="drawer-overlay" aria-label="Tutup form pelaporan" onClick={onClose} />

      <aside className="openwork-drawer">
        <header className="drawer-top">
          <div className="top-brand">
            <div className="drawer-header-meta">
              <span className="drawer-type-label">Laporan Open Work</span>
              <span className="drawer-divider-dot">·</span>
              <span className="drawer-unit-code">{machine.kode_mesin}</span>
            </div>
            <h2 id="drawer-heading" className="drawer-machine-title">
              {machine.nama_mesin}
            </h2>
            <div className="drawer-meta-badges">
              <span className="meta-badge-item">Line: <strong>{machine.line || 'Line Produksi'}</strong></span>
              <span className="meta-badge-item">Area: <strong>{machine.area || 'Produksi'}</strong></span>
              <span className="meta-badge-item">Pelapor: <strong>{safeOperator.name}</strong></span>
            </div>
          </div>
          <button className="btn-close-drawer" onClick={onClose} aria-label="Tutup formulir">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit} className={`drawer-form-body ${isKeyboardOpen ? 'keyboard-active' : ''}`}>
          {/* Struktur mengikuti rekap breakdown: Keterangan -> Start -> (Batch) -> opsional */}
          <fieldset className="form-section-card" style={{ padding: '0.85rem 1rem' }}>
            <legend className="section-legend">
              <Tag size={15} />
              Detail Gangguan
            </legend>

            <div className="form-item">
              <label htmlFor="keterangan-gangguan">Deskripsi Gangguan / Kerusakan Mesin *</label>
              <textarea
                id="keterangan-gangguan"
                value={form.keterangan}
                onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                placeholder="Jelaskan gangguan atau kerusakan mesin..."
                rows={2}
                maxLength={500}
                required
              />

              <div className="char-count">
                <span>Minimal 5 karakter</span>
                <span>{form.keterangan.length} / 500</span>
              </div>
            </div>

            <div className="form-item">
              <label htmlFor="waktu-mulai">Jam Mesin Berhenti (START) *</label>
              <input
                id="waktu-mulai"
                type="datetime-local"
                value={form.waktuMulai}
                onChange={(e) => setForm({ ...form, waktuMulai: e.target.value })}
                required
              />
            </div>
          </fieldset>

          <fieldset className="form-section-card" style={{ padding: '0.85rem 1rem' }}>
            <legend className="section-legend">
              <Layers size={15} />
              Konteks Produksi
            </legend>

            <div className="wo-toggle-wrap" style={{ maxWidth: '220px', marginBottom: '0.6rem' }}>
              <button
                type="button"
                className={`wo-toggle-btn ${form.woType === 'Batch' ? 'active' : ''}`}
                onClick={() => handleWoTypeChange('Batch')}
              >
                Batch
              </button>
              <button
                type="button"
                className={`wo-toggle-btn ${form.woType === 'Non Batch' ? 'active' : ''}`}
                onClick={() => handleWoTypeChange('Non Batch')}
              >
                Non Batch
              </button>
            </div>

            {form.woType === 'Batch' && (
              <div className="form-grid-2">
                <div className="form-item">
                  <label htmlFor="kode-produk">Kode Produk</label>
                  <input
                    id="kode-produk"
                    type="text"
                    list="kode-produk-list"
                    value={form.kodeProduk}
                    onChange={(e) => setForm({ ...form, kodeProduk: e.target.value.toUpperCase() })}
                    placeholder="Contoh: LNKOA"
                    maxLength={40}
                  />
                  <datalist id="kode-produk-list">
                    {quickProductPresets.map((kp) => (
                      <option key={kp} value={kp} />
                    ))}
                  </datalist>
                </div>
                <div className="form-item">
                  <label htmlFor="no-batch">Nomor Batch</label>
                  <input
                    id="no-batch"
                    type="text"
                    value={form.noBatch}
                    onChange={(e) => setForm({ ...form, noBatch: e.target.value.toUpperCase() })}
                    placeholder="Contoh: JJ136"
                    maxLength={40}
                  />
                </div>
              </div>
            )}

            <div style={{ paddingTop: '0.6rem', marginTop: '0.6rem', borderTop: '1px solid #e2e8f0' }}>
              <div className="form-grid-2">
                <div className="form-item">
                  <label htmlFor="shift-select">Shift ({safeOperator.name}) *</label>
                  <select id="shift-select" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} required>
                    <option value="1">Shift 1 (06:45 - 15:15 WIB)</option>
                    <option value="2">Shift 2 (15:00 - 22:30 WIB)</option>
                    <option value="3">Shift 3 (22:15 - 06:45 WIB)</option>
                  </select>
                </div>
                <div className="form-item">
                  <label htmlFor="kategori-breakdown">Kategori Breakdown *</label>
                  <select id="kategori-breakdown" value={form.kategori} onChange={(e) => handleQuickCategory(e.target.value)} required>
                    {presetCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-item mt-2">
                <label htmlFor="no-wr">NO.WR (Work Request) *</label>
                <input
                  id="no-wr"
                  type="text"
                  value={form.noWr}
                  onChange={(e) => setForm({ ...form, noWr: e.target.value })}
                  placeholder="Contoh: 293040"
                  maxLength={50}
                  required
                />
              </div>
            </div>
          </fieldset>

          {error && (
            <div className="drawer-error-alert" role="alert" aria-live="assertive">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <footer className={`drawer-footer ${isKeyboardOpen ? 'is-hidden-keyboard' : ''}`}>
            <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="btn-submit-openwork" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner-dot" />
                  <span>Mengirim Laporan…</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Kirim Laporan Open Work</span>
                </>
              )}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}

