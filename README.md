# Ollama Chat App

A Flask-based chat interface leveraging **Socket.IO** for **streaming** responses from the **Ollama API**. This app in intended to be lightweight and run locally along side Ollama. It allows users to interact with LLM models, maintain chat history, and manage conversation logs. The Ollama CLI is still required to manage models. 

## About the developer  
As a Data Engineer and Architect, web development falls in my 5th wheel of expertise. 90% of the app was build in ChatGPT o1. 

## Features

- **Real-time AI responses** using Flask-SocketIO.
- **Persistent chat history** with session-based storage.
- **File-based chat logs** stored as JSON.
- **Interactive UI** with chat selection, deletion, and renaming.
- **Markdown and Syntax Highlighting** with collapsible `<think>` tags.
- **Secure environment variable management** via `.env`.

## Prerequisites

- **Python 3.8+**  
- **pip** (for managing dependencies)  
- **Ollama running locally** on port `11434` (can be configured in .env)


## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/tiposapien/ollama_chat_app.git
cd ollama_chat_app
```

### 2. Setup Python Virtual Environment (Optional but Recommended)

```bash
cd <to_your_desired_folder>
python -m venv .venv
# activate environment
source .venv/bin/activate # for linux or macos
.\.venv\Scripts\activate.bat # for windows (powershell use .psi)
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Save the below in a`.env` file and update the values:

```bash
# -----------------------------------
#    Environment Variables
# -----------------------------------

# Flask secret key
FLASK_SECRET_KEY=your_super_secret_key_when_deployed

# Ollama API base endpoint and port
OLLAMA_API_BASE=http://localhost:11434/api
OLLAMA_API_PORT=11434 

# Debug mode (True/False)
DEBUG_MODE=True
```

## Additional Run Deails
- Session details stored in **<app_folder>/flask_session** folder (should be created if it doesn't exist. assumes permissions)
- Chat logs stored in **<app_folder>/chat_logs** folder (should be created if it doesn't exist. assumes permissions)
- Ollama must be running with desired models downloaded
- App was developed and tested on MacOS, please feel free to provide feedback for other platforms. 


### Launch

```bash
python app.py
```

The app will start at `http://127.0.0.1:5000`.


## Running Tests

Ensure `pytest` is installed:

```bash
pip install pytest
```

Run tests:

```bash
pytest
```

## Project Structure

```
ollama_chat_app/
├── app.py              # Flask app entry point
├── config.py           # Configuration file
├── .env                # Environment variables and secrets
├── requirements.txt    # Dependencies
├── tests/              
│   ├── test_api.py     # Test cases for the API endpoints 
├── static/
│   ├── css/styles.css  # CSS Styles
│   ├── js/scripts.js   # JavaScript Logic
├── templates/
│   ├── index.html      # Frontend UI
├── chat_logs/          # Stored chat logs
├── flask_session/      # Flask session data
└── README.md           # Project documentation
```

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

---

**Happy Chatting with Ollama!**
