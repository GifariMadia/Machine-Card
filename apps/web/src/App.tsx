import { loadBusinessData, resetBusinessData, refreshBusinessData, backupLegacyBusinessData } from './storage';
import { storage } from './storage';
import React, { useState, useEffect, Suspense } from 'react';
import { type AppUser, type Operator, type Technician, type Supervisor, type Admin } from './operator';
import LoginPage from './LoginPage';
import OperatorDashboard from './OperatorDashboard';
import TechnicianDashboard from './TechnicianDashboard';
import SupervisorDashboard from './SupervisorDashboard';
import AdminDashboard from './AdminDashboard';
import './styles.css';
import './dashboard-unified.css';

function DashboardLoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f3f5f4',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            border: '3px solid #dce2df',
            borderTopColor: '#059669',
            borderRadius: '50%',
            animation: 'mc-spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#475569' }}>
          Menyiapkan Workspace Machine Card...
        </p>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Machine Card Runtime Error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    try {
      sessionStorage.clear();
      storage.removeItem('mc-active-tab');
      storage.removeItem('mc-sidebar-collapsed');
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            color: '#f8fafc',
            padding: '1.5rem',
            fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                margin: '0 auto 1.25rem',
              }}
            >
              ⚠️
            </div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700 }}>
              Terjadi Gangguan Tampilan Sesi
            </h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Aplikasi mendeteksi kendala pada state browser Anda. Anda dapat memuat ulang tampilan atau mereset sesi untuk melanjutkan.
            </p>
            {this.state.error?.message && (
              <pre
                style={{
                  background: '#0f172a',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  color: '#fca5a5',
                  overflowX: 'auto',
                  textAlign: 'left',
                  marginBottom: '1.5rem',
                  border: '1px solid #7f1d1d',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Muat Ulang Halaman
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Reset Sesi &amp; Login Ulang
              </button>
            </div>
          </div>
        </div>
      );
    }
