"""Ollama Chat App

A Flask-based web application that interfaces with the Ollama API to provide
chat capabilities with AI models. Features include session-based chat history,
chat log management with JSON storage, real-time messaging using SocketIO,
and RESTful API endpoints for model retrieval and chat log operations.

Author: OpenAI ChatGPT
"""

import os
import json
import requests
import logging
from typing import Any, Dict, List, Optional, Union, Tuple

# Eventlet is required for async SocketIO operation
import eventlet

from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
from flask_session import Session
from uuid import uuid4
from datetime import datetime
from config import Config
from dotenv import load_dotenv

load_dotenv()  # In case we need environment variables before config

# -----------------------------------------------------------------------------------
#  Initialize Flask App and Configuration
# -----------------------------------------------------------------------------------
app = Flask(__name__)
app.config.from_object(Config)

# Flask-Session
Session(app)

# SocketIO (use eventlet or gevent in production)
socketio = SocketIO(app, manage_session=False)

if app.config['DEBUG_MODE']:
    app.logger.setLevel(logging.DEBUG)
else:
    app.logger.setLevel(logging.INFO)

OLLAMA_API_BASE = app.config['OLLAMA_API_BASE']
LOG_DIR = app.config['LOG_DIR']

# Create LOG_DIR if not exists
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR, exist_ok=True)

# -----------------------------------------------------------------------------------
#  Helper Functions
# -----------------------------------------------------------------------------------
def handle_api_error(e: Exception) -> Tuple[Any, int]:
    """Return JSON with a 503 error for Ollama API unavailability."""
    app.logger.error(f"Ollama API error: {str(e)}")
    return jsonify({"error": "Service unavailable"}), 503

def save_chat_to_log(log_filename: str, chat_session: Dict[str, Any]) -> None:
    """Save the chat session to a file in JSON format."""
    log_filepath = os.path.join(LOG_DIR, log_filename)
    with open(log_filepath, 'w', encoding='utf-8') as log_file:
        json.dump(chat_session, log_file, indent=2)

def get_chat_logs() -> List[Dict[str, Union[str, Any]]]:
    """Get a sorted list of chat log metadata (excluding deleted)."""
    files = os.listdir(LOG_DIR)
    chat_logs: List[Dict[str, Union[str, Any]]] = []
    for filename in files:
        if filename.startswith('deleted-') or not filename.endswith('.json'):
            continue
        log_filepath = os.path.join(LOG_DIR, filename)
        with open(log_filepath, 'r', encoding='utf-8') as log_file:
            chat_session = json.load(log_file)
            chat_logs.append({
                'filename': filename,
                'uuid': chat_session.get('uuid', ''),
                'datetime': chat_session.get('datetime', ''),
                'subject': chat_session.get('subject', 'Untitled Chat')
            })
    # Sort by datetime descending
    chat_logs.sort(key=lambda x: x['datetime'], reverse=True)
    return chat_logs

def is_valid_log_filename(filename: str) -> bool:
    """Check that the filename is safe (no path traversal) and exists in LOG_DIR."""
    if not filename.endswith('.json'):
        return False
    if os.path.basename(filename) != filename:
        return False
    full_path = os.path.join(LOG_DIR, filename)
    if not os.path.isfile(full_path):
        return False
    return True

def load_chat_log(filename: str) -> Optional[Dict[str, Any]]:
    """Load chat session from a JSON file if filename is valid."""
    if not is_valid_log_filename(filename):
        return None
    log_filepath = os.path.join(LOG_DIR, filename)
    if os.path.exists(log_filepath):
        with open(log_filepath, 'r', encoding='utf-8') as log_file:
            return json.load(log_file)
    return None

def delete_chat_log(filename: str) -> bool:
    """Mark a chat log as deleted by renaming the file if filename is valid."""
    if not is_valid_log_filename(filename):
        return False
    log_filepath = os.path.join(LOG_DIR, filename)
    if os.path.exists(log_filepath):
        new_name = f"deleted-{filename}"
        os.rename(log_filepath, os.path.join(LOG_DIR, new_name))
        return True
    return False

# -----------------------------------------------------------------------------------
#  Flask Hooks
# -----------------------------------------------------------------------------------
@app.before_request
def initialize_session() -> None:
    """Initialize session variables for the current user if not present."""
    if 'log_filename' not in session:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        session['chat_uuid'] = uuid4().hex
        session['log_filename'] = f'chat_{timestamp}_{session["chat_uuid"]}.json'
        session['chat_datetime'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if 'chat_history' not in session:
        session['chat_history'] = []
        
    if 'chat_subject' not in session:
        session['chat_subject'] = ''

@app.before_request
def log_request_info() -> None:
    """Log basic request info (in production, ensure logs are rotated)."""
    app.logger.info(f"Incoming {request.method} request to {request.path}")

# -----------------------------------------------------------------------------------
#  Routes
# -----------------------------------------------------------------------------------
@app.route('/')
def index() -> Any:
    # Clear session so a fresh chat starts each time user hits home
    session.clear()
    return render_template('index.html')

@app.route('/api/models', methods=['GET'])
def get_models() -> Any:
    """Fetch available models from the Ollama API."""
    try:
        response = requests.get(f'{OLLAMA_API_BASE}/tags', timeout=5)
        response.raise_for_status()
        data = response.json()
        models = [model.get('name') for model in data.get('models', [])]
        return jsonify({"models": models})
    except requests.exceptions.RequestException as e:
        return handle_api_error(e)

@app.route('/api/chat_history', methods=['GET'])
def get_chat_history() -> Any:
    """Return the current chat history from session."""
    return jsonify({"chat_history": session.get('chat_history', [])})

@app.route('/api/chat_logs', methods=['GET'])
def list_chat_logs() -> Any:
    """List metadata of all chat logs."""
    return jsonify({"chat_logs": get_chat_logs()})

@app.route('/api/load_chat', methods=['POST'])
def load_chat() -> Any:
    """Load a specific chat session into the user's session."""
    data = request.json
    filename = data.get('filename')
    if filename and is_valid_log_filename(filename):
        chat_session = load_chat_log(filename)
        if chat_session:
            session['chat_history'] = chat_session.get('chat_logs', [])
            session['log_filename'] = filename
            session['chat_uuid'] = chat_session.get('uuid', '')
            session['chat_subject'] = chat_session.get('subject', '')
            session['chat_datetime'] = chat_session.get('datetime', '')
            session.modified = True
            return jsonify({"status": True, "message": "Chat loaded successfully"}), 200
    return jsonify({"error": "Failed to load chat"}), 400

@app.route('/api/update_chat_subject', methods=['POST'])
def update_chat_subject() -> Any:
    """Update the subject/title of a chat log."""
    data = request.json
    filename = data.get('filename')
    new_subject = data.get('subject')
    if filename and new_subject is not None and is_valid_log_filename(filename):
        chat_session = load_chat_log(filename)
        if chat_session:
            chat_session['subject'] = new_subject
            save_chat_to_log(filename, chat_session)
            return jsonify({"status": True, "message": "Subject updated successfully"}), 200
    return jsonify({"error": "Failed to update subject"}), 400

@app.route('/api/delete_chat', methods=['POST'])
def delete_chat() -> Any:
    """Mark a chat log as deleted."""
    data = request.json
    filename = data.get('filename')
    if filename and is_valid_log_filename(filename) and delete_chat_log(filename):
        return jsonify({"status": True, "message": "Chat deleted successfully"}), 200
    return jsonify({"error": "Failed to delete chat"}), 400

# -----------------------------------------------------------------------------------
#  SocketIO Events
# -----------------------------------------------------------------------------------
@socketio.on('send_message')
def handle_send_message(data: Dict[str, Any]) -> None:
    """Handle user sending a new message (prompt) to the Ollama API."""
    prompt = data.get('prompt', '').strip()
    model = data.get('model', 'llama3.2')

    # Add user message to chat history
    # TODO: If user message includes images, add an "images": [base64_images] field as per Ollama API.
    user_message = {
        "role": "user",
        "content": prompt,
        "datetime": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "model": model
    }

    if not session.get('chat_subject'):
        # Use first 30 characters of first user message as subject
        session['chat_subject'] = prompt[:30] if prompt else 'Untitled Chat'

    session['chat_datetime'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    session['chat_history'].append(user_message)
    session.modified = True

    # Prepare request payload for Ollama
    obj_payload = {
        "model": model,
        # "prompt": prompt,  # Removed as per instructions
        "messages": session['chat_history'],
        "stream": True
    }

    sid = request.sid
    accumulated_message = ""

    # Stream response from Ollama
    try:
        response = requests.post(f'{OLLAMA_API_BASE}/chat', json=obj_payload, stream=True, timeout=300)
        response.raise_for_status()

        for line in response.iter_lines():
            if line:
                data_line = line.decode('utf-8')
                parsed_data = json.loads(data_line)

                if parsed_data.get('done'):
                    # Finalize assistant message
                    assistant_message = {
                        "role": "assistant",
                        "content": accumulated_message,
                        "datetime": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        "model": model
                    }
                    session['chat_history'].append(assistant_message)
                    session.modified = True

                    # Save chat log in the background
                    chat_session = {
                        "uuid": session.get('chat_uuid'),
                        "datetime": session.get('chat_datetime'),
                        "subject": session.get('chat_subject'),
                        "chat_logs": session.get('chat_history')
                    }
                    log_filename = session.get('log_filename')
                    socketio.start_background_task(save_chat_to_log, log_filename, chat_session)

                    socketio.emit('response_complete', room=sid)
                    break
                else:
                    content_chunk = parsed_data['message'].get('content', '')
                    accumulated_message += content_chunk
                    socketio.emit('receive_message', {'content': accumulated_message}, room=sid)
    except requests.exceptions.Timeout:
        app.logger.error("Ollama API call timed out after 300 seconds.")
        emit('error', {'error': 'The model took too long to respond (timed out after 5 minutes).'})
    except requests.exceptions.RequestException as e:
        app.logger.error(f"Ollama API error: {e}")
        emit('error', {'error': 'Unable to connect to Ollama API'})

# -----------------------------------------------------------------------------------
#  Entry Point
# -----------------------------------------------------------------------------------
if __name__ == '__main__':
    import eventlet
    import eventlet.wsgi
    socketio.run(app, debug=app.config['DEBUG_MODE'], host='0.0.0.0', port=5000)
    print('test')