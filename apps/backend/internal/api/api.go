package api

import (
	"proomptmachinee/internal/services/keycloak"
	"proomptmachinee/internal/services/openapi/completions"
	"proomptmachinee/pkg/logger"
)

type Api struct {
	completionsClient *completions.Client
	keycloakValidator *keycloak.Validator
	logger            logger.Logger
}

func New(compClient *completions.Client, keycloakValidator *keycloak.Validator, logger logger.Logger) *Api {
	return &Api{
		completionsClient: compClient,
		keycloakValidator: keycloakValidator,
		logger:            logger,
	}
}
