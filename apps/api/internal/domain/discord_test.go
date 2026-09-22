package domain_test

import (
	"context"
	"strings"
	"testing"

	"machine-card/api/internal/domain"
)

func TestFormatDiscordShiftReport(t *testing.T) {
	payload := domain.FormatDiscordShiftReport(domain.ShiftReportData{
		SupervisorName:      "Petrus Juan Teranggani",
		SupervisorNIK:       "SPV0001",
		Department:          "Engineering Maintenance Pulogadung",
		Plant:               "Pulogadung",
		Shift:               "1",
		DayCategory:         domain.DayCategoryWeekday,
		Date:                "18/09/2026",
		Summary:             "Lini berjalan lancar 95% target tercapai.",
		HandoverNotes:       "Perhatikan suhu sealer Ilapak 3.",
		ActiveMachinesCount: 19,
		BreakdownCount:      1,
		OpenTickets: []domain.ShiftTicketItem{
			{
				Ticket:       "OW-233183",
				Machine:      "Ilapak 1",
				Issue:        "Potongan tidak stabil",
				Status:       "OPEN",
				Progres:      "Pemeriksaan pisau I-Cut",
				TindakLanjut: "Lanjut kalibrasi shift 2",
			},
		},
	})

	if payload.Username != "B7 Machine Card Bot" {
		t.Errorf("Username = %s; want 'B7 Machine Card Bot'", payload.Username)
	}
	if len(payload.Embeds) != 1 {
		t.Fatalf("Embeds len = %d; want 1", len(payload.Embeds))
	}
	embed := payload.Embeds[0]
	if embed.Color != 0xe11d48 {
		t.Errorf("Color = %x; want 0xe11d48 (Red for breakdownCount > 0)", embed.Color)
	}
	if !strings.Contains(embed.Title, "LAPORAN SHIFT") {
		t.Errorf("Title %s does not contain 'LAPORAN SHIFT'", embed.Title)
	}

	foundSPV := false
	foundTicket := false
	for _, f := range embed.Fields {
		if strings.Contains(f.Name, "SPV Maintenance") && strings.Contains(f.Value, "Petrus Juan Teranggani") {
			foundSPV = true
		}
		if strings.Contains(f.Name, "Aktivitas") && strings.Contains(f.Value, "OW-233183") {
			foundTicket = true
		}
	}

	if !foundSPV {
		t.Error("Field SPV Maintenance not found or value mismatch")
	}
	if !foundTicket {
		t.Error("Field Aktivitas not found or ticket OW-233183 mismatch")
	}
}

func TestGetShiftSchedule(t *testing.T) {
	// Weekdays
	s1w := domain.GetShiftSchedule("1", domain.DayCategoryWeekday)
	if s1w.TimeRange != "06:45 - 15:15" {
		t.Errorf("S1 Weekday TimeRange = %s; want 06:45 - 15:15", s1w.TimeRange)
	}
	s2w := domain.GetShiftSchedule("2", domain.DayCategoryWeekday)
	if s2w.TimeRange != "15:00 - 22:30" {
		t.Errorf("S2 Weekday TimeRange = %s; want 15:00 - 22:30", s2w.TimeRange)
	}
	s3w := domain.GetShiftSchedule("3", domain.DayCategoryWeekday)
	if s3w.TimeRange != "22:15 - 06:45" {
		t.Errorf("S3 Weekday TimeRange = %s; want 22:15 - 06:45", s3w.TimeRange)
	}

	// Weekend
	s1we := domain.GetShiftSchedule("1", domain.DayCategoryWeekend)
	if s1we.TimeRange != "06:45 - 14:15" {
		t.Errorf("S1 Weekend TimeRange = %s; want 06:45 - 14:15", s1we.TimeRange)
	}
	s2we := domain.GetShiftSchedule("2", domain.DayCategoryWeekend)
	if s2we.TimeRange != "14:15 - 21:45" {
		t.Errorf("S2 Weekend TimeRange = %s; want 14:15 - 21:45", s2we.TimeRange)
	}
	s3we := domain.GetShiftSchedule("3", domain.DayCategoryWeekend)
	if s3we.TimeRange != "21:45 - 05:30" {
		t.Errorf("S3 Weekend TimeRange = %s; want 21:45 - 05:30", s3we.TimeRange)
	}
}

func TestEvaluateShiftCompleteness(t *testing.T) {
	f := false
