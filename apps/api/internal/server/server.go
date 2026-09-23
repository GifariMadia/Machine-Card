package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"machine-card/api/internal/config"
	"machine-card/api/internal/db"
)

type Server struct {
	httpServer *http.Server
	repo       db.Repository
}

func NewRouter(cfg *config.Config, repo db.Repository) http.Handler {
	return NewRouterWithRateLimit(cfg, repo, 200, time.Minute)
}

func NewRouterWithRateLimit(cfg *config.Config, repo db.Repository, maxReqPerWindow int, window time.Duration) http.Handler {
	obs := NewObservabilityCollector()
	idem := NewIdempotencyStore(24*time.Hour, obs)
	handler := NewHandlerWithTelemetry(cfg, repo, obs, idem)
	rateLimiter := NewRateLimiter(maxReqPerWindow, window, obs)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /{$}", handler.BackendConsole)
	mux.HandleFunc("GET /api/health", handler.Health)
	mux.HandleFunc("GET /api/observability", handler.GetObservability)
	mux.HandleFunc("GET /api/machines", handler.GetMachines)
	mux.HandleFunc("GET /api/monitoring", handler.GetMonitoring)
	mux.HandleFunc("GET /api/open-work", handler.GetOpenWorks)
	mux.HandleFunc("POST /api/open-work", handler.CreateOpenWork)
	mux.HandleFunc("POST /api/open-work/close", handler.CloseOpenWork)
	mux.HandleFunc("GET /api/analytics/breakdown", handler.GetBreakdownAnalytics)
	mux.HandleFunc("POST /api/shift-report/discord", handler.PostShiftReportDiscord)

	// Susun rantai middleware (Bab 27, Bab 33, Bab 36):
	// CORS -> RequestID & Observability -> SecurityHeaders -> RateLimiter -> Mux
	var chain http.Handler = mux
	chain = rateLimiter.Middleware(chain)
	chain = SecurityHeadersMiddleware(chain)
	chain = RequestIDAndLoggingMiddleware(obs)(chain)
	chain = CORSMiddleware(cfg.WebOrigin)(chain)

	runtime, _ := repo.(db.Runtime)
	return SecureRouter(chain, runtime, cfg.WebOrigin)
}

func New(cfg *config.Config, repo db.Repository) *Server {
	router := NewRouter(cfg, repo)

	return &Server{
		httpServer: &http.Server{
			Addr:              fmt.Sprintf(":%d", cfg.Port),
			Handler:           router,
			ReadHeaderTimeout: 10 * time.Second,
			ReadTimeout:       30 * time.Second,
			WriteTimeout:      30 * time.Second,
			IdleTimeout:       60 * time.Second,
		},
		repo: repo,
	}
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.repo != nil {
		s.repo.Close()
	}
	return s.httpServer.Shutdown(ctx)
}
