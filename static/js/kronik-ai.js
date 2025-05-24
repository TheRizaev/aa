// AI Chat functionality
document.addEventListener('DOMContentLoaded', function() {
    // Existing code...

    // AI Chat elements
    const aiChatButton = document.getElementById('ai-chat-button');
    const aiChatOverlay = document.getElementById('ai-chat-overlay');
    const aiChatClose = document.getElementById('ai-chat-close');
    const aiChatInput = document.getElementById('ai-chat-input');
    const aiChatSend = document.getElementById('ai-chat-send');
    const aiChatMessages = document.getElementById('ai-chat-messages');

    let isTyping = false;

    // Open chat
    aiChatButton.addEventListener('click', function() {
        aiChatOverlay.classList.add('active');
        setTimeout(() => {
            aiChatInput.focus();
        }, 300);
    });

    // Close chat
    aiChatClose.addEventListener('click', function() {
        aiChatOverlay.classList.remove('active');
    });

    // Close on overlay click
    aiChatOverlay.addEventListener('click', function(e) {
        if (e.target === aiChatOverlay) {
            aiChatOverlay.classList.remove('active');
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

    async function sendMessage() {
        const message = aiChatInput.value.trim();
        if (!message || isTyping) return;

        // Add user message
        addMessage(message, true);
        
        // Clear input
        aiChatInput.value = '';
        adjustTextareaHeight();
        toggleSendButton();
        
        // Show typing indicator
        isTyping = true;
        const typingIndicator = addTypingIndicator();
        
        try {
            // Get CSRF token
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
                             document.querySelector('meta[name=csrf-token]')?.content ||
                             getCookie('csrftoken');

            const response = await fetch('/api/ai-chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken || '',
                },
                body: JSON.stringify({
                    message: message
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Remove typing indicator
            typingIndicator.remove();
            
            // Create AI message container
            const aiMessageDiv = addMessage('', false);
            const messageContent = aiMessageDiv.querySelector('.message-content p');
            
            // Read the stream
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
                                messageContent.textContent = fullResponse;
                                aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
                            }
                        } catch (e) {
                            // Ignore JSON parse errors for incomplete chunks
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Remove typing indicator if still present
            if (typingIndicator.parentNode) {
                typingIndicator.remove();
            }
            
            // Add error message
            addMessage('Извините, произошла ошибка. Попробуйте еще раз.', false);
        } finally {
            isTyping = false;
            toggleSendButton();
        }
    }

    // Helper function to get CSRF cookie
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

    // Close chat with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && aiChatOverlay.classList.contains('active')) {
            aiChatOverlay.classList.remove('active');
        }
    });

    // Auto-resize textarea
    aiChatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Initialize textarea height
    setTimeout(() => {
        if (aiChatInput) {
            adjustTextareaHeight();
        }
    }, 100);
});