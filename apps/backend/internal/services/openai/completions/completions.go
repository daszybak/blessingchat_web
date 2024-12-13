package completions

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
)

const (
	openAiCompletionsUrl string = "https://api.openai.com/v1/chat/completions"
)

type Client struct {
	key    string
	client *http.Client
	url    string
	model  string
}

type StreamResponse struct {
	resp *http.Response
}

func (s *StreamResponse) Receive(w http.ResponseWriter) error {
	defer s.Close()
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported!", http.StatusInternalServerError)
		return errors.New("streaming unsupported")
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	if s.resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(s.resp.Body)
		return fmt.Errorf("error: %s\nBody: %s", s.resp.Status, string(bodyBytes))
	}

	// Read the streaming response line by line
	reader := bufio.NewReader(s.resp.Body)
	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}

		// Skip empty lines
		if len(line) == 0 {
			continue
		}

		// Each line should be a JSON object starting with "data: "
		// Remove "data: " prefix and check for end of stream
		if bytes.HasPrefix(line, []byte("data: ")) {
			line = bytes.TrimPrefix(line, []byte("data: "))
			if string(bytes.TrimSpace(line)) == "[DONE]" {
				break
			}

			var completionResp CompletionResponse
			if err := json.Unmarshal(line, &completionResp); err != nil {
				log.Fatalf("Error parsing JSON: %s : %v", string(line), err)
			}

			if len(completionResp.Choices) > 0 {
				content := completionResp.Choices[0].Delta.Content
				contentResp := &ContentResponse{Content: content}
				jsonChunk, _ := json.Marshal(contentResp)

				_, err := w.Write([]byte("data: " + string(jsonChunk) + "\n"))
				if err != nil {
					return err
				}

				flusher.Flush()
			}

		}
	}
	_, doneErr := w.Write([]byte("data: [DONE]\n\n"))
	if doneErr != nil {
		return doneErr
	}
	flusher.Flush()
	//https://cookbook.openai.com/examples/how_to_stream_completions#4-how-to-get-token-usage-data-for-streamed-chat-completion-response
	// you can use stream_options={"include_usage": true} to get the usage metadata
	// the `usage` field on the last chunk contains the usage statistics for the entire request
	// it can still be a cool excercise to try to calculate the tokens yourself
	status := &ContentResponse{
		Metadata: map[string]string{
			"requests_remaining": "zero",
		},
	}
	statusResp, _ := json.Marshal(status)
	w.Write([]byte("data: " + string(statusResp) + "\n\n"))
	flusher.Flush()
	return nil
}

func (s *StreamResponse) Close() error {
	return s.resp.Body.Close()
}

func NewCompletionsClient(key string, client *http.Client, model string) *Client {
	return &Client{
		key:    key,
		client: client,
		url:    openAiCompletionsUrl,
		model:  model,
	}
}

// TODO think of a mechanism that will allow previous prompts for user to be
// persisted if they exist
func (c *Client) SendPrompt(prompt string) (*StreamResponse, error) {
	msg := &CompletionRequestMessage{
		Role:    CompletionRequestMessageRoleUser,
		Content: prompt,
	}

	// TODO add stream_options={"include_usage": true} to the request
	// TODO add more fields like temperature, max_tokens, etc. that can
	// passed from the frontend
	completionReq := &CompletionRequest{
		Model:    c.model,
		Messages: []*CompletionRequestMessage{msg},
		Stream:   CompletionRequestStreamEnabled,
	}

	jsonData, err := json.Marshal(completionReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal json: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, c.url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	authString := fmt.Sprintf("Bearer %s", c.key)

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", authString)
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	return &StreamResponse{resp: resp}, nil
}
