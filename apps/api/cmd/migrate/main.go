package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"machine-card/api/internal/config"
	"machine-card/api/internal/db"
)

func main() {
	cfg := config.Load()

	mode := "migrate"
	if len(os.Args) > 1 {
		mode = os.Args[1]
	}

	cwd, err := os.Getwd()
	if err != nil {
		log.Fatalf("Gagal membaca direktori kerja: %v", err)
	}

	migrator := db.NewMigrator(cfg.DatabaseURL, cwd)
	ctx := context.Background()

	log.Printf("Menjalankan database %s...", mode)
	if err := migrator.Run(ctx, mode); err != nil {
		fmt.Fprintf(os.Stderr, "Error saat menjalankan %s: %v\n", mode, err)
		os.Exit(1)
	}

	log.Printf("Operasi %s selesai dengan sukses.", mode)
}
