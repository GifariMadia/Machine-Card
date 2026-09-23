package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"machine-card/api/internal/config"
	"machine-card/api/internal/db"
	"machine-card/api/internal/domain"
)

type Handler struct {
	cfg         *config.Config
	repo        db.Repository
	idempotency *IdempotencyStore
	obs         *ObservabilityCollector
}

func NewHandler(cfg *config.Config, repo db.Repository) *Handler {
	obs := NewObservabilityCollector()
	return &Handler{
		cfg:         cfg,
		repo:        repo,
		idempotency: NewIdempotencyStore(24*time.Hour, obs),
		obs:         obs,
	}
}

func NewHandlerWithTelemetry(cfg *config.Config, repo db.Repository, obs *ObservabilityCollector, idem *IdempotencyStore) *Handler {
	return &Handler{
		cfg:         cfg,
		repo:        repo,
		idempotency: idem,
		obs:         obs,
	}
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONBytes(w http.ResponseWriter, status int, raw []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}

// writeStructuredError menyediakan kontrak error stabil untuk mesin & manusia (Bab 16 - RFC 9457 inspired)
func writeStructuredError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	reqID := "req-unknown"
	if r != nil {
		reqID = GetRequestID(r.Context())
	}
	writeJSON(w, status, map[string]string{
		"code":       code,
		"message":    message,
		"request_id": reqID,
	})
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	serverTime, err := h.repo.Health(ctx)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status":     "degraded",
			"code":       "ERR_DB_DEGRADED",
			"message":    "Database belum tersambung",
			"request_id": GetRequestID(ctx),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"waktu_server": serverTime.Format(time.RFC3339Nano),
		"request_id":   GetRequestID(ctx),
	})
}

// GetObservability: Menyediakan SLI/SLO metrics, latency percentiles (p50/p95), idempotency stats, dan GxP Audit Trail (Bab 33 & Bab 34)
func (h *Handler) GetObservability(w http.ResponseWriter, r *http.Request) {
	if h.obs == nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
		return
	}
	snapshot := h.obs.Snapshot()
	snapshot["request_id"] = GetRequestID(r.Context())
	writeJSON(w, http.StatusOK, snapshot)
}

// GetMachines: Mengembalikan daftar seluruh mesin aktif (pencabutan restriksi otorisasi operator)
func (h *Handler) GetMachines(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	username := strings.ToUpper(strings.TrimSpace(q.Get("username")))
	search := strings.TrimSpace(q.Get("search"))
	category := strings.TrimSpace(q.Get("category"))
	limit := domain.NormalizeLimit(q.Get("limit"))

	machines, err := h.repo.ListMachines(ctx, username, search, category, limit)
	if err != nil {
		if errors.Is(err, db.ErrDegraded) {
			writeStructuredError(w, r, http.StatusServiceUnavailable, "ERR_DB_DEGRADED", "Database belum tersambung")
			return
		}
		writeStructuredError(w, r, http.StatusInternalServerError, "ERR_INTERNAL", "Terjadi kesalahan pada server")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":       machines,
		"total":      len(machines),
		"request_id": GetRequestID(ctx),
	})
}

func (h *Handler) GetMonitoring(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	status := strings.TrimSpace(q.Get("status"))
	limit := domain.NormalizeLimit(q.Get("limit"))

	items, err := h.repo.ListMonitoring(ctx, status, limit)
	if err != nil {
		if errors.Is(err, db.ErrDegraded) {
			writeStructuredError(w, r, http.StatusServiceUnavailable, "ERR_DB_DEGRADED", "Database belum tersambung")
			return
		}
		writeStructuredError(w, r, http.StatusInternalServerError, "ERR_INTERNAL", "Terjadi kesalahan pada server")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":       items,
		"total":      len(items),
		"request_id": GetRequestID(ctx),
	})
}

func (h *Handler) CreateOpenWork(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rawBody, err := ReadAndRestoreBody(r)
	if err != nil {
		writeStructuredError(w, r, http.StatusRequestEntityTooLarge, "ERR_PAYLOAD_TOO_LARGE", "Ukuran payload melebihi batas maksimum (1 MB)")
		return
	}

	idemKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	payloadHash := HashPayload(rawBody)
	if idemKey != "" && h.idempotency != nil {
		if rec, found, conflict := h.idempotency.Check("POST:/api/open-work", idemKey, payloadHash); found {
			if conflict {
				writeStructuredError(w, r, http.StatusConflict, "ERR_IDEMPOTENCY_PAYLOAD_MISMATCH", "Idempotency-Key yang sama tidak boleh digunakan untuk payload berbeda")
				return
			}
			w.Header().Set("X-Idempotent-Replayed", "true")
			writeJSONBytes(w, rec.Status, rec.Body)
			return
		}
	}

	var req domain.OpenWorkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeStructuredError(w, r, http.StatusBadRequest, "ERR_INVALID_PAYLOAD", "Data laporan breakdown belum lengkap")
		return
	}

	// Validation boundary (Bab 3 & Bab 16)
	if req.IDMesin <= 0 ||
		strings.TrimSpace(req.NIKPelapor) == "" ||
		strings.TrimSpace(req.Keterangan) == "" ||
		strings.TrimSpace(req.WaktuMulai) == "" ||
		strings.TrimSpace(req.TipeWO) == "" {
		writeStructuredError(w, r, http.StatusBadRequest, "ERR_VALIDATION_FAILED", "Data laporan breakdown belum lengkap")
		return
	}

	if req.TipeWO != "Batch" && req.TipeWO != "Non Batch" {
		writeStructuredError(w, r, http.StatusBadRequest, "ERR_INVALID_WO_TYPE", "WO Type tidak valid")
		return
	}

	if req.Shift != 1 && req.Shift != 2 && req.Shift != 3 {
		writeStructuredError(w, r, http.StatusBadRequest, "ERR_INVALID_SHIFT", "Shift tidak valid")
		return
	}

	if req.WaktuSelesai != nil && *req.WaktuSelesai != "" {
		if err := domain.ValidateTimelineInvariant(req.WaktuMulai, *req.WaktuSelesai); err != nil {
			writeStructuredError(w, r, http.StatusBadRequest, "ERR_INVALID_TIMELINE", err.Error())
			return
		}
	}

	res, err := h.repo.CreateOpenWork(ctx, req)
	if err != nil {
		if errors.Is(err, db.ErrForbidden) {
			writeStructuredError(w, r, http.StatusForbidden, "ERR_FORBIDDEN_ROLE", "Hanya operator aktif yang dapat membuat laporan Open Work")
			return
		}
		if errors.Is(err, db.ErrNotFound) {
			writeStructuredError(w, r, http.StatusNotFound, "ERR_MACHINE_NOT_FOUND", "Mesin tidak ditemukan")
			return
		}
		if errors.Is(err, db.ErrDegraded) {
			writeStructuredError(w, r, http.StatusServiceUnavailable, "ERR_DB_DEGRADED", "Database belum tersambung")
			return
		}
		writeStructuredError(w, r, http.StatusInternalServerError, "ERR_INTERNAL", "Terjadi kesalahan pada server")
		return
	}

	respPayload := map[string]any{
		"data":       res,
		"request_id": GetRequestID(ctx),
	}
	respBytes, _ := json.Marshal(respPayload)

	if idemKey != "" && h.idempotency != nil {
		h.idempotency.Save("POST:/api/open-work", idemKey, payloadHash, http.StatusCreated, respBytes)
	}

	if h.obs != nil {
		h.obs.RecordAudit(AuditEntry{
			RequestID:  GetRequestID(ctx),
			ActorNIK:   strings.ToUpper(strings.TrimSpace(req.NIKPelapor)),
			ActorRole:  "OPERATOR",
			Action:     "CREATE_OPEN_WORK",
			EntityType: "OPEN_WORK",
			EntityID:   res.NomorWork,
			StatusCode: http.StatusCreated,
			Metadata: map[string]any{
				"id_mesin": req.IDMesin,
				"shift":    req.Shift,
				"tipe_wo":  req.TipeWO,
			},
		})
	}

	writeJSONBytes(w, http.StatusCreated, respBytes)
}

// CloseOpenWork: Operator menutup tiket saat mesin mulai beroperasi kembali (mendukung skenario pergantian shift, idempotensi, & optimistic concurrency)
func (h *Handler) CloseOpenWork(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rawBody, err := ReadAndRestoreBody(r)
	if err != nil {
		writeStructuredError(w, r, http.StatusRequestEntityTooLarge, "ERR_PAYLOAD_TOO_LARGE", "Ukuran payload melebihi batas maksimum (1 MB)")
		return
	}

	idemKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	payloadHash := HashPayload(rawBody)
	if idemKey != "" && h.idempotency != nil {
		if rec, found, conflict := h.idempotency.Check("POST:/api/open-work/close", idemKey, payloadHash); found {
			if conflict {
				writeStructuredError(w, r, http.StatusConflict, "ERR_IDEMPOTENCY_PAYLOAD_MISMATCH", "Idempotency-Key yang sama tidak boleh digunakan untuk payload berbeda")
				return
			}
			w.Header().Set("X-Idempotent-Replayed", "true")
			writeJSONBytes(w, rec.Status, rec.Body)
			return
		}
	}

	var req domain.OpenWorkCloseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeStructuredError(w, r, http.StatusBadRequest, "ERR_INVALID_PAYLOAD", "Data closing tiket tidak valid")
		return
	}

	if req.IDWork <= 0 && strings.TrimSpace(req.NomorWork) == "" {
		writeStructuredError(w, r, http.StatusBadRequest, "ERR_MISSING_TICKET_ID", "ID atau Nomor Work wajib disertakan")
		return
	}

	if strings.TrimSpace(req.NIKOperator) == "" {
		writeStructuredError(w, r, http.StatusBadRequest, "ERR_MISSING_OPERATOR_NIK", "NIK Operator penutup wajib diisi")
		return
	}

	if req.Shift != 1 && req.Shift != 2 && req.Shift != 3 {
		writeStructuredError(w, r, http.StatusBadRequest, "ERR_INVALID_SHIFT", "Shift penutupan tiket tidak valid (1, 2, atau 3)")
		return
	}

	result, err := h.repo.CloseOpenWorkByOperator(ctx, req)
	if err != nil {
		if errors.Is(err, db.ErrForbidden) {
			writeStructuredError(w, r, http.StatusForbidden, "ERR_FORBIDDEN_ROLE", "Hanya operator aktif yang dapat menutup tiket")
			return
		}
		if errors.Is(err, db.ErrNotFound) {
			writeStructuredError(w, r, http.StatusNotFound, "ERR_TICKET_NOT_FOUND", "Tiket open work tidak ditemukan")
			return
		}
		if errors.Is(err, db.ErrConflict) || errors.Is(err, domain.ErrInvalidTransition) {
			writeStructuredError(w, r, http.StatusConflict, "ERR_CONFLICT_STATE", "Konflik status tiket: tiket sudah ditutup atau sedang dimodifikasi oleh sesi lain")
			return
		}
		if errors.Is(err, domain.ErrInvalidTimeline) {
			writeStructuredError(w, r, http.StatusBadRequest, "ERR_INVALID_TIMELINE", err.Error())
			return
		}
		if errors.Is(err, db.ErrDegraded) {
			writeStructuredError(w, r, http.StatusServiceUnavailable, "ERR_DB_DEGRADED", "Database belum tersambung")
			return
		}
		writeStructuredError(w, r, http.StatusInternalServerError, "ERR_INTERNAL", "Terjadi kesalahan pada server")
		return
	}

	respPayload := map[string]any{
		"message":    "Tiket berhasil diclosing oleh operator. Mesin tercatat telah beroperasi kembali.",
		"data":       result,
		"request_id": GetRequestID(ctx),
	}
	respBytes, _ := json.Marshal(respPayload)

	if idemKey != "" && h.idempotency != nil {
		h.idempotency.Save("POST:/api/open-work/close", idemKey, payloadHash, http.StatusOK, respBytes)
	}

	if h.obs != nil {
		h.obs.RecordAudit(AuditEntry{
			RequestID:  GetRequestID(ctx),
			ActorNIK:   strings.ToUpper(strings.TrimSpace(req.NIKOperator)),
			ActorRole:  "OPERATOR",
			Action:     "CLOSE_OPEN_WORK",
			EntityType: "OPEN_WORK",
			EntityID:   result.NomorWork,
			StatusCode: http.StatusOK,
			Metadata: map[string]any{
				"shift_penutup":     req.Shift,
				"is_shift_handover": result.IsShiftHandover,
				"version":           result.Version,
			},
		})
	}

	writeJSONBytes(w, http.StatusOK, respBytes)
}

// GetOpenWorks: Mengambil riwayat breakdown tiket dengan perbandingan waktu teknisi vs downtime operasional
func (h *Handler) GetOpenWorks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
