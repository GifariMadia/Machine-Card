import { describe, expect, it } from 'vitest';
import { getMachineParts } from './machine-parts';
import type { SupervisorWorkTicket } from './SupervisorDashboard';

const machine = { nama_mesin: 'Ilapak 1', kode_mesin: 'ILA-01' };
const master = [{ id: 'PART-001', name: 'Pisau Dapur', intervalBasis: 'KALENDER' as const, defaultLifetimeDays: 90, specification: '20cm' }];
const ticket = { ticket: 'OW-TEST', machine: ' ILA-01 ', status: 'CLOSED', waktuSelesai: '2026-10-26T10:00:00', partReplaced: { name: 'Pisau Dapur', position: 'Line 1' } } as SupervisorWorkTicket;

describe('hubungan penggantian part dan mesin', () => {
  it('menggunakan rumus master untuk penggantian part terdaftar tanpa justifikasi baru', () => {
    expect(getMachineParts(machine, [], [ticket], [], master)).toMatchObject([{
      part: 'Pisau Dapur', intervalBasis: 'KALENDER', intervalTarget: 90,
      position: 'Line 1', replacedAt: '2026-10-26', specification: '20cm', isDataComplete: true,
    }]);
  });

  it('menampilkan penggantian yang disetujui meski snapshot tiket tidak memiliki part', () => {
    const approvals = [{ id: 'JUSTIF-1', machine: 'Ilapak 1', ticket: 'OW-TEST', status: 'APPROVED', partName: 'Pisau Dapur', position: 'Line 1', adminJustification: { standardizedName: 'Pisau Dapur', intervalBasis: 'KALENDER' as const, defaultLifetimeDays: 120 } }];
    expect(getMachineParts(machine, [], [], approvals, [])[0].intervalTarget).toBe(120);
  });

  it('tidak menghubungkan katalog master atau penggantian Ilapak 20 ke Ilapak 1', () => {
    expect(getMachineParts(machine, [], [], [], master)).toEqual([]);
    expect(getMachineParts(machine, [], [{ ...ticket, machine: 'Ilapak 20' }], [], master)).toEqual([]);
  });

  it('tidak menghitung tiket batal atau mengarang rumus yang belum ditetapkan', () => {
    expect(getMachineParts(machine, [], [{ ...ticket, isVoid: true }], [], master)).toEqual([]);
    expect(getMachineParts(machine, [], [ticket], [], [])[0]).toMatchObject({ intervalTarget: 0, isDataComplete: false });
  });
});
