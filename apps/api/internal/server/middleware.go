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
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB max body size
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

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := extractClientIP(r)
		now := time.Now()

		rl.mu.Lock()
		cw, exists := rl.clients[ip]
		if !exists || now.After(cw.resetAt) {
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
