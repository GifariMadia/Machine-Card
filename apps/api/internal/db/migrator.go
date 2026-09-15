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
