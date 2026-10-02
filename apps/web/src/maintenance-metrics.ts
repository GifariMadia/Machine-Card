export const activeStatuses = new Set(['OPEN', 'IN_PROGRESS', 'PENDING', 'MENUNGGU_PART', 'MENUNGGU_DUKUNGAN', 'HANDOVER']);
export const isUnfinished = (ticket: { status: string; isVoid?: boolean }) => !ticket.isVoid && activeStatuses.has(ticket.status);
export const plantDate = (date = new Date()) => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
export function parsePlantTime(value: string): number {
  if (!value) return NaN;
  const qualified = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.length === 10 ? `${value}T00:00:00+07:00` : `${value}+07:00`;
  return Date.parse(qualified);
}
export function formatPlantTime(value: string): string {
  const time = parsePlantTime(value); return Number.isFinite(time) ? new Date(time).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—';
}

export function validMinutes(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function repairMinutes(ticket: { durasiPerbaikanMenit?: number; waktuMulaiTeknisi?: string; waktuSelesai?: string; durasiTungguMenit?: number }): number | null {
  const recorded = validMinutes(ticket.durasiPerbaikanMenit);
  if (recorded !== null) return recorded;
  const start = Date.parse(ticket.waktuMulaiTeknisi || '');
  const end = Date.parse(ticket.waktuSelesai || '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(0, (end - start) / 60000 - (validMinutes(ticket.durasiTungguMenit) ?? 0));
}

export function ticketDowntime(ticket: { waktuMulai?: string; waktuMesinBeroperasi?: string }): number | null {
  const start = parsePlantTime(ticket.waktuMulai || ''); const end = parsePlantTime(ticket.waktuMesinBeroperasi || '');
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 60000 : null;
}

export function pmCompliance(items: Array<{ tanggalJatuhTempo: string; tanggalSelesaiAktual?: string; status: string }>, today = plantDate()) {
  const due = items.filter((item) => item.tanggalJatuhTempo <= today);
  const onTime = due.filter((item) => item.status === 'SELESAI' && item.tanggalSelesaiAktual && item.tanggalSelesaiAktual <= item.tanggalJatuhTempo);
  return { due: due.length, onTime: onTime.length, percent: due.length ? Math.round(onTime.length / due.length * 1000) / 10 : null };
}

// Events after midnight belong to the previous operational date for the night shift.
export function operationalDate(timestamp: string, shift: string): string | null {
 const date = new Date(parsePlantTime(timestamp)); if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hourCycle: 'h23', hour: '2-digit' }).format(date);
  const dateString = plantDate(date);
  if (shift === '3' && Number(parts) < 7) {
    const previous = new Date(`${dateString}T12:00:00+07:00`); previous.setUTCDate(previous.getUTCDate() - 1);
    return plantDate(previous);
  }
  return dateString;
}
