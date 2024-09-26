package config

type Config struct {
	OpenAi   OpenAIConfig   `yaml:"openai"`
	Keycloak KeycloakConfig `yaml:"keycloak"`
	Server   ServerConfig   `yaml:"server"`
}

type OpenAIConfig struct {
	ApiKey         string `yaml:"api_key"`
	OrganizationId string `yaml:"organization_id"`
}

type KeycloakConfig struct {
	Oauth2IssuerURL string `yaml:"oauth2_issuer_url"`
}

type ServerConfig struct {
	Port string `yaml:"port"`
}
