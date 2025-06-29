/**
 * Q&A and Comments System for Video Platform
 * Complete rewrite with proper like functionality and mention handling
 */

// Initialize when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Main elements
    const qaSection = document.querySelector('.qa-section');
    const qaForm = document.getElementById('qa-form');
    const qaInput = document.getElementById('qa-input');
    const qaSubmit = document.getElementById('qa-submit');
    const qaList = document.getElementById('qa-list');
    
    // Get video container to extract video and user IDs
    const videoContainer = document.querySelector('.video-container');
    const videoId = videoContainer ? videoContainer.getAttribute('data-video-id') : null;
    const videoUserId = videoContainer ? videoContainer.getAttribute('data-user-id') : null;
    
    // Check if user is authenticated
    const isAuthenticated = qaSubmit ? !qaSubmit.disabled : false;
    
    // Get CSRF token
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
    
    console.log('QA System initialized:', { videoId, videoUserId, isAuthenticated });
    
    // Initialize the comment system
    initQASystem();
    
    /**
     * Main initialization function
     */
    function initQASystem() {
        console.log("Initializing QA system...");
        
        if (!isAuthenticated) {
            setupNonAuthenticatedHandlers();
        } else {
            setupCommentSubmission();
        }
        
        // Set up event delegation for all interactive elements
        setupEventDelegation();
        
        // Set up existing comments
        setupExistingComments();
        
        // Set up show/hide replies functionality
        setupShowHideReplies();
    }

    /**
     * Set up event delegation for dynamic content
     */
    function setupEventDelegation() {
        if (!qaList) return;
        
        qaList.addEventListener('click', function(e) {
            // Handle reply buttons
            const replyBtn = e.target.closest('.qa-reply-btn');
            if (replyBtn && isAuthenticated) {
                e.preventDefault();
                const commentId = replyBtn.getAttribute('data-comment-id');
                toggleReplyForm(commentId);
                return;
            }
            
            // Handle reply-to-reply buttons
            const replyToReplyBtn = e.target.closest('.qa-reply-to-reply-btn');
            if (replyToReplyBtn && isAuthenticated) {
                e.preventDefault();
                const commentId = replyToReplyBtn.getAttribute('data-comment-id');
                const username = replyToReplyBtn.getAttribute('data-username');
                handleReplyToReply(commentId, username);
                return;
            }
            
            // Handle like buttons
            const likeBtn = e.target.closest('.qa-like');
            if (likeBtn) {
                e.preventDefault();
                if (!isAuthenticated) {
                    showLoginModal();
                    return;
                }
                toggleLike(likeBtn);
                return;
            }
            
            // Handle show/hide replies buttons
            const showRepliesBtn = e.target.closest('.show-replies-btn');
            if (showRepliesBtn) {
                e.preventDefault();
                toggleRepliesVisibility(showRepliesBtn);
                return;
            }
            
            // Handle cancel reply buttons
            const cancelBtn = e.target.closest('.cancel-reply');
            if (cancelBtn) {
                e.preventDefault();
                const commentId = cancelBtn.getAttribute('data-comment-id');
                hideReplyForm(commentId);
                return;
            }
            
            // Handle reply submit buttons
            const replySubmitBtn = e.target.closest('.reply-submit');
            if (replySubmitBtn) {
                e.preventDefault();
                const commentId = replySubmitBtn.getAttribute('data-comment-id');
                submitReply(commentId);
                return;
            }
        });
        
        // Handle Enter key in reply inputs
        qaList.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && e.target.matches('[id^="reply-input-"]')) {
                e.preventDefault();
                const commentId = e.target.id.replace('reply-input-', '');
                submitReply(commentId);
            }
        });
    }

    /**
     * Set up handlers for non-authenticated users
     */
    function setupNonAuthenticatedHandlers() {
        // Redirect to login when trying to interact with comment box
        if (qaInput) {
            qaInput.addEventListener('click', function(e) {
                e.preventDefault();
                showLoginModal();
            });
        }
    }
    
    /**
     * Set up comment submission
     */
    function setupCommentSubmission() {
        if (!qaForm || !qaInput || !qaSubmit) return;
        
        // Form submission handler
        qaForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitComment();
        });
        
        // Submit button click handler
        qaSubmit.addEventListener('click', function(e) {
            e.preventDefault();
            submitComment();
        });
        
        // Enter key handler
        qaInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitComment();
            }
        });
    }
    
    /**
     * Set up existing comments
     */
    function setupExistingComments() {
        console.log("Setting up existing comments...");
        const existingComments = document.querySelectorAll('.qa-item');
        console.log(`Found ${existingComments.length} existing comments`);
        
        existingComments.forEach(comment => {
            const commentId = comment.getAttribute('data-comment-id');
            console.log(`Setting up comment ID: ${commentId}`);
            
            // Set up reply-to-reply buttons for existing replies
            const replies = comment.querySelectorAll('.qa-reply');
            replies.forEach(reply => {
                setupReplyToReplyButtons(reply);
            });
        });
    }
    
    /**
     * Set up reply-to-reply buttons for a specific reply
     */
    function setupReplyToReplyButtons(replyElement) {
        // Add reply button only if not already present
        if (!replyElement.querySelector('.qa-reply-to-reply-btn')) {
            const actionsDiv = replyElement.querySelector('.qa-actions');
            if (actionsDiv) {
                const username = replyElement.querySelector('.qa-author').getAttribute('data-username') || 
                                replyElement.getAttribute('data-user-id');
                const commentId = replyElement.closest('.qa-item').getAttribute('data-comment-id');
                
                const replyBtn = document.createElement('button');
                replyBtn.className = 'qa-reply-to-reply-btn';
                replyBtn.textContent = 'Ответить';
                replyBtn.setAttribute('data-comment-id', commentId);
                replyBtn.setAttribute('data-username', username);
                
                actionsDiv.appendChild(replyBtn);
            }
        }    
    }
    
    /**
     * Set up show/hide replies functionality
     */
    function setupShowHideReplies() {
        console.log("Setting up show/hide replies functionality");
        
        // Find all show replies buttons
        const showRepliesBtns = document.querySelectorAll('.show-replies-btn');
        console.log(`Found ${showRepliesBtns.length} show/hide buttons`);
        
        // Add click handlers to each button
        showRepliesBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                toggleRepliesVisibility(this);
            });
        });
    }

    /**
     * Toggle replies visibility
     */
    function toggleRepliesVisibility(btn) {
        const isShown = btn.getAttribute('data-shown') === 'true';
        const repliesContainer = btn.nextElementSibling;
        
        if (repliesContainer && repliesContainer.classList.contains('qa-replies')) {
            const replyCount = repliesContainer.querySelectorAll('.qa-reply').length;
            
            if (isShown) {
                // Hide replies
                repliesContainer.style.display = 'none';
                btn.innerHTML = `Показать ответы (${replyCount})`;
                btn.setAttribute('data-shown', 'false');
            } else {
                // Show replies
                repliesContainer.style.display = 'block';
                btn.innerHTML = 'Скрыть ответы';
                btn.setAttribute('data-shown', 'true');
            }
        }
    }
    
    /**
     * Function to submit a new comment
     */
    function submitComment() {
        const commentText = qaInput.value.trim();
        
        if (commentText === '') return;
        
        // Show loading state
        qaSubmit.disabled = true;
        qaSubmit.textContent = 'Отправка...';
        
        // Create a proper video ID for API
        let apiVideoId = videoId;
        if (videoUserId) {
            apiVideoId = `${videoUserId}__${videoId}`;
        }
        
        // Prepare data for submission
        const formData = new FormData();
        formData.append('text', commentText);
        formData.append('video_id', apiVideoId);
        
        // Using fetch to send the request
        fetch('/api/add-comment/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Clear input
                qaInput.value = '';
                
                // Create and add the new comment
                addNewComment(data.comment);
                
                // Display success message
                showStatusMessage('Комментарий успешно добавлен', 'success');
            } else {
                showStatusMessage(data.error || 'Ошибка при добавлении комментария', 'error');
            }
        })
        .catch(error => {
            console.error('Error adding comment:', error);
            showStatusMessage('Ошибка при отправке комментария. Пожалуйста, попробуйте позже.', 'error');
        })
        .finally(() => {
            // Reset button state
            qaSubmit.disabled = false;
            qaSubmit.textContent = 'Отправить';
        });
    }
    
    /**
     * Add a new comment to the DOM
     */
    function addNewComment(comment) {
        // Create the comment element
        const commentElement = createCommentElement(comment);
        
        // If there's a "no comments" message, remove it
        const noQaMessage = qaList.querySelector('.no-qa');
        if (noQaMessage) {
            noQaMessage.remove();
        }
        
        // Add new comment to the top of the list
        qaList.prepend(commentElement);
    }
    
    /**
     * Create a DOM element for a comment
     */
    function createCommentElement(comment) {
        const isAuthor = comment.user_id === videoUserId;
        
        const div = document.createElement('div');
        div.className = 'qa-item';
        div.setAttribute('data-comment-id', comment.id);
        div.setAttribute('data-user-id', comment.user_id);
        
        const displayName = comment.display_name || 'User';
        const firstLetter = displayName.charAt(0);
        
        // Format date in a user-friendly way
        const date = new Date(comment.date);
        const formattedDate = formatDate(date);
        
        // Determine avatar content - either image or first letter
        let avatarContent = '';
        if (comment.avatar_url) {
            avatarContent = `<img src="${comment.avatar_url}" alt="${displayName}" loading="lazy">`;
        } else {
            avatarContent = `<span class="avatar-text">${firstLetter}</span>`;
        }
        
        // Get current user avatar for reply form
        const currentUserAvatar = getCurrentUserAvatar();
        
        div.innerHTML = `
            <div class="avatar ${isAuthor ? 'author-avatar' : ''}">
                ${avatarContent}
            </div>
            <div class="qa-content">
                <div class="qa-author ${isAuthor ? 'is-author' : ''}" data-username="${comment.user_id}">
                    ${displayName}
                    ${isAuthor ? '<span class="author-badge">Автор</span>' : ''}
                </div>
                <div class="qa-text">${escapeHtml(comment.text)}</div>
                <div class="qa-meta">${formattedDate}</div>
                <div class="qa-actions">
                    <button class="qa-like" data-liked="false">
                        <img src="/static/icons/like.svg" alt="Like" width="20" height="20"> 
                        <span>${comment.likes || 0}</span>
                    </button>
                    <button class="qa-reply-btn" data-comment-id="${comment.id}">Ответить</button>
                </div>
                
                <!-- Reply form (initially hidden) -->
                <div class="reply-form" id="reply-form-${comment.id}" style="display: none;">
                    <div class="avatar">${currentUserAvatar}</div>
                    <input type="text" id="reply-input-${comment.id}" placeholder="Ответить на вопрос...">
                    <button class="reply-submit" data-comment-id="${comment.id}">Ответить</button>
                    <button class="cancel-reply" data-comment-id="${comment.id}">Отмена</button>
                </div>
                
                <div class="qa-replies"></div>
            </div>
        `;
        
        return div;
    }
    
    /**
     * Toggle visibility of the reply form
     */
    function toggleReplyForm(commentId) {
        console.log(`Toggling reply form for comment ${commentId}`);
        const replyForm = document.getElementById(`reply-form-${commentId}`);
        
        if (!replyForm) {
            console.error(`Reply form not found for comment ${commentId}`);
            showStatusMessage('Ошибка: форма ответа не найдена', 'error');
            return;
        }
        
        // Hide all other reply forms
        document.querySelectorAll('.reply-form').forEach(form => {
            if (form.id !== `reply-form-${commentId}` && form.style.display !== 'none') {
                form.style.display = 'none';
                const input = form.querySelector('input');
                if (input) input.value = '';
            }
        });
        
        // Toggle this form
        const isHidden = replyForm.style.display === 'none' || replyForm.style.display === '';
        replyForm.style.display = isHidden ? 'flex' : 'none';
        
        // Focus the input field if showing
        if (isHidden) {
            const input = replyForm.querySelector('input');
            if (input) {
                input.focus();
            }
        }
    }
    
    /**
     * Hide a specific reply form
     */
    function hideReplyForm(commentId) {
        const replyForm = document.getElementById(`reply-form-${commentId}`);
        if (replyForm) {
            replyForm.style.display = 'none';
            const input = replyForm.querySelector('input');
            if (input) input.value = '';
        }
    }
    
    /**
     * Handle reply to reply functionality
     */
    function handleReplyToReply(commentId, username) {
        // Show the reply form
        toggleReplyForm(commentId);
        
        // Add username to input field - ensure only one @ is added
        const replyInput = document.getElementById(`reply-input-${commentId}`);
        if (replyInput) {
            // Clean username (remove @ if present)
            const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
            replyInput.value = `@${cleanUsername} `;
            replyInput.focus();
            // Put cursor at the end
            replyInput.selectionStart = replyInput.selectionEnd = replyInput.value.length;
        }
    }
    
    /**
     * Submit a reply to a comment
     */
    function submitReply(commentId) {
        const replyForm = document.getElementById(`reply-form-${commentId}`);
        const replyInput = document.getElementById(`reply-input-${commentId}`);
        const replySubmitBtn = replyForm.querySelector('.reply-submit');
        
        const replyText = replyInput.value.trim();
        if (replyText === '') return;
        
        // Show loading state
        replySubmitBtn.disabled = true;
        replySubmitBtn.textContent = 'Отправка...';
        
        // Create a proper video ID for API
        let apiVideoId = videoId;
        if (videoUserId) {
            apiVideoId = `${videoUserId}__${videoId}`;
        }
        
        // Prepare data for submission
        const formData = new FormData();
        formData.append('text', replyText);
        formData.append('comment_id', commentId);
        formData.append('video_id', apiVideoId);
        
        // Send request to the server
        fetch('/api/add-reply/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Clear input and hide form
                replyInput.value = '';
                replyForm.style.display = 'none';
                
                // Add the reply to the DOM
                addReplyToComment(commentId, data.reply);
                
                // Show success message
                showStatusMessage('Ответ успешно добавлен', 'success');
            } else {
                showStatusMessage(data.error || 'Ошибка при добавлении ответа', 'error');
            }
        })
        .catch(error => {
            console.error('Error adding reply:', error);
            showStatusMessage('Ошибка при отправке ответа. Пожалуйста, попробуйте позже.', 'error');
        })
        .finally(() => {
            // Reset button state
            replySubmitBtn.disabled = false;
            replySubmitBtn.textContent = 'Ответить';
        });
    }
    
    /**
     * Add a reply to a comment in the DOM
     */
    function addReplyToComment(commentId, reply) {
        // Find the comment
        const commentElement = document.querySelector(`.qa-item[data-comment-id="${commentId}"]`);
        if (!commentElement) return;
        
        // Find or create the replies container
        let repliesContainer = commentElement.querySelector('.qa-replies');
        if (!repliesContainer) {
            repliesContainer = document.createElement('div');
            repliesContainer.className = 'qa-replies';
            commentElement.querySelector('.qa-content').appendChild(repliesContainer);
        }
        
        // Add parent comment ID to the reply object
        reply.parentCommentId = commentId;
        
        // Create the reply element
        const replyElement = createReplyElement(reply);
        
        // Check if there's already a "show replies" button
        let showRepliesBtn = commentElement.querySelector('.show-replies-btn');
        
        // If replies were previously hidden, show them now for the new reply
        if (showRepliesBtn) {
            // Show replies container
            repliesContainer.style.display = 'block';
            
            // Update button text
            showRepliesBtn.innerHTML = 'Скрыть ответы';
            showRepliesBtn.setAttribute('data-shown', 'true');
        } else if (repliesContainer.querySelectorAll('.qa-reply').length === 0) {
            // This is the first reply, we'll add a show/hide button after adding the reply
            showRepliesBtn = document.createElement('button');
            showRepliesBtn.className = 'show-replies-btn';
            showRepliesBtn.innerHTML = 'Скрыть ответы';
            showRepliesBtn.setAttribute('data-shown', 'true');
            
            // Insert button before replies container
            commentElement.querySelector('.qa-content').insertBefore(showRepliesBtn, repliesContainer);
        }
        
        // Ensure replies container is visible when adding a new reply
        repliesContainer.style.display = 'block';
        
        // Add the reply to container
        repliesContainer.appendChild(replyElement);
        
        // Update the reply count if needed
        updateReplyCount(commentId);
    }
    
    /**
     * Update the reply count for a comment
     */
    function updateReplyCount(commentId) {
        const commentElement = document.querySelector(`.qa-item[data-comment-id="${commentId}"]`);
        if (!commentElement) return;
        
        const repliesContainer = commentElement.querySelector('.qa-replies');
        const showRepliesBtn = commentElement.querySelector('.show-replies-btn');
        
        if (repliesContainer && showRepliesBtn) {
            const replyCount = repliesContainer.querySelectorAll('.qa-reply').length;
            
            // Only update if currently showing the count
            if (showRepliesBtn.getAttribute('data-shown') === 'false') {
                showRepliesBtn.innerHTML = `Показать ответы (${replyCount})`;
            }
        }
    }
    
    /**
     * Create a DOM element for a reply
     */
    function createReplyElement(reply) {
        const isAuthor = reply.user_id === videoUserId;
        
        const div = document.createElement('div');
        div.className = 'qa-reply';
        div.setAttribute('data-reply-id', reply.id);
        div.setAttribute('data-user-id', reply.user_id);
        
        const displayName = reply.display_name || reply.user_id || 'User';
        const username = reply.user_id || 'user';
        const firstLetter = displayName.charAt(0).toUpperCase();
        
        // Format date
        const date = new Date(reply.date);
        const formattedDate = formatDate(date);
        
        // Determine avatar content - either image or first letter
        let avatarContent = '';
        if (reply.avatar_url) {
            avatarContent = `<img src="${reply.avatar_url}" alt="${displayName}" loading="lazy">`;
        } else {
            avatarContent = `<span class="avatar-text">${firstLetter}</span>`;
        }
        
        // Process text to handle @username replies
        const replyText = processMentions(reply.text);
        
        const parentCommentId = reply.parentCommentId || '';
        
        div.innerHTML = `
            <div class="avatar avatar-medium ${isAuthor ? 'author-avatar' : ''}">
                ${avatarContent}
            </div>
            <div class="qa-content">
                <div class="qa-author ${isAuthor ? 'is-author' : ''}" data-username="${username}">
                    ${displayName}
                    ${isAuthor ? '<span class="author-badge">Автор</span>' : ''}
                </div>
                <div class="qa-text">${replyText}</div>
                <div class="qa-meta">${formattedDate}</div>
                <div class="qa-actions">
                    <button class="qa-like" data-liked="false">
                        <img src="/static/icons/like.svg" alt="Like" width="20" height="20"> 
                        <span>${reply.likes || 0}</span>
                    </button>
                    <button class="qa-reply-to-reply-btn" data-comment-id="${parentCommentId}" data-username="${username}">Ответить</button>
                </div>
            </div>
        `;
        
        // Try to load avatar dynamically if not provided
        if (!reply.avatar_url && reply.user_id) {
            setTimeout(() => {
                fetch(`/api/get-user-profile/?user_id=${encodeURIComponent(reply.user_id)}`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.success && data.profile && data.profile.avatar_url) {
                            const avatarContainer = div.querySelector('.avatar');
                            if (avatarContainer) {
                                avatarContainer.innerHTML = `<img src="${data.profile.avatar_url}" alt="${displayName}" loading="lazy">`;
                            }
                        }
                    })
                    .catch(err => console.error('Error loading avatar for reply:', err));
            }, 200);
        }
        
        return div;
    }
    
    /**
     * Toggle like state on a comment/reply
     */
    function toggleLike(likeButton) {
        if (!isAuthenticated) {
            showLoginModal();
            return;
        }

        // Get comment info
        const commentElement = likeButton.closest('.qa-item');
        const replyElement = likeButton.closest('.qa-reply');
        const isReply = !!replyElement;
        
        let commentId;
        if (isReply) {
            commentId = replyElement.getAttribute('data-reply-id');
        } else {
            commentId = commentElement.getAttribute('data-comment-id');
        }
        
        if (!commentId) {
            console.error('Could not find comment ID');
            return;
        }

        // Store current state for rollback
        const currentIsLiked = likeButton.getAttribute('data-liked') === 'true';
        const countSpan = likeButton.querySelector('span');
        const currentCount = parseInt(countSpan.textContent) || 0;
        
        // Update UI optimistically
        const newIsLiked = !currentIsLiked;
        const newCount = newIsLiked ? currentCount + 1 : Math.max(0, currentCount - 1);
        
        likeButton.setAttribute('data-liked', newIsLiked);
        countSpan.textContent = newCount;
        
        if (newIsLiked) {
            likeButton.classList.add('liked');
            likeButton.style.color = 'var(--accent-color)';
        } else {
            likeButton.classList.remove('liked');
            likeButton.style.color = '';
        }
        
        // Send to server
        const formData = new FormData();
        formData.append('comment_id', commentId);
        formData.append('video_id', `${videoUserId}__${videoId}`);
        formData.append('is_reply', isReply ? 'true' : 'false');
        
        fetch('/api/toggle-comment-like/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update with server response
                likeButton.setAttribute('data-liked', data.is_liked);
                countSpan.textContent = data.likes;
                
                if (data.is_liked) {
                    likeButton.classList.add('liked');
                    likeButton.style.color = 'var(--accent-color)';
                } else {
                    likeButton.classList.remove('liked');
                    likeButton.style.color = '';
                }
                
                console.log(`Like toggled for ${isReply ? 'reply' : 'comment'} ${commentId}`);
            } else {
                // Rollback on error
                likeButton.setAttribute('data-liked', currentIsLiked);
                countSpan.textContent = currentCount;
                
                if (currentIsLiked) {
                    likeButton.classList.add('liked');
                    likeButton.style.color = 'var(--accent-color)';
                } else {
                    likeButton.classList.remove('liked');
                    likeButton.style.color = '';
                }
                
                showStatusMessage(data.error || 'Ошибка при изменении лайка', 'error');
            }
        })
        .catch(error => {
            console.error('Error toggling like:', error);
            
            // Rollback on error
            likeButton.setAttribute('data-liked', currentIsLiked);
            countSpan.textContent = currentCount;
            
            if (currentIsLiked) {
                likeButton.classList.add('liked');
                likeButton.style.color = 'var(--accent-color)';
            } else {
                likeButton.classList.remove('liked');
                likeButton.style.color = '';
            }
            
            showStatusMessage('Ошибка сети при изменении лайка', 'error');
        });
    }
    
    /**
     * Process text to highlight @mentions
     */
    function processMentions(text) {
        if (!text) return '';
        
        // Escape HTML first
        text = escapeHtml(text);
        
        // Replace @username with highlighted span
        return text.replace(/@(\w+)/g, '<span class="user-mention">@$1</span>');
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Show status message to user
     */
    function showStatusMessage(message, type = 'info') {
        // Remove any existing status messages
        const existingMessage = document.querySelector('.status-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Create new status message
        const messageDiv = document.createElement('div');
        messageDiv.className = `status-message status-${type}`;
        messageDiv.textContent = message;
        
        // Add to page
        document.body.appendChild(messageDiv);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 3000);
    }
    
    /**
     * Show login modal for non-authenticated users
     */
    function showLoginModal() {
        // Check if modal already exists
        let modal = document.getElementById('login-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'login-modal';
            modal.className = 'login-modal-overlay';
            modal.innerHTML = `
                <div class="login-modal-content">
                    <button class="login-modal-close" onclick="this.closest('.login-modal-overlay').remove()">×</button>
                    <h3>Требуется авторизация</h3>
                    <p>Для взаимодействия с комментариями необходимо войти в систему</p>
                    <div class="login-modal-buttons">
                        <a href="/login/" class="login-btn">Войти</a>
                        <a href="/register/" class="register-btn">Регистрация</a>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add click outside to close
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.remove();
                }
            });
        }
        
        modal.style.display = 'flex';
    }
    
    /**
     * Get current user avatar HTML for reply forms
     */
    function getCurrentUserAvatar() {
        // Check if there's a current user avatar in the page
        const commentForm = document.getElementById('qa-form');
        if (commentForm) {
            const avatarContainer = commentForm.querySelector('.avatar');
            if (avatarContainer) {
                return avatarContainer.innerHTML;
            }
        }
        
        // Fallback to initial
        return '<span class="avatar-text">U</span>';
    }
    
    /**
     * Get current user name for display
     */
    function getCurrentUserName() {
        // Try to get from the page context or form
        const qaForm = document.getElementById('qa-form');
        if (qaForm) {
            const avatar = qaForm.querySelector('.avatar img');
            if (avatar) {
                return avatar.alt || 'User';
            }
        }
        return 'User';
    }
    
    /**
     * Get current user initial
     */
    function getCurrentUserInitial() {
        const userName = getCurrentUserName();
        return userName.charAt(0).toUpperCase();
    }
    
    /**
     * Format date for display
     */
    function formatDate(date) {
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            return 'Вчера';
        } else if (diffDays < 7) {
            return `${diffDays} дней назад`;
        } else {
            return date.toLocaleDateString('ru-RU');
        }
    }
    
    // Load comment avatars on page load
    function loadCommentAvatars() {
        const avatarPlaceholders = document.querySelectorAll('.qa-item .avatar .avatar-text, .qa-reply .avatar .avatar-text');
        
        avatarPlaceholders.forEach(placeholder => {
            const commentElement = placeholder.closest('.qa-item') || placeholder.closest('.qa-reply');
            const userId = commentElement.getAttribute('data-user-id');
            
            if (userId && userId !== 'current-user') {
                // Try to get avatar URL from user profile
                fetch(`/api/get-user-profile/?user_id=${encodeURIComponent(userId)}`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.success && data.profile && data.profile.avatar_url) {
                            // Replace placeholder with actual image
                            const avatarContainer = placeholder.parentElement;
                            const img = document.createElement('img');
                            img.src = data.profile.avatar_url;
                            img.alt = commentElement.querySelector('.qa-author').textContent.trim();
                            img.loading = "lazy";
                            
                            // Remove placeholder and add image
                            placeholder.remove();
                            avatarContainer.appendChild(img);
                        }
                    })
                    .catch(error => {
                        console.error('Error loading comment avatar:', error);
                    });
            }
        });
    }
    
    // Load avatars after a short delay
    setTimeout(loadCommentAvatars, 100);
});