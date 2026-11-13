// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { exampleSupervisor, exampleAdmin, exampleTechnician, exampleOperator } from './operator';

describe('App Root Render Test', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('renders LoginPage when no user session exists', () => {
    render(<App />);
    expect(screen.getAllByText(/BINTANG TOEDJOE/i).length).toBeGreaterThan(0);
  });

  it('renders SupervisorDashboard when supervisor session exists', async () => {
    sessionStorage.setItem('machine-card-session', JSON.stringify(exampleSupervisor));
    render(<App />);
    const elements = await screen.findAllByText(/Portal Pengawasan Supervisor/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('renders AdminDashboard when admin session exists', async () => {
    sessionStorage.setItem('machine-card-session', JSON.stringify(exampleAdmin));
    render(<App />);
    const elements = await screen.findAllByText(/Portal Administrasi/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('renders TechnicianDashboard when technician session exists', async () => {
    sessionStorage.setItem('machine-card-session', JSON.stringify(exampleTechnician));
    render(<App />);
    const elements = await screen.findAllByText(/Teknisi/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('renders OperatorDashboard when operator session exists', async () => {
    sessionStorage.setItem('machine-card-session', JSON.stringify(exampleOperator));
    render(<App />);
    const elements = await screen.findAllByText(/Operator/i);
    expect(elements.length).toBeGreaterThan(0);
  });
});
