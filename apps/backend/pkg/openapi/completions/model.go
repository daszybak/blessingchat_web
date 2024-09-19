package completions

type CompletionRequest struct {
	Model               string                      `json:"model"`
	Messages            []*CompletionRequestMessage `json:"messages"`
	Stream              bool                        `json:"stream"`
	MaxCompletionTokens int                         `json:"max_completion_tokens,omitempty"`
}

type CompletionRequestMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type CompletionResponse struct {
	Choices []Choice `json:"choices"`
}

type Delta struct {
	Content string `json:"content"`
}

type Choice struct {
	Delta Delta `json:"delta"`
}

type ContentResponse struct {
	Content  string            `json:"content,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

const (
	CompletionRequestStreamEnabled     = true
	CompletionRequestMessageRoleUser   = "user"
	CompletionRequestMessageRoleSystem = "system"
)
