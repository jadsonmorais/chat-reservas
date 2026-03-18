import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "troque-esta-chave")
    DATABASE_URL = os.environ.get("DATABASE_URL")
    SERPAPI_KEY = os.environ.get("SERPAPI_KEY")
    USE_MCP = os.environ.get("USE_MCP", "true").lower() == "true"
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
    EVOLUTION_API_URL = os.environ.get("EVOLUTION_API_URL")
    EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY")
    EVOLUTION_INSTANCE_NAME = os.environ.get("EVOLUTION_INSTANCE_NAME")
    PRICE_THRESHOLD_LOW = float(os.environ.get("PRICE_THRESHOLD_LOW", 300))
    PRICE_THRESHOLD_MEDIUM = float(os.environ.get("PRICE_THRESHOLD_MEDIUM", 600))
    PORT = int(os.environ.get("PORT", 3000))
