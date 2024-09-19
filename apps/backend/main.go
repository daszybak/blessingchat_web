package main

import (
	"fmt"
	"log"
	"net/http"
	"proomptmachinee/pkg/openapi"
	"proomptmachinee/pkg/openapi/completions"
)

type ChatbotApi struct {
	completionsClient *completions.Client
}

func main() {
	key := "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"
	client := &http.Client{}
	completionsClient := completions.NewCompletionsClient(key, client, openapi.Gpt4oMini)
	api := &ChatbotApi{completionsClient}

	http.HandleFunc("/chat_bot", api.handleStream)
	fmt.Println("Listening on port 8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
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
