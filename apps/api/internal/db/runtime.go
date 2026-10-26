package db

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/scrypt"
)

type Actor struct {
	NIK         string   `json:"nik"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Active      bool     `json:"active"`
	Shifts      []string `json:"shifts"`
	Departments []string `json:"departments"`
	Machines    []string `json:"machines"`
}
type Document struct {
	Value   json.RawMessage `json:"value"`
	Version int64           `json:"version"`
}
type Change struct {
	Key     string          `json:"key"`
	Value   json.RawMessage `json:"value"`
	Version int64           `json:"version"`
}
type Runtime interface {
	Login(context.Context, string, string) (Actor, string, error)
	Session(context.Context, string) (Actor, error)
	Logout(context.Context, string) error
	Documents(context.Context, Actor) (map[string]Document, error)
	Commit(context.Context, Actor, string, []Change) (map[string]Document, error)
}

// Runtime tables are additive; business rows are never reset during startup.
func (r *PostgresRepo) EnsureRuntime(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS mc_login_limits(username text PRIMARY KEY,failures integer NOT NULL,window_end timestamptz NOT NULL);
 CREATE TABLE IF NOT EXISTS mc_runtime_flags(key text PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS mc_dispatches(key text PRIMARY KEY,actor_nik text NOT NULL,payload_hash text NOT NULL,status text NOT NULL,response jsonb,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS mc_sessions(token_hash text PRIMARY KEY, username text NOT NULL, expires_at timestamptz NOT NULL);
 CREATE TABLE IF NOT EXISTS mc_documents(key text PRIMARY KEY, value jsonb NOT NULL, version bigint NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS mc_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_nik text NOT NULL, actor_role text NOT NULL, request_key text NOT NULL, changes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS mc_commits(request_key text PRIMARY KEY, actor_nik text NOT NULL, payload_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
 ALTER TABLE pengguna DROP CONSTRAINT IF EXISTS pengguna_peran_check;
 ALTER TABLE pengguna ADD CONSTRAINT pengguna_peran_check CHECK(peran IN ('ADMIN','SUPERVISOR','TEKNISI','OPERATOR'));`)
	return err
}

// Provision only missing privileged accounts. Random bootstrap credentials are returned once to the local operator.
func (r *PostgresRepo) Bootstrap(ctx context.Context) (map[string]string, error) {
	credentials := map[string]string{}
	for _, account := range []struct{ nik, name, role string }{{"ADM0001", "Siti Rahma", "ADMIN"}, {"SPV0001", "Hendra Gunawan", "SUPERVISOR"}, {"TKN0001", "Budi Santoso", "TEKNISI"}} {
		var exists bool
		if err := r.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pengguna WHERE username=$1)", account.nik).Scan(&exists); err != nil {
			return nil, err
		}
		if exists {
			continue
		}
		secret := make([]byte, 18)
		if _, err := rand.Read(secret); err != nil {
			return nil, err
		}
		password := hex.EncodeToString(secret)
		hash, err := HashOperatorPassword(account.nik, password)
		if err != nil {
			return nil, err
		}
		tag, err := r.pool.Exec(ctx, "INSERT INTO pengguna(username,nama,peran,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", account.nik, account.name, account.role, hash)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() > 0 {
			credentials[account.nik] = password
		}
	}
	var hardened bool
	if err := r.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM mc_runtime_flags WHERE key='credentials-hardened-v1')").Scan(&hardened); err != nil {
		return nil, err
	}
	if !hardened {
		rows, err := r.pool.Query(ctx, "SELECT username,peran,password_hash FROM pengguna")
		if err != nil {
			return nil, err
		}
		type existingUser struct{ nik, role, hash string }
		existing := []existingUser{}
		for rows.Next() {
			var user existingUser
			if err := rows.Scan(&user.nik, &user.role, &user.hash); err != nil {
				rows.Close()
				return nil, err
			}
			existing = append(existing, user)
		}
		rows.Close()
		for _, user := range existing {
			defaults := []string{"password", "123456", "admin", "Admin@001", "Supervisor@001", "Teknisi@001", user.nik}
			if strings.HasPrefix(user.nik, "OPR") {
				number, _ := strconv.Atoi(strings.TrimPrefix(user.nik, "OPR"))
				defaults = append(defaults, fmt.Sprintf("Operator@%03d", number))
			}
			for _, candidate := range defaults {
				if verifyPassword(user.hash, candidate) {
					raw := make([]byte, 18)
					if _, err := rand.Read(raw); err != nil {
						return nil, err
					}
					password := hex.EncodeToString(raw)
					hash, err := HashOperatorPassword(user.nik, password)
					if err != nil {
						return nil, err
					}
					if _, err = r.pool.Exec(ctx, "UPDATE pengguna SET password_hash=$2 WHERE username=$1", user.nik, hash); err != nil {
						return nil, err
					}
					credentials[user.nik] = password
					break
				}
			}
		}
		if _, err := r.pool.Exec(ctx, "INSERT INTO mc_runtime_flags(key) VALUES('credentials-hardened-v1') ON CONFLICT DO NOTHING"); err != nil {
			return nil, err
		}
	}
	if err := r.initializeDocuments(ctx); err != nil {
		return nil, err
	}
	return credentials, nil
}

func (r *PostgresRepo) initializeDocuments(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO mc_documents(key,value) SELECT 'machine-card-managed-users',COALESCE(jsonb_agg(jsonb_build_object('id','user-'||id_pengguna,'nik',username,'name',nama,'role',peran,'active',aktif,'shifts',jsonb_build_array('Shift 1'),'departments',jsonb_build_array('Maintenance'),'machines','[]'::jsonb)),'[]'::jsonb) FROM pengguna ON CONFLICT DO NOTHING;
 INSERT INTO mc_documents(key,value) SELECT 'machine-card-machines',COALESCE(jsonb_agg(jsonb_build_object('id_mesin',id_mesin,'kode_mesin',kode_mesin,'nama_mesin',nama_mesin,'kategori',section,'status',status_mesin,'jumlah_part',0)),'[]'::jsonb) FROM mesin ON CONFLICT DO NOTHING;`)
	if err != nil {
		return err
	}
	var exists bool
	if err = r.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM mc_documents WHERE key='machine-card-open-work')").Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	tickets, err := r.ListOpenWorks(ctx, "", "", "", 10000)
	if err != nil {
		return err
	}
	values := []map[string]any{}
	for _, t := range tickets {
		values = append(values, map[string]any{"id_work": t.IDWork, "ticket": t.NomorWork, "id_mesin": t.IDMesin, "machine": t.NamaMesin, "section": t.Section, "reporter": t.PelaporNIK, "reporterName": t.PelaporNama, "shift": fmt.Sprint(t.ShiftLapor), "status": t.Status, "keterangan": t.Keterangan, "kategori": t.KategoriBreakdown, "waktuMulai": t.WaktuMulaiBreakdown, "waktuSelesai": t.WaktuSelesaiTeknisi, "waktuMesinBeroperasi": t.WaktuMesinBeroperasi, "waktuMulaiTeknisi": t.WaktuMulaiTeknisi, "action": t.TindakanTeknisi, "technicianName": t.TeknisiNama, "technicianNik": t.TeknisiNIK, "durasiPerbaikanMenit": t.DurasiPerbaikanMenit, "durasiTungguMenit": t.DurasiTungguMenit, "noWr": t.NoWorkRequest, "woType": t.TipeWO, "kodeProduk": t.KodeProduk, "noBatch": t.NoBatch})
	}
	raw, _ := json.Marshal(values)
	_, err = r.pool.Exec(ctx, "INSERT INTO mc_documents(key,value) VALUES('machine-card-open-work',$1) ON CONFLICT DO NOTHING", raw)
	return err
}

func verifyPassword(hash, password string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 3 || parts[0] != "scrypt" {
		return false
	}
	expected, err := hex.DecodeString(parts[2])
	if err != nil || len(expected) != 64 {
		return false
	}
	actual, err := scrypt.Key([]byte(password), []byte(parts[1]), 16384, 8, 1, 64)
	return err == nil && subtle.ConstantTimeCompare(expected, actual) == 1
}
func tokenHash(token string) string {
	v := sha256.Sum256([]byte(token))
	return hex.EncodeToString(v[:])
}
func (r *PostgresRepo) Login(ctx context.Context, nik, password string) (Actor, string, error) {
	var a Actor
	var hash string
	normalized := strings.ToUpper(strings.TrimSpace(nik))
	var failures int
	var windowEnd time.Time
	if err := r.pool.QueryRow(ctx, "SELECT failures,window_end FROM mc_login_limits WHERE username=$1", normalized).Scan(&failures, &windowEnd); err == nil && failures >= 5 && time.Now().Before(windowEnd) {
		return a, "", ErrRateLimited
	}
	err := r.pool.QueryRow(ctx, "SELECT username,nama,peran,aktif,password_hash FROM pengguna WHERE username=$1", strings.ToUpper(strings.TrimSpace(nik))).Scan(&a.NIK, &a.Name, &a.Role, &a.Active, &hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return a, "", err
	}
	if err != nil || !a.Active || !verifyPassword(hash, password) {
		_, _ = r.pool.Exec(ctx, `INSERT INTO mc_login_limits(username,failures,window_end) VALUES($1,1,CURRENT_TIMESTAMP+interval '1 minute') ON CONFLICT(username) DO UPDATE SET failures=CASE WHEN mc_login_limits.window_end<CURRENT_TIMESTAMP THEN 1 ELSE mc_login_limits.failures+1 END,window_end=CASE WHEN mc_login_limits.window_end<CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP+interval '1 minute' ELSE mc_login_limits.window_end END`, normalized)
		return a, "", ErrForbidden
	}
	_, _ = r.pool.Exec(ctx, "DELETE FROM mc_login_limits WHERE username=$1", normalized)
	a.Shifts = []string{"Shift 1"}
	a.Departments = []string{"Maintenance"}
	a.Machines = []string{}
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return a, "", err
	}
	token := hex.EncodeToString(raw)
	_, err = r.pool.Exec(ctx, "INSERT INTO mc_sessions(token_hash,username,expires_at) VALUES($1,$2,$3)", tokenHash(token), a.NIK, time.Now().Add(30*time.Minute))
	if err != nil {
		return a, "", err
	}
	a, err = r.Session(ctx, token)
	return a, token, err
}
func (r *PostgresRepo) Session(ctx context.Context, token string) (Actor, error) {
	var a Actor
	err := r.pool.QueryRow(ctx, `SELECT u.username,u.nama,u.peran,u.aktif FROM mc_sessions s JOIN pengguna u ON u.username=s.username WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP AND u.aktif`, tokenHash(token)).Scan(&a.NIK, &a.Name, &a.Role, &a.Active)
	if err != nil {
		return a, ErrForbidden
	}
	a.Shifts = []string{"Shift 1"}
	a.Departments = []string{"Maintenance"}
	a.Machines = []string{}
	// Profile metadata is editable by administrators; credentials never leave the server.
	var raw []byte
	if r.pool.QueryRow(ctx, "SELECT value FROM mc_documents WHERE key='machine-card-managed-users'").Scan(&raw) == nil {
		var users []map[string]json.RawMessage
		if json.Unmarshal(raw, &users) == nil {
			for _, u := range users {
				var nik string
