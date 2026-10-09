from typing import Annotated

from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    # Database
    DATABASE_URL: str


    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_HOURS: int


    # Redis
    REDIS_URL: str


    # Celery
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str


    # Email
    SMTP_HOST: str
    SMTP_PORT: int
    SMTP_USERNAME: str
    SMTP_PASSWORD: str

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    ENVIRONMENT: str = "development"
    PRODUCT_SEARCH_SIMILARITY_THRESHOLD: Annotated[float, Field(ge=0.0, le=1.0)] = Field(
        default=0.35,
        validation_alias=AliasChoices(
            "PRODUCT_SEARCH_SIMILARITY_THRESHOLD",
            "product_search_similarity_threshold",
        ),
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )


settings = Settings()