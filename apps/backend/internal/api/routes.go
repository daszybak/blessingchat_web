package api

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
	"github.com/justinas/alice"
)

func (api *Api) Routes() *httprouter.Router {
	router := httprouter.New()

	// chain := alice.New(api.corsMiddleware, api.authMiddleware)
	chain := alice.New(api.corsMiddleware)
	router.Handler(http.MethodGet, "/v1/test", chain.Then(http.HandlerFunc(api.testToken)))
	router.HandlerFunc(http.MethodGet, "/v1/data", api.handleGetTestData)
	router.Handler(http.MethodGet, "/v1/chat_bot", chain.Then(http.HandlerFunc(api.handleStream)))
	router.HandlerFunc(http.MethodGet, "/v1/speech_to_speech", api.handleWebSocket)
	router.Handler(http.MethodGet, "/v1/healthcheck", api.loggingMiddleware(http.HandlerFunc(api.healthcheck)))
	router.GlobalOPTIONS = http.HandlerFunc(api.corsPreflight)

	return router
}
