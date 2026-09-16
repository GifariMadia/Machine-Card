package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"machine-card/api/internal/domain"
)

var (
	ErrForbidden   = errors.New("forbidden")
	ErrRateLimited = errors.New("login rate limited")
	ErrNotFound    = errors.New("not found")
	ErrConflict    = errors.New("conflict")
	ErrDegraded    = errors.New("database not connected")
)

type Repository interface {
	Health(ctx context.Context) (time.Time, error)
	ListMachines(ctx context.Context, username, search, category string, limit int) ([]domain.Machine, error)
	ListMonitoring(ctx context.Context, status string, limit int) ([]domain.MonitoringItem, error)
	CreateOpenWork(ctx context.Context, req domain.OpenWorkRequest) (*domain.OpenWorkResult, error)
	CloseOpenWorkByOperator(ctx context.Context, req domain.OpenWorkCloseRequest) (*domain.DetailedTicketItem, error)
	ListOpenWorks(ctx context.Context, status, machine, section string, limit int) ([]domain.DetailedTicketItem, error)
	GetBreakdownAnalytics(ctx context.Context) (*domain.BreakdownAnalytics, error)
	Close()
}

type PostgresRepo struct {
	pool *pgxpool.Pool
}

func NewPostgresRepo(ctx context.Context, databaseURL string) (*PostgresRepo, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid database URL: %w", err)
	}

	config.MaxConns = 10
	config.MinConns = 2
	config.MaxConnLifetime = 1 * time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connection
	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping postgres: %w", err)
	}

	return &PostgresRepo{pool: pool}, nil
}

func (r *PostgresRepo) Close() {
	if r.pool != nil {
		r.pool.Close()
	}
}

func (r *PostgresRepo) Health(ctx context.Context) (time.Time, error) {
	if r.pool == nil {
		return time.Time{}, ErrDegraded
	}
	var serverTime time.Time
	err := r.pool.QueryRow(ctx, "SELECT NOW() AS waktu_server").Scan(&serverTime)
	if err != nil {
		return time.Time{}, err
	}
	return serverTime, nil
}

// ListMachines: Operator memiliki akses ke SEMUA mesin di pabrik untuk kemudahan lapangan
func (r *PostgresRepo) ListMachines(ctx context.Context, _ string, search, category string, limit int) ([]domain.Machine, error) {
	if r.pool == nil {
		return nil, ErrDegraded
	}

	var values []any
	var filters []string

	if search != "" {
		values = append(values, "%"+search+"%")
		pos := len(values)
		filters = append(filters, fmt.Sprintf("(m.nama_mesin ILIKE $%d OR m.kode_mesin ILIKE $%d)", pos, pos))
	}

	if category != "" && category != "Semua kategori" {
		values = append(values, category)
		pos := len(values)
		filters = append(filters, fmt.Sprintf("m.section = $%d", pos))
	}

	values = append(values, limit)
	limitPos := len(values)

	whereClause := ""
	if len(filters) > 0 {
		whereClause = "WHERE " + strings.Join(filters, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT m.id_mesin, m.kode_mesin, m.nama_mesin, m.section AS kategori, m.status_mesin AS status,
		       COUNT(pm.id_part_mesin)::int AS jumlah_part
		FROM mesin m
		LEFT JOIN part_mesin pm ON pm.id_mesin = m.id_mesin
		%s
		GROUP BY m.id_mesin
		ORDER BY m.nama_mesin
