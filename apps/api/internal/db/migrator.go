package db

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/scrypt"
)

type Migrator struct {
	databaseURL string
	basePath    string
}

func NewMigrator(databaseURL, basePath string) *Migrator {
	return &Migrator{
		databaseURL: databaseURL,
		basePath:    basePath,
	}
}

func HashOperatorPassword(username, password string) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	salt := hex.EncodeToString(raw)

	derived, err := scrypt.Key([]byte(password), []byte(salt), 16384, 8, 1, 64)
	if err != nil {
		return "", fmt.Errorf("failed to derive scrypt key: %w", err)
	}

	return fmt.Sprintf("scrypt$%s$%s", salt, hex.EncodeToString(derived)), nil
}

func (m *Migrator) Run(ctx context.Context, mode string) error {
	folder := "migrations"
	if mode == "seed" {
		folder = "seeds"
	}

	// Find database folder
	candidateDirs := []string{
		filepath.Join(m.basePath, "database", folder),
		filepath.Join(m.basePath, "..", "database", folder),
		filepath.Join(m.basePath, "..", "..", "database", folder),
	}

	var root string
	for _, dir := range candidateDirs {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			root = dir
			break
		}
	}
	if root == "" {
		return fmt.Errorf("directory for %s not found in candidates: %v", folder, candidateDirs)
	}

	conn, err := pgx.Connect(ctx, m.databaseURL)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer conn.Close(ctx)

	entries, err := os.ReadDir(root)
	if err != nil {
		return fmt.Errorf("failed to read dir %s: %w", root, err)
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	if mode != "seed" {
		_, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
			nama_file TEXT PRIMARY KEY,
			diterapkan_pada TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`)
		if err != nil {
			return fmt.Errorf("failed to ensure schema_migrations table: %w", err)
		}
	}

	for _, file := range files {
		if mode != "seed" {
			var exists int
			err := conn.QueryRow(ctx, "SELECT 1 FROM schema_migrations WHERE nama_file = $1", file).Scan(&exists)
			if err == nil && exists == 1 {
				log.Printf("Lewati: %s/%s", folder, file)
				continue
			}
		}

		filePath := filepath.Join(root, file)
		sqlBytes, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", filePath, err)
		}

		_, err = conn.Exec(ctx, string(sqlBytes))
		if err != nil {
			return fmt.Errorf("failed to execute %s/%s: %w", folder, file, err)
		}

		if mode != "seed" {
			_, err = conn.Exec(ctx, "INSERT INTO schema_migrations (nama_file) VALUES ($1)", file)
			if err != nil {
				return fmt.Errorf("failed to record migration %s: %w", file, err)
			}
		}
		log.Printf("Selesai: %s/%s", folder, file)
	}

	if mode == "seed" {
		if err := m.seedOperators(ctx, conn); err != nil {
			return err
		}
	}

	return nil
}

func (m *Migrator) seedOperators(ctx context.Context, conn *pgx.Conn) error {
	candidateFiles := []string{
		filepath.Join(m.basePath, "apps", "web", "src", "operator-seed.md"),
		filepath.Join(m.basePath, "..", "web", "src", "operator-seed.md"),
		filepath.Join(m.basePath, "..", "..", "apps", "web", "src", "operator-seed.md"),
	}

	var operatorPath string
	for _, f := range candidateFiles {
		if _, err := os.Stat(f); err == nil {
			operatorPath = f
			break
		}
	}
	if operatorPath == "" {
		return fmt.Errorf("operator-seed.md not found in candidates: %v", candidateFiles)
	}

	file, err := os.Open(operatorPath)
	if err != nil {
		return fmt.Errorf("failed to open %s: %w", operatorPath, err)
	}
	defer file.Close()

	lineRegex := regexp.MustCompile(`^\|\s*\d+\s*\|`)
	cleanReplacer := strings.NewReplacer("**", "", "*(", "", ")*", "")

	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin tx for seed: %w", err)
	}
	defer tx.Rollback(ctx)

	scanner := bufio.NewScanner(file)
	rowCount := 0

	for scanner.Scan() {
		line := scanner.Text()
		if !lineRegex.MatchString(line) {
			continue
		}

		parts := strings.Split(line, "|")
		if len(parts) < 6 {
			continue
		}

		rawNo := strings.TrimSpace(cleanReplacer.Replace(parts[1]))
		name := strings.TrimSpace(cleanReplacer.Replace(parts[2]))
		rawMachines := strings.TrimSpace(cleanReplacer.Replace(parts[4]))

		no, err := strconv.Atoi(rawNo)
		if err != nil {
			continue
		}

		username := fmt.Sprintf("OPR%04d", no)
		password := fmt.Sprintf("Operator@%03d", no)
		passwordHash, err := HashOperatorPassword(username, password)
		if err != nil {
			return fmt.Errorf("failed to hash password for %s: %w", username, err)
		}

		var idOperator int64
		userQuery := `
			INSERT INTO pengguna (nama, username, password_hash, peran)
			VALUES ($1, $2, $3, 'OPERATOR')
			ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
			RETURNING id_pengguna
		`
		err = tx.QueryRow(ctx, userQuery, name, username, passwordHash).Scan(&idOperator)
		if err != nil {
			return fmt.Errorf("failed to insert operator %s: %w", username, err)
		}

		_, err = tx.Exec(ctx, "DELETE FROM akses_mesin WHERE id_operator = $1", idOperator)
		if err != nil {
			return fmt.Errorf("failed to delete existing machine access for operator %d: %w", idOperator, err)
		}

		if rawMachines != "Tidak tercantum" && rawMachines != "" {
			machineNames := strings.Split(rawMachines, ",")
			for _, mName := range machineNames {
				cleanMName := strings.TrimSpace(mName)
				if cleanMName == "" {
					continue
				}
				_, err = tx.Exec(ctx, `
					INSERT INTO akses_mesin (id_operator, id_mesin, boleh_open_work)
					SELECT $1, id_mesin, TRUE FROM mesin WHERE nama_mesin = $2
					ON CONFLICT (id_operator, id_mesin) DO UPDATE SET boleh_open_work = TRUE
				`, idOperator, cleanMName)
				if err != nil {
					return fmt.Errorf("failed to link operator %s to machine %s: %w", username, cleanMName, err)
				}
			}
		}

		rowCount++
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("error reading operator-seed.md: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit operator seeds: %w", err)
	}

	log.Printf("Selesai: %d pengguna operator dan akses mesin", rowCount)
	return nil
}
