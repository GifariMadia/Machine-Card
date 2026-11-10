// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { authenticateOperator, authenticateUser, operators } from './operator';

describe('operator authorization seed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('memuat 128 operator dengan NIK unik', () => {
    expect(operators).toHaveLength(128);
    expect(new Set(operators.map((operator) => operator.nik)).size).toBe(128);
  });

  it('mengautentikasi operator dan mempertahankan scope mesin', () => {
    const operator = authenticateOperator('opr0001', 'Operator@001');
    expect(operator?.name).toBe('A. Dahlan');
    expect(operator?.machines).toContain('Ilapak 1');
    expect(operator?.departments).toEqual(['Filling']);
  });

  it('menolak kata sandi yang salah', () => {
    expect(authenticateOperator('OPR0001', 'salah')).toBeUndefined();
  });

  it('memprioritaskan nama dan akun baru yang didaftarkan Admin di machine-card-managed-users', () => {
    // Simulasikan pendaftaran akun baru oleh Admin
    const managedUsers = [
      {
        id: 'usr-1',
        nik: 'OPR0002',
        name: 'Budi Hartono Baru (Admin Input)',
        role: 'OPERATOR',
        departments: ['Produksi'],
        shifts: ['Shift 2'],
        machines: ['Ilapak 1', 'Ilapak 2'],
        active: true,
      },
      {
        id: 'usr-2',
        nik: 'OPR9999',
        name: 'Karyawan Tambahan Khusus',
        role: 'OPERATOR',
        departments: ['Produksi'],
        shifts: ['Shift 1'],
        machines: [],
        active: true,
      },
    ];
    localStorage.setItem('machine-card-managed-users', JSON.stringify(managedUsers));

    // NIK OPR0002 harus menghasilkan nama baru dari Admin, BUKAN nama dari seed lama
    const user1 = authenticateUser('OPR0002', 'Operator@001');
    expect(user1).toBeDefined();
    expect(user1?.name).toBe('Budi Hartono Baru (Admin Input)');
    expect(user1?.shifts).toEqual(['Shift 2']);

    // NIK OPR9999 yang tidak ada di seed juga harus berhasil login
    const user2 = authenticateUser('OPR9999', '123456');
    expect(user2).toBeDefined();
    expect(user2?.name).toBe('Karyawan Tambahan Khusus');
  });
});
