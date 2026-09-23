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

