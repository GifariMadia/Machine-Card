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
