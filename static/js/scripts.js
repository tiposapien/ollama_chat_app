// Ensure DOMPurify is available (should be included via script tag in your HTML)
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


    if (messageInput) {
        messageInput.addEventListener('paste', async function(event) {
            event.preventDefault();
            const clipboardData = event.clipboardData || window.clipboardData;
            if (!clipboardData) return;

            // Check for image
            for (const item of clipboardData.items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        // Insert image as base64 <img> tag
                        const imgTag = `<img src="${e.target.result}" alt="pasted image" />`;
                        insertHtmlAtCursor(imgTag);
                    };
                    reader.readAsDataURL(file);
                    return;
                }
            }

            // Check for file (non-image)
            for (const item of clipboardData.items) {
                if (item.kind === 'file' && !item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    // Insert a placeholder for the file
                    const placeholder = `<span class="file-placeholder">[File: ${file.name}]</span>`;
                    insertHtmlAtCursor(placeholder);
                    // Optionally, handle the file (e.g., upload or process)
                    handlePastedFile(file);
                    return;
                }
            }

            // Otherwise, paste as plain text
            const text = clipboardData.getData('text/plain');
            if (text) {
                insertHtmlAtCursor(text);
            }
        });
    }

    // Helper to insert HTML at the cursor position in contenteditable
    function insertHtmlAtCursor(html) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        const el = document.createElement('div');
        el.innerHTML = html;
        const frag = document.createDocumentFragment();
        let node, lastNode;
        while ((node = el.firstChild)) {
            lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);

        // Move the cursor after the inserted content
        if (lastNode) {
            range.setStartAfter(lastNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    // Placeholder for handling pasted files (non-images)
    function handlePastedFile(file) {
        // Implement your file upload/processing logic here (e.g., upload, parse, etc.)
        // TODO: Handle file upload/processing.
        console.log('Pasted file:', file);
    }
    
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
        // Create the error container if it doesn't exist
        let errorContainer = document.getElementById('chat-error-container');
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.id = 'chat-error-container';
            errorContainer.style.position = 'fixed';
            errorContainer.style.top = '30px';
            errorContainer.style.left = '50%';
            errorContainer.style.transform = 'translateX(-50%)';
            errorContainer.style.zIndex = '9999';
            errorContainer.style.display = 'flex';
            errorContainer.style.flexDirection = 'column';
            errorContainer.style.gap = '10px';
            document.body.appendChild(errorContainer);
        }

        // Create error message div
        const errorDiv = document.createElement('div');
        errorDiv.classList.add('error-message', 'fancy-error');
        errorDiv.style.display = 'flex';
        errorDiv.style.alignItems = 'center';
        errorDiv.style.padding = '14px 22px';
        errorDiv.style.background = 'rgba(242,67,67,0.97)';
        errorDiv.style.color = '#fff';
        errorDiv.style.borderRadius = '8px';
        errorDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.09)';
        errorDiv.style.fontWeight = '600';
        errorDiv.style.fontSize = '1rem';
        errorDiv.style.gap = '12px';
        errorDiv.style.maxWidth = '350px';
        errorDiv.style.margin = '0 auto';
        errorDiv.style.animation = 'error-slide-down 0.4s cubic-bezier(.17,.67,.58,1.39)';

        // Icon
        const icon = document.createElement('span');
        icon.textContent = '⚠️';
        icon.style.fontSize = '1.3em';
        icon.style.marginRight = '6px';

        // Error text
        const textSpan = document.createElement('span');
        textSpan.textContent = message;

        // Dismiss button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.color = '#fff';
        closeBtn.style.fontSize = '1.2em';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.marginLeft = 'auto';
        closeBtn.addEventListener('click', () => {
            errorDiv.remove();
        });

        errorDiv.appendChild(icon);
        errorDiv.appendChild(textSpan);
        errorDiv.appendChild(closeBtn);

        errorContainer.appendChild(errorDiv);

        // Auto-dismiss after 4.5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 4500);
    }
    /* ------------------------ */

    // Load models (async/await)
    async function loadModels() {
        showLoadingIndicator();
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
        } finally {
            hideLoadingIndicator();
        }
    }

    // Load chat logs (async/await)
    async function loadChatLogs() {
        showLoadingIndicator();
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
        } finally {
            hideLoadingIndicator();
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
                // Instead of updating the list item directly (which could cause duplicate listeners), refresh the chat logs
                loadChatLogs();
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

    // Only ONE keydown event listener for messageInput, per instructions
    if (messageInput) {
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Let browser insert newline
                    return;
                } else {
                    e.preventDefault();
                    sendMessage();
                }
            }
        });
    }

    // Send message
    function sendMessage() {
        const message = messageInput.innerHTML
            .replace(/<br\s*\/?>/gi, '')
            .trim();
        // Prevent sending empty message (with only whitespace or line breaks)
        if (!message || !message.replace(/&nbsp;|<[^>]*>/g, '').trim()) {
            return;
        }
        const selectedModel = modelSelect.value;
        if (!selectedModel) {
            showError("Please select a model.");
            return;
        }
        if (message) {
            addMessageToChat('User', message);
            messageInput.innerHTML = '';
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
        html = DOMPurify.sanitize(html);
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
        hideLoadingIndicator();
    });

    // Add a message bubble to chat
    function addMessageToChat(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message-bubble', sender === 'User' ? 'user-message' : 'bot-message');

        let html = marked.parse(message);
        html = DOMPurify.sanitize(html);
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