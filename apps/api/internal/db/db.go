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
	if err != nil {
		return nil, fmt.Errorf("insert open_work error: %w", err)
	}

	insertBreakdownQuery := `
		INSERT INTO breakdown
		  (id_work, tanggal, shift, id_mesin, section, keterangan, id_operator,
		   kode_produk, no_batch, waktu_mulai, waktu_selesai, no_work_request, tipe_wo, kategori_breakdown)
		VALUES ($1, ($8::timestamptz AT TIME ZONE 'Asia/Jakarta')::date, $2, $3, $4, $5, $6,
		        $7, $9, $8::timestamptz, $10::timestamptz, $11, $12, $13)
	`
	_, err = tx.Exec(ctx, insertBreakdownQuery,
		res.IDWork,
		req.Shift,
		req.IDMesin,
		section,
		strings.TrimSpace(req.Keterangan),
		idPengguna,
		req.KodeProduk,
		req.WaktuMulai,
		req.NoBatch,
		req.WaktuSelesai,
		req.NoWorkRequest,
		req.TipeWO,
		req.KategoriBreakdown,
	)
	if err != nil {
		return nil, fmt.Errorf("insert breakdown error: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit error: %w", err)
	}

	return &res, nil
}

// CloseOpenWorkByOperator: Operator di lapangan (bisa operator dari shift berikutnya) menutup tiket setelah mesin beroperasi kembali
func (r *PostgresRepo) CloseOpenWorkByOperator(ctx context.Context, req domain.OpenWorkCloseRequest) (*domain.DetailedTicketItem, error) {
	if r.pool == nil {
		return nil, ErrDegraded
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction error: %w", err)
	}
	defer tx.Rollback(ctx)

	// Validasi operator penutup (bisa dari shift yang sama atau shift lanjutan)
	var (
		idPenutup   int64
		namaPenutup string
	)
	err = tx.QueryRow(ctx, "SELECT id_pengguna, nama FROM pengguna WHERE username = $1 AND peran = 'OPERATOR' AND aktif = TRUE",
		strings.ToUpper(strings.TrimSpace(req.NIKOperator))).Scan(&idPenutup, &namaPenutup)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrForbidden
		}
		return nil, fmt.Errorf("check operator error: %w", err)
	}

	// Temukan tiket dan lock baris (pessimistic + optimistic concurrency check - Bab 19)
	var (
		idWork              int64
		nomorWork           string
		idMesin             int64
		currentStatus       string
		currentVersion      int
		waktuDibuka         time.Time
		waktuMulaiBreakdown time.Time
		shiftLapor          int
	)
	findQuery := `
		SELECT ow.id_work, ow.nomor_work, ow.id_mesin, ow.status, COALESCE(ow.version, 1), ow.waktu_dibuka, b.waktu_mulai, b.shift
		FROM open_work ow
		JOIN breakdown b ON b.id_work = ow.id_work
		WHERE (($1::bigint > 0 AND ow.id_work = $1) OR ($1::bigint = 0 AND ow.nomor_work = $2))
          AND ($2 = '' OR ow.nomor_work = $2)
		FOR UPDATE OF ow
	`
	err = tx.QueryRow(ctx, findQuery, req.IDWork, req.NomorWork).
		Scan(&idWork, &nomorWork, &idMesin, &currentStatus, &currentVersion, &waktuDibuka, &waktuMulaiBreakdown, &shiftLapor)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("find ticket error: %w", err)
	}

	// Validasi State Machine (Bab 17): tiket CLOSED tidak boleh ditutup ulang
	if err := domain.ValidateTicketTransition(currentStatus, "CLOSED", "OPERATOR"); err != nil {
		return nil, ErrConflict
	}

	// Validasi Optimistic Concurrency (Bab 19 & Lab 2)
	if req.ExpectedVersion != nil && *req.ExpectedVersion != currentVersion {
		return nil, ErrConflict
	}

	// Tentukan waktu mesin beroperasi kembali
	waktuResume := time.Now().UTC()
	if req.WaktuMesinBeroperasi != "" {
		if parsed, err := time.Parse(time.RFC3339, req.WaktuMesinBeroperasi); err == nil {
			waktuResume = parsed
		}
	}

	// Validasi Invariant Waktu (Bab 2 & Bab 18): waktu mesin beroperasi >= waktu mulai breakdown
	if waktuResume.Before(waktuMulaiBreakdown) || waktuResume.After(time.Now().UTC()) {
		return nil, domain.ErrInvalidTimeline
	}

	// Hitung durasi perbaikan teknisi (jika ada catatan pengerjaan)
	var techDurationHours *float64
	row := tx.QueryRow(ctx, `
		SELECT EXTRACT(EPOCH FROM (waktu_selesai - waktu_mulai)) / 3600.0
		FROM catatan_pengerjaan
		WHERE id_work = $1 AND waktu_selesai IS NOT NULL
		ORDER BY waktu_selesai DESC
		LIMIT 1
	`, idWork)
	var dur float64
	if err := row.Scan(&dur); err == nil {
		techDurationHours = &dur
	}

	// Update open_work dengan conditional status & increment version (Bab 19)
	newVersion := currentVersion + 1
	updateWorkQuery := `
		UPDATE open_work
		SET status = 'CLOSED',
		    version = $1,
		    id_penutup = $2,
		    shift_penutup = $3,
		    waktu_mesin_beroperasi = $4,
		    waktu_ditutup = CURRENT_TIMESTAMP,
		    catatan_closing_operator = $5
		WHERE id_work = $6 AND status <> 'CLOSED'
	`
	cmdTag, err := tx.Exec(ctx, updateWorkQuery, newVersion, idPenutup, req.Shift, waktuResume, strings.TrimSpace(req.CatatanClosing), idWork)
	if err != nil {
		return nil, fmt.Errorf("update open_work error: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return nil, ErrConflict
	}

	// Update breakdown
	updateBreakdownQuery := `
		UPDATE breakdown
		SET waktu_mesin_beroperasi = $1,
		    id_operator_penutup = $2,
		    shift_penutup = $3,
		    waktu_selesai = COALESCE(waktu_selesai, $1),
		    durasi_perbaikan_teknisi_jam = $4,
		    version = COALESCE(version, 1) + 1
		WHERE id_work = $5
	`
	_, err = tx.Exec(ctx, updateBreakdownQuery, waktuResume, idPenutup, req.Shift, techDurationHours, idWork)
	if err != nil {
		return nil, fmt.Errorf("update breakdown error: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit error: %w", err)
	}

	downtimeMinutes := waktuResume.Sub(waktuMulaiBreakdown).Minutes()
	isHandover := req.Shift != shiftLapor
	resumeStr := waktuResume.Format(time.RFC3339)
	closingNotes := strings.TrimSpace(req.CatatanClosing)

	return &domain.DetailedTicketItem{
		IDWork:               idWork,
		NomorWork:            nomorWork,
		IDMesin:              idMesin,
		Status:               "CLOSED",
		Version:              newVersion,
		PenutupNIK:           &req.NIKOperator,
		PenutupNama:          &namaPenutup,
		ShiftPenutup:         &req.Shift,
		WaktuMesinBeroperasi: &resumeStr,
		CatatanClosing:       &closingNotes,
		DurasiDowntimeMenit:  &downtimeMinutes,
		IsShiftHandover:      isHandover,
	}, nil
}

// ListOpenWorks: Mengambil daftar tiket breakdown dengan rincian timeline pelapor, teknisi, dan penutup
func (r *PostgresRepo) ListOpenWorks(ctx context.Context, status, machine, section string, limit int) ([]domain.DetailedTicketItem, error) {
	if r.pool == nil {
		return nil, ErrDegraded
	}

	var values []any
	var filters []string

	if status != "" && status != "ALL" {
		values = append(values, status)
		filters = append(filters, fmt.Sprintf("ow.status = $%d", len(values)))
	}

	if machine != "" {
		values = append(values, "%"+machine+"%")
		pos := len(values)
		filters = append(filters, fmt.Sprintf("(m.nama_mesin ILIKE $%d OR m.kode_mesin ILIKE $%d)", pos, pos))
	}

	if section != "" && section != "Semua kategori" {
		values = append(values, section)
		filters = append(filters, fmt.Sprintf("m.section = $%d", len(values)))
	}

	values = append(values, limit)
	limitPos := len(values)

	whereClause := ""
	if len(filters) > 0 {
		whereClause = "WHERE " + strings.Join(filters, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT ow.id_work, ow.nomor_work, ow.id_mesin, m.kode_mesin, m.nama_mesin, m.section,
		       p_pembuat.username AS pelapor_nik, p_pembuat.nama AS pelapor_nama, b.shift AS shift_lapor,
		       b.waktu_mulai AS waktu_mulai_breakdown, b.keterangan, COALESCE(b.kategori_breakdown, 'Umum') AS kategori_breakdown,
		       b.tipe_wo, COALESCE(b.kode_produk, '') AS kode_produk, COALESCE(b.no_batch, '') AS no_batch,
		       COALESCE(b.no_work_request, '') AS no_work_request, ow.status,
		       cp.waktu_mulai AS waktu_mulai_teknisi, cp.waktu_selesai AS waktu_selesai_teknisi,
		       p_tek.username AS teknisi_nik, p_tek.nama AS teknisi_nama, cp.tindakan AS tindakan_teknisi,
		       p_tutup.username AS penutup_nik, p_tutup.nama AS penutup_nama, ow.shift_penutup,
		       ow.waktu_mesin_beroperasi, ow.catatan_closing_operator
		FROM open_work ow
		JOIN breakdown b ON b.id_work = ow.id_work
		JOIN mesin m ON m.id_mesin = ow.id_mesin
		JOIN pengguna p_pembuat ON p_pembuat.id_pengguna = ow.id_pembuat
		LEFT JOIN pengguna p_tutup ON p_tutup.id_pengguna = ow.id_penutup
		LEFT JOIN LATERAL (
		    SELECT cp.waktu_mulai, cp.waktu_selesai, cp.id_teknisi, cp.tindakan
