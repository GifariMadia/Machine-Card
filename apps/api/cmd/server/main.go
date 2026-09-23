package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"machine-card/api/internal/config"
	"machine-card/api/internal/db"
	"machine-card/api/internal/server"
)

func main() {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var repo db.Repository
	pgRepo, err := db.NewPostgresRepo(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("[WARN] Koneksi database belum tersedia: %v", err)
		log.Println("[INFO] Mode terbatas: login dan data operasional tidak tersedia sampai database terhubung")
		repo = &db.MockRepo{Degraded: true}
	} else {
		if err := pgRepo.EnsureRuntime(ctx); err != nil {
			log.Fatalf("Runtime migration failed: %v", err)
		}
		credentials, err := pgRepo.Bootstrap(ctx)
		if err != nil {
			log.Fatalf("Bootstrap failed: %v", err)
		}
		if len(credentials) > 0 {
			configDir, err := os.UserConfigDir()
			if err != nil {
				log.Fatal(err)
			}
			dir := filepath.Join(configDir, "MachineCard", "private")
			if err := os.MkdirAll(dir, 0700); err != nil {
				log.Fatal(err)
			}
			file := filepath.Join(dir, "initial-accounts-"+time.Now().Format("20060102-150405")+".json")
			raw, _ := json.MarshalIndent(credentials, "", "  ")
			if err := os.WriteFile(file, raw, 0600); err != nil {
				log.Fatal(err)
			}
			log.Printf("Initial credentials written locally: %s", file)
		}
		log.Println("[INFO] Berhasil terhubung ke database PostgreSQL")
		repo = pgRepo
		go server.RunShiftWorker(ctx, cfg, pgRepo)
	}

	srv := server.New(cfg, repo)

	go func() {
		log.Printf("Machine Card API (Go) berjalan di port %d", cfg.Port)
		if err := srv.Start(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("Menutup server API...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Shutdown error: %v", err)
	}
	log.Println("Server API selesai ditutup")
}
