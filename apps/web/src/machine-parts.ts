import { plantDate, parsePlantTime } from './maintenance-metrics';
import { storage } from './storage';
import type { MachinePartHistory, SupervisorWorkTicket } from './SupervisorDashboard';

type Formula = {
  id?: string;
  name?: string;
  standardizedName?: string;
  approvedPartId?: string;
  partNumber?: string;
  specification?: string;
  intervalBasis?: 'KALENDER' | 'JAM_OPERASI';
  defaultLifetimeDays?: number;
};

type Approval = {
  id: string;
  machine: string;
  ticket: string;
  status: string;
  partName: string;
  position?: string;
  specification?: string;
  reportedAt?: string;
  adminJustification?: Formula;
};

const normalized = (value: string) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Master registration supplies the formula; only a replacement record links a part to a machine.
export function getMachineParts(
  machine: { nama_mesin: string; kode_mesin: string },
  monitored: MachinePartHistory[],
  tickets: SupervisorWorkTicket[],
  approvals: Approval[],
  master: Formula[],
): MachinePartHistory[] {
  const matches = (name: string) => [machine.nama_mesin, machine.kode_mesin].some((alias) => normalized(alias) === normalized(name));
  const approved = approvals.filter((item) => item.status === 'APPROVED' && item.adminJustification);
  type Candidate = { name: string; position: string; date?: string; spec?: string; formula?: Formula; snapshot?: MachinePartHistory };
  const events: Candidate[] = [];
  tickets.filter((ticket) => matches(ticket.machine) && ticket.status !== 'VOID' && !ticket.isVoid).forEach((ticket) => {
    const replacement = ticket.partReplaced;
    const name = typeof replacement === 'string' ? replacement : replacement?.name;
    if (!name?.trim()) return;
    const approval = approved.find((item) => item.ticket === ticket.ticket && normalized(item.partName) === normalized(name));
    const formula = master.find((part) => part.id === approval?.adminJustification?.approvedPartId || normalized(part.name || '') === normalized(approval?.adminJustification?.standardizedName || name)) || approval?.adminJustification;
    events.push({ name, position: typeof replacement === 'object' ? replacement.position || 'Lini Produksi' : 'Lini Produksi', date: ticket.waktuSelesai || ticket.waktuMulai, spec: typeof replacement === 'object' ? replacement.specification : undefined, formula });
  });
  approved.filter((item) => matches(item.machine)).forEach((item) => {
    const formula = master.find((part) => part.id === item.adminJustification?.approvedPartId || normalized(part.name || '') === normalized(item.adminJustification?.standardizedName || item.partName)) || item.adminJustification;
    const ticket = tickets.find((ticket) => ticket.ticket === item.ticket);
    events.push({ name: item.partName, position: item.position || 'Lini Produksi', date: ticket?.waktuSelesai || item.reportedAt, spec: item.specification, formula });
  });
  monitored.filter((part) => matches(part.machine)).forEach((part) => {
    events.push({ name: part.part, position: part.position, date: part.replacedAt, spec: part.specification, formula: master.find((item) => item.id === part.id || normalized(item.name || '') === normalized(part.part)) || { intervalBasis: part.intervalBasis, defaultLifetimeDays: part.intervalTarget, partNumber: part.partNumber }, snapshot: part });
  });
  const list: MachinePartHistory[] = [];
  events.sort((a,b) => (b.date || '').localeCompare(a.date || '')).forEach((event) => {
    const name = event.formula?.standardizedName || event.formula?.name || event.name;
    if (list.some((part) => normalized(part.part) === normalized(name) && normalized(part.position) === normalized(event.position))) return;
    const target = Number(event.formula?.defaultLifetimeDays) || 0;
    const basis = event.formula?.intervalBasis || 'JAM_OPERASI';
    const parsedDate = parsePlantTime(event.date || '');
    const date = Number.isFinite(parsedDate) ? plantDate(new Date(parsedDate)) : undefined;
    const baseline = Date.parse((date || '') + 'T00:00:00+07:00');
    const now = Date.parse(plantDate() + 'T00:00:00+07:00');
    const elapsed = Number.isFinite(baseline) && baseline <= now ? Math.floor((now-baseline)/86400000) : null;
    const meter = monitored.find((part) => matches(part.machine) && normalized(part.part) === normalized(name) && normalized(part.position) === normalized(event.position) && part.replacedAt?.slice(0,10) === date);
    const meterValid = typeof meter?.installedMeterHours === 'number' && typeof meter.currentMeterHours === 'number' && meter.currentMeterHours >= meter.installedMeterHours && Boolean(meter.meterVerifiedAt);
    const usage = basis === 'KALENDER' ? elapsed ?? 0 : meterValid ? meter!.currentMeterHours! - meter!.installedMeterHours! : 0;
    const complete = target > 0 && (basis === 'KALENDER' ? elapsed !== null : meterValid);
    list.push({ id: `${machine.kode_mesin}-${name}-${event.position}`, machine: machine.nama_mesin, part: name,
      partNumber: event.formula?.partNumber, specification: event.formula?.specification || event.spec || 'Belum diisi', position: event.position,
      replacedAt: date, intervalBasis: basis, intervalTarget: target, unit: basis === 'KALENDER' ? 'Hari' : 'Jam Operasi',
      currentUsage: usage, lifetimeDays: target, usedDays: elapsed ?? undefined, isDataComplete: complete,
      installedMeterHours: meter?.installedMeterHours, currentMeterHours: meter?.currentMeterHours, meterVerifiedAt: meter?.meterVerifiedAt,
      incompleteReason: complete ? undefined : target <= 0 ? 'Menunggu rumus lifetime' : basis === 'JAM_OPERASI' ? 'Menunggu baseline dan meter jam operasi terverifikasi' : 'Tanggal pemasangan belum valid',
    });
  });
  return list;
}

export function readPartsArray(key: string) {
  try {
    const value = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
