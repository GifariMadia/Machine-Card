package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"machine-card/api/internal/db"
)

type actorKey struct{}

func ActorFromContext(ctx context.Context) db.Actor {
	a, _ := ctx.Value(actorKey{}).(db.Actor)
	return a
}

// SecureRouter makes identity validation mandatory, including for legacy endpoints.
func SecureRouter(core http.Handler, store db.Runtime, origin string) http.Handler {
	mux := http.NewServeMux()
	loginLimiter := NewRateLimiter(100, time.Minute, NewObservabilityCollector())
	mux.Handle("POST /api/auth/login", loginLimiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, 503, "Penyimpanan akun belum tersedia")
			return
		}
		if !sameOrigin(r, origin) {
			writeError(w, 403, "Origin ditolak")
			return
		}
		var input struct {
			NIK      string `json:"nik"`
			Password string `json:"password"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if json.NewDecoder(r.Body).Decode(&input) != nil {
			writeError(w, 400, "Payload login tidak valid")
			return
		}
		a, token, err := store.Login(r.Context(), input.NIK, input.Password)
		if err != nil {
			status := 503
			message := "Server login belum tersedia"
			if errors.Is(err, db.ErrForbidden) {
				status = 401
				message = "NIK atau kata sandi tidak sesuai atau akun nonaktif"
			}
			if errors.Is(err, db.ErrRateLimited) {
				status = 429
				message = "Terlalu banyak percobaan. Coba setelah satu menit."
			}
			writeError(w, status, message)
			return
		}

		http.SetCookie(w, &http.Cookie{Name: "mc_session", Value: "", Path: "/api", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
		http.SetCookie(w, &http.Cookie{Name: "mc_session", Value: token, Path: "/", HttpOnly: true, Secure: r.TLS != nil, SameSite: http.SameSiteStrictMode, MaxAge: 8 * 3600})
		writeJSON(w, 200, a)
	})))
	mux.HandleFunc("GET /api/auth/session", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, ActorFromContext(r.Context())) })
	mux.HandleFunc("POST /api/auth/activity", func(w http.ResponseWriter, r *http.Request) {
		if touch, ok := store.(interface {
			Touch(context.Context, string) error
		}); ok {
			cookie, _ := r.Cookie("mc_session")
			if cookie != nil {
				if err := touch.Touch(r.Context(), cookie.Value); err != nil {
					writeError(w, 503, "Sesi belum dapat diperbarui")
					return
				}
			}
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		c, _ := r.Cookie("mc_session")
		if c != nil {
			_ = store.Logout(r.Context(), c.Value)
		}
		http.SetCookie(w, &http.Cookie{Name: "mc_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/state", func(w http.ResponseWriter, r *http.Request) {
		docs, err := store.Documents(r.Context(), ActorFromContext(r.Context()))
		if err != nil {
			writeError(w, 503, "Data server belum tersedia")
			return
		}
		writeJSON(w, 200, docs)
	})
	mux.HandleFunc("POST /api/state", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Key     string      `json:"requestKey"`
			Changes []db.Change `json:"changes"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
		if json.NewDecoder(r.Body).Decode(&input) != nil {
