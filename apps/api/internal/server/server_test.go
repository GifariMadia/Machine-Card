package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"machine-card/api/internal/config"
	"machine-card/api/internal/db"
	"machine-card/api/internal/domain"
	"machine-card/api/internal/server"
)

func setupTestRouter(degraded bool) (http.Handler, *db.MockRepo) {
	cfg := &config.Config{
		Port:              4000,
		DatabaseURL:       "postgres://localhost",
		WebOrigin:         "http://localhost:5173",
		DiscordWebhookURL: "https://discord.com/api/webhooks/simulate",
	}
	repo := db.NewMockRepo()
	repo.Degraded = degraded
	obs := server.NewObservabilityCollector()
	handler := server.NewHandlerWithTelemetry(cfg, repo, obs, server.NewIdempotencyStore(24*time.Hour, obs))
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", handler.BackendConsole)
	mux.HandleFunc("GET /api/health", handler.Health)
	mux.HandleFunc("GET /api/machines", handler.GetMachines)
	mux.HandleFunc("GET /api/monitoring", handler.GetMonitoring)
	mux.HandleFunc("GET /api/open-work", handler.GetOpenWorks)
	mux.HandleFunc("POST /api/open-work", handler.CreateOpenWork)
	mux.HandleFunc("POST /api/open-work/close", handler.CloseOpenWork)
	mux.HandleFunc("GET /api/analytics/breakdown", handler.GetBreakdownAnalytics)
	mux.HandleFunc("POST /api/shift-report/discord", handler.PostShiftReportDiscord)
	mux.HandleFunc("GET /api/observability", handler.GetObservability)
	router := server.CORSMiddleware(cfg.WebOrigin)(server.RequestIDAndLoggingMiddleware(obs)(server.SecurityHeadersMiddleware(mux)))
	return router, repo
}

func TestHealthEndpoint(t *testing.T) {
	t.Run("healthy status", func(t *testing.T) {
		router, _ := setupTestRouter(false)
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Status = %d; want %d", rec.Code, http.StatusOK)
		}

		var body map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}
		if body["status"] != "ok" {
			t.Errorf("status = %v; want 'ok'", body["status"])
		}
		if body["waktu_server"] == nil {
			t.Error("waktu_server is missing")
		}
	})

	t.Run("degraded status", func(t *testing.T) {
		router, _ := setupTestRouter(true)
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("Status = %d; want %d", rec.Code, http.StatusServiceUnavailable)
		}

		var body map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}
		if body["status"] != "degraded" {
			t.Errorf("status = %s; want 'degraded'", body["status"])
		}
	})
}

func TestGetMachinesEndpoint(t *testing.T) {
	router, _ := setupTestRouter(false)

	t.Run("unrestricted operator machine access returns all machines", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/machines?username=OPR0001", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Status = %d; want %d", rec.Code, http.StatusOK)
		}

		var body struct {
			Data  []domain.Machine `json:"data"`
			Total int              `json:"total"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("Failed to parse json: %v", err)
		}
		// Mock has 3 machines, all should be accessible
		if body.Total != 3 {
			t.Errorf("Total = %d; want 3", body.Total)
		}
	})

	t.Run("category filtering works across all machines", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/machines?username=OPR0001&category=Filling", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Status = %d; want %d", rec.Code, http.StatusOK)
		}

		var body struct {
			Data  []domain.Machine `json:"data"`
			Total int              `json:"total"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if body.Total != 1 || body.Data[0].NamaMesin != "Ilapak 1" {
			t.Errorf("Expected 1 Filling machine, got %d", body.Total)
		}
	})
}

func TestGetMonitoringEndpoint(t *testing.T) {
	router, _ := setupTestRouter(false)

	req := httptest.NewRequest(http.MethodGet, "/api/monitoring?limit=10", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d; want %d", rec.Code, http.StatusOK)
	}

	var body struct {
		Data  []domain.MonitoringItem `json:"data"`
		Total int                     `json:"total"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Failed to parse json: %v", err)
	}
	if body.Total != 1 {
		t.Errorf("Total = %d; want 1", body.Total)
	}
}

func TestCreateOpenWorkEndpoint(t *testing.T) {
	router, _ := setupTestRouter(false)

	t.Run("validation error on incomplete fields", func(t *testing.T) {
		payload := map[string]any{
			"id_mesin": 1,
		}
		bodyBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/open-work", bytes.NewReader(bodyBytes))
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("Status = %d; want %d", rec.Code, http.StatusBadRequest)
		}
	})

	t.Run("invalid WO Type returns 400", func(t *testing.T) {
		payload := map[string]any{
			"id_mesin":    1,
			"nik_pelapor": "OPR0001",
			"shift":       1,
			"keterangan":  "Motor rusak",
			"waktu_mulai": "2026-10-16T08:00:00Z",
			"tipe_wo":     "InvalidWO",
		}
		bodyBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/open-work", bytes.NewReader(bodyBytes))
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("Status = %d; want %d", rec.Code, http.StatusBadRequest)
		}
	})

	t.Run("successful creation by active operator returns 201", func(t *testing.T) {
		payload := map[string]any{
			"id_mesin":    1,
			"nik_pelapor": "OPR0001",
			"shift":       1,
			"keterangan":  "Pisau tumpul",
			"waktu_mulai": "2026-10-16T08:00:00Z",
			"tipe_wo":     "Batch",
			"kode_produk": "PRD-01",
			"no_batch":    "B-1234",
		}
