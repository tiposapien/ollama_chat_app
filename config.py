import os
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env

class Config:
    # Flask/Session configuration
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'fallback_secret')
    SESSION_TYPE = 'filesystem'
    SESSION_FILE_DIR = os.path.join(os.getcwd(), 'flask_session')
    SESSION_PERMANENT = False

    # Directory for chat logs
    LOG_DIR = os.path.join(os.getcwd(), 'chat_logs')

    # Ollama API base URL
    OLLAMA_API_PORT = os.getenv('OLLAMA_API_PORT', '11434')
    OLLAMA_API_BASE = os.getenv('OLLAMA_API_BASE', f'http://localhost:{OLLAMA_API_PORT}/api')

    # Debug mode toggle
    DEBUG_MODE = os.getenv('DEBUG_MODE', 'False').lower() == 'true'