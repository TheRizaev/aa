document.addEventListener('DOMContentLoaded', function() {
    // Элементы DOM для AI чата
    const aiChatButton = document.getElementById('ai-chat-button');
    const aiChatOverlay = document.getElementById('ai-chat-overlay');
    const aiChatContainer = document.getElementById('ai-chat-container');
    const aiChatClose = document.getElementById('ai-chat-close');
    const aiChatExpand = document.getElementById('ai-chat-expand');
    const aiChatInput = document.getElementById('ai-chat-input');
    const aiChatSend = document.getElementById('ai-chat-send');
    const aiChatMessages = document.getElementById('ai-chat-messages');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    let isTyping = false;
    let isExpanded = false;
    let historyLoaded = false;
    let voiceInterface = null;

    // Инициализация голосового интерфейса
    function initializeVoiceInterface() {
        if (window.KronikVoiceInterface && window.userAuthenticated) {
            voiceInterface = new window.KronikVoiceInterface({
                onTranscription: (text) => {
                    // Добавляем сообщение пользователя в чат
                    addMessage(text, true, { isVoiceMessage: true });
                },
                onResponse: (response) => {
                    // Голосовой ответ уже обработан в voice interface
                    if (response.ai_response) {
                        addMessage(response.ai_response, false, {
                            isVoiceResponse: true,
                            truncated: response.truncated
                        });
                    }
                },
                onError: (error) => {
                    console.error('Voice interface error:', error);
                    addMessage('Ошибка голосового интерфейса: ' + error, false, { isError: true });
                }
            });
        }
    }

    // Проверка аутентификации
    function checkAuthentication() {
        return window.userAuthenticated === true;
    }

    // Показ модального окна авторизации
    function showLoginModal() {
        const modalHTML = `
            <div class="login-modal-overlay" id="login-modal-overlay">
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
                        <h3>Кроник ИИ доступен только для авторизованных пользователей</h3>
                        <p>Войдите или зарегистрируйтесь, чтобы получить доступ к персональному образовательному помощнику</p>
                        
                        <div class="login-modal-buttons">
                            <a href="/login/" class="login-modal-btn login-btn">Войти</a>
                            <a href="/register/" class="login-modal-btn register-btn">Регистрация</a>
                        </div>
                        
                        <div class="login-modal-features">
                            <h4>После входа вы получите:</h4>
                            <ul>
                                <li>✓ Персонального AI помощника для обучения</li>
                                <li>✓ Сохранение истории диалогов</li>
                                <li>✓ Голосовое общение с Кроником</li>
                                <li>✓ Адаптивные ответы под ваш уровень</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        const modalOverlay = document.getElementById('login-modal-overlay');
        const modalClose = document.getElementById('login-modal-close');
        
        setTimeout(() => {
            modalOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }, 10);
        
        modalClose.addEventListener('click', closeLoginModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeLoginModal();
            }
        });
        
        function closeLoginModal() {
            modalOverlay.classList.remove('active');
            document.body.style.overflow = '';
            setTimeout(() => {
                modalOverlay.remove();
            }, 300);
        }
    }

    // Открытие чата
    if (aiChatButton) {
        aiChatButton.addEventListener('click', function() {
            if (!checkAuthentication()) {
                showLoginModal();
                return;
            }
            
            aiChatOverlay.classList.add('active');
            setTimeout(() => {
                aiChatInput.focus();
                if (!historyLoaded) {
                    loadChatHistory();
                    historyLoaded = true;
                }
                if (!voiceInterface) {
                    initializeVoiceInterface();
                }
            }, 300);
        });
    }

    // Закрытие чата
    if (aiChatClose) {
        aiChatClose.addEventListener('click', function() {
            aiChatOverlay.classList.remove('active');
            if (voiceInterface) {
                voiceInterface.stopRecording();
            }
        });
    }

    // Закрытие по клику на оверлей
    if (aiChatOverlay) {
        aiChatOverlay.addEventListener('click', function(e) {
            if (e.target === aiChatOverlay) {
                aiChatOverlay.classList.remove('active');
            }
        });
    }

    // Развернуть/свернуть чат
    if (aiChatExpand) {
        aiChatExpand.addEventListener('click', function() {
            isExpanded = !isExpanded;
            aiChatContainer.classList.toggle('expanded');
            
            const expandIcon = aiChatExpand.querySelector('svg');
            if (isExpanded) {
                expandIcon.innerHTML = `
                    <path d="M5 9l-3 3m0 0l3 3m-3-3h8M19 9l3 3m0 0l-3 3m3-3h-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                `;
                aiChatExpand.title = 'Свернуть';
            } else {
                expandIcon.innerHTML = `
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                `;
                aiChatExpand.title = 'Развернуть на весь экран';
            }
        });
    }

    // Обработка ввода
    if (aiChatInput) {
        aiChatInput.addEventListener('input', function() {
            adjustTextareaHeight();
            toggleSendButton();
        });

        aiChatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Отправка сообщения
    if (aiChatSend) {
        aiChatSend.addEventListener('click', sendMessage);
    }

    // Очистка истории
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', async function() {
            if (!confirm('Вы уверены, что хотите очистить всю историю чата?')) {
                return;
            }
            
            try {
                const response = await fetch('/api/clear-chat-history/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCsrfToken(),
                    }
                });
                
                if (response.ok) {
                    // Очищаем только сообщения, не трогая приветствие
                    const messages = aiChatMessages.querySelectorAll('.ai-message:not(:first-child), .user-message');
                    messages.forEach(msg => msg.remove());
                    
                    // Показываем уведомление
                    showNotification('История чата очищена', 'success');
                }
            } catch (error) {
                console.error('Error clearing history:', error);
                showNotification('Ошибка при очистке истории', 'error');
            }
        });
    }

    function adjustTextareaHeight() {
        aiChatInput.style.height = 'auto';
        aiChatInput.style.height = Math.min(aiChatInput.scrollHeight, 120) + 'px';
    }

    function toggleSendButton() {
        const hasText = aiChatInput.value.trim().length > 0;
        aiChatSend.disabled = !hasText || isTyping;
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
        scrollToBottom();
        
        return typingDiv;
    }

    function addMessage(text, isUser, options = {}) {
        const messageDiv = document.createElement('div');
        messageDiv.className = isUser ? 'user-message' : 'ai-message';
        
        if (options.fromHistory) {
            messageDiv.classList.add('from-history');
        }
        
        if (options.isError) {
            messageDiv.classList.add('error-message');
        }
        
        if (isUser) {
            messageDiv.innerHTML = `
                <div class="message-content">
                    ${options.isVoiceMessage ? '<span class="voice-indicator">🎤</span> ' : ''}
                    <p>${escapeHtml(text)}</p>
                </div>
                <div class="user-avatar">
                    ${window.userAvatarUrl ? 
                        `<img src="${window.userAvatarUrl}" alt="User">` : 
                        (window.userInitial || 'U')
                    }
                </div>
            `;
        } else {
            let content = '';
            if (options.isVoiceResponse && options.truncated) {
                content = `<p>${text}</p><p class="truncation-note">⚠️ Ответ был сокращен для голосового воспроизведения</p>`;
            } else {
                // Парсим markdown для текстовых ответов
                content = `<p>${window.parseMarkdown ? window.parseMarkdown(text) : text}</p>`;
            }
            
            messageDiv.innerHTML = `
                <div class="ai-avatar"><span class="kronik-logo">K</span></div>
                <div class="message-content">
                    ${options.isVoiceResponse ? '<span class="voice-indicator">🔊</span> ' : ''}
                    ${content}
                </div>
            `;
        }
        
        aiChatMessages.appendChild(messageDiv);
        scrollToBottom();
        
        return messageDiv;
    }

    async function sendMessage() {
        const message = aiChatInput.value.trim();
        if (!message || isTyping) return;

        // Добавляем сообщение пользователя
        addMessage(message, true);
        
        // Очищаем поле ввода
        aiChatInput.value = '';
        adjustTextareaHeight();
        toggleSendButton();
        
        // Показываем индикатор загрузки
        isTyping = true;
        const typingIndicator = addTypingIndicator();
        
        try {
            const response = await fetch('/api/ai-chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({
                    message: message,
                    type: 'text'  // Указываем, что это текстовое сообщение
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Удаляем индикатор загрузки
            typingIndicator.remove();
            
            // Создаем контейнер для ответа AI
            const aiMessageDiv = addMessage('', false);
            const messageContent = aiMessageDiv.querySelector('.message-content p');
            
            // Читаем поток
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.content) {
                                fullResponse += data.content;
                                // Парсим markdown
                                messageContent.innerHTML = window.parseMarkdown ? 
                                    window.parseMarkdown(fullResponse) : 
                                    fullResponse;
                                scrollToBottom();
                            }
                        } catch (e) {
                            // Игнорируем ошибки парсинга для неполных чанков
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Удаляем индикатор загрузки
            if (typingIndicator.parentNode) {
                typingIndicator.remove();
            }
            
            // Добавляем сообщение об ошибке
            addMessage('Извините, произошла ошибка. Попробуйте еще раз.', false, { isError: true });
        } finally {
            isTyping = false;
            toggleSendButton();
        }
    }

    // Загрузка истории чата
    async function loadChatHistory() {
        try {
            const response = await fetch('/api/get-chat-history/?limit=50');
            const data = await response.json();
            
            if (data.success && data.history && data.history.length > 0) {
                // Добавляем разделитель истории
                const separator = document.createElement('div');
                separator.className = 'history-separator';
                separator.innerHTML = '<span>История чата</span>';
                aiChatMessages.appendChild(separator);
                
                // Добавляем сообщения из истории
                data.history.forEach(msg => {
                    addMessage(msg.content, msg.type === 'user', { fromHistory: true });
                });
                
                // Добавляем еще один разделитель
                const endSeparator = document.createElement('div');
                endSeparator.className = 'history-separator';
                endSeparator.innerHTML = '<span>Новая сессия</span>';
                aiChatMessages.appendChild(endSeparator);
                
                scrollToBottom();
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    // Вспомогательные функции
    function getCsrfToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
               document.querySelector('meta[name=csrf-token]')?.content ||
               getCookie('csrftoken');
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

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function scrollToBottom() {
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `chat-notification ${type}`;
        notification.textContent = message;
        
        aiChatMessages.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Закрытие по Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && aiChatOverlay.classList.contains('active')) {
            aiChatOverlay.classList.remove('active');
        }
    });

    // Инициализация
    setTimeout(() => {
        if (aiChatInput) {
            adjustTextareaHeight();
        }
    }, 100);
});