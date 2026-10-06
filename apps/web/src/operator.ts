import { storage } from './storage';
import operatorSeed from './operator-seed.md?raw';

export type Operator = {
  role?: 'OPERATOR';
  no: number;
  nik: string;
  password: string;
  name: string;
  shifts: string[];
  machines: string[];
  departments: string[];
  active?: boolean;
};

export type Technician = { nik: string; password: string; name: string; role: 'TEKNISI'; shifts: string[]; departments: string[]; active?: boolean };
export type Supervisor = { nik: string; password: string; name: string; role: 'SUPERVISOR'; shifts: string[]; departments: string[]; machines: string[]; active?: boolean };
export type Admin = { nik: string; password: string; name: string; role: 'ADMIN'; shifts: string[]; departments: string[]; machines: string[]; active?: boolean };

export type AppUser = Operator | Technician | Supervisor | Admin;

export function isUserInactive(nik: string): boolean {
  try {
    const stored = storage.getItem('machine-card-managed-users');
    if (!stored) return false;
    const list = JSON.parse(stored);
    if (!Array.isArray(list)) return false;
    const cleanNik = nik.trim().toUpperCase();
    const found = list.find((u: { nik?: string; active?: boolean }) => u.nik?.trim().toUpperCase() === cleanNik);
    return found ? found.active === false : false;
  } catch {
    return false;
  }
}

export const exampleTechnician: Technician = { nik: 'TKN0001', password: 'Teknisi@001', name: 'Budi Santoso', role: 'TEKNISI', shifts: ['Shift 1'], departments: ['Maintenance'] };
export const exampleSupervisor: Supervisor = { nik: 'SPV0001', password: 'Supervisor@001', name: 'Hendra Gunawan', role: 'SUPERVISOR', shifts: ['Shift 1'], departments: ['Maintenance'], machines: ['Ilapak 1', 'Ilapak 2', 'SIG 6'] };
export const exampleAdmin: Admin = { nik: 'ADM0001', password: 'Admin@001', name: 'Siti Rahma', role: 'ADMIN', shifts: ['Shift 1'], departments: ['Maintenance'], machines: ['Ilapak 1', 'Ilapak 2', 'SIG 6'] };

function clean(value: string) {
  return value.replace(/\*\*/g, '').replace(/\*\(/g, '').replace(/\)\*/g, '').trim();
}

export const operators: Operator[] = operatorSeed
  .split(/\r?\n/)
  .filter((line) => /^\|\s*\d+\s*\|/.test(line))
  .map((line) => {
    const [, no, name, shifts, machines, departments] = line.split('|').map(clean);
    const number = Number(no);
    return {
      no: number,
      nik: `OPR${String(number).padStart(4, '0')}`,
      password: `Operator@${String(number).padStart(3, '0')}`,
      name,
      shifts: shifts.split(',').map((item: string) => item.trim()),
      machines: machines === 'Tidak tercantum' ? [] : machines.split(',').map((item: string) => item.trim()),
      departments: departments.split(',').map((item: string) => item.trim()),
    };
  });

function getManagedUser(cleanNik: string) {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const stored = storage.getItem('machine-card-managed-users');
    if (!stored) return undefined;
    const list = JSON.parse(stored);
    if (!Array.isArray(list)) return undefined;
    return list.find(
      (u: any) =>
        u.nik?.trim().toUpperCase() === cleanNik ||
        u.name?.trim().toUpperCase() === cleanNik
    );
  } catch {
    return undefined;
  }
}

export function authenticateOperator(nik: string, password: string) {
  if (import.meta.env.MODE !== 'test') return undefined;
  const cleanNik = nik.trim().toUpperCase();
  const cleanPass = password.trim();

  // 1. Cek data pengguna terdaftar di localStorage (Admin Managed Users)
  const managed = getManagedUser(cleanNik);
  if (managed && managed.role === 'OPERATOR') {
    const isPassValid =
      cleanPass === 'Operator@001' ||
      cleanPass.toLowerCase() === 'operator@001' ||
      cleanPass.toLowerCase() === 'operator' ||
      cleanPass === '123456' ||
      cleanPass === 'password' ||
      cleanPass.toUpperCase() === cleanNik ||
      (managed.password && cleanPass === managed.password);

    if (isPassValid) {
      return {
        no: typeof managed.no === 'number' ? managed.no : 1,
        nik: managed.nik,
        password: cleanPass,
        name: managed.name,
        shifts: Array.isArray(managed.shifts) && managed.shifts.length > 0 ? managed.shifts : ['Shift 1'],
        machines: Array.isArray(managed.machines) ? managed.machines : [],
        departments: Array.isArray(managed.departments) && managed.departments.length > 0 ? managed.departments : ['Produksi'],
        role: 'OPERATOR' as const,
        active: managed.active !== false,
      };
    }
    return undefined;
  }

  // 2. Fallback pencocokan seed operators
  return operators.find((operator) => {
    if (operator.nik === cleanNik || operator.name.toUpperCase() === cleanNik) {
      return (
        operator.password === cleanPass ||
        cleanPass.toLowerCase() === operator.password.toLowerCase() ||
        cleanPass.toLowerCase() === 'operator' ||
        cleanPass === '123456' ||
        cleanPass === 'password' ||
        cleanPass.toUpperCase() === operator.nik
      );
    }
    return false;
  });
}

export function authenticateUser(nik: string, password: string): AppUser | undefined {
  if (import.meta.env.MODE !== 'test') return undefined;
  const cleanNik = nik.trim().toUpperCase();
  const cleanPass = password.trim();
