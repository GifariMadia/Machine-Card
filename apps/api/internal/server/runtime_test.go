package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"machine-card/api/internal/db"
	"machine-card/api/internal/server"
)

type sessionStore struct{ role string }

func (s sessionStore) Login(context.Context, string, string) (db.Actor, string, error) {
	return db.Actor{}, "", db.ErrForbidden
}
func (s sessionStore) Session(_ context.Context, token string) (db.Actor, error) {
	if token != "valid" {
		return db.Actor{}, db.ErrForbidden
	}
	return db.Actor{NIK: "U1", Role: s.role}, nil
}
func (s sessionStore) Logout(context.Context, string) error { return nil }
func (s sessionStore) Documents(context.Context, db.Actor) (map[string]db.Document, error) {
	return map[string]db.Document{}, nil
}
func (s sessionStore) Commit(context.Context, db.Actor, string, []db.Change) (map[string]db.Document, error) {
	return nil, db.ErrForbidden
}

func TestRuntimeRouterRejectsUnverifiedAndUnauthorizedRequests(t *testing.T) {
	core := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	for _, test := range []struct {
		path, method, cookie, origin, role string
		want                               int
	}{
		{"/api/state", "GET", "", "", "ADMIN", 401},
		{"/api/state", "GET", "forged", "", "ADMIN", 401},
		{"/api/observability", "GET", "valid", "", "OPERATOR", 403},
		{"/api/state", "POST", "valid", "https://other.example", "ADMIN", 403},
		{"/api/open-work/close", "POST", "valid", "", "OPERATOR", 410},
		{"/api/auth/session", "GET", "valid", "", "SUPERVISOR", 200},
	} {
		t.Run(test.path+test.cookie+test.origin+test.role, func(t *testing.T) {
			router := server.SecureRouter(core, sessionStore{test.role}, "http://localhost:5173")
			req := httptest.NewRequest(test.method, test.path, nil)
			if test.cookie != "" {
				req.AddCookie(&http.Cookie{Name: "mc_session", Value: test.cookie})
			}
			if test.origin != "" {
				req.Header.Set("Origin", test.origin)
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != test.want {
				t.Fatalf("got %d want %d", rec.Code, test.want)
			}
		})
	}
}
