document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const messageInput = document.getElementById('message-input');
    const modelSelect = document.getElementById('model-select');
    const chatForm = document.getElementById('chat-form');
    const newChatButton = document.getElementById('new-chat-button');
    const deleteChatButton = document.getElementById('delete-chat-button');
    const chatLogsList = document.getElementById('chat-logs');

    let selectedChatFilename = null;
    const socket = io();

    /* ---- Loading Indicator ---- */
    let loadingIndicator = null;
    function showLoadingIndicator() {
        if (!loadingIndicator) {
            loadingIndicator = document.createElement('div');
            loadingIndicator.classList.add('loading-indicator');
            loadingIndicator.textContent = 'Thinking...';
            chatBox.appendChild(loadingIndicator);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }
    function hideLoadingIndicator() {
        if (loadingIndicator) {
            loadingIndicator.remove();
            loadingIndicator = null;
        }
    }
    /* -------------------------- */

    /* ---- Error Handling ---- */
    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.classList.add('error-message');
        errorDiv.textContent = message;
        // Optional styling or fade-out
        chatBox.appendChild(errorDiv);
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 3000);
    }
    /* ------------------------ */

    // Load models (async/await)
    async function loadModels() {
        try {
            const response = await fetch('/api/models');
            if (!response.ok) throw new Error('Failed to fetch models.');
            const data = await response.json();
            const models = data.models || [];
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching models:', error);
            showError('Error fetching models');
        }
    }

    // Load chat logs (async/await)
    async function loadChatLogs() {
        try {
            const response = await fetch('/api/chat_logs');
            if (!response.ok) throw new Error('Failed to fetch chat logs.');
            const data = await response.json();
            chatLogsList.innerHTML = '';
            data.chat_logs.forEach(chat => {
                const listItem = document.createElement('li');
                listItem.textContent = chat.subject || 'Untitled Chat';
                listItem.dataset.filename = chat.filename;
                listItem.dataset.subject = chat.subject || 'Untitled Chat';
                listItem.classList.add('chat-list-item');
                listItem.addEventListener('click', () => selectChat(listItem));
                listItem.addEventListener('dblclick', () => makeListItemEditable(listItem));
                chatLogsList.appendChild(listItem);
            });
            // Re-select if we already had a selected chat
            if (selectedChatFilename) {
                document.querySelectorAll('#chat-logs li').forEach(item => {
                    if (item.dataset.filename === selectedChatFilename) {
                        item.classList.add('selected');
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching chat logs:', error);
            showError('Error fetching chat logs');
        }
    }

    // Select a chat
    async function selectChat(listItem) {
        document.querySelectorAll('#chat-logs li').forEach(li => li.classList.remove('selected'));
        listItem.classList.add('selected');
        selectedChatFilename = listItem.dataset.filename;

        try {
            const res = await fetch('/api/load_chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({filename: selectedChatFilename})
            });
            const data = await res.json();
            if (data.status) {
                chatBox.innerHTML = '';
                // Reload chat history
                loadChatHistory();
            } else {
                showError('Failed to load chat.');
            }
        } catch (err) {
            console.error('Error loading chat:', err);
            showError('Error loading chat');
        }
    }

    // Editable list item (chat subject)
    function makeListItemEditable(listItem) {
        const currentSubject = listItem.dataset.subject;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentSubject;
        input.classList.add('edit-input');
        listItem.innerHTML = '';
        listItem.appendChild(input);
        input.focus();

        input.addEventListener('blur', () => saveNewSubject(listItem, input.value.trim()));
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
        });
    }

    async function saveNewSubject(listItem, newSubject) {
        if (!selectedChatFilename) {
            showError('Please select a chat to update.');
            return;
        }
        try {
            const res = await fetch('/api/update_chat_subject', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    filename: listItem.dataset.filename,
                    subject: newSubject
                })
            });
            const data = await res.json();
            if (data.status) {
                listItem.textContent = newSubject || 'Untitled Chat';
                listItem.dataset.subject = newSubject || 'Untitled Chat';
                listItem.addEventListener('click', () => selectChat(listItem));
                listItem.addEventListener('dblclick', () => makeListItemEditable(listItem));
            } else {
                showError('Failed to update subject.');
            }
        } catch (err) {
            console.error('Error updating subject:', err);
            showError('Error updating subject');
        }
    }

    newChatButton.addEventListener('click', () => {
        // Refresh the page to clear session and start a new chat
        location.reload();
    });

    deleteChatButton.addEventListener('click', async () => {
        if (selectedChatFilename) {
            try {
                const res = await fetch('/api/delete_chat', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ filename: selectedChatFilename })
                });
                const data = await res.json();
                if (data.status) {
                    chatBox.innerHTML = '';
                    selectedChatFilename = null;
                    loadChatLogs();
                } else {
                    showError('Failed to delete chat.');
                }
            } catch (err) {
                console.error('Error deleting chat:', err);
                showError('Error deleting chat');
            }
        } else {
            showError('Please select a chat to delete.');
        }
    });

    // Load chat history
    async function loadChatHistory() {
        try {
            const response = await fetch('/api/chat_history');
            if (!response.ok) throw new Error('Failed to fetch chat history');
            const data = await response.json();
            renderChatHistory(data.chat_history);
        } catch (error) {
            console.error('Error fetching chat history:', error);
            showError('Error fetching chat history');
        }
    }

    function renderChatHistory(chatHistory) {
        chatBox.innerHTML = '';
        chatHistory.forEach(msg => {
            const sender = msg.role === 'user' ? 'User' : 'Bot';
            addMessageToChat(sender, msg.content);
        });
    }

    // Form submission
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
    });

    // SHIFT+Enter to send
    messageInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Send message
    function sendMessage() {
        const message = messageInput.value.trim();
        const selectedModel = modelSelect.value;
        if (!selectedModel) {
            alert("Please select a model.");
            return;
        }
        if (message) {
            addMessageToChat('User', message);
            messageInput.value = '';
            // Show waiting indicator
            showLoadingIndicator();

            // Emit socket event
            socket.emit('send_message', {
                model: selectedModel,
                prompt: message
            });
        }
    }

    // Receive streamed data
    socket.on('receive_message', data => {
        hideLoadingIndicator();
        const content = data.content;
        let botMessages = document.querySelectorAll('.bot-message[data-updating="true"]');
        let lastBotMessage = botMessages[botMessages.length - 1];

        if (!lastBotMessage) {
            lastBotMessage = addMessageToChat('Bot', '');
            lastBotMessage.setAttribute('data-updating', 'true');
        }
        let html = marked.parse(content);
        html = transformCustomTags(html);
        lastBotMessage.innerHTML = html;

        lastBotMessage.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
            addCopyButton(block);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    // Response complete
    socket.on('response_complete', () => {
        hideLoadingIndicator();
        const updatingBotMessages = document.querySelectorAll('.bot-message[data-updating="true"]');
        updatingBotMessages.forEach(msg => msg.removeAttribute('data-updating'));
        loadChatLogs();
    });

    socket.on('error', data => {
        console.error('Socket Error:', data.error);
        showError(data.error);
    });

    // Add a message bubble to chat
    function addMessageToChat(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message-bubble', sender === 'User' ? 'user-message' : 'bot-message');

        let html = marked.parse(message);
        html = transformCustomTags(html);
        messageElement.innerHTML = html;

        messageElement.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
            addCopyButton(block);
        });

        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageElement;
    }

    // Transform <think> tags into collapsible sections
    function transformCustomTags(html) {
        return html.replace(/<think>([\s\S]*?)<\/think>/gi, (match, p1) => {
            if (!p1.trim()) {
                return '';
            }
            return `
            <div class="custom-think-collapsible">
                <div class="think-summary">[Thought - Click to Expand]</div>
                <div class="think-content" style="display:none;">${p1}</div>
            </div>`;
        });
    }

    // Toggle collapsible on click
    document.addEventListener('click', e => {
        if (e.target && e.target.classList.contains('think-summary')) {
            const content = e.target.nextElementSibling;
            if (content) {
                const isVisible = (content.style.display === 'block');
                content.style.display = isVisible ? 'none' : 'block';
                e.target.textContent = isVisible
                  ? '[Thought - Click to Expand]'
                  : '[Thought - Click to Hide]';
            }
        }
    });

    // Add "Copy" button to code blocks
    function addCopyButton(codeBlock) {
        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Copy';
        copyBtn.classList.add('copy-button');
        codeBlock.parentNode.insertBefore(copyBtn, codeBlock);
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(codeBlock.innerText || '').then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.textContent = 'Copy', 1500);
            });
        });
    }

    // Initial calls
    loadModels();
    loadChatHistory();
    loadChatLogs();
});