package db

import (
	"encoding/json"
	"testing"
)

// Regression tests for the 2026-10-27 re-audit findings (RA-02, RA-03, RA-04, RA-06).
func TestReaudit20261027Evidence(t *testing.T) {
	t.Run("closure_document_date_can_disagree_with_key", func(t *testing.T) {
		err := validateDocument(Actor{NIK: "T1", Role: "TEKNISI", Shifts: []string{"Shift 1"}}, "machine-card-shift-closing-T1-2026-10-26-1", json.RawMessage(`[]`), json.RawMessage(`{"date":"2026-10-25","shift":"Shift 1","complete":true}`))
		if err != ErrConflict {
			t.Fatalf("expected ErrConflict for mismatched closure key and payload date, got %v", err)
		}
	})
	t.Run("handover_to_next_technician_rejected", func(t *testing.T) {
		err := validateDocument(Actor{NIK: "T2", Role: "TEKNISI"}, "machine-card-open-work", json.RawMessage(`[{"ticket":"W1","status":"IN_PROGRESS","technicianNik":"T1"}]`), json.RawMessage(`[{"ticket":"W1","status":"IN_PROGRESS","technicianNik":"T2","riwayatHandover":[]}]`))
		if err != nil {
			t.Fatalf("expected valid cross-shift handover takeover to succeed, got %v", err)
		}
		err = validateDocument(Actor{NIK: "T2", Role: "TEKNISI"}, "machine-card-open-work", json.RawMessage(`[{"ticket":"W1","status":"IN_PROGRESS","technicianNik":"T1"}]`), json.RawMessage(`[{"ticket":"W1","status":"IN_PROGRESS","technicianNik":"T2"}]`))
		if err != ErrConflict {
			t.Fatalf("expected non-handover takeover to be rejected with ErrConflict, got %v", err)
		}
	})
	t.Run("negative_wait_is_accepted", func(t *testing.T) {
		err := validateDocument(Actor{NIK: "T1", Role: "TEKNISI"}, "machine-card-open-work", json.RawMessage(`[{"ticket":"W1","status":"IN_PROGRESS","technicianNik":"T1"}]`), json.RawMessage(`[{"ticket":"W1","status":"SELESAI_PERBAIKAN","technicianNik":"T1","action":"repair","durasiTungguMenit":-999999}]`))
		if err != ErrConflict {
			t.Fatalf("expected ErrConflict for negative durasiTungguMenit, got %v", err)
		}
	})
	t.Run("supervisor_correction_without_reason_is_accepted", func(t *testing.T) {
		err := validateDocument(Actor{NIK: "S1", Role: "SUPERVISOR"}, "machine-card-open-work", json.RawMessage(`[{"ticket":"W1","status":"CLOSED","durasiPerbaikanMenit":10}]`), json.RawMessage(`[{"ticket":"W1","status":"CLOSED","durasiPerbaikanMenit":9999}]`))
		if err != ErrConflict {
			t.Fatalf("expected ErrConflict for supervisor correction without changeReason, got %v", err)
		}
	})
}
