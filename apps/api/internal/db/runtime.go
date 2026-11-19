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
	_, _ = r.pool.Exec(ctx, "DELETE FROM mc_sessions WHERE expires_at<=CURRENT_TIMESTAMP")
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
	if r.pool.QueryRow(ctx, `SELECT elem FROM mc_documents d CROSS JOIN LATERAL jsonb_array_elements(d.value) elem WHERE d.key='machine-card-managed-users' AND elem->>'nik'=$1 LIMIT 1`, a.NIK).Scan(&raw) == nil {
		var u map[string]json.RawMessage
		if json.Unmarshal(raw, &u) == nil {
			_ = json.Unmarshal(u["shifts"], &a.Shifts)
			_ = json.Unmarshal(u["departments"], &a.Departments)
			_ = json.Unmarshal(u["machines"], &a.Machines)
		}
	}
	return a, nil
}
func (r *PostgresRepo) Touch(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx, "UPDATE mc_sessions SET expires_at=CURRENT_TIMESTAMP+interval '30 minutes' WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP", tokenHash(token))
	return err
}

func (r *PostgresRepo) Logout(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM mc_sessions WHERE token_hash=$1", tokenHash(token))
	return err
}

func (r *PostgresRepo) Documents(ctx context.Context, a Actor) (map[string]Document, error) {
	out := map[string]Document{}
	rows, err := r.pool.Query(ctx, "SELECT key,value,version FROM mc_documents")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var d Document
		if err := rows.Scan(&key, &d.Value, &d.Version); err != nil {
			return nil, err
		}
		out[key] = d
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if a.Role == "ADMIN" || a.Role == "SUPERVISOR" {
		var raw []byte
		if err := r.pool.QueryRow(ctx, `SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) FROM (SELECT key,CASE WHEN status='SENDING' AND updated_at<CURRENT_TIMESTAMP-interval '2 minutes' THEN 'UNKNOWN' ELSE status END AS status,updated_at FROM mc_dispatches ORDER BY updated_at DESC LIMIT 1000)e`).Scan(&raw); err != nil {
			return nil, err
		}
		out["machine-card-report-deliveries"] = Document{Value: raw, Version: 0}
	}
	return out, nil
}

func (r *PostgresRepo) Commit(ctx context.Context, a Actor, key string, changes []Change) (map[string]Document, error) {
	if key == "" || len(changes) == 0 || len(changes) > 40 {
		return nil, ErrConflict
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	// All replicas serialize the commit reservation and document versions in one database transaction.
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(71026001)"); err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(changes)
	hash := tokenHash(string(payload))
	var previousActor, previousHash string
	var response []byte
	err = tx.QueryRow(ctx, "SELECT actor_nik,payload_hash,response FROM mc_commits WHERE request_key=$1", key).Scan(&previousActor, &previousHash, &response)
	if err == nil {
		if previousActor != a.NIK || previousHash != hash {
			return nil, ErrConflict
		}
		var result map[string]Document
		err = json.Unmarshal(response, &result)
		return result, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	generatedPasswords := map[string]string{}
	allowGeneratedPasswords := false
	for _, change := range changes {
		if change.Key == "machine-card-import-ledger" && change.Version == 0 && a.Role == "ADMIN" {
			allowGeneratedPasswords = true
		}
	}
	result := map[string]Document{}
	auditChanges := []map[string]any{}
	seen := map[string]bool{}
	for _, change := range changes {
		if seen[change.Key] || !json.Valid(change.Value) {
			return nil, ErrConflict
		}
		seen[change.Key] = true
		var old Document
		err = tx.QueryRow(ctx, "SELECT value,version FROM mc_documents WHERE key=$1 FOR UPDATE", change.Key).Scan(&old.Value, &old.Version)
		if errors.Is(err, pgx.ErrNoRows) {
			old.Value = json.RawMessage(`[]`)
			old.Version = 0
		} else if err != nil {
			return nil, err
		}
		if change.Key == "machine-card-import-ledger" && old.Version > 0 {
			return nil, ErrConflict
		}
		if change.Version != old.Version {
			return nil, ErrConflict
		}
		if err = validateDocument(a, change.Key, old.Value, change.Value); err != nil {
			return nil, err
		}
		if err := validateReferences(ctx, tx, a, change.Key, old.Value, change.Value); err != nil {
			return nil, err
		}
		change.Value = canonicalDocument(a, change.Key, old.Value, change.Value)
		if change.Key == "machine-card-managed-users" {
			cleaned, err := syncUsers(ctx, tx, change.Value, allowGeneratedPasswords, generatedPasswords)
			if err != nil {
				return nil, err
			}
			change.Value = cleaned
		}
		version := old.Version + 1
		if _, err = tx.Exec(ctx, "INSERT INTO mc_documents(key,value,version) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,version=EXCLUDED.version", change.Key, change.Value, version); err != nil {
			return nil, err
		}
		result[change.Key] = Document{Value: change.Value, Version: version}
		auditChanges = append(auditChanges, map[string]any{"key": change.Key, "change": auditDelta(old, result[change.Key])})
	}
	// Audit includes both versions. Plaintext passwords are redacted before persistence.
	audit := map[string]any{}
	for k, d := range result {
		audit[k] = d
	}
	auditBytes, _ := json.Marshal(auditChanges)
	if _, err = tx.Exec(ctx, "INSERT INTO mc_events(actor_nik,actor_role,request_key,changes) VALUES($1,$2,$3,$4)", a.NIK, a.Role, key, auditBytes); err != nil {
		return nil, err
	}
	encoded, _ := json.Marshal(result)
	if _, err = tx.Exec(ctx, "INSERT INTO mc_commits(request_key,actor_nik,payload_hash,response) VALUES($1,$2,$3,$4)", key, a.NIK, hash, encoded); err != nil {
		return nil, err
	}
	_, _ = tx.Exec(ctx, "DELETE FROM mc_commits WHERE created_at < CURRENT_TIMESTAMP - interval '7 days'")
	if len(generatedPasswords) > 0 {
		base, err := os.UserConfigDir()
		if err != nil {
			return nil, err
		}
		dir := filepath.Join(base, "MachineCard", "private")
		if err = os.MkdirAll(dir, 0700); err != nil {
			return nil, err
		}
		raw, _ := json.MarshalIndent(generatedPasswords, "", "  ")
		if err = os.WriteFile(filepath.Join(dir, "imported-accounts-"+time.Now().Format("20060102-150405.000000000")+".json"), raw, 0600); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

func syncUsers(ctx context.Context, tx pgx.Tx, raw json.RawMessage, allowGenerated bool, generated map[string]string) (json.RawMessage, error) {
	var users []map[string]any
	if json.Unmarshal(raw, &users) != nil {
		return nil, ErrConflict
	}
	activeAdmins := 0
	usernames := []string{}
	seen := map[string]bool{}
	for _, u := range users {
		nik, _ := u["nik"].(string)
		name, _ := u["name"].(string)
		role, _ := u["role"].(string)
		password, _ := u["password"].(string)
		active, ok := u["active"].(bool)
		if !ok {
			active = true
		}
		if nik == "" || name == "" || !strings.Contains("|ADMIN|SUPERVISOR|TEKNISI|OPERATOR|", "|"+role+"|") {
			return nil, ErrConflict
		}
		if seen[nik] {
			return nil, ErrConflict
		}
		seen[nik] = true
		usernames = append(usernames, nik)
		if active && role == "ADMIN" {
			activeAdmins++
		}
		var exists bool
		if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pengguna WHERE username=$1)", nik).Scan(&exists); err != nil {
			return nil, err
		}
		if !exists && len(password) < 12 {
			if !allowGenerated {
				return nil, fmt.Errorf("new user requires password of at least 12 characters")
			}
			raw := make([]byte, 18)
			if _, err := rand.Read(raw); err != nil {
				return nil, err
			}
			password = hex.EncodeToString(raw)
			generated[nik] = password
		}
		if password != "" {
			if len(password) < 12 {
				return nil, ErrConflict
			}
			hash, err := HashOperatorPassword(nik, password)
			if err != nil {
				return nil, err
			}
			if _, err = tx.Exec(ctx, "INSERT INTO pengguna(username,nama,peran,aktif,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(username) DO UPDATE SET nama=EXCLUDED.nama,peran=EXCLUDED.peran,aktif=EXCLUDED.aktif,password_hash=EXCLUDED.password_hash", nik, name, role, active, hash); err != nil {
				return nil, err
			}
		} else {
			if _, err := tx.Exec(ctx, "UPDATE pengguna SET nama=$2,peran=$3,aktif=$4 WHERE username=$1", nik, name, role, active); err != nil {
				return nil, err
			}
		}
		if password != "" {
			if _, err := tx.Exec(ctx, "DELETE FROM mc_sessions WHERE username=$1", nik); err != nil {
				return nil, err
			}
		}
		delete(u, "password")
		delete(u, "password_hash")
	}
	if activeAdmins == 0 {
		return nil, ErrConflict
	}
	if _, err := tx.Exec(ctx, "UPDATE pengguna SET aktif=false WHERE NOT(username=ANY($1::text[]))", usernames); err != nil {
		return nil, err
	}
	return json.Marshal(users)
}
