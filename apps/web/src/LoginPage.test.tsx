// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from './LoginPage';
import {
  exampleOperator,
  exampleTechnician,
  exampleSupervisor,
  exampleAdmin,
} from './operator';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
});

describe('LoginPage Bintang Toedjoe & Kalbe Panca Sradha (Multi-Role RBAC)', () => {
  it('merender judul Bintang Toedjoe dan butir Kalbe Panca Sradha (1 sampai 5)', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    expect(screen.getByRole('heading', { name: /BINTANG TOEDJOE/i })).toBeTruthy();
    expect(screen.getByText(/KALBE PANCA SRADHA/i)).toBeTruthy();

    // Butir 1 - 5
    expect(screen.getByText(/Trust is the glue of life/i)).toBeTruthy();
    expect(screen.getByText(/saling percaya adalah perekat diantara kami/i)).toBeTruthy();
    expect(screen.getByText(/Mindfulness is the foundation of our action/i)).toBeTruthy();
    expect(screen.getByText(/kesadaran penuh adalah dasar setiap tindakan kami/i)).toBeTruthy();
    expect(screen.getByText(/Innovation is the key of our success/i)).toBeTruthy();
    expect(screen.getByText(/inovasi adalah kunci keberhasilan kami/i)).toBeTruthy();
    expect(screen.getByText(/Strive to be the best/i)).toBeTruthy();
    expect(screen.getByText(/bertekad untuk menjadi yang terbaik/i)).toBeTruthy();
    expect(screen.getByText(/Interconnectedness is a universal way of life/i)).toBeTruthy();
    expect(screen.getByText(/saling keterkaitan adalah panduan hidup kami/i)).toBeTruthy();
  });

  it('merender Visi & Misi Bintang Toedjoe', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    expect(screen.getByText(/^Vision$/i)).toBeTruthy();
    expect(screen.getByText(/Menjadi perusahaan produk kesehatan/i)).toBeTruthy();
    expect(screen.getByText(/^Mission$/i)).toBeTruthy();
    expect(screen.getByText(/Untuk memberikan kesehatan bagi semua orang/i)).toBeTruthy();
  });

  it('merender form login terpadu dengan field NIK, Password, dan tombol LOGIN tanpa tab peran buatan', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    expect(screen.getByRole('heading', { name: /MACHINE CARD/i })).toBeTruthy();
    expect(screen.getByLabelText(/EMAIL \/ EMPLOYEE ID/i)).toBeTruthy();
    expect(screen.getByLabelText(/^PASSWORD$/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^LOGIN$/i })).toBeTruthy();
    // Memastikan tab buatan operator/teknisi sudah tidak ada di DOM
    expect(screen.queryByRole('tab', { name: /Operator/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Teknisi/i })).toBeNull();
  });

  it('menampilkan pesan validasi jika field kosong', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.click(screen.getByRole('button', { name: /^LOGIN$/i }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Mohon lengkapi NIK dan kata sandi Anda/i)).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('menampilkan pesan kesalahan jika kredensial salah', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/EMAIL \/ EMPLOYEE ID/i), { target: { value: 'OPR9999' } });
    fireEvent.change(screen.getByLabelText(/^PASSWORD$/i), { target: { value: 'pass_salah' } });
    fireEvent.click(screen.getByRole('button', { name: /^LOGIN$/i }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/NIK atau kata sandi tidak sesuai/i)).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('dapat login sebagai Operator dengan kredensial valid dan mengingat NIK di localStorage', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/EMAIL \/ EMPLOYEE ID/i), { target: { value: exampleOperator.nik } });
    fireEvent.change(screen.getByLabelText(/^PASSWORD$/i), { target: { value: exampleOperator.password } });

    const rememberCheckbox = screen.getByLabelText(/Ingat saya di perangkat ini/i) as HTMLInputElement;
    fireEvent.click(rememberCheckbox);

    fireEvent.click(screen.getByRole('button', { name: /^LOGIN$/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
        nik: exampleOperator.nik,
        name: exampleOperator.name,
      }));
      expect(localStorage.getItem('machine-card-employee-id')).toBe(exampleOperator.nik);
    });
  });

  it('dapat login sebagai Teknisi dengan kredensial valid', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/EMAIL \/ EMPLOYEE ID/i), { target: { value: exampleTechnician.nik } });
    fireEvent.change(screen.getByLabelText(/^PASSWORD$/i), { target: { value: exampleTechnician.password } });
    fireEvent.click(screen.getByRole('button', { name: /^LOGIN$/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
        nik: exampleTechnician.nik,
        role: 'TEKNISI',
        name: 'Budi Santoso',
      }));
    });
  });

  it('dapat login sebagai Supervisor dengan kredensial valid', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/EMAIL \/ EMPLOYEE ID/i), { target: { value: exampleSupervisor.nik } });
    fireEvent.change(screen.getByLabelText(/^PASSWORD$/i), { target: { value: exampleSupervisor.password } });
    fireEvent.click(screen.getByRole('button', { name: /^LOGIN$/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
        nik: exampleSupervisor.nik,
        role: 'SUPERVISOR',
        name: 'Hendra Gunawan',
      }));
    });
  });

  it('dapat login sebagai Admin dengan kredensial valid', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/EMAIL \/ EMPLOYEE ID/i), { target: { value: exampleAdmin.nik } });
    fireEvent.change(screen.getByLabelText(/^PASSWORD$/i), { target: { value: exampleAdmin.password } });
    fireEvent.click(screen.getByRole('button', { name: /^LOGIN$/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
        nik: exampleAdmin.nik,
        role: 'ADMIN',
        name: 'Siti Rahma',
      }));
    });
  });

  it('dapat menampilkan dan menyembunyikan password', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    const passInput = screen.getByLabelText(/^PASSWORD$/i) as HTMLInputElement;
    expect(passInput.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /Lihat password/i });
    fireEvent.click(toggleBtn);
    expect(passInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /Sembunyikan password/i }));
    expect(passInput.type).toBe('password');
  });

  it('menolak login jika akun berstatus nonaktif sesuai URS 1.2', async () => {
    const onLogin = vi.fn();
    // Simulasikan akun teknisi dinonaktifkan di master data
    localStorage.setItem(
      'machine-card-managed-users',
      JSON.stringify([
        {
          id: 'usr-tkn-1',
          nik: exampleTechnician.nik,
          name: exampleTechnician.name,
          role: 'TEKNISI',
          active: false,
        },
      ])
    );

    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/EMAIL \/ EMPLOYEE ID/i), { target: { value: exampleTechnician.nik } });
    fireEvent.change(screen.getByLabelText(/^PASSWORD$/i), { target: { value: exampleTechnician.password } });
    fireEvent.click(screen.getByRole('button', { name: /^LOGIN$/i }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Akses ditolak: Akun Anda berstatus nonaktif/i)).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
  });
});
