package db

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"machine-card/api/internal/domain"
)

func integrationStore(t *testing.T) *PostgresRepo {
	t.Helper()
	if os.Getenv("MC_DB_INTEGRATION") != "1" {
		t.Skip("set MC_DB_INTEGRATION=1 for isolated PostgreSQL integration tests")
	}
	_ = godotenv.Load("../../../../.env")
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgresql://machine_card:machine_card@localhost:5432/machine_card"
	}
	ctx := context.Background()
	root, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("mc_test_%d", time.Now().UnixNano())
	if _, err = root.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		root.Close()
		t.Fatal(err)
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pool.Close(); _, _ = root.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); root.Close() })
	_, err = pool.Exec(ctx, `CREATE TABLE pengguna(id_pengguna bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, username text UNIQUE NOT NULL,nama text NOT NULL,peran text NOT NULL,password_hash text NOT NULL,aktif boolean NOT NULL DEFAULT true)`)
	if err != nil {
		t.Fatal(err)
	}
	r := &PostgresRepo{pool: pool}
	if err = r.EnsureRuntime(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO mc_documents(key,value) VALUES('machine-card-machines','[{"id_mesin":1,"kode_mesin":"ILA-01","nama_mesin":"Ilapak 1","status":"AKTIF"}]')`); err != nil {
		t.Fatal(err)
	}
	hash, _ := HashOperatorPassword("A1", "integration-password-strong")
	if _, err = pool.Exec(ctx, "INSERT INTO pengguna(username,nama,peran,password_hash) VALUES('A1','Admin','ADMIN',$1)", hash); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestDispatchReservationSurvivesReopenWithoutDuplicateSend(t *testing.T) {
	r := integrationStore(t)
	ctx := context.Background()
	actor := Actor{NIK: "A1", Role: "ADMIN"}
	calls := 0
	send := func() (*domain.DiscordReportResult, error) {
		calls++
		return &domain.DiscordReportResult{Success: true}, nil
	}
	if _, err := r.Dispatch(ctx, actor, "one-shift", "hash", send); err != nil {
		t.Fatal(err)
	}
	reopened := &PostgresRepo{pool: r.pool}
	if _, err := reopened.Dispatch(ctx, actor, "one-shift", "hash", send); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal("duplicate network dispatch")
	}
	if _, err := reopened.Dispatch(ctx, actor, "one-shift", "different", send); err != ErrConflict {
		t.Fatal("payload mismatch accepted", err)
	}
}

func TestRuntimeAuthenticationAndDurability(t *testing.T) {
	r := integrationStore(t)
	ctx := context.Background()
	if _, _, err := r.Login(ctx, "A1", "password"); err == nil {
		t.Fatal("generic password accepted")
	}
	actor, token, err := r.Login(ctx, "A1", "integration-password-strong")
	if err != nil {
		t.Fatal(err)
	}
	if actor.Role != "ADMIN" {
		t.Fatal("wrong actor")
	}
	reopened := &PostgresRepo{pool: r.pool}
	if _, err = reopened.Session(ctx, token); err != nil {
		t.Fatal("session not persistent", err)
	}
	if _, err = r.pool.Exec(ctx, "UPDATE pengguna SET aktif=false WHERE username='A1'"); err != nil {
		t.Fatal(err)
	}
	if _, err = reopened.Session(ctx, token); err == nil {
		t.Fatal("disabled account session still valid")
	}
}

func TestRuntimeAtomicClaimReplayAndAudit(t *testing.T) {
