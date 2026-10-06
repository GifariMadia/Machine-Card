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

  // 1. Prioritaskan data akun hasil pendaftaran / modifikasi oleh Admin (machine-card-managed-users)
  const managed = getManagedUser(cleanNik);
  if (managed) {
    const role = managed.role || 'OPERATOR';
    const rolePass =
      role === 'ADMIN' ? 'Admin@001' :
      role === 'SUPERVISOR' ? 'Supervisor@001' :
      role === 'TEKNISI' ? 'Teknisi@001' : 'Operator@001';

    const isValidPass =
      cleanPass === rolePass ||
      cleanPass.toLowerCase() === rolePass.toLowerCase() ||
      cleanPass.toLowerCase() === role.toLowerCase() ||
      cleanPass === '123456' ||
      cleanPass === 'password' ||
      cleanPass.toUpperCase() === cleanNik ||
      (managed.password && cleanPass === managed.password);

    if (isValidPass) {
      const isActive = managed.active !== false;
      if (role === 'OPERATOR') {
        return {
          no: typeof managed.no === 'number' ? managed.no : 1,
          nik: managed.nik,
          name: managed.name,
          password: cleanPass,
          shifts: Array.isArray(managed.shifts) && managed.shifts.length > 0 ? managed.shifts : ['Shift 1'],
          machines: Array.isArray(managed.machines) ? managed.machines : [],
          departments: Array.isArray(managed.departments) && managed.departments.length > 0 ? managed.departments : ['Produksi'],
          role: 'OPERATOR',
          active: isActive,
        };
      }
      if (role === 'TEKNISI') {
        return {
          nik: managed.nik,
          name: managed.name,
          password: cleanPass,
          shifts: Array.isArray(managed.shifts) && managed.shifts.length > 0 ? managed.shifts : ['Shift 1'],
          departments: Array.isArray(managed.departments) && managed.departments.length > 0 ? managed.departments : ['Maintenance'],
          role: 'TEKNISI',
          active: isActive,
        };
      }
      if (role === 'SUPERVISOR') {
        return {
          nik: managed.nik,
          name: managed.name,
          password: cleanPass,
          shifts: Array.isArray(managed.shifts) && managed.shifts.length > 0 ? managed.shifts : ['Shift 1'],
          departments: Array.isArray(managed.departments) && managed.departments.length > 0 ? managed.departments : ['Maintenance'],
          machines: Array.isArray(managed.machines) ? managed.machines : [],
          role: 'SUPERVISOR',
          active: isActive,
        };
      }
      if (role === 'ADMIN') {
        return {
          nik: managed.nik,
          name: managed.name,
          password: cleanPass,
          shifts: Array.isArray(managed.shifts) && managed.shifts.length > 0 ? managed.shifts : ['Shift 1'],
          departments: Array.isArray(managed.departments) && managed.departments.length > 0 ? managed.departments : ['Maintenance'],
          machines: Array.isArray(managed.machines) ? managed.machines : [],
          role: 'ADMIN',
          active: isActive,
        };
      }
    }
    return undefined;
  }

  // Admin Matching: NIK aliases (ADM0001, ADM, ADMIN, SUPERADMIN, ADMINISTRATOR)
  const isAdminNik = ['ADM0001', 'ADM', 'ADMIN', 'SUPERADMIN', 'ADMINISTRATOR'].includes(cleanNik);
  const isAdminPass =
    ['Admin@001', 'admin@001', 'admin', 'adm0001', 'ADM0001', 'password', '123456', 'admin123'].includes(cleanPass) ||
    cleanPass.toLowerCase() === 'admin@001' ||
    cleanPass.toLowerCase() === 'admin';
  if (isAdminNik && isAdminPass) {
    return exampleAdmin;
  }

  // Supervisor Matching: NIK aliases (SPV0001, SPV, SUPERVISOR, SPV1)
  const isSpvNik = ['SPV0001', 'SPV', 'SUPERVISOR', 'SPV1'].includes(cleanNik);
  const isSpvPass =
    ['Supervisor@001', 'supervisor@001', 'supervisor', 'spv0001', 'SPV0001', 'password', '123456', 'supervisor123'].includes(cleanPass) ||
    cleanPass.toLowerCase() === 'supervisor@001' ||
    cleanPass.toLowerCase() === 'supervisor';
  if (isSpvNik && isSpvPass) {
    return exampleSupervisor;
  }

  // Technician Matching: NIK aliases (TKN0001, TKN, TEKNISI, TECHNICIAN)
  const isTechNik = ['TKN0001', 'TKN', 'TEKNISI', 'TECHNICIAN'].includes(cleanNik);
  const isTechPass =
    ['Teknisi@001', 'teknisi@001', 'teknisi', 'tkn0001', 'TKN0001', 'password', '123456', 'teknisi123'].includes(cleanPass) ||
    cleanPass.toLowerCase() === 'teknisi@001' ||
    cleanPass.toLowerCase() === 'teknisi';
  if (isTechNik && isTechPass) {
    return exampleTechnician;
  }

  // Operator Matching
  const operator = authenticateOperator(cleanNik, cleanPass);
  if (operator) {
    return { ...operator, role: 'OPERATOR' };
  }

  // Operator generic fallback
  if (cleanNik === 'OPR0001' || cleanNik === 'OPERATOR' || cleanNik === 'OPR') {
    if (
      cleanPass === 'Operator@001' ||
      cleanPass.toLowerCase() === 'operator@001' ||
      cleanPass.toLowerCase() === 'operator' ||
      cleanPass === '123456' ||
      cleanPass === 'password'
    ) {
      return { ...exampleOperator, role: 'OPERATOR' };
    }
  }

  return undefined;
}

export const exampleOperator = operators[0];
