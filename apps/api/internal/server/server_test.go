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
		bodyBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/open-work", bytes.NewReader(bodyBytes))
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Status = %d; want %d", rec.Code, http.StatusCreated)
		}

		var body struct {
			Data domain.OpenWorkResult `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("Failed to parse json: %v", err)
		}
		if body.Data.NomorWork == "" {
			t.Error("NomorWork is empty in response")
		}
	})
}

func TestOperatorClosingEndpoint(t *testing.T) {
	router, _ := setupTestRouter(false)

	t.Run("operator can close ticket and record machine resume time", func(t *testing.T) {
		payload := domain.OpenWorkCloseRequest{
			IDWork:               1001,
			NomorWork:            "OW-20261016-123456",
			NIKOperator:          "OPR0002", // Different operator from shift 2
			Shift:                2,
			WaktuMesinBeroperasi: "2026-10-16T15:30:00Z",
			CatatanClosing:       "Running test selesai, produk normal.",
		}
		bodyBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/open-work/close", bytes.NewReader(bodyBytes))
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Status = %d; want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
		}

		var resp struct {
			Message string                    `json:"message"`
			Data    domain.DetailedTicketItem `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse json: %v", err)
		}
		if resp.Data.Status != "CLOSED" {
			t.Errorf("Status = %s; want 'CLOSED'", resp.Data.Status)
		}
		if !resp.Data.IsShiftHandover {
			t.Error("IsShiftHandover should be true for Shift 2 closing Shift 1 breakdown")
		}
	})
}

func TestGetOpenWorksEndpoint(t *testing.T) {
	router, _ := setupTestRouter(false)

	req := httptest.NewRequest(http.MethodGet, "/api/open-work", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d; want %d", rec.Code, http.StatusOK)
	}

	var body struct {
		Data  []domain.DetailedTicketItem `json:"data"`
		Total int                         `json:"total"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Failed to parse json: %v", err)
	}
	if body.Total != 1 {
		t.Errorf("Total = %d; want 1", body.Total)
	}
	tkt := body.Data[0]
	if tkt.DurasiDowntimeMenit == nil || *tkt.DurasiDowntimeMenit <= 0 {
		t.Error("DurasiDowntimeMenit should be calculated")
	}
	if tkt.DurasiPerbaikanMenit == nil || *tkt.DurasiPerbaikanMenit <= 0 {
		t.Error("DurasiPerbaikanMenit should be calculated")
	}
}

func TestGetBreakdownAnalyticsEndpoint(t *testing.T) {
	router, _ := setupTestRouter(false)

	req := httptest.NewRequest(http.MethodGet, "/api/analytics/breakdown", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d; want %d", rec.Code, http.StatusOK)
	}

	var body struct {
		Data domain.BreakdownAnalytics `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Failed to parse json: %v", err)
	}
	if body.Data.TotalIncidents != 15 {
		t.Errorf("TotalIncidents = %d; want 15", body.Data.TotalIncidents)
	}
	if body.Data.MTTROperationalHours <= 0 {
		t.Error("MTTROperationalHours should be > 0")
	}
	if body.Data.MTBFHours <= 0 {
		t.Error("MTBFHours should be > 0")
	}
	if len(body.Data.AreaStats) == 0 {
		t.Error("AreaStats should not be empty")
	}
	if len(body.Data.TopMachines) == 0 {
		t.Error("TopMachines should not be empty")
	}
}

func TestPostShiftReportDiscordEndpoint(t *testing.T) {
	router, _ := setupTestRouter(false)

	payload := map[string]any{
		"supervisorName":      "SPV Testing",
		"supervisorNik":       "SPV0001",
		"department":          "Maintenance",
		"plant":               "Pulogadung",
		"shift":               "1",
		"activeMachinesCount": 10,
		"breakdownCount":      0,
		"webhookUrl":          "https://example.com/simulate",
	}
	bodyBytes, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/shift-report/discord", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d; want %d", rec.Code, http.StatusOK)
	}

	var body domain.DiscordReportResult
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Failed to parse json: %v", err)
	}
	if !body.Success || !body.Simulated {
		t.Errorf("Expected Success=true & Simulated=true; got Success=%v, Simulated=%v", body.Success, body.Simulated)
	}
}

func TestCORSOptionsPreflight(t *testing.T) {
	router, _ := setupTestRouter(false)

	req := httptest.NewRequest(http.MethodOptions, "/api/machines", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("OPTIONS Status = %d; want %d", rec.Code, http.StatusNoContent)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Errorf("CORS origin header = %s; want 'http://localhost:5173'", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

// Lab 3 (Bab 17 & Bab 56): Pengujian Idempotensi Request (replay identik & deteksi konflik payload berbeda)
func TestIdempotencyContract(t *testing.T) {
	router, _ := setupTestRouter(false)

	payload1 := map[string]any{
		"id_mesin":    1,
		"nik_pelapor": "OPR0001",
		"shift":       1,
		"keterangan":  "Sensor eye mark tertutup debu",
		"waktu_mulai": "2026-10-20T08:00:00Z",
		"tipe_wo":     "Batch",
	}
	body1, _ := json.Marshal(payload1)

	// 1. Request pertama dengan Idempotency-Key
	req1 := httptest.NewRequest(http.MethodPost, "/api/open-work", bytes.NewReader(body1))
	req1.Header.Set("Idempotency-Key", "idem-key-openwork-001")
	rec1 := httptest.NewRecorder()
	router.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusCreated {
		t.Fatalf("First request status = %d; want 201", rec1.Code)
	}
	if rec1.Header().Get("X-Idempotent-Replayed") != "" {
		t.Errorf("First request should not be marked replayed")
	}

	// 2. Request kedua (retry) dengan Idempotency-Key & payload yang SAMA -> harus mengembalikan respons yang sama + header X-Idempotent-Replayed: true
	req2 := httptest.NewRequest(http.MethodPost, "/api/open-work", bytes.NewReader(body1))
	req2.Header.Set("Idempotency-Key", "idem-key-openwork-001")
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusCreated {
		t.Fatalf("Replay request status = %d; want 201", rec2.Code)
	}
