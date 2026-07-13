from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    CORE_API_URL: str = "http://localhost:3000"

    # Service-to-service auth (§7A)
    SERVICE_TOKEN_JWKS_URI: str = ""
    SERVICE_TOKEN_AUDIENCE: str = "slotq-ai"

    # LLM (model-agnostic behind LangChain Runnable)
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4o"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # Per-request cost ceiling (§8)
    LLM_MAX_TOKENS_PER_REQUEST: int = 4096
    LLM_TIMEOUT_SECONDS: int = 30

    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"
