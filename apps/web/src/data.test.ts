import { describe, expect, it } from 'vitest';
import { fallbackMachines } from './data';

describe('machine seed', () => {
  it('memuat tepat 43 mesin dengan kode unik', () => {
    expect(fallbackMachines).toHaveLength(43);
    expect(new Set(fallbackMachines.map((item) => item.kode_mesin)).size).toBe(43);
  });
});
