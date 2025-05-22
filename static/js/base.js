// static/js/ai-chat-fixed.js - Исправленный JavaScript с сохранением истории

document.addEventListener('DOMContentLoaded', function() {
    // Simple Markdown parser
    function parseMarkdown(text) {
        // Escape HTML first to prevent XSS
        text = text.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#x27;');

        // Headers (must be at start of line)
        text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');

        // Code blocks (triple backticks)
        text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Inline code (single backticks)
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold (**text** or __text__)
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
        
        // Italic (*text* or _text_)
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        text = text.replace(/_(.*?)_/g, '<em>$1</em>');
        
        // Lists (unordered)
        text = text.replace(/^\* (.*$)/gm, '<li>$1</li>');
        text = text.replace(/^- (.*$)/gm, '<li>$1</li>');
        
        // Lists (ordered)
        text = text.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');
        
        // Wrap consecutive list items in ul/ol tags
        text = text.replace(/(<li>.*<\/li>)/gs, function(match) {
            return '<ul>' + match + '</ul>';
        });
        
        // Blockquotes
        text = text.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
        
        // Links [text](url)
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // Line breaks (double newline becomes paragraph)
        text = text.replace(/\n\n/g, '</p><p>');
        text = '<p>' + text + '</p>';
        
        // Clean up empty paragraphs
        text = text.replace(/<p><\/p>/g, '');
        
        // Single line breaks
        text = text.replace(/\n/g, '<br>');
        
        return text;
    }

    // AI Chat elements
    const aiChatButton = document.getElementById('ai-chat-button');
    const aiChatOverlay = document.getElementById('ai-chat-overlay');
    const aiChatContainer = document.getElementById('ai-chat-container');
    const aiChatClose = document.getElementById('ai-chat-close');
    const aiChatExpand = document.getElementById('ai-chat-expand');
    const aiChatInput = document.getElementById('ai-chat-input');
    const aiChatSend = document.getElementById('ai-chat-send');
    const aiChatMessages = document.getElementById('ai-chat-messages');

    if (!aiChatButton || !aiChatOverlay || !aiChatInput || !aiChatSend || !aiChatMessages) {
        console.log('AI Chat elements not found, skipping initialization');
        return;
    }

    let isTyping = false;
    let isExpanded = false;
    let historyLoaded = false;

    // Создаем модальное окно для неавторизованных пользователей
    function createLoginModal() {
        const modal = document.createElement('div');
        modal.id = 'login-modal';
        modal.className = 'login-modal-overlay';
        modal.innerHTML = `
            <div class="login-modal-content">
                <button class="login-modal-close" id="login-modal-close">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
                <div class="login-modal-body">
                    <div class="ai-avatar-large">
                        <span class="kronik-logo">K</span>
                    </div>
                    <h3>Войдите, чтобы пользоваться Кроник ИИ</h3>
                    <p>Для доступа к персональному образовательному помощнику необходимо авторизоваться</p>
                    <div class="login-modal-buttons">
                        <a href="/login/" class="login-modal-btn login-btn">Войти</a>
                        <a href="/register/" class="login-modal-btn register-btn">Регистрация</a>
                    </div>
                    <div class="login-modal-features">
                        <h4>Возможности Кроник ИИ:</h4>
                        <ul>
                            <li>🎓 Помощь в изучении предметов</li>
                            <li>💡 Объяснение сложных концепций</li>
                            <li>📚 Персональные рекомендации</li>
                            <li>💬 Сохранение истории диалогов</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Закрытие модального окна
        const closeBtn = modal.querySelector('#login-modal-close');
        const overlay = modal;
        
        closeBtn.addEventListener('click', function() {
            modal.classList.remove('active');
        });
        
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                modal.classList.remove('active');
            }
        });

        return modal;
    }

    // Создаем модальное окно
    const loginModal = createLoginModal();

    // Показ сообщения авторизации
    function showLoginMessage() {
        loginModal.classList.add('active');
    }

    // Загрузка истории чата при открытии
    async function loadChatHistory() {
        if (historyLoaded) return;
        
        try {
            // Показываем индикатор загрузки
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'history-loading';
            loadingIndicator.innerHTML = `
                <div class="history-loading-spinner"></div>
                Загрузка истории чата...
            `;
            aiChatMessages.appendChild(loadingIndicator);

            const response = await fetch('/api/get-chat-history/?limit=50');
            
            // Удаляем индикатор загрузки
            loadingIndicator.remove();
            
            if (response.status === 401 || response.status === 403) {
                // Пользователь не авторизован
                console.log('User not authenticated for chat history');
                historyLoaded = true;
                return;
            }

            const data = await response.json();
            
            if (data.success && data.history.length > 0) {
                // Очищаем контейнер сообщений (удаляем приветственное сообщение)
                aiChatMessages.innerHTML = '';
                
                // Добавляем разделитель истории
                const separator = document.createElement('div');
                separator.className = 'history-separator';
                separator.innerHTML = '<span>История предыдущих сообщений</span>';
                aiChatMessages.appendChild(separator);
                
                // Добавляем сообщения из истории
                data.history.forEach(message => {
                    addMessageFromHistory(message.content, message.type === 'user');
                });
                
                // Добавляем разделитель для новых сообщений
                const newSeparator = document.createElement('div');
                newSeparator.className = 'history-separator';
                newSeparator.innerHTML = '<span>Новая сессия</span>';
                aiChatMessages.appendChild(newSeparator);
                
                // Прокручиваем к концу
                setTimeout(() => {
                    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
                }, 100);
                
                console.log(`Загружено ${data.history.length} сообщений из истории`);
            } else {
                console.log('История чата пуста или не найдена');
                // Оставляем приветственное сообщение
            }
            
            historyLoaded = true;
        } catch (error) {
            console.error('Ошибка загрузки истории чата:', error);
            
            // Удаляем индикатор загрузки если есть
            const loadingIndicator = aiChatMessages.querySelector('.history-loading');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            
            historyLoaded = true; // Помечаем как загруженную, чтобы не пытаться снова
        }
    }

    // Добавление сообщения из истории (без анимации)
    function addMessageFromHistory(content, isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.className = isUser ? 'user-message from-history' : 'ai-message from-history';
        
        let avatarHtml = '';
        if (isUser) {
            if (window.userAvatarUrl) {
                avatarHtml = `<div class="user-avatar"><img src="${window.userAvatarUrl}" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;"></div>`;
            } else if (window.userInitial) {
                avatarHtml = `<div class="user-avatar">${window.userInitial}</div>`;
            } else {
                avatarHtml = `<div class="user-avatar">У</div>`;
            }
        } else {
            avatarHtml = `<div class="ai-avatar"><span class="kronik-logo">K</span></div>`;
        }
        
        // Обрабатываем содержимое
        const processedContent = isUser ? escapeHtml(content) : parseMarkdown(content);
        
        messageDiv.innerHTML = `
            ${avatarHtml}
            <div class="message-content">
                ${processedContent}
            </div>
        `;
        
        aiChatMessages.appendChild(messageDiv);
    }

    // Open chat - обновленная функция
    aiChatButton.addEventListener('click', function() {
        // Проверяем авторизацию
        if (!window.userAuthenticated) {
            showLoginMessage();
            return;
        }

        aiChatOverlay.classList.add('active');
        
        // Загружаем историю при первом открытии
        if (!historyLoaded) {
            loadChatHistory();
        }
        
        setTimeout(() => {
            aiChatInput.focus();
        }, 300);
    });

    // Close chat
    if (aiChatClose) {
        aiChatClose.addEventListener('click', function() {
            aiChatOverlay.classList.remove('active');
            // Reset expanded state when closing
            if (isExpanded) {
                toggleExpanded();
            }
        });
    }

    // Expand/collapse chat
    if (aiChatExpand) {
        aiChatExpand.addEventListener('click', function() {
            toggleExpanded();
        });
    }

    function toggleExpanded() {
        isExpanded = !isExpanded;
        aiChatContainer.classList.toggle('expanded', isExpanded);
        
        // Update expand button icon
        const expandIcon = aiChatExpand.querySelector('svg');
        if (isExpanded) {
            // Change to collapse icon
            expandIcon.innerHTML = `
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            `;
            aiChatExpand.title = 'Свернуть';
        } else {
            // Change back to expand icon
            expandIcon.innerHTML = `
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            `;
            aiChatExpand.title = 'Развернуть на весь экран';
        }
        
        // Scroll to bottom after animation
        setTimeout(() => {
            aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        }, 300);
    }

    // Close on overlay click
    aiChatOverlay.addEventListener('click', function(e) {
        if (e.target === aiChatOverlay) {
            aiChatOverlay.classList.remove('active');
            if (isExpanded) {
                toggleExpanded();
            }
        }
    });

    // Handle input changes
    aiChatInput.addEventListener('input', function() {
        adjustTextareaHeight();
        toggleSendButton();
    });

    // Handle enter key
    aiChatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Send button click
    aiChatSend.addEventListener('click', sendMessage);

    function adjustTextareaHeight() {
        aiChatInput.style.height = 'auto';
        aiChatInput.style.height = Math.min(aiChatInput.scrollHeight, 120) + 'px';
    }

    function toggleSendButton() {
        const hasText = aiChatInput.value.trim().length > 0;
        aiChatSend.disabled = !hasText || isTyping;
    }

    function addMessage(content, isUser = false, useMarkdown = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = isUser ? 'user-message' : 'ai-message';
        
        let avatarHtml = '';
        if (isUser) {
            if (window.userAvatarUrl) {
                avatarHtml = `<div class="user-avatar"><img src="${window.userAvatarUrl}" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;"></div>`;
            } else if (window.userInitial) {
                avatarHtml = `<div class="user-avatar">${window.userInitial}</div>`;
            } else {
                avatarHtml = `<div class="user-avatar">У</div>`;
            }
        } else {
            avatarHtml = `<div class="ai-avatar"><span class="kronik-logo">K</span></div>`;
        }
        
        // Process content with Markdown if it's an AI message
        const processedContent = (useMarkdown && !isUser) ? parseMarkdown(content) : escapeHtml(content);
        
        messageDiv.innerHTML = `
            ${avatarHtml}
            <div class="message-content">
                ${processedContent}
            </div>
        `;
        
        aiChatMessages.appendChild(messageDiv);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        
        return messageDiv;
    }

    function addTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-message typing-message';
        typingDiv.innerHTML = `
            <div class="ai-avatar"><span class="kronik-logo">K</span></div>
            <div class="message-content">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        
        aiChatMessages.appendChild(typingDiv);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        
        return typingDiv;
    }

    // Function to escape HTML (for user messages)
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function sendMessage() {
        const message = aiChatInput.value.trim();
        if (!message || isTyping) return;

        // Проверяем авторизацию перед отправкой
        if (!window.userAuthenticated) {
            showLoginMessage();
            return;
        }

        // Add user message (no markdown processing for user messages)
        addMessage(message, true, false);
        
        // Clear input
        aiChatInput.value = '';
        adjustTextareaHeight();
        toggleSendButton();
        
        // Show typing indicator
        isTyping = true;
        const typingIndicator = addTypingIndicator();
        
        try {
            // Get CSRF token
            const csrfToken = getCsrfToken();

            const response = await fetch('/api/ai-chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                body: JSON.stringify({
                    message: message
                })
            });

            // Remove typing indicator
            if (typingIndicator && typingIndicator.parentNode) {
                typingIndicator.remove();
            }

            if (response.status === 401 || response.status === 403) {
                // Пользователь не авторизован
                addMessage('Для использования чата необходимо авторизоваться. <a href="/login/">Войти</a>', false, false);
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Check if response is streaming
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/plain')) {
                // Handle streaming response
                await handleStreamingResponse(response);
            } else {
                // Handle JSON response (fallback)
                const data = await response.json();
                if (data.error) {
                    addMessage(`Ошибка: ${data.error}`, false, false);
                } else {
                    addMessage(data.response || 'Пустой ответ от сервера', false, true);
                }
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Remove typing indicator if still present
            if (typingIndicator && typingIndicator.parentNode) {
                typingIndicator.remove();
            }
            
            // Try fallback to simple API
            try {
                await sendMessageFallback(message);
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                addMessage('Извините, произошла ошибка. Попробуйте еще раз.', false, false);
            }
        } finally {
            isTyping = false;
            toggleSendButton();
        }
    }

    async function handleStreamingResponse(response) {
        // Create AI message container with empty content
        const aiMessageDiv = addMessage('', false, false);
        const messageContent = aiMessageDiv.querySelector('.message-content');
        
        // Read the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonStr = line.slice(6).trim();
                            if (jsonStr) {
                                const data = JSON.parse(jsonStr);
                                if (data.content) {
                                    fullResponse += data.content;
                                    // Apply markdown parsing in real-time
                                    messageContent.innerHTML = parseMarkdown(fullResponse);
                                    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
                                }
                                if (data.done) {
                                    break;
                                }
                            }
                        } catch (e) {
                            // Ignore JSON parse errors for incomplete chunks
                            console.warn('JSON parse error:', e);
                        }
                    }
                }
            }
        } catch (streamError) {
            console.error('Stream reading error:', streamError);
            if (!fullResponse) {
                messageContent.innerHTML = '<p>Ошибка при получении ответа. Попробуйте еще раз.</p>';
            }
        }
    }

    async function sendMessageFallback(message) {
        const csrfToken = getCsrfToken();
        
        const response = await fetch('/api/ai-chat-simple/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken,
            },
            body: JSON.stringify({
                message: message
            })
        });

        const data = await response.json();
        
        if (data.success) {
            addMessage(data.response, false, true);
        } else {
            addMessage(`Ошибка: ${data.error}`, false, false);
        }
    }

    // Функция для очистки истории чата
    async function clearChatHistory() {
        if (!window.userAuthenticated) {
            showLoginMessage();
            return;
        }

        if (!confirm('Вы уверены, что хотите очистить всю историю чата? Это действие нельзя отменить.')) {
            return;
        }
        
        try {
            const csrfToken = getCsrfToken();
            const response = await fetch('/api/clear-chat-history/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                },
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Очищаем интерфейс
                aiChatMessages.innerHTML = `
                    <div class="ai-message">
                        <div class="ai-avatar">
                            <span class="kronik-logo">K</span>
                        </div>
                        <div class="message-content">
                            <p>История чата очищена. Привет! Я <strong>Кроник ИИ</strong>, ваш персональный образовательный помощник.</p>
                        </div>
                    </div>
                `;
                
                // Сбрасываем флаг загрузки истории
                historyLoaded = false;
                
                console.log(`Очищено ${data.deleted_count} сообщений`);
            } else {
                addMessage('Ошибка при очистке истории чата', false, false);
            }
        } catch (error) {
            console.error('Error clearing chat history:', error);
            addMessage('Ошибка при очистке истории чата', false, false);
        }
    }

    // Добавляем кнопку очистки истории только для авторизованных
    function addClearHistoryButton() {
        if (!window.userAuthenticated) {
            return; // Не добавляем кнопку для неавторизованных
        }

        const clearButton = document.createElement('button');
        clearButton.className = 'clear-history-btn';
        clearButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Очистить историю</span>
        `;
        clearButton.title = 'Очистить всю историю чата';
        clearButton.onclick = clearChatHistory;
        
        // Добавляем кнопку в заголовок чата
        const chatControls = document.querySelector('.ai-chat-controls');
        if (chatControls) {
            chatControls.insertBefore(clearButton, chatControls.firstChild);
        }
    }

    // Добавляем кнопку очистки только для авторизованных
    addClearHistoryButton();

    // Helper function to get CSRF token
    function getCsrfToken() {
        let token = null;
        
        const metaTag = document.querySelector('meta[name=csrf-token]');
        if (metaTag) {
            token = metaTag.getAttribute('content');
        }
        
        if (!token) {
            const hiddenInput = document.querySelector('[name=csrfmiddlewaretoken]');
            if (hiddenInput) {
                token = hiddenInput.value;
            }
        }
        
        if (!token) {
            token = getCookie('csrftoken');
        }
        
        return token;
    }

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // Initialize textarea height
    setTimeout(() => {
        if (aiChatInput) {
            adjustTextareaHeight();
        }
    }, 100);

    // Handle window resize for expanded mode
    window.addEventListener('resize', function() {
        if (isExpanded) {
            setTimeout(() => {
                aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
            }, 100);
        }
    });

    // Auto-focus input when chat becomes visible (только для авторизованных)
    if (window.userAuthenticated) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (aiChatOverlay.classList.contains('active') && aiChatInput) {
                        setTimeout(() => {
                            aiChatInput.focus();
                        }, 350);
                    }
                }
            });
        });

        observer.observe(aiChatOverlay, { attributes: true });
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Close chat with Escape key
        if (e.key === 'Escape') {
            if (aiChatOverlay.classList.contains('active')) {
                aiChatOverlay.classList.remove('active');
                if (isExpanded) {
                    toggleExpanded();
                }
            }
            if (loginModal.classList.contains('active')) {
                loginModal.classList.remove('active');
            }
        }
        
        // Ctrl/Cmd + K to open chat
        if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !aiChatOverlay.classList.contains('active')) {
            e.preventDefault();
            aiChatButton.click();
        }
        
        // Ctrl/Cmd + Enter to expand/collapse when chat is open (только для авторизованных)
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && aiChatOverlay.classList.contains('active') && window.userAuthenticated) {
            e.preventDefault();
            toggleExpanded();
        }
    });
});