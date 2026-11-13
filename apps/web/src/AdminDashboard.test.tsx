// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';
import { exampleAdmin } from './operator';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AdminDashboard & RBAC Management Portal (Peran Admin)', () => {
  it('merender info admin, status superadmin, dan ringkasan KPI global', () => {
    const onLogout = vi.fn();
    render(<AdminDashboard admin={exampleAdmin} onLogout={onLogout} />);

    // Topbar context
    expect(screen.getByText('BINTANG TOEDJOE')).toBeTruthy();
    expect(screen.getByText(/Portal Administrasi & RBAC/i)).toBeTruthy();
    expect(screen.getAllByText(exampleAdmin.name).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Pulogadung Central')).toBeTruthy();

    // Global KPI Metrics
    expect(screen.getByText('Total Pengguna')).toBeTruthy();
    expect(screen.getByText('Mesin Aktif')).toBeTruthy();
    expect(screen.getByText('Master Part')).toBeTruthy();
    expect(screen.getByText('Log Audit Sistem')).toBeTruthy();

    // 4 Main Tabs
    expect(screen.getByRole('tab', { name: /Pengguna & RBAC/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Master Mesin/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Master Part & Lifetime/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Log Audit Sistem & Keamanan/i })).toBeTruthy();
  });

  it('dapat melakukan filter dan pencarian pengguna berdasarkan peran RBAC', () => {
    const onLogout = vi.fn();
    render(<AdminDashboard admin={exampleAdmin} onLogout={onLogout} />);

    // Search user
    const searchInput = screen.getByLabelText(/Cari pengguna/i);
    fireEvent.change(searchInput, { target: { value: 'Budi Santoso' } });

    expect(screen.getByText('Budi Santoso')).toBeTruthy();
    expect(screen.getByText('TEKNISI')).toBeTruthy();

    // Clear search
    const clearBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(clearBtn);

    // Filter by role: Operator
    const operatorFilterBtn = screen.getByRole('button', { name: /^Operator/i });
    fireEvent.click(operatorFilterBtn);

    expect(screen.getAllByText('OPERATOR').length).toBeGreaterThan(0);
  });

  it('menampilkan akses terbuka seluruh mesin plant tanpa pembatasan per operator dan dapat mengedit profil/shift pengguna', () => {
    const onLogout = vi.fn();
    render(<AdminDashboard admin={exampleAdmin} onLogout={onLogout} />);

    // Pastikan tombol pembatasan "Atur Mesin" sudah dicabut
    expect(screen.queryByRole('button', { name: /Atur Mesin/i })).toBeNull();
    expect(screen.getAllByText(/Seluruh Mesin Plant/i).length).toBeGreaterThan(0);

    // Klik "Edit Profil" pada pengguna pertama
    const editButtons = screen.getAllByRole('button', { name: /Edit Profil/i });
    expect(editButtons.length).toBeGreaterThan(0);
    fireEvent.click(editButtons[0]);

    // Drawer Edit Profil & Penugasan Shift terbuka
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Edit Profil & Penugasan Shift/i)).toBeTruthy();
    expect(screen.getByText(/Kebijakan Akses Mesin Terbuka:/i)).toBeTruthy();

    // Ubah shift kerja
    const shiftSelect = screen.getByLabelText(/Shift Kerja Aktif/i);
    fireEvent.change(shiftSelect, { target: { value: 'Shift 2' } });

    // Simpan perubahan profil
    const saveBtn = screen.getByRole('button', { name: /Simpan Perubahan Profil/i });
    fireEvent.click(saveBtn);

    // Drawer tertutup
    expect(screen.queryByText(/Edit Profil & Penugasan Shift/i)).toBeNull();
  });

  it('dapat mendaftarkan pengguna baru dengan peran tertentu', () => {
    const onLogout = vi.fn();
    render(<AdminDashboard admin={exampleAdmin} onLogout={onLogout} />);

    // Open add user modal
    const addBtn = screen.getByRole('button', { name: /Tambah Pengguna/i });
    fireEvent.click(addBtn);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Tambah Pengguna Baru/i)).toBeTruthy();

    // Fill form
    const nikInput = screen.getByPlaceholderText(/Contoh: OPR0099 atau TKN0005/i);
    fireEvent.change(nikInput, { target: { value: 'OPR9999' } });

    const nameInput = screen.getByPlaceholderText(/Nama lengkap karyawan/i);
    fireEvent.change(nameInput, { target: { value: 'Karyawan Baru Testing' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Daftarkan Pengguna/i });
    fireEvent.click(submitBtn);

    // Verify added to table
    expect(screen.getByText('OPR9999')).toBeTruthy();
    expect(screen.getByText('Karyawan Baru Testing')).toBeTruthy();
  });

  it('dapat mengelola master data mesin dan mengubah status operasional mesin', () => {
    const onLogout = vi.fn();
    render(<AdminDashboard admin={exampleAdmin} onLogout={onLogout} />);

    // Switch to Master Mesin Tab
    const mesinTab = screen.getByRole('tab', { name: /Master Mesin/i });
    fireEvent.click(mesinTab);

    expect(screen.getByText(/SECTION \/ LINI PRODUKSI/i)).toBeTruthy();
    expect(screen.getByText('Ilapak 1')).toBeTruthy();

    // Toggle status on first machine
    const toggleButtons = screen.getAllByRole('button', { name: /Set Nonaktif/i });
    expect(toggleButtons.length).toBeGreaterThan(0);
    fireEvent.click(toggleButtons[0]);

    // Should now show Set Beroperasi
    expect(screen.getAllByRole('button', { name: /Set Beroperasi/i }).length).toBeGreaterThan(0);
  });

  it('dapat melihat dan mengubah batas aturan lifetime spare part di tab Master Part & Lifetime', () => {
    const onLogout = vi.fn();
    render(<AdminDashboard admin={exampleAdmin} onLogout={onLogout} />);

    // Switch to Parts Tab
    const partsTab = screen.getByRole('tab', { name: /Master Part & Lifetime/i });
    fireEvent.click(partsTab);

    expect(screen.getByText(/Aturan Batas Monitoring Lifetime Spare Part/i)).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();

    // Click "Ubah Batas"
    const editBtn = screen.getByRole('button', { name: /Ubah Batas/i });
    fireEvent.click(editBtn);

    // Save button should appear
    expect(screen.getByRole('button', { name: /Simpan Aturan/i })).toBeTruthy();
  });

  it('dapat melihat log audit sistem & keamanan di tab Audit', () => {
    const onLogout = vi.fn();
    render(<AdminDashboard admin={exampleAdmin} onLogout={onLogout} />);

    // Switch to Audit Tab
    const auditTab = screen.getByRole('tab', { name: /Log Audit Sistem/i });
    fireEvent.click(auditTab);

    expect(screen.getByText(/Log Audit Aktivitas Sistem/i)).toBeTruthy();
    expect(screen.getByText('LOG-20261025-08')).toBeTruthy();
    expect(screen.getByText(/Justifikasi & Standarisasi Part Baru/i)).toBeTruthy();
