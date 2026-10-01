import { storage } from './storage';
export type Machine = {
  id_mesin: number;
  kode_mesin: string;
  nama_mesin: string;
  kategori: string;
  status: 'AKTIF' | 'NONAKTIF';
  jumlah_part: number;
  area?: string;
  line?: string;
  lokasi?: string;
};

const source = [
  ['CHI-01', 'Chimei 10A/Jinsung 3', 'Chimei'], ['CHI-02', 'Chimei 11A/Jinsung 4', 'Chimei'],
  ['CHI-03', 'Chimei 12A/Jinsung 1', 'Chimei'], ['CHI-04', 'Chimei 1B/SIG 6', 'Chimei'],
  ['CHI-05', 'Chimei 4/Yonan', 'Chimei'], ['CHI-06', 'Chimei 4B/Jinsung 2', 'Chimei'],
  ['CHI-07', 'Chimei 5A/Ilapak 5', 'Chimei'], ['CHI-08', 'Chimei 5B/Unifill B', 'Chimei'],
  ['CHI-09', 'Chimei 6/Ilapak 1', 'Chimei'], ['CHI-10', 'Chimei 8A/Ilapak 8', 'Chimei'],
  ['CHI-11', 'Chimei 9A/Ilapak 11', 'Chimei'],
  ...Array.from({ length: 12 }, (_, i) => [`ILA-${String(i + 1).padStart(2, '0')}`, `Ilapak ${i + 1}`, 'Ilapak']),
  ...Array.from({ length: 5 }, (_, i) => [`JIN-${String(i + 1).padStart(2, '0')}`, `Jinsung ${i + 1}`, 'Jinsung & Jih Cheng']),
  ['JHC-01', 'Jih Cheng Tube', 'Jinsung & Jih Cheng'],
  ['ST-03', 'ST 3 RCL 3', 'ST (Sachet)'], ['ST-04', 'ST 4 RCL 1', 'ST (Sachet)'],
  ['ST-06', 'ST 6 RCL 3', 'ST (Sachet)'], ['ST-10', 'ST 10 RCL 1', 'ST (Sachet)'],
  ['ST-12', 'ST 12 RCL 1', 'ST (Sachet)'], ['ST-15', 'ST 15 RCL 1', 'ST (Sachet)'],
  ['SIG-05', 'SIG 5', 'SIG & JOYEA'], ['SIG-06', 'SIG 6', 'SIG & JOYEA'],
  ['JOY-01', 'JOYEA', 'SIG & JOYEA'], ['JOY-02', 'JOYEA Cartoning', 'SIG & JOYEA'],
  ['OTH-01', 'Filling Liquid 1', 'Lainnya'], ['OTH-02', 'MT Silverson', 'Lainnya'],
  ['OTH-03', 'Temach', 'Lainnya'], ['OTH-04', 'Unifill B', 'Lainnya'],
] as const;

export const fallbackMachines: Machine[] = source.map(([kode, nama, kategori], index) => {
  const lineMatch = nama.match(/(?:Ilapak|Chimei|ST|SIG|Jinsung)\s*(\d+[A-Za-z]?)/i);
  const inferredLine = lineMatch ? `Line ${lineMatch[1]}` : `Line ${kode}`;
  return {
    id_mesin: index + 1,
    kode_mesin: kode,
    nama_mesin: nama,
    kategori,
    status: 'AKTIF',
    jumlah_part: 0,
    area: 'Produksi Pulogadung',
    line: inferredLine,
    lokasi: 'Gedung Produksi',
  };
});

export const categories = ['Semua kategori', 'Chimei', 'Ilapak', 'Jinsung & Jih Cheng', 'ST (Sachet)', 'SIG & JOYEA', 'Lainnya'];

export const MACHINE_STORAGE_KEY = 'machine-card-machines';

export function getStoredMachines(): Machine[] {
  try {
    const stored = storage.getItem(MACHINE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return fallbackMachines;
}

export function saveStoredMachines(machines: Machine[]): void {
  try {
    const serialized = JSON.stringify(machines);
    const existing = storage.getItem(MACHINE_STORAGE_KEY);
    if (existing === serialized) return;
    storage.setItem(MACHINE_STORAGE_KEY, serialized);
    window.dispatchEvent(new CustomEvent('mc-machines-updated', { detail: machines }));
  } catch {}
}
