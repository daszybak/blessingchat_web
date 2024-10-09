package resputil

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type Resputil interface {
	Ok(w http.ResponseWriter, data interface{}) error
}
type Responses struct {
}

func NewResputil() Resputil {
	return &Responses{}
}

func (r *Responses) Ok(w http.ResponseWriter, data interface{}) error {
	js, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("could not marshal json: %v", err)
	}
	r.writeHeaders(w, http.StatusOK)
	w.Write(js)

	return nil
}

func (r *Responses) writeHeaders(w http.ResponseWriter, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
}
