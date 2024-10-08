package realtime

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"proomptmachinee/internal/services/openai"

	"github.com/gorilla/websocket"
)

const (
	OpenAiRealtimeUrl     = "wss://api.openai.com/v1/realtime"
	OpenAiBetaHeaderKey   = "OpenAI-Beta"
	OpenAiBetaHeaderValue = "realtime=v1"
	OpenAiModelQueryKey   = "model"
)

type Client struct {
	key     string
	url     string
	model   string
	headers http.Header
}

func NewRealtimeClient(key string, model string) *Client {
	headers := http.Header{}
	headers.Set(OpenAiBetaHeaderKey, OpenAiBetaHeaderValue)
	authString := fmt.Sprintf("Bearer %s", key)
	headers.Set("Authorization", authString)
	return &Client{
		key:     key,
		url:     OpenAiRealtimeUrl,
		model:   model,
		headers: headers,
	}
}

var upgrader = websocket.Upgrader{
	// Buffer sizes for real-time audio streaming
	ReadBufferSize:  8192, // 8 KB for raw PCM (24kHz)
	WriteBufferSize: 8192, // Can adjust for specific formats

	// Adjust for G.711 if needed
	// ReadBufferSize:  2048, // 2 KB for G.711 (8kHz)
	// WriteBufferSize: 2048,

	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Message struct {
	Content []byte
	Type    int
}

// InputAudioTranscription represents the optional audio transcription settings
type InputAudioTranscription struct {
	Enable *bool   `json:"enable,omitempty"`
	Model  *string `json:"model,omitempty"`
}

// Session represents the session update details
type Session struct {
	Instructions            *string                  `json:"instructions,omitempty"`
	InputAudioTranscription *InputAudioTranscription `json:"input_audio_transcription,omitempty"`
}

// SessionUpdate represents the overall update message
type SessionUpdate struct {
	Type    string   `json:"type"`
	Session *Session `json:"session,omitempty"`
}

// TODO close connection with OpenAi when client closes the connection
func (c *Client) WsHandler(w http.ResponseWriter, r *http.Request) error {
	// Upgrade connection with client from Http to WebSocket
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "couldn't upgrade connection", http.StatusInternalServerError)
		return errors.New("couldn't upgrade connection")
	}

	log.Println("WebSocket connection opened with client", r.Header.Get(""))

	// Open websocket connection with Open Ai
	openAiConn, resp, err := websocket.DefaultDialer.Dial(OpenAiRealtimeUrl+"?"+OpenAiModelQueryKey+"="+openai.Gpt40RealtimePreview, c.headers)
	// TODO sent intial message to Open Ai of type `session.update`
	// to update the session's default configuration
	// Writing JSON using an inline struct
	// FIXME refactor
	// Define session update message
	instructions := "You are my Croatian programming female friend"
	sessionUpdate := SessionUpdate{
		Type: "session.update",
		Session: &Session{
			Instructions: &instructions,
			// InputAudioTranscription is nil, so it will be omitted in JSON
		},
	}

	if err := openAiConn.WriteJSON(sessionUpdate); err != nil {
		log.Println("Error sending session update:", err)
		return err
	}

	if err != nil {
		if resp != nil {
			return fmt.Errorf("openAi response status: %s", resp.Status)
		}
		closeMessage := websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "failed to connect to OpenAi")
		if writeErr := clientConn.WriteMessage(websocket.CloseMessage, closeMessage); writeErr != nil {
			return fmt.Errorf("couldn't send close message to client: %v", writeErr)
		}
		return fmt.Errorf("failed to connect to OpenAI: %w", err)
	}

	var openAiReceivedMessages = make(chan *Message, 10)

	// Read messages from OpenAi
	go func() {
		defer func() {
			close(openAiReceivedMessages)
		}()
		for {
			messageType, messageContent, err := openAiConn.ReadMessage()
			var result interface{}
			json.Unmarshal(messageContent, &result)
			log.Printf("received message from Open Ai: %v, %v, %v", messageType, result, err)
			if err != nil {
				log.Printf("couldn't read message from OpenAI: %v", err)
				msg := &Message{
					Content: websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "OpenAI disconnected"),
					Type:    websocket.CloseMessage,
				}
				openAiReceivedMessages <- msg
				break
			}
			msg := &Message{
				Content: messageContent,
				Type:    messageType,
			}
			openAiReceivedMessages <- msg
		}
	}()

	// Send OpenAi messages back to client
	go func() {
		for message := range openAiReceivedMessages {
			clientConn.WriteMessage(message.Type, message.Content)
		}
	}()

	var clientReceivedMessages = make(chan *Message, 10)

	// Send client messages to OpenAi
	go func() {
		for message := range clientReceivedMessages {
			openAiConn.WriteMessage(message.Type, message.Content)
		}
	}()

	// Receive messages from client
	go func() {
		for {
			messageType, messageContent, err := clientConn.ReadMessage()
			var result interface{}
			json.Unmarshal(messageContent, &result)
			log.Printf("received message from client: %v, %v, %v", messageType, result, err)
			if err != nil {
				log.Printf("couldn't read message from client: %v", err)
				// close connection with OpenAi
				// TODO rethink this
				openAiConn.Close()
				break
			}
			msg := &Message{
				Content: messageContent,
				Type:    messageType,
			}
			clientReceivedMessages <- msg
		}
	}()

	return nil
}
