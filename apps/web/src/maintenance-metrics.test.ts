import { expect, it } from 'vitest';
import { isUnfinished, pmCompliance, repairMinutes, operationalDate } from './maintenance-metrics';

it('menghitung pending dan menunggu part sebagai pekerjaan belum selesai', () => {
  for (const status of ['OPEN', 'IN_PROGRESS', 'PENDING', 'MENUNGGU_PART', 'MENUNGGU_DUKUNGAN', 'HANDOVER']) expect(isUnfinished({ status })).toBe(true);
  expect(isUnfinished({ status: 'SELESAI_PERBAIKAN' })).toBe(false);
  expect(isUnfinished({ status: 'OPEN', isVoid: true })).toBe(false);
});
it('tidak mengarang durasi dan mempertahankan nilai nol yang valid', () => {
  expect(repairMinutes({})).toBeNull();
  expect(repairMinutes({ durasiPerbaikanMenit: 0 })).toBe(0);
  expect(repairMinutes({ waktuMulaiTeknisi: '2026-10-26T10:00:00+07:00', waktuSelesai: '2026-10-26T11:00:00+07:00', durasiTungguMenit: 20 })).toBe(40);
});
it('PM masa depan tidak mempengaruhi compliance dan selesai terlambat tidak dianggap tepat waktu', () => {
  expect(pmCompliance([], '2026-10-26').percent).toBeNull();
  expect(pmCompliance([
    { status: 'SELESAI', tanggalJatuhTempo: '2026-10-20', tanggalSelesaiAktual: '2026-10-21' },
    { status: 'SELESAI', tanggalJatuhTempo: '2026-10-21', tanggalSelesaiAktual: '2026-10-21' },
    { status: 'TERJADWAL', tanggalJatuhTempo: '2026-10-31' },
  ], '2026-10-26')).toEqual({ due: 2, onTime: 1, percent: 50 });
});
it('tanggal operasional shift malam mempertahankan tanggal asal sesudah tengah malam', () => {
  expect(operationalDate('2026-10-27T01:00:00+07:00', '3')).toBe('2026-10-26');
});
