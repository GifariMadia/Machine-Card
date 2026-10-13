import { useState } from 'react';
import { storage } from './storage';
import type { MachinePartHistory } from './SupervisorDashboard';

export default function PartMeterSetup({ parts, actor }: { parts: MachinePartHistory[]; actor: string }) {
  const [partId, setPartId] = useState('');
  const [baseline, setBaseline] = useState('');
  const [current, setCurrent] = useState('');
  const [error, setError] = useState('');
  const candidates = parts.filter((part) => part.intervalBasis === 'JAM_OPERASI');
  if (!candidates.length) return null;
  return <details className="spv-handover-details" style={{ margin: 20 }}><summary>Verifikasi meter jam operasi part</summary>
    <form className="spv-pm-planner-form" onSubmit={(event) => {
      event.preventDefault(); const part = candidates.find((item) => item.id === partId);
      if (!part || !part.replacedAt || baseline === '' || current === '' || Number(current) < Number(baseline)) { setError('Pilih part dengan tanggal pemasangan valid. Meter terkini harus minimal sebesar baseline pemasangan.'); return; }
      const value = { ...part, installedMeterHours: Number(baseline), currentMeterHours: Number(current), meterVerifiedAt: new Date().toISOString(), meterVerifiedBy: actor };
      const previous: MachinePartHistory[] = JSON.parse(storage.getItem('machine-card-parts') || '[]');
      const next = previous.filter((item) => !(item.machine === part.machine && item.part === part.part && item.position === part.position));
      storage.setItem('machine-card-parts', JSON.stringify([value, ...next]));
      window.dispatchEvent(new Event('mc-parts-updated')); setError('');
    }}>
      <label htmlFor="meter-part">Part terpasang</label><select id="meter-part" required value={partId} onChange={(event) => { setPartId(event.target.value); const item = candidates.find((part) => part.id === event.target.value); setBaseline(item?.installedMeterHours?.toString() || ''); setCurrent(item?.currentMeterHours?.toString() || ''); }}><option value="">Pilih part</option>{candidates.map((part) => <option key={part.id} value={part.id}>{part.part} · {part.position} · {part.replacedAt || 'Tanggal belum diisi'}</option>)}</select>
      <label htmlFor="meter-baseline">Meter kumulatif saat pemasangan (jam)</label><input id="meter-baseline" type="number" min="0" step="0.01" required value={baseline} onChange={(event) => setBaseline(event.target.value)} />
      <label htmlFor="meter-current">Meter kumulatif terkini (jam)</label><input id="meter-current" type="number" min={baseline || '0'} step="0.01" required value={current} onChange={(event) => setCurrent(event.target.value)} />
      <p>Gunakan pembacaan meter kumulatif fisik yang sama. Jam operasi bulanan tidak dapat menggantikan baseline pemasangan.</p>
      {error && <p role="alert">{error}</p>}<button className="spv-btn-kpi-edit" type="submit">Simpan verifikasi meter</button>
    </form>
  </details>;
}
