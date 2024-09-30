package main

import (
	"fmt"
	"gopkg.in/yaml.v3"
	"net/http"
	"os"
	"proomptmachinee/internal/api"
	"proomptmachinee/internal/config"
	"proomptmachinee/internal/services/keycloak"
	"proomptmachinee/internal/services/openapi"
	"proomptmachinee/internal/services/openapi/completions"
	resp_errors "proomptmachinee/pkg/errors"
	"proomptmachinee/pkg/logger"
	"proomptmachinee/pkg/resputil"
	"time"
)

func main() {
	log := logger.New()
	configFile, err := os.ReadFile("configs/config.yaml")
	if err != nil {
		log.Fatal("couldn't read config:", err)
	}
	cfg := &config.Config{}
	err = yaml.Unmarshal(configFile, cfg)
	if err != nil {
		log.Fatal("couldn't unmarshal config", err)
	}
	key := cfg.OpenAi.ApiKey
	fmt.Println(key)
	client := &http.Client{}
	completionsClient := completions.NewCompletionsClient(key, client, openapi.Gpt4oMini)
	kcValidator := keycloak.NewValidator(cfg.Keycloak.Oauth2IssuerURL)
	errResp := resp_errors.New(log)
	resp := resputil.NewResputil()
	chatBotApi := api.New(completionsClient, kcValidator, log, resp, errResp)
	server := &http.Server{
		Addr:        ":4000",
		Handler:     chatBotApi.Routes(),
		IdleTimeout: time.Minute,
		ReadTimeout: 10 * time.Second,
		// This may be subject to change since
		// we actually don't know how long could
		// a stream for a bing prompt last.
		WriteTimeout: 2 * time.Minute,
	}

	// TODO important to consider singals propagation, and graceful shutdown
	// should idealy be ran in a separate goroutine, also allowing for grace period
	// to all tasks in progress
	log.Info("Server started", map[string]interface{}{"port": "4000"})
	err = server.ListenAndServe()
	log.Fatal("server shutting down", err)

}
