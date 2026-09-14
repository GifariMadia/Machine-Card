package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port              int
	DatabaseURL       string
	WebOrigin         string
	DiscordWebhookURL string
}

func Load() *Config {
	// Attempt to load .env from current directory or parent directories
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../.env")
	_ = godotenv.Load("../../.env")

	port := 4000
	if p := os.Getenv("PORT"); p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 {
			port = val
		}
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://machine_card:machine_card@localhost:5432/machine_card"
	}

	webOrigin := os.Getenv("WEB_ORIGIN")
	if webOrigin == "" {
		webOrigin = "http://localhost:5173"
	}

	discordURL := os.Getenv("DISCORD_WEBHOOK_URL")

	return &Config{
		Port:              port,
		DatabaseURL:       dbURL,
		WebOrigin:         webOrigin,
		DiscordWebhookURL: discordURL,
	}
}
