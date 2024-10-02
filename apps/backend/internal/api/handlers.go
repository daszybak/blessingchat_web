package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

func (api *Api) handleStream(w http.ResponseWriter, r *http.Request) {
	queryParams := r.URL.Query()
	message := queryParams.Get("prompt")
	response, err := api.completionsClient.SendPrompt(message)
	if err != nil {
		log.Fatal(err)
	}

	err = response.Receive(w)
}

func (api *Api) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	api.realtimeClient.WsHandler(w, r)
}

func (api *Api) healthcheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
	w.Write([]byte("service is healthy"))
}

func (api *Api) testToken(w http.ResponseWriter, r *http.Request) {
	// just for testing, this could cause panic if the userId is not present
	userId := r.Context().Value("userId").(string)
	w.Write([]byte(fmt.Sprintf("User ID: %s\n", userId)))
}

// should be moved to middleware
func (api *Api) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		token := strings.TrimPrefix(authHeader, "Bearer ")
		userId, err := api.keycloakValidator.ValidateTokenSignature(token)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte("Unauthorized"))
			return
		}

		ctx := context.WithValue(r.Context(), "userId", userId)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// same as above
func (api *Api) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		api.logger.LogRequestResponse(r, 343, "something", time.Duration(5), nil)
	})
}

func (api *Api) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", r.Header.Get("Allow"))
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Access-Control-Allow-Origin"))
		w.Header().Set("Access-Control-Allow-Headers", r.Header.Get("Access-Control-Allow-Headers"))
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
