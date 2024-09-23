package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"proomptmachinee/pkg/keycloak"
	"proomptmachinee/pkg/openapi"
	"proomptmachinee/pkg/openapi/completions"
	"strings"

	"gopkg.in/yaml.v3"
)

type ChatbotApi struct {
	completionsClient *completions.Client
	keycloakValidator *keycloak.Validator
}

func main() {
	configFile, err := os.ReadFile("configs/config.yaml")
	if err != nil {
		log.Fatal("couldn't read config file", err)
	}
	config := &struct {
		Openai struct {
			ApiKey         string `yaml:"api_key"`
			OrganizationId string `yaml:"organization_id"`
		} `yaml:"openai"`
		Keycloak struct {
			Oauth2IssuerUrl string `yaml:"oauth2_issuer_url"`
		}
	}{}
	err = yaml.Unmarshal(configFile, config)
	if err != nil {
		log.Fatal("couldn't unmarshal config", err)
	}
	key := config.Openai.ApiKey
	client := &http.Client{}
	completionsClient := completions.NewCompletionsClient(key, client, openapi.Gpt4oMini)
	kcValidator := keycloak.NewValidator(config.Keycloak.Oauth2IssuerUrl)
	api := &ChatbotApi{completionsClient, kcValidator}

	http.HandleFunc("/chat_bot", api.handleStream)
	http.Handle("/test", api.AuthMiddleware(http.HandlerFunc(api.testToken)))
	fmt.Println("Listening on port 4000")
	log.Fatal(http.ListenAndServe(":4000", nil))
}

func (api *ChatbotApi) handleStream(w http.ResponseWriter, r *http.Request) {
	queryParams := r.URL.Query()
	message := queryParams.Get("prompt")
	response, err := api.completionsClient.SendPrompt(message)
	if err != nil {
		log.Fatal(err)
	}

	err = response.Receive(w)
}

func (api *ChatbotApi) testToken(w http.ResponseWriter, r *http.Request) {
	userId := r.Context().Value("userId").(string)
	w.Write([]byte(fmt.Sprintf("User ID: %s\n", userId)))
}

func (api *ChatbotApi) AuthMiddleware(next http.Handler) http.Handler {
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
