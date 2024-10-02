package api

import (
	"proomptmachinee/internal/services/keycloak"
	"proomptmachinee/internal/services/openai/completions"
	"proomptmachinee/internal/services/openai/realtime"
	"proomptmachinee/pkg/logger"
)

type Api struct {
	completionsClient *completions.Client
	realtimeClient    *realtime.Client
	keycloakValidator *keycloak.Validator
	logger            logger.Logger
}

func New(compClient *completions.Client, keycloakValidator *keycloak.Validator, logger logger.Logger, realtimeClient *realtime.Client) *Api {
	return &Api{
		completionsClient: compClient,
		realtimeClient:    realtimeClient,
		keycloakValidator: keycloakValidator,
		logger:            logger,
	}
}
