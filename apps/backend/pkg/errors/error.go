package resp_errors

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"proomptmachinee/pkg/logger"
)

const (
	httpStatusInternalServerError = "Internal Server Error"
	httpStatusNotFound            = "Not Found"
	httpStatusBadRequest          = "Bad Request"
	httpStatusForbidden           = "Forbidden"
	httpStatusUnauthorized        = "Unauthorized"
)

type ErrResponder interface {
	InternalServerError(w http.ResponseWriter, err error)
	NotFound(w http.ResponseWriter)
	// TODO add more descriptive `bad request` errors
	BadRequest(w http.ResponseWriter)
	Unauthorized(w http.ResponseWriter)
	Forbidden(w http.ResponseWriter)
}
type Error struct {
	log *logger.ConcreteLogger
}

func New(log *logger.ConcreteLogger) *Error {
	return &Error{log: log}
}

func (e *Error) InternalServerError(w http.ResponseWriter, err error) {
	e.errorResponse(w, err, http.StatusInternalServerError, httpStatusInternalServerError)
}

func (e *Error) NotFound(w http.ResponseWriter) {
	e.errorResponse(w, nil, http.StatusNotFound, httpStatusNotFound)
}

func (e *Error) BadRequest(w http.ResponseWriter) {
	e.errorResponse(w, nil, http.StatusBadRequest, httpStatusBadRequest)
}
func (e *Error) Forbidden(w http.ResponseWriter) {
	e.errorResponse(w, nil, http.StatusForbidden, httpStatusForbidden)
}

func (e *Error) Unauthorized(w http.ResponseWriter) {
	e.errorResponse(w, nil, http.StatusUnauthorized, httpStatusUnauthorized)
}

func (e *Error) errorResponse(w http.ResponseWriter, reqErr error, status int, code string) {
	// use logger
	if reqErr != nil {
		log.Println(reqErr)
	}
	w.WriteHeader(status)
	data := map[string]interface{}{
		"code": code,
	}
	js, err := json.Marshal(data)
	if err != nil {
		log.Println(fmt.Errorf("failed marshalling error response: %v", err))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(js)
}
