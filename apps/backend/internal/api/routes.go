package api

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
	"github.com/justinas/alice"
)

func (api *Api) Routes() *httprouter.Router {
	router := httprouter.New()

	chain := alice.New(api.corsMiddleware, api.authMiddleware)
	router.Handler(http.MethodGet, "/v1/test", chain.Then(http.HandlerFunc(api.testToken)))
	router.HandlerFunc(http.MethodGet, "/v1/chat_bot", api.handleStream)
	router.HandlerFunc(http.MethodGet, "/v1/speech_to_speech", api.handleWebSocket)
	router.Handler(http.MethodGet, "/v1/healthcheck", api.loggingMiddleware(http.HandlerFunc(api.healthcheck)))

	return router
}
