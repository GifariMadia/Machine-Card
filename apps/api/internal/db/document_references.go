package db

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"time"
)

func recordTime(raw string) (time.Time, error) {
	if value, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return value, nil
	}
	loc, _ := time.LoadLocation("Asia/Jakarta")
	for _, layout := range []string{"2006-01-02T15:04:05.999", "2006-01-02T15:04:05", "2006-01-02T15:04"} {
		if value, err := time.ParseInLocation(layout, raw, loc); err == nil {
			return value, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid timestamp")
}

func validateReferences(ctx context.Context, tx pgx.Tx, a Actor, key string, before, after json.RawMessage) error {
	if a.Role == "ADMIN" || (key != "machine-card-open-work" && key != "machine-card-pm-schedules") {
		return nil
	}
	var old, next []map[string]json.RawMessage
	_ = json.Unmarshal(before, &old)
	if json.Unmarshal(after, &next) != nil {
		return ErrConflict
	}
	id := "ticket"
	if key == "machine-card-pm-schedules" {
		id = "id"
	}
	previous := map[string]bool{}
	for _, item := range old {
		previous[text(item, id)] = true
	}
	for _, item := range next {
		if previous[text(item, id)] {
			continue
		}
		var active bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM mc_documents d CROSS JOIN LATERAL jsonb_array_elements(d.value) m WHERE d.key='machine-card-machines' AND m->>'nama_mesin'=$1 AND m->>'status'='AKTIF')`, text(item, "machine")).Scan(&active); err != nil {
			return err
		}
		if !active {
			return ErrConflict
		}
		if key == "machine-card-open-work" {
			start, err := recordTime(text(item, "waktuMulai"))
			if err != nil || start.After(time.Now()) {
				return ErrConflict
			}
			shift := text(item, "shift")
			if shift != "1" && shift != "2" && shift != "3" {
				return ErrConflict
			}
		}
	}
	return nil
}
