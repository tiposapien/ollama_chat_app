import sys
import os

import pytest
import json
from app import app, socketio
from flask.testing import FlaskClient



@pytest.fixture
def client():
    """
    Provides a Flask test client.
    We mock session data to avoid filesystem complexities in tests.
    """
    app.config['TESTING'] = True
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['chat_history'] = []
            sess['log_filename'] = 'test_chat.json'
        yield client

def test_index_page(client: FlaskClient):
    """Test the index page loads and contains 'Ollama Chat App'."""
    response = client.get('/')
    assert response.status_code == 200
    assert b"Ollama Chat App" in response.data

def test_get_models(client: FlaskClient, monkeypatch):
    """Mock /api/models to ensure we handle data properly."""
    mock_models = {"models": ["llama2", "mistral", "gemma"]}

    def mock_get(*args, **kwargs):
        class MockResponse:
            def json(self):
                return {
                    "models": [
                        {"name": "llama2"},
                        {"name": "mistral"},
                        {"name": "gemma"}
                    ]  # Simulating Ollama API's expected response format
                }
            def raise_for_status(self):
                pass
        return MockResponse()

    # Patch requests.get
    monkeypatch.setattr("requests.get", mock_get)

    response = client.get('/api/models')
    assert response.status_code == 200
    assert "models" in response.json
    assert response.json["models"] == ["llama2", "mistral", "gemma"]

def test_chat_history_empty(client: FlaskClient):
    """Test /api/chat_history returns an empty list initially."""
    response = client.get('/api/chat_history')
    assert response.status_code == 200
    assert "chat_history" in response.json
    assert response.json["chat_history"] == []

def test_send_message_socket(client, monkeypatch):
    """
    Test the SocketIO 'send_message' event.
    We'll mock the Ollama streaming response to simulate API responses.
    """

    # Mock Ollama API response
    def mock_post(*args, **kwargs):
        class MockResponse:
            def iter_lines(self):
                yield b'{"message": {"content": "Hello "}}'
                yield b'{"message": {"content": "World!"}}'
                yield b'{"done": true}'
            def raise_for_status(self):
                pass
        return MockResponse()

    monkeypatch.setattr("requests.post", mock_post)

    # Create a test request context to properly initialize session
    with app.test_request_context():
        with app.test_client() as client:
            with client.session_transaction() as session:
                session['chat_history'] = []  # Initialize session variable

    # Use Flask-SocketIO test client
    test_client = socketio.test_client(app)

    # Emit a test message
    test_client.emit('send_message', {'prompt': 'Hello World', 'model': 'llama2'})

    # Receive messages from SocketIO
    received = test_client.get_received()

    # Validate that we received a response event
    assert any(event['name'] == 'receive_message' for event in received), "Expected 'receive_message' event"