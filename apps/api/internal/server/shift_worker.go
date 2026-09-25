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
