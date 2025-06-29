/**
 * KRONIK Notifications System
 * Система уведомлений для платформы KRONIK
 */

class NotificationManager {
    constructor() {
        this.isAuthenticated = window.userAuthenticated || false;
        this.unreadCount = 0;
        this.notifications = [];
        this.isOpen = false;
        this.isLoading = false;
        this.hasMore = true;
        this.offset = 0;
        this.limit = 20;
        
        this.initElements();
        this.bindEvents();
        
        if (this.isAuthenticated) {
            this.loadUnreadCount();
            this.startPeriodicUpdate();
        }
    }
    
    initElements() {
        this.notificationButton = document.querySelector('.notification-icon');
        this.notificationBadge = document.querySelector('.notification-badge');
        this.notificationDropdown = document.querySelector('.notification-dropdown');
        this.notificationContent = document.querySelector('.notification-content');
        
        if (!this.notificationButton || !this.notificationBadge || !this.notificationDropdown) {
            console.warn('Notification elements not found');
            return;
        }
    }
    
    bindEvents() {
        if (!this.notificationButton) return;
        
        // Клик по кнопке уведомлений
        this.notificationButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });
        
        // Закрытие при клике вне области
        document.addEventListener('click', (e) => {
            if (!this.notificationDropdown || !this.notificationDropdown.contains(e.target)) {
                this.closeDropdown();
            }
        });
        
        // Скролл для загрузки дополнительных уведомлений
        if (this.notificationContent) {
            this.notificationContent.addEventListener('scroll', () => {
                if (this.shouldLoadMore()) {
                    this.loadMoreNotifications();
                }
            });
        }
    }
    
    async loadUnreadCount() {
        if (!this.isAuthenticated) return;
        
        try {
            const response = await fetch('/api/notifications/unread-count/', {
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.updateUnreadCount(data.unread_count);
            }
        } catch (error) {
            console.error('Error loading unread count:', error);
        }
    }
    
    async loadNotifications() {
        if (!this.isAuthenticated || this.isLoading) return;
        
        this.isLoading = true;
        this.showLoadingState();
        
        try {
            const response = await fetch(`/api/notifications/?offset=${this.offset}&limit=${this.limit}`, {
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (this.offset === 0) {
                    this.notifications = data.notifications;
                } else {
                    this.notifications = [...this.notifications, ...data.notifications];
                }
                
                this.hasMore = data.has_more;
                this.updateUnreadCount(data.unread_count);
                this.renderNotifications();
            } else {
                this.showError('Ошибка загрузки уведомлений');
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
            this.showError('Ошибка соединения');
        } finally {
            this.isLoading = false;
        }
    }
    
    async loadMoreNotifications() {
        if (!this.hasMore || this.isLoading) return;
        
        this.offset += this.limit;
        await this.loadNotifications();
    }
    
    renderNotifications() {
        if (!this.notificationContent) return;
        
        if (this.notifications.length === 0) {
            this.showEmptyState();
            return;
        }
        
        const notificationsHTML = this.notifications.map(notification => 
            this.createNotificationHTML(notification)
        ).join('');
        
        // Добавляем кнопку "Отметить все как прочитанные" если есть непрочитанные
        const hasUnread = this.notifications.some(n => !n.is_read);
        const markAllButton = hasUnread ? `
            <div class="notification-actions">
                <button class="mark-all-read-btn" onclick="notificationManager.markAllAsRead()">
                    Отметить все как прочитанные
                </button>
            </div>
        ` : '';
        
        this.notificationContent.innerHTML = `
            ${markAllButton}
            <div class="notifications-list">
                ${notificationsHTML}
            </div>
            ${this.hasMore ? '<div class="load-more-notifications">Прокрутите для загрузки еще</div>' : ''}
        `;
    }
    
    createNotificationHTML(notification) {
        const readClass = notification.is_read ? 'read' : 'unread';
        const timeAgo = notification.time_since_created;
        
        // Получаем иконку для типа уведомления
        const icon = this.getNotificationIcon(notification.type);
        
        // Получаем аватар отправителя
        const avatarHTML = notification.from_user && notification.from_user.avatar_url 
            ? `<img src="${notification.from_user.avatar_url}" alt="${notification.from_user.display_name}">`
            : (notification.from_user ? notification.from_user.display_name.charAt(0) : icon);
        
        return `
            <div class="notification-item ${readClass}" data-id="${notification.id}">
                <div class="notification-avatar">
                    ${avatarHTML}
                </div>
                <div class="notification-body">
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-message">${notification.message}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
                <div class="notification-actions">
                    ${!notification.is_read ? `
                        <button class="mark-read-btn" onclick="notificationManager.markAsRead('${notification.id}')" title="Отметить как прочитанное">
                            ✓
                        </button>
                    ` : ''}
                    <button class="delete-notification-btn" onclick="notificationManager.deleteNotification('${notification.id}')" title="Удалить">
                        ×
                    </button>
                </div>
                ${notification.action_url ? `
                    <div class="notification-click-area" onclick="notificationManager.handleNotificationClick('${notification.id}', '${notification.action_url}')"></div>
                ` : ''}
            </div>
        `;
    }
    
    getNotificationIcon(type) {
        const icons = {
            'new_video': '🎥',
            'new_material': '📚',
            'comment_reply': '💬',
            'comment_like': '👍',
            'video_like': '❤️',
            'new_subscriber': '👥',
            'mention': '@',
            'system': '⚙️'
        };
        return icons[type] || '📢';
    }
    
    async markAsRead(notificationId) {
        try {
            const response = await fetch('/api/notifications/mark-read/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    notification_id: notificationId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Обновляем локальное состояние
                const notification = this.notifications.find(n => n.id === notificationId);
                if (notification) {
                    notification.is_read = true;
                }
                
                this.updateUnreadCount(data.unread_count);
                this.renderNotifications();
            }
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }
    
    async markAllAsRead() {
        try {
            const response = await fetch('/api/notifications/mark-all-read/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Обновляем локальное состояние
                this.notifications.forEach(notification => {
                    notification.is_read = true;
                });
                
                this.updateUnreadCount(0);
                this.renderNotifications();
            }
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    }
    
    async deleteNotification(notificationId) {
        try {
            const response = await fetch(`/api/notifications/delete/${notificationId}/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Удаляем из локального состояния
                this.notifications = this.notifications.filter(n => n.id !== notificationId);
                this.updateUnreadCount(data.unread_count);
                this.renderNotifications();
            }
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    }
    
    handleNotificationClick(notificationId, actionUrl) {
        // Отмечаем как прочитанное и переходим по ссылке
        this.markAsRead(notificationId);
        
        if (actionUrl && actionUrl !== 'null' && actionUrl !== 'undefined') {
            window.location.href = actionUrl;
        }
    }
    
    toggleDropdown() {
        if (!this.isAuthenticated) {
            this.showAuthRequired();
            return;
        }
        
        this.isOpen = !this.isOpen;
        
        if (this.isOpen) {
            this.openDropdown();
        } else {
            this.closeDropdown();
        }
    }
    
    openDropdown() {
        if (this.notificationDropdown) {
            this.notificationDropdown.classList.add('show');
            this.isOpen = true;
            
            // Загружаем уведомления при открытии
            if (this.notifications.length === 0) {
                this.offset = 0;
                this.loadNotifications();
            }
        }
    }
    
    closeDropdown() {
        if (this.notificationDropdown) {
            this.notificationDropdown.classList.remove('show');
            this.isOpen = false;
        }
    }
    
    updateUnreadCount(count) {
        this.unreadCount = count;
        
        if (this.notificationBadge) {
            this.notificationBadge.textContent = count;
            this.notificationBadge.style.display = count > 0 ? 'flex' : 'none';
        }
    }
    
    showLoadingState() {
        if (this.notificationContent) {
            this.notificationContent.innerHTML = `
                <div class="notification-loading">
                    <div class="notification-loading-spinner"></div>
                    <span>Загрузка уведомлений...</span>
                </div>
            `;
        }
    }
    
    showEmptyState() {
        if (this.notificationContent) {
            this.notificationContent.innerHTML = `
                <div class="empty-notifications">
                    <div class="empty-icon">📢</div>
                    <p>У вас пока нет уведомлений</p>
                </div>
            `;
        }
    }
    
    showError(message) {
        if (this.notificationContent) {
            this.notificationContent.innerHTML = `
                <div class="notification-error">
                    <div class="error-icon">⚠️</div>
                    <p>${message}</p>
                    <button onclick="notificationManager.loadNotifications()">Попробовать снова</button>
                </div>
            `;
        }
    }
    
    showAuthRequired() {
        if (this.notificationContent) {
            this.notificationContent.innerHTML = `
                <div class="notification-login-required">
                    <div class="login-icon">🔒</div>
                    <p>Авторизуйтесь, чтобы видеть уведомления</p>
                    <div class="notification-login-buttons">
                        <a href="/login/" class="notification-login-btn">Войти</a>
                        <a href="/register/" class="notification-register-btn">Регистрация</a>
                    </div>
                </div>
            `;
        }
        
        if (this.notificationDropdown) {
            this.notificationDropdown.classList.add('show');
        }
    }
    
    shouldLoadMore() {
        if (!this.notificationContent || !this.hasMore || this.isLoading) {
            return false;
        }
        
        const scrollTop = this.notificationContent.scrollTop;
        const scrollHeight = this.notificationContent.scrollHeight;
        const clientHeight = this.notificationContent.clientHeight;
        
        return scrollTop + clientHeight >= scrollHeight - 100;
    }
    
    startPeriodicUpdate() {
        // Обновляем количество непрочитанных каждые 30 секунд
        setInterval(() => {
            if (this.isAuthenticated && !this.isOpen) {
                this.loadUnreadCount();
            }
        }, 30000);
    }
    
    getCSRFToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }
    
    // Публичные методы для вызова из других частей приложения
    addNotification(notification) {
        this.notifications.unshift(notification);
        this.unreadCount++;
        this.updateUnreadCount(this.unreadCount);
        
        if (this.isOpen) {
            this.renderNotifications();
        }
        
        // Показываем toast уведомление
        this.showToast(notification);
    }
    
    showToast(notification) {
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.innerHTML = `
            <div class="toast-icon">${this.getNotificationIcon(notification.type)}</div>
            <div class="toast-content">
                <div class="toast-title">${notification.title}</div>
                <div class="toast-message">${notification.message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        document.body.appendChild(toast);
        
        // Автоматически удаляем через 5 секунд
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
        
        // Анимация появления
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
    }
    
    // Методы для интеграции с WebSocket (если будет реализован в будущем)
    onWebSocketMessage(data) {
        if (data.type === 'notification') {
            this.addNotification(data.notification);
        } else if (data.type === 'unread_count') {
            this.updateUnreadCount(data.count);
        }
    }
}

// Инициализация менеджера уведомлений
let notificationManager;

document.addEventListener('DOMContentLoaded', function() {
    notificationManager = new NotificationManager();
});

// Экспорт для использования в других модулях
window.NotificationManager = NotificationManager;
window.notificationManager = notificationManager;
                