package domain_test

import (
	"testing"

	"machine-card/api/internal/domain"
)

func TestNormalizeLimit(t *testing.T) {
	tests := []struct {
		name     string
		input    any
		expected int
	}{
		{name: "normal integer string", input: "25", expected: 25},
		{name: "exceeds maximum", input: "999", expected: 100},
		{name: "negative value", input: "-2", expected: 1},
		{name: "non-numeric string", input: "x", expected: 50},
		{name: "nil input", input: nil, expected: 50},
		{name: "float string", input: "42.8", expected: 42},
		{name: "integer type", input: 75, expected: 75},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := domain.NormalizeLimit(tc.input)
			if got != tc.expected {
				t.Errorf("NormalizeLimit(%v) = %d; want %d", tc.input, got, tc.expected)
			}
		})
	}
}

func TestValidateTicketTransition(t *testing.T) {
	if err := domain.ValidateTicketTransition("OPEN", "IN_PROGRESS", "TEKNISI"); err != nil {
		t.Errorf("Expected OPEN -> IN_PROGRESS to be valid, got: %v", err)
	}
	if err := domain.ValidateTicketTransition("IN_PROGRESS", "SELESAI_PERBAIKAN", "TEKNISI"); err != nil {
		t.Errorf("Expected IN_PROGRESS -> SELESAI_PERBAIKAN to be valid, got: %v", err)
	}
	if err := domain.ValidateTicketTransition("SELESAI_PERBAIKAN", "CLOSED", "OPERATOR"); err != nil {
		t.Errorf("Expected SELESAI_PERBAIKAN -> CLOSED by OPERATOR to be valid, got: %v", err)
	}
	if err := domain.ValidateTicketTransition("CLOSED", "OPEN", "OPERATOR"); err == nil {
		t.Error("Expected CLOSED -> OPEN to be rejected (terminal state invariant)")
	}
	if err := domain.ValidateTicketTransition("CLOSED", "CLOSED", "OPERATOR"); err == nil {
		t.Error("Expected CLOSED -> CLOSED to be rejected (no double close)")
	}
	if err := domain.ValidateTicketTransition("SELESAI_PERBAIKAN", "CLOSED", "TEKNISI"); err == nil {
		t.Error("Expected closing by TEKNISI to be rejected (only OPERATOR/ADMIN closes running test)")
	}
}

func TestValidateTimelineInvariant(t *testing.T) {
	if err := domain.ValidateTimelineInvariant("2026-10-20T08:00:00Z", "2026-10-20T09:30:00Z"); err != nil {
		t.Errorf("Expected valid timeline to pass, got: %v", err)
	}
	if err := domain.ValidateTimelineInvariant("2026-10-20T10:00:00Z", "2026-10-20T08:00:00Z"); err == nil {
		t.Error("Expected end time before start time to fail invariant check")
	}
}

func TestValidateDiscordWebhookURL(t *testing.T) {
	if err := domain.ValidateDiscordWebhookURL("https://discord.com/api/webhooks/123456/abcdef"); err != nil {
		t.Errorf("Expected official discord HTTPS webhook to pass, got: %v", err)
	}
	if err := domain.ValidateDiscordWebhookURL("http://discord.com/api/webhooks/123456/abcdef"); err == nil {
		t.Error("Expected non-HTTPS URL to fail")
	}
	if err := domain.ValidateDiscordWebhookURL("https://169.254.169.254/api/webhooks/123"); err == nil {
		t.Error("Expected metadata SSRF IP to fail")
	}
	if err := domain.ValidateDiscordWebhookURL("https://localhost:5432/api/webhooks/123"); err == nil {
		t.Error("Expected localhost SSRF to fail")
	}
}

func TestURS81ReviewAndDataCorrection(t *testing.T) {
	// 1. Validasi Pembatalan (Void) Catatan Operasional
	t.Run("pembatalan catatan oleh operator harus ditolak", func(t *testing.T) {
		err := domain.ValidateRecordCancellation("OPERATOR", "Salah input mesin")
		if err == nil {
			t.Error("Expected cancellation by OPERATOR to be rejected")
		}
	})

	t.Run("pembatalan catatan oleh SPV tanpa alasan harus ditolak", func(t *testing.T) {
		err := domain.ValidateRecordCancellation("SUPERVISOR", "   ")
		if err == nil {
			t.Error("Expected cancellation without reason to be rejected")
		}
	})

	t.Run("pembatalan catatan oleh SPV dengan alasan sah harus diterima", func(t *testing.T) {
		err := domain.ValidateRecordCancellation("SUPERVISOR", "Duplikasi tiket open work oleh operator")
		if err != nil {
			t.Errorf("Expected valid cancellation to pass, got: %v", err)
		}
	})

	// 2. Validasi Koreksi Data Pengukuran Maintenance
	t.Run("koreksi data oleh teknisi harus ditolak (hanya SPV/Admin)", func(t *testing.T) {
		err := domain.ValidateDataCorrection("TEKNISI", "Koreksi durasi", "durasiPerbaikanMenit", "120", "90")
		if err == nil {
			t.Error("Expected correction by TEKNISI to be rejected")
		}
	})

	t.Run("koreksi data oleh SPV dengan data identik harus ditolak", func(t *testing.T) {
		err := domain.ValidateDataCorrection("SUPERVISOR", "Koreksi durasi", "durasiPerbaikanMenit", "120", "120")
		if err == nil {
			t.Error("Expected correction with identical values to be rejected")
		}
	})

	t.Run("koreksi data oleh SPV dengan alasan sah harus diterima", func(t *testing.T) {
		err := domain.ValidateDataCorrection("SUPERVISOR", "Koreksi durasi aktif setelah verifikasi rekaman PLC", "durasiPerbaikanMenit", "120", "85")
		if err != nil {
			t.Errorf("Expected valid correction to pass, got: %v", err)
		}
	})

	// 3. Validasi Revisi Laporan Shift Terkirim
	t.Run("revisi laporan shift oleh SPV dengan alasan sah harus diterima", func(t *testing.T) {
		err := domain.ValidateReportRevision("SUPERVISOR", "Penambahan rincian tindakan pada mesin Chimei JS 05")
		if err != nil {
			t.Errorf("Expected valid shift revision to pass, got: %v", err)
		}
	})

	t.Run("revisi laporan shift tanpa alasan harus ditolak", func(t *testing.T) {
		err := domain.ValidateReportRevision("SUPERVISOR", "")
		if err == nil {
			t.Error("Expected empty reason to fail")
		}
	})
}
