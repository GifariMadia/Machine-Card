package server

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"machine-card/api/internal/config"
	"machine-card/api/internal/db"
	"machine-card/api/internal/domain"
)

// Workers on different replicas reserve the same durable dispatch key before any network request.
func RunShiftWorker(ctx context.Context, cfg *config.Config, repo *db.PostgresRepo) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if cfg.DiscordWebhookURL == "" || strings.Contains(cfg.DiscordWebhookURL, "simulate") {
				continue
			}
			actor := db.Actor{NIK: "SYSTEM", Name: "Penjadwal Laporan Shift", Role: "SUPERVISOR"}
			docs, err := repo.Documents(ctx, actor)
			if err != nil {
				continue
			}
			reports := readyShiftReports(docs, time.Now())
			for key, report := range reports {
				raw, _ := json.Marshal(report)
				_, err = repo.Dispatch(ctx, actor, "auto:"+key, HashPayload(raw), func() (*domain.DiscordReportResult, error) {
					return domain.SendDiscordShiftReport(ctx, cfg.DiscordWebhookURL, report)
				})
				if err != nil && err != db.ErrConflict {
					log.Printf("Shift dispatch %s requires review: %v", key, err)
				}
			}
		}
	}
}

func readyShiftReports(docs map[string]db.Document, now time.Time) map[string]domain.ShiftReportData {
	result := map[string]domain.ShiftReportData{}
	loc, _ := time.LoadLocation("Asia/Jakarta")
	type member struct {
		NIK    string   `json:"nik"`
		Name   string   `json:"name"`
		Role   string   `json:"role"`
		Active bool     `json:"active"`
		Shifts []string `json:"shifts"`
	}
	type closing struct {
		Date     string `json:"date"`
		Shift    string `json:"shift"`
		Complete bool   `json:"complete"`
		ClosedAt string `json:"closedAt"`
	}
	var users []member
	_ = json.Unmarshal(docs["machine-card-managed-users"].Value, &users)
	var tickets []map[string]json.RawMessage
	_ = json.Unmarshal(docs["machine-card-open-work"].Value, &tickets)
	get := func(row map[string]json.RawMessage, key string) string {
		var value string
		_ = json.Unmarshal(row[key], &value)
		return value
	}
	groups := map[string]closing{}
	for key, doc := range docs {
		if strings.HasPrefix(key, "machine-card-shift-closing-") {
			var value closing
			if json.Unmarshal(doc.Value, &value) == nil && value.Complete {
				value.Shift = strings.TrimPrefix(value.Shift, "Shift ")
				groups[value.Date+":"+value.Shift] = value
			}
		}
	}
	for key, group := range groups {
		date, err := time.ParseInLocation("2006-01-02", group.Date, loc)
		if err != nil {
			continue
		}
		category := domain.DayCategoryWeekday
		if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
			category = domain.DayCategoryWeekend
		}
		schedule := domain.GetShiftSchedule(group.Shift, category)
		deadline, err := time.ParseInLocation("2006-01-02 15:04", group.Date+" "+strings.TrimSuffix(schedule.TriggerTime, " WIB"), loc)
		if err != nil {
			continue
		}
		if group.Shift == "3" {
			deadline = deadline.AddDate(0, 0, 1)
		}
		if now.Before(deadline) {
			continue
		}
		report := domain.ShiftReportData{SupervisorName: "Penjadwal Laporan Shift", SupervisorNIK: "SYSTEM", Department: "Maintenance", Plant: "Pulogadung", Date: date.Format("02/01/2006"), Shift: group.Shift, DayCategory: category}
		allReported := true
		for _, user := range users {
			if !user.Active || user.Role != "TEKNISI" {
				continue
			}
			assigned := false
			for _, shift := range user.Shifts {
				if strings.TrimPrefix(shift, "Shift ") == group.Shift {
					assigned = true
				}
			}
			if !assigned {
				continue
			}
			var closure closing
			doc, exists := docs["machine-card-shift-closing-"+user.NIK+"-"+group.Date+"-"+group.Shift]
			if !exists {
				doc = docs["machine-card-shift-closing-"+user.NIK]
			}
			_ = json.Unmarshal(doc.Value, &closure)
			valid := closure.Complete && closure.Date == group.Date && strings.TrimPrefix(closure.Shift, "Shift ") == group.Shift
			if !valid {
				allReported = false
			}
			for _, note := range []struct{ base, area, label string }{{"machine-card-repair-notes", "RUANG_REPAIR", "Workshop"}, {"machine-card-pm-notes", "PM", "PM"}, {"machine-card-pbjt-notes", "PBJT", "PBJT"}, {"machine-card-other-notes", "OTHER", "Other"}} {
				var content string
				_ = json.Unmarshal(docs[note.base+"-"+user.NIK+"-"+group.Date+"-"+group.Shift].Value, &content)
				if strings.TrimSpace(content) != "" {
					report.OpenTickets = append(report.OpenTickets, domain.ShiftTicketItem{Ticket: "NOTE:" + user.NIK + ":" + note.label, Machine: note.label, Issue: "Catatan " + note.label, Status: "DONE", Area: note.area, Actions: []string{content}, Pelaksana: user.Name})
				}
			}
			report.TeamMembers = append(report.TeamMembers, user.NIK)
			report.AssignedTechnicians = append(report.AssignedTechnicians, domain.AssignedTechnicianStatus{NIK: user.NIK, Name: user.Name, HasReported: valid, CompletedAt: &closure.ClosedAt})
		}
		if !allReported || len(report.TeamMembers) == 0 {
			continue
		}
		affected := map[string]bool{}
		for _, ticket := range tickets {
			start := get(ticket, "waktuMulai")
			parsed, parseErr := time.Parse(time.RFC3339Nano, start)
			if parseErr != nil {
				parsed, parseErr = time.ParseInLocation("2006-01-02T15:04", start, loc)
			}
			if parseErr == nil {
				local := parsed.In(loc)
				if get(ticket, "shift") == "3" && local.Hour() < 7 {
					local = local.AddDate(0, 0, -1)
				}
				start = local.Format("2006-01-02")
			}

			if len(start) < 10 || start[:10] != group.Date || get(ticket, "shift") != group.Shift || get(ticket, "status") == "VOID" {
				continue
			}
			status := get(ticket, "status")
			if status == "CLOSED" || status == "SELESAI_PERBAIKAN" {
				status = "DONE"
			} else {
				status = "OPEN"
				affected[get(ticket, "machine")] = true
			}
			area := "OTHER"
			section := strings.ToLower(get(ticket, "section"))
			if strings.Contains(section, "packaging") {
				area = "PACKAGING"
			} else if strings.Contains(section, "filling") {
				area = "FILLING"
			} else if strings.Contains(section, "compounding") {
				area = "COMPOUNDING"
			}
			report.OpenTickets = append(report.OpenTickets, domain.ShiftTicketItem{Ticket: get(ticket, "ticket"), Machine: get(ticket, "machine"), Issue: get(ticket, "keterangan"), Status: status, Area: area, WR: get(ticket, "noWr"), Actions: []string{get(ticket, "action")}})
		}
		var machines []json.RawMessage
		_ = json.Unmarshal(docs["machine-card-machines"].Value, &machines)
		report.BreakdownCount = len(affected)
		report.ActiveMachinesCount = len(machines) - len(affected)
		if report.ActiveMachinesCount < 0 {
			report.ActiveMachinesCount = 0
		}
		report.Summary = "Laporan dikompilasi dari catatan shift. Jumlah tiket bukan bukti kondisi operasi atau keamanan mesin."
		result[key] = report
	}
	return result
}
