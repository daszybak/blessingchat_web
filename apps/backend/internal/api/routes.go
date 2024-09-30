package api

import (
	"github.com/julienschmidt/httprouter"
	"github.com/justinas/alice"
	"net/http"
)

func (api *Api) Routes() *httprouter.Router {
	router := httprouter.New()

	chain := alice.New(api.authMiddleware)
	router.Handler(http.MethodGet, "/v1/test", chain.Then(http.HandlerFunc(api.testToken)))
	router.HandlerFunc(http.MethodGet, "/v1/chat_bot", api.handleStream)
	router.HandlerFunc(http.MethodGet, "/v1/data", api.handleGetTestData)
	router.Handler(http.MethodGet, "/v1/healthcheck", api.loggingMiddleware(http.HandlerFunc(api.healthcheck)))

	return router
}
