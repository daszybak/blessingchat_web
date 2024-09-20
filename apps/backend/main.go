package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"proomptmachinee/pkg/openapi"
	"proomptmachinee/pkg/openapi/completions"

	"gopkg.in/yaml.v3"
)

type ChatbotApi struct {
	completionsClient *completions.Client
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
	}{}
	err = yaml.Unmarshal(configFile, config)
	if err != nil {
		log.Fatal("couldn't unmarshal config", err)
	}
	key := config.Openai.ApiKey
	client := &http.Client{}
	completionsClient := completions.NewCompletionsClient(key, client, openapi.Gpt4oMini)
	api := &ChatbotApi{completionsClient}

	http.HandleFunc("/chat_bot", api.handleStream)
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
