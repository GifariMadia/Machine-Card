// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SupervisorPMPlanner from './SupervisorPMPlanner';
import type { Machine } from './data';
import type { PreventiveMaintenanceItem } from './SupervisorDashboard';

afterEach(cleanup);
const machines: Machine[] = [{ id_mesin: 1, kode_mesin: 'ILA-01', nama_mesin: 'Ilapak 1', kategori: 'Filling', status: 'AKTIF', jumlah_part: 0 }];
const scheduled: PreventiveMaintenanceItem = { id: 'pm-1', nomorPm: 'PM-001', machine: 'Ilapak 1', kodeMesin: 'ILA-01', section: 'Filling', periode: 'Mingguan', kegiatan: 'Periksa bearing', tanggalJatuhTempo: '2026-10-27', status: 'TERJADWAL' };

it('membuat jadwal PM dengan identitas mesin dan kegiatan supervisor', () => {
  const save = vi.fn();
  render(<SupervisorPMPlanner schedules={[]} machines={machines} actor="Supervisor" onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: /Buat Jadwal PM/i }));
  fireEvent.change(screen.getByLabelText('Mesin'), { target: { value: 'ILA-01' } });
  fireEvent.change(screen.getByLabelText('Kegiatan PM'), { target: { value: 'Periksa bearing' } });
  fireEvent.change(screen.getByLabelText('Tanggal pelaksanaan'), { target: { value: '2026-10-27' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan Jadwal PM' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ machine: 'Ilapak 1', kodeMesin: 'ILA-01', kegiatan: 'Periksa bearing', status: 'TERJADWAL', tanggalJatuhTempo: '2026-10-27' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('merekam alasan dan otorisator saat supervisor menjadwalkan ulang', () => {
  const save = vi.fn();
  render(<SupervisorPMPlanner schedules={[scheduled]} machines={machines} actor="Hendra (SPV)" onSave={save} />);
  fireEvent.change(screen.getByLabelText('Pilih jadwal PM untuk diubah'), { target: { value: 'pm-1' } });
  fireEvent.change(screen.getByLabelText('Tanggal pelaksanaan'), { target: { value: '2026-10-29' } });
  fireEvent.change(screen.getByLabelText('Alasan perubahan'), { target: { value: 'Menyesuaikan jadwal produksi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan Jadwal PM' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'pm-1', status: 'DIRESCHEDULE', riwayatReschedule: [expect.objectContaining({ tanggalSebelumnya: '2026-10-27', tanggalBaru: '2026-10-29', diubahOleh: 'Hendra (SPV)', alasan: 'Menyesuaikan jadwal produksi' })] }));
});

it('mempertahankan formulir saat penyimpanan gagal', () => {
  render(<SupervisorPMPlanner schedules={[scheduled]} machines={machines} actor="Supervisor" onSave={() => { throw new Error('storage'); }} />);
  fireEvent.change(screen.getByLabelText('Pilih jadwal PM untuk diubah'), { target: { value: 'pm-1' } });
  fireEvent.change(screen.getByLabelText('Alasan perubahan'), { target: { value: 'Koreksi kegiatan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan Jadwal PM' }));
  expect(screen.getByRole('alert').textContent).toContain('belum tersimpan');
  expect(screen.getByRole('dialog')).toBeTruthy();
});
