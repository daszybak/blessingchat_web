package api

import (
	"proomptmachinee/internal/services/keycloak"
	"proomptmachinee/internal/services/openapi/completions"
	"proomptmachinee/pkg/errors"
	"proomptmachinee/pkg/logger"
	"proomptmachinee/pkg/resputil"
)

type Api struct {
	completionsClient *completions.Client
	keycloakValidator *keycloak.Validator
	logger            logger.Logger
	resputil          resputil.Resputil
	errResp           resp_errors.ErrResponder
}

func New(compClient *completions.Client,
	keycloakValidator *keycloak.Validator,
	logger logger.Logger,
	resputil resputil.Resputil,
	errResp resp_errors.ErrResponder,
) *Api {
	return &Api{
		completionsClient: compClient,
		keycloakValidator: keycloakValidator,
		resputil:          resputil,
		logger:            logger,
		errResp:           errResp,
	}
}
