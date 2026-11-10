import { expect, it } from 'vitest';
import { machineTicketStatus } from './machine-ticket-status';

it('tidak menyatakan mesin normal ketika perbaikan selesai tetapi operator belum konfirmasi', () => {
  expect(machineTicketStatus([{ status: 'SELESAI_PERBAIKAN' }])).toMatchObject({ tone: 'pending', label: 'Menunggu konfirmasi Operator' });
});

it.each(['OPEN', 'IN_PROGRESS', 'PENDING', 'MENUNGGU_PART', 'MENUNGGU_DUKUNGAN', 'HANDOVER'])('memprioritaskan gangguan %s di atas tiket selesai perbaikan', (status) => {
  expect(machineTicketStatus([{ status: 'SELESAI_PERBAIKAN' }, { status }])).toMatchObject({ tone: 'breakdown', ticket: { status } });
});

it('penutupan tiket dan ketiadaan tiket bukan bukti kondisi operasional real-time', () => {
  for (const tickets of [[], [{ status: 'CLOSED' }], [{ status: 'VOID' }], [{ status: 'OPEN', isVoid: true }]]) {
    expect(machineTicketStatus(tickets)).toEqual({ label: 'Tidak ada tiket gangguan aktif', tone: 'neutral', ticket: undefined });
  }
});
