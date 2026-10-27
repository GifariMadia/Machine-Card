package db

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"machine-card/api/internal/domain"
)

// Dispatch persists the reservation before sending. Unknown outcomes are never automatically resent.
func (r *PostgresRepo) Dispatch(ctx context.Context, a Actor, key, hash string, send func() (*domain.DiscordReportResult, error)) (*domain.DiscordReportResult, error) {
	if key == "" {
		return nil, ErrConflict
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", "dispatch:"+key); err != nil {
		return nil, err
	}
	var priorHash, priorActor, status string
	var raw []byte
	err = tx.QueryRow(ctx, "SELECT payload_hash,actor_nik,status,response FROM mc_dispatches WHERE key=$1", key).Scan(&priorHash, &priorActor, &status, &raw)
	if err == nil {
		if priorHash != hash || priorActor != a.NIK || status != "SENT" {
			return nil, ErrConflict
		}
		var result domain.DiscordReportResult
		if err = json.Unmarshal(raw, &result); err != nil {
			return nil, err
		}
		return &result, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO mc_dispatches(key,actor_nik,payload_hash,status) VALUES($1,$2,$3,'SENDING')", key, a.NIK, hash); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	result, sendErr := send()
	status = "SENT"
	if sendErr != nil {
		status = "UNKNOWN"
	} else if result.Simulated {
		status = "SIMULATED"
	}
	raw, _ = json.Marshal(result)
	// Independent short context records the outcome even if the caller disconnects.
	saveCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tx, err = r.pool.Begin(saveCtx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(saveCtx)
	if _, err = tx.Exec(saveCtx, "UPDATE mc_dispatches SET status=$2,response=$3,updated_at=CURRENT_TIMESTAMP WHERE key=$1", key, status, raw); err != nil {
		return nil, err
	}
	event, _ := json.Marshal(map[string]any{"dispatch": key, "status": status})
	if _, err = tx.Exec(saveCtx, "INSERT INTO mc_events(actor_nik,actor_role,request_key,changes) VALUES($1,$2,$3,$4)", a.NIK, a.Role, "dispatch:"+key, event); err != nil {
		return nil, err
	}
	if err = tx.Commit(saveCtx); err != nil {
		return nil, err
	}
	return result, sendErr
}

func (r *PostgresRepo) Events(ctx context.Context) (json.RawMessage, error) {
	var raw []byte
	err := r.pool.QueryRow(ctx, `SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) FROM (SELECT id,actor_nik,actor_role,request_key,changes,created_at FROM mc_events ORDER BY id DESC LIMIT 1000)e`).Scan(&raw)
	return raw, err
}
