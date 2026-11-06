package server

import (
	"encoding/json"
	"machine-card/api/internal/db"
	"testing"
	"time"
)

func TestShiftWorkerRequiresSubmittedReportAndShiftDeadline(t *testing.T) {
	doc := func(raw string) db.Document { return db.Document{Value: json.RawMessage(raw)} }
	docs := map[string]db.Document{
		"machine-card-managed-users":    doc(`[{"nik":"T1","name":"Teknisi","role":"TEKNISI","active":true,"shifts":["Shift 1"]}]`),
		"machine-card-shift-closing-T1": doc(`{"date":"2026-10-26","shift":"Shift 1","complete":true,"closedAt":"2026-10-26T15:16:00+07:00"}`),
		"machine-card-open-work":        doc(`[{"ticket":"WR-1","machine":"Ilapak 1","section":"Packaging","shift":"1","status":"SELESAI_PERBAIKAN","waktuMulai":"2026-10-26T10:00:00+07:00"},{"ticket":"OLD","shift":"2","waktuMulai":"2020-01-01T10:00:00+07:00"}]`),
		"machine-card-machines":         doc(`[{"nama_mesin":"Ilapak 1"}]`),
	}
	before, _ := time.Parse(time.RFC3339, "2026-10-26T15:00:00+07:00")
	if len(readyShiftReports(docs, before)) != 0 {
		t.Fatal("dispatched before end of shift")
	}
	after, _ := time.Parse(time.RFC3339, "2026-10-26T15:30:00+07:00")
	reports := readyShiftReports(docs, after)
	if len(reports) != 1 || len(reports["2026-10-26:1"].OpenTickets) != 1 {
		t.Fatal("incorrect report scope")
	}
	delete(docs, "machine-card-shift-closing-T1")
	if len(readyShiftReports(docs, after)) != 0 {
		t.Fatal("dispatched without submission")
	}
}
