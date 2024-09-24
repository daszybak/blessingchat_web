package logger

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"
)

type Logger interface {
	Info(msg string, data map[string]interface{})
	Error(msg string, data map[string]interface{})
	LogRequestResponse(req *http.Request, statusCode int, body string, duration time.Duration, err error)
}

type ConcreteLogger struct {
	*slog.Logger
}

func New() *ConcreteLogger {
	return &ConcreteLogger{
		Logger: slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}
}

func (l *ConcreteLogger) Info(msg string, data map[string]interface{}) {
	fields := make([]any, 0, len(data))
	for key, value := range data {
		fields = append(fields, slog.Any(key, value))
	}
	l.Logger.Info(msg, fields...)
}

func (l *ConcreteLogger) Error(msg string, data map[string]interface{}) {
	fields := make([]any, 0, len(data))
	for key, value := range data {
		fields = append(fields, slog.Any(key, value))
	}
	l.Logger.Error(msg, fields...)
}

func (l *ConcreteLogger) Fatal(msg string, err error) {
	m := fmt.Sprintf("Fatal error: %s", msg)
	l.Logger.Error(m, err)
	os.Exit(1)
}

func (l *ConcreteLogger) LogRequestResponse(req *http.Request, statusCode int, body string, duration time.Duration, err error) {
	data := map[string]interface{}{
		"request": map[string]interface{}{
			"url":        req.URL.String(),
			"user_agent": req.UserAgent(),
			"method":     req.Method,
			"headers":    req.Header,
			"body":       req.Body,
		},
		"response": map[string]interface{}{
			"status_code": statusCode,
			"body":        body,
		},
		"duration": duration.String(),
	}

	if err != nil {
		data["errors"] = []map[string]interface{}{
			{"error": err.Error()},
		}
	}

	l.Info("Handled request", data)
}
