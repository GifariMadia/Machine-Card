package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type ctxKey string

const requestIDContextKey ctxKey = "request_id"

// GenerateRequestID menghasilkan correlation ID unik untuk tracing lintas batas (Bab 33).
func GenerateRequestID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return fmt.Sprintf("req-%d-%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}

func GetRequestID(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDContextKey).(string); ok && v != "" {
		return v
	}
	return "req-unknown"
}

// statusRecorder menangkap HTTP status code untuk telemetry & structured logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func CORSMiddleware(webOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := webOrigin
			if origin == "" {
				origin = "*"
			}

			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID, Idempotency-Key")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID, X-Idempotent-Replayed, X-RateLimit-Limit, X-RateLimit-Remaining")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// SecurityHeadersMiddleware menetapkan header pertahanan aplikasi & batas ukuran payload 1 MB (Bab 27 & Bab 36).
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

		if r.Body != nil && (r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch) {
			maxBytes := int64(1 << 20) // 1 MB max body size
			if r.URL.Path == "/api/state" {
				maxBytes = 4 << 20 // 4 MB for state document transactions
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		}

		next.ServeHTTP(w, r)
	})
}

// RequestIDAndLoggingMiddleware menyematkan X-Request-ID dan merekam metrik SLI/SLO (Bab 33 & Bab 34).
func RequestIDAndLoggingMiddleware(obs *ObservabilityCollector) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
			if reqID == "" || len(reqID) > 64 {
				reqID = GenerateRequestID()
			}

			w.Header().Set("X-Request-ID", reqID)
			ctx := context.WithValue(r.Context(), requestIDContextKey, reqID)

			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

			next.ServeHTTP(rec, r.WithContext(ctx))

			duration := time.Since(start)
			if obs != nil {
				obs.RecordRequest(rec.status, float64(duration.Microseconds())/1000.0)
			}

			log.Printf("[API] request_id=%s method=%s path=%s status=%d duration_ms=%.2f",
				reqID, r.Method, r.URL.Path, rec.status, float64(duration.Microseconds())/1000.0)
		})
	}
}

// RateLimiter membatasi laju request per IP untuk mencegah penyalahgunaan & backpressure (Bab 36).
type RateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	clients map[string]*clientWindow
	obs     *ObservabilityCollector
}

type clientWindow struct {
	count   int
	resetAt time.Time
}

func NewRateLimiter(limit int, window time.Duration, obs *ObservabilityCollector) *RateLimiter {
	return &RateLimiter{
		limit:   limit,
		window:  window,
		clients: make(map[string]*clientWindow),
		obs:     obs,
	}
}

const (
	maxRateLimitClients     = 4096
	maxIdempotencyCacheSize = 2048
)

func evictExpiredOrOldest[V any](entries map[string]V, maxEntries int, isExpired func(V) bool, timestamp func(V) time.Time) {
	if len(entries) < maxEntries {
		return
	}
	var oldestKey string
	var oldestTime time.Time
	for k, v := range entries {
		if isExpired(v) {
			delete(entries, k)
			continue
		}
		ts := timestamp(v)
		if oldestKey == "" || ts.Before(oldestTime) {
			oldestKey = k
			oldestTime = ts
		}
	}
	if len(entries) >= maxEntries && oldestKey != "" {
		delete(entries, oldestKey)
	}
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := extractClientIP(r)
		now := time.Now()

		rl.mu.Lock()
		cw, exists := rl.clients[ip]
		if !exists || now.After(cw.resetAt) {
			if !exists {
				evictExpiredOrOldest(rl.clients, maxRateLimitClients, func(w *clientWindow) bool {
					return now.After(w.resetAt)
				}, func(w *clientWindow) time.Time {
					return w.resetAt
				})
			}
			cw = &clientWindow{
				count:   0,
				resetAt: now.Add(rl.window),
			}
			rl.clients[ip] = cw
		}
		cw.count++
		remaining := rl.limit - cw.count
		if remaining < 0 {
			remaining = 0
		}
		exceeded := cw.count > rl.limit
		rl.mu.Unlock()

		w.Header().Set("X-RateLimit-Limit", strconv.Itoa(rl.limit))
		w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))

		if exceeded {
			if rl.obs != nil {
				atomic.AddInt64(&rl.obs.rateLimitedCount, 1)
			}
			w.Header().Set("Retry-After", strconv.Itoa(int(rl.window.Seconds())))
			writeStructuredError(w, r, http.StatusTooManyRequests, "ERR_RATE_LIMIT_EXCEEDED", "Batas frekuensi request terlampaui, silakan coba beberapa saat lagi")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func extractClientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	if r.RemoteAddr != "" {
		return r.RemoteAddr
	}
	return "127.0.0.1"
}

// IdempotencyRecord menyimpan respons dari operasi yang telah dieksekusi (Bab 17 & Lab 3).
type IdempotencyRecord struct {
	PayloadHash string
	Status      int
	Body        []byte
	CreatedAt   time.Time
	ExpiresAt   time.Time
}

type IdempotencyStore struct {
	mu      sync.Mutex
	records map[string]IdempotencyRecord
	ttl     time.Duration
	obs     *ObservabilityCollector
}

func NewIdempotencyStore(ttl time.Duration, obs *ObservabilityCollector) *IdempotencyStore {
	return &IdempotencyStore{
		records: make(map[string]IdempotencyRecord),
		ttl:     ttl,
		obs:     obs,
	}
}

func HashPayload(raw []byte) string {
	sum := sha256.Sum256(bytes.TrimSpace(raw))
	return hex.EncodeToString(sum[:])
}

// CheckOrReserve memeriksa apakah Idempotency-Key sudah pernah diproses.
func (s *IdempotencyStore) Check(scope, key, payloadHash string) (rec IdempotencyRecord, found bool, conflict bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	composite := scope + ":" + key
	existing, ok := s.records[composite]
	if !ok {
		return IdempotencyRecord{}, false, false
	}

	if time.Now().After(existing.ExpiresAt) {
		delete(s.records, composite)
		return IdempotencyRecord{}, false, false
	}

	if existing.PayloadHash != payloadHash {
		return existing, true, true
	}

	if s.obs != nil {
		atomic.AddInt64(&s.obs.idempotentReplays, 1)
	}
	return existing, true, false
}

func (s *IdempotencyStore) Save(scope, key, payloadHash string, status int, body []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	composite := scope + ":" + key
	now := time.Now()
	if _, exists := s.records[composite]; !exists {
		evictExpiredOrOldest(s.records, maxIdempotencyCacheSize, func(rec IdempotencyRecord) bool {
			return now.After(rec.ExpiresAt)
		}, func(rec IdempotencyRecord) time.Time {
			return rec.CreatedAt
		})
	}
	s.records[composite] = IdempotencyRecord{
		PayloadHash: payloadHash,
		Status:      status,
		Body:        append([]byte(nil), body...),
		CreatedAt:   now,
		ExpiresAt:   now.Add(s.ttl),
	}
}

// ReadAndRestoreBody membaca body untuk fingerprinting dan mengembalikannya ke r.Body.
func ReadAndRestoreBody(r *http.Request) ([]byte, error) {
	if r.Body == nil {
		return nil, nil
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, err
	}
	r.Body = io.NopCloser(bytes.NewReader(raw))
	return raw, nil
}

// AuditEntry merepresentasikan jejak audit perubahan penting GxP ALCOA+ (Bab 33).
type AuditEntry struct {
	RequestID  string         `json:"request_id"`
	ActorNIK   string         `json:"actor_nik"`
	ActorRole  string         `json:"actor_role"`
	Action     string         `json:"action"`
	EntityType string         `json:"entity_type"`
	EntityID   string         `json:"entity_id"`
	StatusCode int            `json:"status_code"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	Timestamp  string         `json:"timestamp"`
}

// ObservabilityCollector mengumpulkan SLI/SLO (latency p50/p95, error budget, dan audit trail) (Bab 33 & Bab 34).
type ObservabilityCollector struct {
	mu                sync.Mutex
	startedAt         time.Time
	totalRequests     int64
	errorRequests     int64
	idempotentReplays int64
	rateLimitedCount  int64
	latenciesMs       []float64
	maxLatencySamples int
	auditTrail        []AuditEntry
	maxAuditEntries   int
}

func NewObservabilityCollector() *ObservabilityCollector {
	return &ObservabilityCollector{
		startedAt:         time.Now(),
		latenciesMs:       make([]float64, 0, 256),
		maxLatencySamples: 500,
		auditTrail:        make([]AuditEntry, 0, 64),
		maxAuditEntries:   100,
	}
}

func (o *ObservabilityCollector) RecordRequest(status int, durationMs float64) {
	atomic.AddInt64(&o.totalRequests, 1)
	if status >= 500 {
		atomic.AddInt64(&o.errorRequests, 1)
	}

	o.mu.Lock()
	defer o.mu.Unlock()
	if len(o.latenciesMs) >= o.maxLatencySamples {
		o.latenciesMs = o.latenciesMs[1:]
	}
	o.latenciesMs = append(o.latenciesMs, durationMs)
}

func (o *ObservabilityCollector) RecordAudit(entry AuditEntry) {
	if entry.Timestamp == "" {
		entry.Timestamp = time.Now().Format(time.RFC3339)
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	if len(o.auditTrail) >= o.maxAuditEntries {
		o.auditTrail = o.auditTrail[1:]
	}
	// Prepend terbaru di awal saat dibaca
	o.auditTrail = append(o.auditTrail, entry)
}

func (o *ObservabilityCollector) Snapshot() map[string]any {
	total := atomic.LoadInt64(&o.totalRequests)
	errCount := atomic.LoadInt64(&o.errorRequests)
	replays := atomic.LoadInt64(&o.idempotentReplays)
	rateLimited := atomic.LoadInt64(&o.rateLimitedCount)

	availabilitySLI := 100.0
	if total > 0 {
		availabilitySLI = float64(total-errCount) / float64(total) * 100.0
	}

	o.mu.Lock()
	latCopy := make([]float64, len(o.latenciesMs))
	copy(latCopy, o.latenciesMs)

	audits := make([]AuditEntry, len(o.auditTrail))
	for i := range o.auditTrail {
		audits[i] = o.auditTrail[len(o.auditTrail)-1-i]
	}
	o.mu.Unlock()

	p50, p95 := computePercentiles(latCopy)

	return map[string]any{
		"uptime_seconds":             int64(time.Since(o.startedAt).Seconds()),
		"total_requests":             total,
		"server_error_requests":      errCount,
		"availability_sli_percent":   availabilitySLI,
		"slo_target_percent":         99.5,
		"p50_latency_ms":             p50,
		"p95_latency_ms":             p95,
		"idempotent_replays":         replays,
		"rate_limited_requests":      rateLimited,
		"audit_trail_recent":         audits,
		"audit_trail_total_buffered": len(audits),
	}
}

func computePercentiles(samples []float64) (p50 float64, p95 float64) {
	if len(samples) == 0 {
		return 0, 0
	}
	sort.Float64s(samples)
	idx50 := int(float64(len(samples)-1) * 0.50)
	idx95 := int(float64(len(samples)-1) * 0.95)
	return samples[idx50], samples[idx95]
}
