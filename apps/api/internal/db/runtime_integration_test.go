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
	r := integrationStore(t)
	ctx := context.Background()
	op := Actor{NIK: "O1", Role: "OPERATOR"}
	create := []Change{{Key: "machine-card-open-work", Version: 0, Value: json.RawMessage(`[{"ticket":"OW-ONE","machine":"Ilapak 1","keterangan":"Gangguan pengujian","reporter":"O1","shift":"1","waktuMulai":"2020-01-01T10:00:00+07:00","status":"OPEN"}]`)}}
	first, err := r.Commit(ctx, op, "create-one", create)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := r.Commit(ctx, op, "create-one", create)
	if err != nil || replay[create[0].Key].Version != first[create[0].Key].Version {
		t.Fatal("idempotent replay failed", err)
	}
	var successes atomic.Int32
	var wg sync.WaitGroup
	for _, nik := range []string{"T1", "T2"} {
		wg.Add(1)
		go func(nik string) {
			defer wg.Done()
			var claim []map[string]any
			_ = json.Unmarshal(first[create[0].Key].Value, &claim)
			claim[0]["status"] = "IN_PROGRESS"
			claim[0]["technicianNik"] = nik
			raw, _ := json.Marshal(claim)
			_, err := r.Commit(ctx, Actor{NIK: nik, Role: "TEKNISI"}, "claim-"+nik, []Change{{Key: create[0].Key, Version: 1, Value: json.RawMessage(raw)}})
			if err == nil {
				successes.Add(1)
			} else if err != ErrConflict {
				t.Errorf("unexpected claim error %v", err)
			}
		}(nik)
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatalf("%d claims succeeded", successes.Load())
	}
	var count int
	if err = r.pool.QueryRow(ctx, "SELECT count(*) FROM mc_events").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("expected 2 durable audit events, got %d", count)
	}
	if _, err = r.Commit(ctx, op, "delete-history", []Change{{Key: create[0].Key, Version: 2, Value: json.RawMessage(`[]`)}}); err == nil {
		t.Fatal("history deletion accepted")
	}
	if _, err = r.Commit(ctx, op, "write-master", []Change{{Key: "mc-master-parts", Version: 0, Value: json.RawMessage(`[{"id":"X"}]`)}}); err != ErrForbidden {
		t.Fatal("operator changed master", err)
	}
}

func TestEntireTicketLifecycleAndServerTimestamps(t *testing.T) {
	r := integrationStore(t)
	ctx := context.Background()
	version := int64(0)
	ticket := map[string]any{"ticket": "FLOW-ONE", "machine": "Ilapak 1", "keterangan": "Gangguan mesin pengujian", "reporter": "O1", "status": "OPEN", "shift": "1", "waktuMulai": time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)}
	commit := func(a Actor) {
		t.Helper()
		raw, _ := json.Marshal([]map[string]any{ticket})
		docs, err := r.Commit(ctx, a, fmt.Sprintf("flow-%d", version), []Change{{Key: "machine-card-open-work", Version: version, Value: raw}})
		if err != nil {
			t.Fatal(err)
		}
		version = docs["machine-card-open-work"].Version
		var values []map[string]any
		_ = json.Unmarshal(docs["machine-card-open-work"].Value, &values)
		ticket = values[0]
	}
	commit(Actor{NIK: "O1", Name: "Operator", Role: "OPERATOR"})
	ticket["status"] = "IN_PROGRESS"
	ticket["technicianNik"] = "T1"
	commit(Actor{NIK: "T1", Name: "Teknisi", Role: "TEKNISI"})
	start := ticket["waktuMulaiTeknisi"]
	ticket["status"] = "SELESAI_PERBAIKAN"
	ticket["action"] = "Pemeriksaan dan penyetelan selesai"
	ticket["waktuMulaiTeknisi"] = "2000-01-01T00:00:00Z"
	commit(Actor{NIK: "T1", Name: "Teknisi", Role: "TEKNISI"})
	if ticket["waktuMulaiTeknisi"] != start {
		t.Fatal("client rewrote start timestamp")
	}
	ticket["status"] = "CLOSED"
	ticket["penutupNik"] = "O1"
	ticket["penutupName"] = "Forged name"
	ticket["waktuMesinBeroperasi"] = time.Now().UTC().Format(time.RFC3339Nano)
	commit(Actor{NIK: "O1", Name: "Operator", Role: "OPERATOR"})
	if ticket["penutupName"] != "Operator" || ticket["closedAt"] == nil {
		t.Fatal("closing identity/timestamp not server-issued")
	}
	ticket["supervisorVerified"] = true
	ticket["supervisorNote"] = "Ditinjau"
	commit(Actor{NIK: "S1", Name: "Supervisor", Role: "SUPERVISOR"})
	if ticket["status"] != "CLOSED" {
		t.Fatal("verification changed status")
	}
}

func TestDocumentBatchRollsBackOnPermissionFailure(t *testing.T) {
	r := integrationStore(t)
	ctx := context.Background()
	_, err := r.Commit(ctx, Actor{NIK: "O1", Role: "OPERATOR"}, "rollback-batch", []Change{
		{Key: "machine-card-open-work", Version: 0, Value: json.RawMessage(`[{"ticket":"ROLLBACK","machine":"Ilapak 1","keterangan":"Gangguan pengujian","reporter":"O1","shift":"1","waktuMulai":"2020-01-01T10:00:00+07:00","status":"OPEN"}]`)},
		{Key: "mc-master-parts", Version: 0, Value: json.RawMessage(`[{"id":"ILLEGAL"}]`)},
	})
	if err != ErrForbidden {
		t.Fatal("expected forbidden batch", err)
	}
	docs, err := r.Documents(ctx, Actor{Role: "ADMIN"})
	if err != nil {
		t.Fatal(err)
	}
	if _, exists := docs["machine-card-open-work"]; exists {
		t.Fatal("partially committed rejected batch")
	}
}
