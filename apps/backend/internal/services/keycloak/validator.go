package keycloak

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"net/http"
	"strings"
	"time"
)

type Validator struct {
	Oauth2IssuerUrl string
}

// TODO return interface instead
func NewValidator(oauth2IssuerUrl string) *Validator {
	return &Validator{Oauth2IssuerUrl: oauth2IssuerUrl}
}

// TODO separate this in form of keycloak client
func (v *Validator) getKeycloakPublicKey(kid string) (*rsa.PublicKey, error) {
	resp, err := http.Get(v.Oauth2IssuerUrl)
	if err != nil {
		return nil, fmt.Errorf("error getting keycloak public key from url %s: %s", v.Oauth2IssuerUrl, err)
	}
	defer resp.Body.Close()

	var jwks jose.JSONWebKeySet
	err = json.NewDecoder(resp.Body).Decode(&jwks)
	if err != nil {
		return nil, fmt.Errorf("couldn't decode keycloak public key: %s", err)
	}
	for _, key := range jwks.Keys {
		if key.KeyID == kid && key.Use == "sig" {
			if rsaKey, ok := key.Key.(*rsa.PublicKey); ok {
				return rsaKey, nil
			}
		}
	}

	return nil, fmt.Errorf("keycloak public key not found")
}

func (v *Validator) ValidateTokenSignature(token string) (string, error) {
	kid, err := extractJwtKid(token)
	if err != nil {
		return "", fmt.Errorf("coudln't extract JWT key id from token: %w", err)
	}

	kcPubKey, err := v.getKeycloakPublicKey(kid)
	if err != nil {
		return "", fmt.Errorf("couldn't get keycloak public key: %w", err)
	}

	parsedToken, err := jwt.ParseSigned(token, []jose.SignatureAlgorithm{jose.RS256})
	if err != nil {
		return "", fmt.Errorf("couldn't parse token: %w", err)
	}

	var claims jwt.Claims
	err = parsedToken.Claims(kcPubKey, &claims)
	if err != nil {
		return "", fmt.Errorf("couldn't parse token claims: %w", err)
	}

	if claims.Expiry == nil {
		return "", fmt.Errorf("token claims has no expiry time")
	}

	// TODO wrap claims with internal type, also check `aud` and
	// `iss` with the payload to ensure. This is just a quick and
	// dirty solution for basic token checking
	if exp := int64(*claims.Expiry); exp < time.Now().Unix() {
		return "", fmt.Errorf("token expired")
	}

	return claims.ID, nil
}

func decodeBase64string(input string) ([]byte, error) {
	// Here we ensure extra padding is added to base64 string
	// In order to be properly decoded base64 string len needs
	// to be divisible by 4, and if it's not padding should be added
	if padding := len(input) % 4; padding != 0 {
		input += strings.Repeat("=", 4-padding)
	}

	return base64.URLEncoding.DecodeString(input)
}

func extractJwtKid(token string) (string, error) {
	encodedHeader := strings.Split(token, ".")[0]
	rawHeader, err := decodeBase64string(encodedHeader)
	if err != nil {
		return "", fmt.Errorf("error decoding header: %s", err)
	}

	// TODO use dedicated JWTHeader type for this
	var header map[string]interface{}
	err = json.Unmarshal(rawHeader, &header)
	if err != nil {
		return "", fmt.Errorf("error decoding header: %s", err)
	}

	return header["kid"].(string), nil
}
