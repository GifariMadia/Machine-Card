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
		LIMIT $%d
	`, whereClause, limitPos)

	rows, err := r.pool.Query(ctx, query, values...)
	if err != nil {
		return nil, fmt.Errorf("query machines error: %w", err)
	}
	defer rows.Close()

	var machines []domain.Machine
	for rows.Next() {
		var m domain.Machine
		if err := rows.Scan(&m.IDMesin, &m.KodeMesin, &m.NamaMesin, &m.Kategori, &m.Status, &m.JumlahPart); err != nil {
			return nil, fmt.Errorf("scan machine row error: %w", err)
		}
		machines = append(machines, m)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("machines iteration error: %w", err)
	}

	if machines == nil {
		machines = []domain.Machine{}
	}
	return machines, nil
}

func (r *PostgresRepo) ListMonitoring(ctx context.Context, status string, limit int) ([]domain.MonitoringItem, error) {
	if r.pool == nil {
		return nil, ErrDegraded
	}

	query := `
		SELECT id_part_mesin, id_mesin, nama_mesin, section, nama_part, spesifikasi, posisi_part,
		       klasifikasi, lifetime_hari, waktu_penggantian, interval_penggantian_hari,
		       waktu_awal_peringatan, waktu_wajib_ganti, status_lifetime
		FROM monitoring_lifetime_part
		WHERE ($1 = '' OR status_lifetime = $1)
		ORDER BY CASE status_lifetime WHEN 'TMS' THEN 1 WHEN 'MENDEKATI_BATAS' THEN 2 WHEN 'BELUM_DAPAT_DIHITUNG' THEN 3 ELSE 4 END,
		         nama_mesin, nama_part
		LIMIT $2
	`

	rows, err := r.pool.Query(ctx, query, status, limit)
	if err != nil {
		return nil, fmt.Errorf("query monitoring error: %w", err)
	}
	defer rows.Close()

	var items []domain.MonitoringItem
	for rows.Next() {
		var item domain.MonitoringItem
		if err := rows.Scan(
			&item.IDPartMesin, &item.IDMesin, &item.NamaMesin, &item.Section, &item.NamaPart, &item.Spesifikasi,
			&item.PosisiPart, &item.Klasifikasi, &item.LifetimeHari, &item.WaktuPenggantian,
			&item.IntervalPenggantianHari, &item.WaktuAwalPeringatan, &item.WaktuWajibGanti, &item.StatusLifetime,
		); err != nil {
			return nil, fmt.Errorf("scan monitoring row error: %w", err)
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("monitoring iteration error: %w", err)
	}

	if items == nil {
		items = []domain.MonitoringItem{}
	}
	return items, nil
}

// CreateOpenWork: Operator yang aktif dapat melaporkan open work untuk SEMUA mesin di pabrik
func (r *PostgresRepo) CreateOpenWork(ctx context.Context, req domain.OpenWorkRequest) (*domain.OpenWorkResult, error) {
	if r.pool == nil {
		return nil, ErrDegraded
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction error: %w", err)
	}
	defer tx.Rollback(ctx)

	// Validasi operator aktif (tidak lagi dibatasi akses_mesin spesifik)
	var (
		idPengguna int64
		nama       string
	)
	err = tx.QueryRow(ctx, "SELECT id_pengguna, nama FROM pengguna WHERE username = $1 AND peran = 'OPERATOR' AND aktif = TRUE",
		strings.ToUpper(strings.TrimSpace(req.NIKPelapor))).Scan(&idPengguna, &nama)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrForbidden
		}
		return nil, fmt.Errorf("check operator error: %w", err)
	}

	// Ambil section mesin
	var section string
	err = tx.QueryRow(ctx, "SELECT section FROM mesin WHERE id_mesin = $1", req.IDMesin).Scan(&section)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("check machine error: %w", err)
	}

	now := time.Now().UTC()
	ticketNumber := fmt.Sprintf("OW-%s-%06d", now.Format("20060102"), now.UnixMilli()%1000000)

	var res domain.OpenWorkResult
	insertWorkQuery := `
		INSERT INTO open_work (nomor_work, id_mesin, id_pembuat, jenis_pekerjaan, keluhan_atau_pekerjaan)
		VALUES ($1, $2, $3, 'BREAKDOWN', $4)
		RETURNING id_work, nomor_work, status, waktu_dibuka
	`
	err = tx.QueryRow(ctx, insertWorkQuery, ticketNumber, req.IDMesin, idPengguna, strings.TrimSpace(req.Keterangan)).
		Scan(&res.IDWork, &res.NomorWork, &res.Status, &res.WaktuDibuka)
