package realtime

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

const (
	OpenAiRealtimeUrl     = "wss://api.openai.com/v1/realtime"
	OpenAiBetaHeaderKey   = "OpenAI-Beta"
	OpenAiBetaHeaderValue = "realtime=v1"
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

func (c *Client) WsHandler(w http.ResponseWriter, r *http.Request) error {
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "couldn't upgrade connection", http.StatusInternalServerError)
		return errors.New("couldn't upgrade connection")
	}

	log.Println("WebSocket connection opened with client")

	openAiConn, resp, err := websocket.DefaultDialer.Dial(c.url, c.headers)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("openAI response status: %s", resp.Status)
		}
		closeMessage := websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "failed to connect to OpenAI")
		if writeErr := clientConn.WriteMessage(websocket.CloseMessage, closeMessage); writeErr != nil {
			return fmt.Errorf("couldn't send close message to client: %v", writeErr)
		}
		return fmt.Errorf("failed to connect to OpenAI: %w", err)
	}
	defer func() {
		err := openAiConn.Close()
		if err != nil {
			log.Printf("error closing OpenAI connection: %v", err)
		}
	}()

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			messageType, message, err := clientConn.ReadMessage()
			if err != nil {
				log.Printf("couldn't read message from client: %v", err)
				closeMessage := websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Client disconnected")
				if writeErr := openAiConn.WriteMessage(websocket.CloseMessage, closeMessage); writeErr != nil {
					log.Printf("error sending close message to OpenAI: %v", writeErr)
				}
				break
			}

			err = openAiConn.WriteMessage(messageType, message)
			if err != nil {
				log.Printf("couldn't send message to OpenAI: %v", err)
				closeMessage := websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "Failed to send message to OpenAI")
				if writeErr := clientConn.WriteMessage(websocket.CloseMessage, closeMessage); writeErr != nil {
					log.Printf("error sending close message to client: %v", writeErr)
				}
				break
			}
		}
	}()

	go func() {
		for {
			messageType, message, err := openAiConn.ReadMessage()
			if err != nil {
				log.Printf("couldn't read message from OpenAI: %v", err)
				closeMessage := websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "OpenAI disconnected")
				if writeErr := clientConn.WriteMessage(websocket.CloseMessage, closeMessage); writeErr != nil {
					log.Printf("error sending close message to client: %v", writeErr)
				}
				break
			}

			err = clientConn.WriteMessage(messageType, message)
			if err != nil {
				log.Printf("couldn't send message to client: %v", err)
				closeMessage := websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "Failed to send message to client")
				if writeErr := openAiConn.WriteMessage(websocket.CloseMessage, closeMessage); writeErr != nil {
					log.Printf("error sending close message to OpenAI: %v", writeErr)
				}
				break
			}
		}
	}()
	return nil
}
