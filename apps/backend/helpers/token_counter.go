package helpers

import (
	"fmt"
	"github.com/pkoukk/tiktoken-go"
)

func TokenCount(text, model string) (int, error) {
	tck, err := tiktoken.EncodingForModel(model)
	if err != nil {
		return 0, fmt.Errorf("coudln't get token encoding from model: %w", err)
	}
	ans := tck.Encode(text, nil, nil)

	return len(ans), nil
}
