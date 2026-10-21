import { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import type { Machine } from './data';
import type { PreventiveMaintenanceItem } from './SupervisorDashboard';

export default function SupervisorPMPlanner({ schedules, machines, actor, onSave }: {
  schedules: PreventiveMaintenanceItem[];
  machines: Machine[];
  actor: string;
  onSave: (item: PreventiveMaintenanceItem) => void;
}) {
  const [editing, setEditing] = useState<PreventiveMaintenanceItem | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [period, setPeriod] = useState<PreventiveMaintenanceItem['periode']>('Mingguan');
  const [activity, setActivity] = useState('');
  const [due, setDue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function start(item: PreventiveMaintenanceItem | null) {
    setEditing(item); setCode(item?.kodeMesin || ''); setPeriod(item?.periode || 'Mingguan');
    setActivity(item?.kegiatan || ''); setDue(item?.tanggalJatuhTempo || ''); setReason(''); setError(''); setOpen(true);
  }

  return <>
    <div className="spv-pm-planner-toolbar">
      <button type="button" className="spv-btn-kpi-edit" onClick={() => start(null)}><Calendar size={15} /> Buat Jadwal PM</button>
      <label>Ubah jadwal PM
        <select aria-label="Pilih jadwal PM untuk diubah" value="" onChange={(event) => {
          const item = schedules.find((pm) => pm.id === event.target.value);
          if (item) start(item);
        }}>
          <option value="">Pilih jadwal…</option>
          {schedules.filter((pm) => pm.status !== 'SELESAI' && !pm.tanggalSelesaiAktual).map((pm) => <option key={pm.id} value={pm.id}>{pm.nomorPm} · {pm.machine}</option>)}
        </select>
      </label>
    </div>
    {open && <div className="spv-drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="pm-planner-title">
      <button className="spv-drawer-overlay" aria-label="Tutup penjadwalan PM" onClick={() => setOpen(false)} />
      <aside className="spv-drawer-panel">
        <header className="spv-drawer-top"><div><h2 id="pm-planner-title">{editing ? 'Ubah Jadwal PM' : 'Buat Jadwal PM'}</h2><p>Tentukan mesin, pekerjaan, dan tanggal pelaksanaan.</p></div><button type="button" className="btn-spv-close-drawer" aria-label="Tutup formulir PM" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <form className="spv-pm-planner-form" onSubmit={(event) => {
          event.preventDefault();
          const machine = machines.find((item) => item.kode_mesin === code);
          if (!machine || !activity.trim() || !due) return;
          if (editing && !reason.trim()) { setError('Isi alasan perubahan jadwal.'); return; }
          const changedDate = editing && editing.tanggalJatuhTempo !== due;
          const id = editing?.id || `PM-${crypto.randomUUID()}`;
          const history = editing ? [...(editing.riwayatReschedule || []), {
            tanggalSebelumnya: editing.tanggalJatuhTempo, tanggalBaru: due, alasan: reason.trim(),
            diubahOleh: actor, waktuDiubah: new Date().toISOString(),
          }] : undefined;
          try {
            onSave({ ...editing, id, nomorPm: editing?.nomorPm || `PM-${due.replace(/-/g, '')}-${id.slice(-8).toUpperCase()}`,
              machine: machine.nama_mesin, kodeMesin: code, section: machine.kategori, periode: period,
              kegiatan: activity.trim(), tanggalJatuhTempo: due,
              status: changedDate ? 'DIRESCHEDULE' : editing?.status || 'TERJADWAL',
              ...(changedDate ? { alasanReschedule: reason.trim(), tanggalSebelumReschedule: editing.tanggalJatuhTempo } : {}),
              riwayatReschedule: history,
              // All edits are attributed, even when only the activity or period changes.
              ...({ updatedBy: actor, updatedAt: new Date().toISOString(), changeReason: reason.trim() } as object),
            });
            setOpen(false);
          } catch { setError('Jadwal belum tersimpan. Silakan coba lagi.'); }
        }}>
          <label htmlFor="pm-machine">Mesin</label><select id="pm-machine" required value={code} disabled={Boolean(editing)} onChange={(e) => setCode(e.target.value)}><option value="">Pilih mesin</option>{machines.map((m) => <option key={m.kode_mesin} value={m.kode_mesin}>{m.nama_mesin} · {m.kode_mesin}</option>)}</select>
          <label htmlFor="pm-period">Periode PM</label><select id="pm-period" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>{['Mingguan', 'Bulanan', '3 Bulanan', 'Tahunan'].map((p) => <option key={p}>{p}</option>)}</select>
          <label htmlFor="pm-activity">Kegiatan PM</label><textarea id="pm-activity" required value={activity} onChange={(e) => setActivity(e.target.value)} rows={4} />
          <label htmlFor="pm-due">Tanggal pelaksanaan</label><input id="pm-due" type="date" required value={due} onChange={(e) => setDue(e.target.value)} />
          {editing && <><label htmlFor="pm-reason">Alasan perubahan</label><textarea id="pm-reason" required value={reason} onChange={(e) => setReason(e.target.value)} /></>}
          {error && <p role="alert">{error}</p>}
          <div className="spv-pm-planner-actions"><button type="button" className="spv-shift-btn" onClick={() => setOpen(false)}>Batal</button><button type="submit" className="spv-btn-kpi-edit">Simpan Jadwal PM</button></div>
        </form>
      </aside>
    </div>}
  </>;
}
