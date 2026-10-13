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

