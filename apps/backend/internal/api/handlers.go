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
	if err != nil {
		api.errResp.InternalServerError(w, err)
	}
}

func (api *Api) handleGetTestData(w http.ResponseWriter, r *http.Request) {
	testResp := TestData{
		UserId: "1223",
		Age:    33,
		Email:  "dummy@dummy.com",
	}

	err := api.resputil.Ok(w, &testResp)
	if err != nil {
		api.errResp.InternalServerError(w, err)
	}

}

func (api *Api) healthcheck(w http.ResponseWriter, r *http.Request) {
	data := map[string]interface{}{
		"status":      "alive",
		"environment": "development",
		"version":     "1.0.0",
	}
	err := api.resputil.Ok(w, data)
	if err != nil {
		api.logger.Error("couldn't send response: %v", map[string]interface{}{
			"error": err.Error(),
		})
	}
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
			api.errResp.Unauthorized(w)
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
		next.ServeHTTP(w, r)
	})
}
