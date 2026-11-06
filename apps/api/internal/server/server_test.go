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
	if rec2.Header().Get("X-Idempotent-Replayed") != "true" {
		t.Errorf("Expected X-Idempotent-Replayed=true on duplicate retry")
	}

	// 3. Request ketiga dengan Idempotency-Key SAMA tetapi payload BERBEDA -> wajib 409 Conflict (Bab 17)
	payloadDiff := map[string]any{
		"id_mesin":    2,
		"nik_pelapor": "OPR0001",
		"shift":       2,
		"keterangan":  "Payload berbeda dengan kunci sama",
		"waktu_mulai": "2026-10-20T09:00:00Z",
		"tipe_wo":     "Non Batch",
	}
	bodyDiff, _ := json.Marshal(payloadDiff)
	req3 := httptest.NewRequest(http.MethodPost, "/api/open-work", bytes.NewReader(bodyDiff))
	req3.Header.Set("Idempotency-Key", "idem-key-openwork-001")
	rec3 := httptest.NewRecorder()
	router.ServeHTTP(rec3, req3)

	if rec3.Code != http.StatusConflict {
		t.Fatalf("Mismatched payload with same Idempotency-Key status = %d; want 409 Conflict", rec3.Code)
	}
}

// Lab 1 & Lab 2 (Bab 19 & Bab 56): Concurrency Control & Optimistic Locking pada Penutupan Tiket
func TestConcurrentClosingAndOptimisticLock(t *testing.T) {
	router, _ := setupTestRouter(false)

	t.Run("20 concurrent close requests only allow 1 success and 19 conflicts", func(t *testing.T) {
		const workers = 20
		var wg sync.WaitGroup
		var successCount int32
		var conflictCount int32

		for i := 0; i < workers; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				payload := domain.OpenWorkCloseRequest{
					IDWork:               2002,
					NomorWork:            "OW-RACE-2002",
					NIKOperator:          "OPR0002",
					Shift:                2,
					WaktuMesinBeroperasi: "2026-10-20T15:30:00Z",
					CatatanClosing:       "Uji konkurensi penutupan tiket",
				}
				b, _ := json.Marshal(payload)
				req := httptest.NewRequest(http.MethodPost, "/api/open-work/close", bytes.NewReader(b))
				rec := httptest.NewRecorder()
				router.ServeHTTP(rec, req)

				if rec.Code == http.StatusOK {
					atomic.AddInt32(&successCount, 1)
				} else if rec.Code == http.StatusConflict {
					atomic.AddInt32(&conflictCount, 1)
				}
			}()
		}
		wg.Wait()

		if successCount != 1 {
			t.Errorf("Expected exactly 1 successful close, got %d", successCount)
		}
		if conflictCount != workers-1 {
			t.Errorf("Expected %d conflict responses, got %d", workers-1, conflictCount)
		}
	})

	t.Run("optimistic lock version mismatch returns 409 Conflict", func(t *testing.T) {
		staleVersion := 99
		payload := domain.OpenWorkCloseRequest{
			IDWork:               3003,
			NomorWork:            "OW-VERSION-3003",
			NIKOperator:          "OPR0001",
			Shift:                1,
			WaktuMesinBeroperasi: "2026-10-20T12:00:00Z",
			CatatanClosing:       "Stale version check",
			ExpectedVersion:      &staleVersion,
		}
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/open-work/close", bytes.NewReader(b))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusConflict {
			t.Fatalf("Expected 409 Conflict for stale ExpectedVersion, got %d", rec.Code)
		}
	})
}

// Bab 27: Proteksi SSRF pada Webhook Discord & Security Headers
func TestSSRFAndSecurityHeaders(t *testing.T) {
	router, _ := setupTestRouter(false)

	payload := map[string]any{
		"supervisorName": "SPV Sec",
		"supervisorNik":  "SPV0001",
		"shift":          "1",
		"webhookUrl":     "http://169.254.169.254/latest/meta-data/iam",
	}
	b, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/shift-report/discord", bytes.NewReader(b))
	req.Header.Set("X-Request-ID", "req-audit-ssrf-test")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("Expected SSRF attempt to be blocked with 400 Bad Request, got %d", rec.Code)
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("Missing X-Content-Type-Options: nosniff header")
	}
	if rec.Header().Get("X-Frame-Options") != "DENY" {
		t.Errorf("Missing X-Frame-Options: DENY header")
	}
	if rec.Header().Get("X-Request-ID") != "req-audit-ssrf-test" {
		t.Errorf("Expected propagated X-Request-ID 'req-audit-ssrf-test', got '%s'", rec.Header().Get("X-Request-ID"))
	}
}

// Bab 33 & Bab 34: Observability SLI/SLO & Audit Trail Endpoint
func TestObservabilityAndAuditTrail(t *testing.T) {
	router, _ := setupTestRouter(false)

	// Buat 1 aksi mutasi agar masuk ke Audit Trail
	createPayload := map[string]any{
		"id_mesin":    1,
		"nik_pelapor": "OPR0001",
		"shift":       1,
		"keterangan":  "Uji pencatatan Audit Trail GxP",
		"waktu_mulai": "2026-10-20T08:00:00Z",
		"tipe_wo":     "Batch",
	}
	b, _ := json.Marshal(createPayload)
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/open-work", bytes.NewReader(b))
	recCreate := httptest.NewRecorder()
	router.ServeHTTP(recCreate, reqCreate)

	// Panggil endpoint /api/observability
	reqObs := httptest.NewRequest(http.MethodGet, "/api/observability", nil)
	recObs := httptest.NewRecorder()
	router.ServeHTTP(recObs, reqObs)

	if recObs.Code != http.StatusOK {
		t.Fatalf("Observability status = %d; want 200", recObs.Code)
	}

	var data map[string]any
	if err := json.Unmarshal(recObs.Body.Bytes(), &data); err != nil {
		t.Fatalf("Failed to parse observability json: %v", err)
	}

	if data["availability_sli_percent"] == nil {
		t.Error("Expected availability_sli_percent in observability snapshot")
	}
	if count, ok := data["audit_trail_total_buffered"].(float64); !ok || count < 1 {
		t.Errorf("Expected at least 1 audit trail entry, got %v", data["audit_trail_total_buffered"])
	}
}

// Bab 36: Rate Limiting & Backpressure Protection
func TestRateLimitingAndBackpressure(t *testing.T) {
	cfg := &config.Config{
		Port:        4000,
		DatabaseURL: "postgres://localhost",
		WebOrigin:   "http://localhost:5173",
	}
	repo := db.NewMockRepo()
	// Batasi 3 request per menit untuk menguji 429 Too Many Requests
	router := server.NewRouterWithRateLimit(cfg, repo, 3, time.Minute)

	for i := 1; i <= 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		req.RemoteAddr = "10.10.10.50:12345"
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("Request #%d should succeed (200), got %d", i, rec.Code)
		}
	}

	// Request ke-4 dari IP yang sama harus ditolak dengan 429 Too Many Requests
	req4 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req4.RemoteAddr = "10.10.10.50:12345"
	rec4 := httptest.NewRecorder()
	router.ServeHTTP(rec4, req4)

	if rec4.Code != http.StatusTooManyRequests {
		t.Fatalf("Request #4 status = %d; want 429 Too Many Requests", rec4.Code)
	}
	if rec4.Header().Get("Retry-After") == "" {
		t.Error("Expected Retry-After header on 429 response")
	}
}

// Bab 10 & Bab 33: Tampilan Backend Service & Observability Console pada GET /
func TestBackendConsoleUI(t *testing.T) {
	router, _ := setupTestRouter(false)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET / status = %d; want 200 OK", rec.Code)
	}
	if !strings.Contains(rec.Header().Get("Content-Type"), "text/html") {
		t.Errorf("Expected text/html Content-Type, got %s", rec.Header().Get("Content-Type"))
	}
	body := rec.Body.String()
	if !strings.Contains(body, "Machine Card Backend Engine") || !strings.Contains(body, "/api/observability") {
		t.Error("Backend Console HTML missing expected title or endpoint registry")
	}
}
