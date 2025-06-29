let videoNotesLoaded = false;
let videoNotes = [];
let noteContextMenu = null;
let addNoteModal = null;

// Инициализация системы заметок
function initVideoNotes() {
    createNoteModal();
    createContextMenu();
    attachVideoEvents();
    loadVideoNotes();
}

// Создание модального окна для добавления заметки
function createNoteModal() {
    if (addNoteModal) return;
    
    addNoteModal = document.createElement('div');
    addNoteModal.className = 'add-note-modal';
    addNoteModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Добавить заметку</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <form id="add-note-form">
                    <div class="form-group">
                        <label for="note-title">Название заметки</label>
                        <input type="text" id="note-title" name="title" required placeholder="Например: Формула вычисления площади">
                    </div>
                    
                    <div class="form-group">
                        <label for="note-timestamp">Время (автоматически)</label>
                        <input type="text" id="note-timestamp" name="timestamp" readonly>
                    </div>
                    
                    <div class="form-group">
                        <label for="note-content">Дополнительные заметки (опционально)</label>
                        <textarea id="note-content" name="content" rows="3" placeholder="Добавьте описание или дополнительную информацию..."></textarea>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn-cancel">Отмена</button>
                        <button type="submit" class="btn-save">Сохранить заметку</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(addNoteModal);
    
    // Обработчики событий для модального окна
    addNoteModal.querySelector('.modal-close').addEventListener('click', closeNoteModal);
    addNoteModal.querySelector('.btn-cancel').addEventListener('click', closeNoteModal);
    addNoteModal.addEventListener('click', (e) => {
        if (e.target === addNoteModal) {
            closeNoteModal();
        }
    });
    
    document.getElementById('add-note-form').addEventListener('submit', handleNoteSubmit);
}

// Создание контекстного меню
function createContextMenu() {
    if (noteContextMenu) return;
    
    noteContextMenu = document.createElement('div');
    noteContextMenu.className = 'note-context-menu';
    noteContextMenu.innerHTML = `
        <div class="context-menu-item" id="add-note-option">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 11H15M12 8V14M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Добавить заметку
        </div>
        <div class="context-menu-item" id="view-notes-option">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Посмотреть заметки (${videoNotes.length})
        </div>
    `;
    
    document.body.appendChild(noteContextMenu);
    
    // Обработчики событий для контекстного меню
    document.getElementById('add-note-option').addEventListener('click', () => {
        hideContextMenu();
        openNoteModal();
    });
    
    document.getElementById('view-notes-option').addEventListener('click', () => {
        hideContextMenu();
        window.location.href = '/notes/';
    });
}

// Подключение событий к видеоплееру
function attachVideoEvents() {
    const videoPlayer = document.getElementById('video-player');
    const videoContainer = document.querySelector('.video-container');
    
    if (!videoPlayer || !videoContainer) return;
    
    // Отключаем стандартное контекстное меню браузера для всего видеоконтейнера
    videoContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    });
    
    // Обработчик правого клика на видео и контейнере
    videoPlayer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY);
        return false;
    });
    
    // Дополнительная обработка для всего видеоконтейнера
    videoContainer.addEventListener('mousedown', (e) => {
        if (e.button === 2) { // Правая кнопка мыши
            e.preventDefault();
            e.stopPropagation();
        }
    });
    
    videoContainer.addEventListener('mouseup', (e) => {
        if (e.button === 2) { // Правая кнопка мыши
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY);
        }
    });
    
    // Скрытие контекстного меню при клике в другом месте
    document.addEventListener('click', (e) => {
        if (noteContextMenu && !noteContextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    // Скрытие контекстного меню при прокрутке
    document.addEventListener('scroll', hideContextMenu);
    
    // Скрытие при нажатии Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
        }
    });
}

// Показать контекстное меню
function showContextMenu(x, y) {
    if (!noteContextMenu) return;
    
    // Обновляем счетчик заметок
    const viewNotesOption = document.getElementById('view-notes-option');
    if (viewNotesOption) {
        viewNotesOption.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Посмотреть заметки (${videoNotes.length})
        `;
    }
    
    // Показываем меню
    noteContextMenu.style.display = 'block';
    noteContextMenu.style.opacity = '0';
    
    // Первоначальное позиционирование
    noteContextMenu.style.left = x + 'px';
    noteContextMenu.style.top = y + 'px';
    
    // Получаем размеры после отображения
    const menuRect = noteContextMenu.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Корректируем позицию, если меню выходит за границы экрана
    let finalX = x;
    let finalY = y;
    
    if (x + menuRect.width > windowWidth) {
        finalX = x - menuRect.width;
    }
    
    if (y + menuRect.height > windowHeight) {
        finalY = y - menuRect.height;
    }
    
    // Убеждаемся, что меню не выходит за левую и верхнюю границы
    finalX = Math.max(10, finalX);
    finalY = Math.max(10, finalY);
    
    // Применяем финальную позицию
    noteContextMenu.style.left = finalX + 'px';
    noteContextMenu.style.top = finalY + 'px';
    
    // Плавно показываем меню
    setTimeout(() => {
        noteContextMenu.style.opacity = '1';
        noteContextMenu.style.transition = 'opacity 0.2s ease';
    }, 10);
    
    console.log('Context menu shown at:', finalX, finalY);
}

// Скрыть контекстное меню
function hideContextMenu() {
    if (noteContextMenu) {
        noteContextMenu.style.display = 'none';
    }
}

// Открыть модальное окно для добавления заметки
function openNoteModal() {
    if (!addNoteModal) return;
    
    const videoPlayer = document.getElementById('video-player');
    const currentTime = videoPlayer ? Math.floor(videoPlayer.currentTime) || 0 : 0;
    
    // Форматируем время
    const formattedTime = formatTime(currentTime);
    
    // Заполняем форму
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    document.getElementById('note-timestamp').value = formattedTime;
    
    addNoteModal.classList.add('active');
    document.getElementById('note-title').focus();
}

// Закрыть модальное окно
function closeNoteModal() {
    if (addNoteModal) {
        addNoteModal.classList.remove('active');
        document.getElementById('add-note-form').reset();
    }
}

// Обработчик отправки формы заметки
function handleNoteSubmit(e) {
    e.preventDefault();
    
    const videoContainer = document.querySelector('.video-container');
    if (!videoContainer) return;
    
    const videoId = videoContainer.getAttribute('data-video-id');
    const videoOwner = videoContainer.getAttribute('data-user-id');
    const videoTitle = document.querySelector('.video-details h1')?.textContent || '';
    
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    const timestampStr = document.getElementById('note-timestamp').value.trim();
    
    if (!title) {
        alert('Название заметки обязательно');
        return;
    }
    
    // Парсим время обратно в секунды
    const timestamp = parseTimeToSeconds(timestampStr);
    
    const noteData = {
        video_id: videoId,
        video_owner: videoOwner,
        video_title: videoTitle,
        title: title,
        content: content,
        timestamp: timestamp
    };
    
    // Отправляем запрос на сервер
    fetch('/api/add-note/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
        },
        body: JSON.stringify(noteData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            videoNotes.push(data.note);
            closeNoteModal();
            showNoteSuccess('Заметка успешно добавлена!');
            
            // Можно добавить визуальный индикатор на прогресс-баре
            addNoteMarker(timestamp);
        } else {
            showNoteError('Ошибка добавления заметки: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error adding note:', error);
        showNoteError('Ошибка добавления заметки');
    });
}

// Загрузка заметок для текущего видео
function loadVideoNotes() {
    const videoContainer = document.querySelector('.video-container');
    if (!videoContainer) return;
    
    const videoId = videoContainer.getAttribute('data-video-id');
    const videoOwner = videoContainer.getAttribute('data-user-id');
    
    if (!videoId || !videoOwner) return;
    
    fetch(`/api/get-video-notes/?video_id=${encodeURIComponent(videoId)}&video_owner=${encodeURIComponent(videoOwner)}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                videoNotes = data.notes;
                videoNotesLoaded = true;
                
                // Добавляем маркеры заметок на прогресс-бар
                videoNotes.forEach(note => {
                    addNoteMarker(note.timestamp);
                });
            }
        })
        .catch(error => {
            console.error('Error loading video notes:', error);
        });
}

// Добавление маркера заметки на прогресс-бар
function addNoteMarker(timestamp) {
    const progressContainer = document.getElementById('progress-container');
    const videoPlayer = document.getElementById('video-player');
    
    if (!progressContainer || !videoPlayer) return;
    
    const duration = videoPlayer.duration || 1;
    const position = (timestamp / duration) * 100;
    
    const marker = document.createElement('div');
    marker.className = 'note-marker';
    marker.style.left = position + '%';
    marker.title = `Заметка в ${formatTime(timestamp)}`;
    
    // Добавляем обработчик клика для перехода к заметке
    marker.addEventListener('click', (e) => {
        e.stopPropagation();
        if (videoPlayer) {
            videoPlayer.currentTime = timestamp;
        }
    });
    
    progressContainer.appendChild(marker);
}

// Вспомогательные функции
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

function parseTimeToSeconds(timeStr) {
    const parts = timeStr.split(':').map(p => parseInt(p) || 0);
    
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else {
        return parts[0] || 0;
    }
}

function showNoteSuccess(message) {
    showNotification(message, 'success');
}

function showNoteError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `note-notification ${type}`;
    notification.textContent = message;
    
    const styles = {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '15px 20px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: 'bold',
        zIndex: '10001',
        animation: 'slideIn 0.3s ease',
        maxWidth: '300px'
    };
    
    if (type === 'success') {
        styles.background = '#4CAF50';
    } else if (type === 'error') {
        styles.background = '#f44336';
    } else {
        styles.background = '#2196F3';
    }
    
    Object.assign(notification.style, styles);
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// CSS стили для заметок
function injectNoteStyles() {
    if (document.getElementById('video-notes-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'video-notes-styles';
    style.textContent = `
        /* Отключение стандартного контекстного меню для видеоконтейнера */
        .video-container,
        .video-container *,
        #video-player {
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
            -webkit-touch-callout: none;
            -webkit-tap-highlight-color: transparent;
        }
        
        .video-container {
            position: relative;
        }
        
        /* Контекстное меню для заметок */
        .note-context-menu {
            position: fixed;
            background: var(--light-bg);
            border: 1px solid rgba(37, 39, 159, 0.2);
            border-radius: 8px;
            padding: 5px 0;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            min-width: 180px;
            display: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            backdrop-filter: blur(10px);
        }
        
        .dark-theme .note-context-menu {
            background: var(--medium-bg);
            border-color: rgba(159, 37, 88, 0.3);
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.4);
        }
        
        .context-menu-item {
            padding: 12px 16px;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--text-dark);
            border: none;
            background: none;
            width: 100%;
            text-align: left;
        }
        
        .dark-theme .context-menu-item {
            color: var(--text-light);
        }
        
        .context-menu-item:hover {
            background: rgba(37, 39, 159, 0.1);
        }
        
        .dark-theme .context-menu-item:hover {
            background: rgba(37, 39, 159, 0.2);
        }
        
        .context-menu-item:focus {
            outline: 2px solid var(--accent-color);
            outline-offset: -2px;
        }
        
        .context-menu-item svg {
            width: 16px;
            height: 16px;
            stroke: currentColor;
            flex-shrink: 0;
        }
        
        /* Модальное окно для добавления заметки */
        .add-note-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            backdrop-filter: blur(5px);
        }
        
        .add-note-modal.active {
            opacity: 1;
            visibility: visible;
        }
        
        .add-note-modal .modal-content {
            background: var(--light-bg);
            border-radius: 15px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            transform: scale(0.9);
            transition: transform 0.3s ease;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .dark-theme .add-note-modal .modal-content {
            background: var(--medium-bg);
        }
        
        .add-note-modal.active .modal-content {
            transform: scale(1);
        }
        
        .add-note-modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 25px;
            border-bottom: 1px solid rgba(37, 39, 159, 0.1);
        }
        
        .add-note-modal .modal-header h3 {
            color: var(--primary-color);
            margin: 0;
            font-size: 1.3rem;
        }
        
        .add-note-modal .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            color: var(--gray-color);
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
        }
        
        .add-note-modal .modal-close:hover {
            background: rgba(37, 39, 159, 0.1);
            color: var(--primary-color);
        }
        
        .add-note-modal .modal-body {
            padding: 25px;
        }
        
        .add-note-modal .form-group {
            margin-bottom: 20px;
        }
        
        .add-note-modal .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--text-dark);
        }
        
        .dark-theme .add-note-modal .form-group label {
            color: var(--text-light);
        }
        
        .add-note-modal .form-group input,
        .add-note-modal .form-group textarea {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid rgba(37, 39, 159, 0.2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-dark);
            font-size: 16px;
            outline: none;
            transition: border-color 0.3s;
            box-sizing: border-box;
            font-family: inherit;
        }
        
        .dark-theme .add-note-modal .form-group input,
        .dark-theme .add-note-modal .form-group textarea {
            color: var(--text-light);
            background: rgba(255, 255, 255, 0.05);
        }
        
        .add-note-modal .form-group input:focus,
        .add-note-modal .form-group textarea:focus {
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(37, 39, 159, 0.1);
        }
        
        .add-note-modal .form-group input[readonly] {
            background: rgba(37, 39, 159, 0.1);
            cursor: not-allowed;
        }
        
        .add-note-modal .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 15px;
            margin-top: 30px;
        }
        
        .add-note-modal .btn-cancel,
        .add-note-modal .btn-save {
            padding: 12px 24px;
            border-radius: 25px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            border: none;
            font-size: 14px;
        }
        
        .add-note-modal .btn-cancel {
            background: transparent;
            color: var(--gray-color);
            border: 2px solid var(--gray-color);
        }
        
        .add-note-modal .btn-cancel:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-2px);
        }
        
        .add-note-modal .btn-save {
            background: var(--accent-color);
            color: white;
            box-shadow: 0 4px 15px rgba(37, 39, 159, 0.3);
        }
        
        .add-note-modal .btn-save:hover {
            background: #1f2f4a;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(37, 39, 159, 0.4);
        }
        
        .add-note-modal .btn-save:disabled {
            background: var(--gray-color);
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        /* Маркеры заметок на прогресс-баре */
        .note-marker {
            position: absolute;
            top: 0;
            width: 4px;
            height: 100%;
            background: var(--accent-color);
            cursor: pointer;
            z-index: 3;
            transition: all 0.2s;
            border-radius: 2px;
        }
        
        .note-marker:hover {
            background: #1f2f4a;
            transform: scaleX(1.5);
        }
        
        .note-marker::before {
            content: '';
            position: absolute;
            top: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 8px;
            height: 8px;
            background: var(--accent-color);
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.2s;
        }
        
        .note-marker:hover::before {
            opacity: 1;
        }
        
        /* Уведомления */
        .note-notification {
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        /* Адаптивность */
        @media (max-width: 768px) {
            .add-note-modal .modal-content {
                width: 95%;
                margin: 20px;
            }
            
            .add-note-modal .modal-body {
                padding: 20px;
            }
            
            .add-note-modal .form-actions {
                flex-direction: column;
                gap: 10px;
            }
            
            .add-note-modal .btn-cancel,
            .add-note-modal .btn-save {
                width: 100%;
                padding: 15px;
            }
            
            .note-context-menu {
                min-width: 160px;
            }
            
            .context-menu-item {
                padding: 15px;
                font-size: 16px;
            }
        }
        
        /* Дополнительные стили для лучшей интеграции */
        #progress-container {
            position: relative;
        }
        
        .video-wrapper {
            position: relative;
        }
        
        /* Анимация появления маркеров */
        .note-marker {
            animation: noteMarkerAppear 0.3s ease;
        }
        
        @keyframes noteMarkerAppear {
            from {
                opacity: 0;
                transform: scaleY(0);
            }
            to {
                opacity: 1;
                transform: scaleY(1);
            }
        }
        
        /* Подсветка области видео при активном контекстном меню */
        .video-wrapper.context-menu-active {
            outline: 2px solid var(--accent-color);
            outline-offset: 2px;
        }
        
        /* Стили для отключения выделения текста */
        .video-container,
        .video-container * {
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
        }
    `;
    
    document.head.appendChild(style);
}
        
function injectNoteStyles() {
    if (document.getElementById('video-notes-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'video-notes-styles';
    style.textContent = `
        /* Контекстное меню для заметок */
        .note-context-menu {
            position: fixed;
            background: var(--light-bg);
            border: 1px solid rgba(37, 39, 159, 0.2);
            border-radius: 8px;
            padding: 5px 0;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            min-width: 180px;
            display: none;
        }
        
        .dark-theme .note-context-menu {
            background: var(--medium-bg);
            border-color: rgba(159, 37, 88, 0.3);
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.4);
        }
        
        .context-menu-item {
            padding: 12px 16px;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--text-dark);
        }
        
        .dark-theme .context-menu-item {
            color: var(--text-light);
        }
        
        .context-menu-item:hover {
            background: rgba(37, 39, 159, 0.1);
        }
        
        .dark-theme .context-menu-item:hover {
            background: rgba(37, 39, 159, 0.2);
        }
        
        .context-menu-item svg {
            width: 16px;
            height: 16px;
            stroke: currentColor;
        }
        
        /* Модальное окно для добавления заметки */
        .add-note-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }
        
        .add-note-modal.active {
            opacity: 1;
            visibility: visible;
        }
        
        .add-note-modal .modal-content {
            background: var(--light-bg);
            border-radius: 15px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            transform: scale(0.9);
            transition: transform 0.3s ease;
        }
        
        .dark-theme .add-note-modal .modal-content {
            background: var(--medium-bg);
        }
        
        .add-note-modal.active .modal-content {
            transform: scale(1);
        }
        
        .add-note-modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 25px;
            border-bottom: 1px solid rgba(37, 39, 159, 0.1);
        }
        
        .add-note-modal .modal-header h3 {
            color: var(--primary-color);
            margin: 0;
            font-size: 1.3rem;
        }
        
        .add-note-modal .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            color: var(--gray-color);
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
        }
        
        .add-note-modal .modal-close:hover {
            background: rgba(37, 39, 159, 0.1);
            color: var(--primary-color);
        }
        
        .add-note-modal .modal-body {
            padding: 25px;
        }
        
        .add-note-modal .form-group {
            margin-bottom: 20px;
        }
        
        .add-note-modal .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--text-dark);
        }
        
        .dark-theme .add-note-modal .form-group label {
            color: var(--text-light);
        }
        
        .add-note-modal .form-group input,
        .add-note-modal .form-group textarea {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid rgba(37, 39, 159, 0.2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-dark);
            font-size: 16px;
            outline: none;
            transition: border-color 0.3s;
            box-sizing: border-box;
            font-family: inherit;
        }
        
        .dark-theme .add-note-modal .form-group input,
        .dark-theme .add-note-modal .form-group textarea {
            color: var(--text-light);
            background: rgba(255, 255, 255, 0.05);
        }
        
        .add-note-modal .form-group input:focus,
        .add-note-modal .form-group textarea:focus {
            border-color: var(--accent-color);
        }
        
        .add-note-modal .form-group input[readonly] {
            background: rgba(37, 39, 159, 0.1);
            cursor: not-allowed;
        }
        
        .add-note-modal .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 15px;
            margin-top: 30px;
        }
        
        .add-note-modal .btn-cancel,
        .add-note-modal .btn-save {
            padding: 12px 24px;
            border-radius: 25px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            border: none;
            font-size: 14px;
        }
        
        .add-note-modal .btn-cancel {
            background: transparent;
            color: var(--gray-color);
            border: 2px solid var(--gray-color);
        }
        
        .add-note-modal .btn-cancel:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-2px);
        }
        
        .add-note-modal .btn-save {
            background: var(--accent-color);
            color: white;
            box-shadow: 0 4px 15px rgba(37, 39, 159, 0.3);
        }
        
        .add-note-modal .btn-save:hover {
            background: #1f2f4a;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(37, 39, 159, 0.4);
        }
        
        /* Маркеры заметок на прогресс-баре */
        .note-marker {
            position: absolute;
            top: 0;
            width: 4px;
            height: 100%;
            background: var(--accent-color);
            cursor: pointer;
            z-index: 3;
            transition: all 0.2s;
            border-radius: 2px;
        }
        
        .note-marker:hover {
            background: #1f2f4a;
            transform: scaleX(1.5);
        }
        
        .note-marker::before {
            content: '';
            position: absolute;
            top: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 8px;
            height: 8px;
            background: var(--accent-color);
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.2s;
        }
        
        .note-marker:hover::before {
            opacity: 1;
        }
        
        /* Уведомления */
        .note-notification {
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        /* Адаптивность */
        @media (max-width: 768px) {
            .add-note-modal .modal-content {
                width: 95%;
                margin: 20px;
            }
            
            .add-note-modal .modal-body {
                padding: 20px;
            }
            
            .add-note-modal .form-actions {
                flex-direction: column;
                gap: 10px;
            }
            
            .add-note-modal .btn-cancel,
            .add-note-modal .btn-save {
                width: 100%;
                padding: 15px;
            }
            
            .note-context-menu {
                min-width: 160px;
            }
            
            .context-menu-item {
                padding: 15px;
                font-size: 16px;
            }
        }
        
        /* Дополнительные стили для лучшей интеграции */
        #progress-container {
            position: relative;
        }
        
        .video-wrapper {
            position: relative;
        }
        
        /* Анимация появления маркеров */
        .note-marker {
            animation: noteMarkerAppear 0.3s ease;
        }
        
        @keyframes noteMarkerAppear {
            from {
                opacity: 0;
                transform: scaleY(0);
            }
            to {
                opacity: 1;
                transform: scaleY(1);
            }
        }
        
        /* Подсветка области видео при наведении на контекстное меню */
        .video-wrapper.context-menu-active {
            outline: 2px solid var(--accent-color);
            outline-offset: 2px;
        }
    `;
    
    document.head.appendChild(style);
}

// Обновление ссылки в базовом шаблоне
function updateNotesMenuLink() {
    const notesMenuItem = document.querySelector('.menu-item[onclick*="paper.svg"]');
    if (notesMenuItem) {
        notesMenuItem.setAttribute('onclick', "window.location.href='/notes/'");
        notesMenuItem.style.cursor = 'pointer';
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Проверяем, что мы на странице видео
    if (document.querySelector('.video-container')) {
        injectNoteStyles();
        
        // Ждем загрузки видеоплеера
        const initNotes = () => {
            const videoPlayer = document.getElementById('video-player');
            if (videoPlayer) {
                initVideoNotes();
                console.log('Video notes initialized');
            } else {
                // Повторяем попытку через 500мс
                setTimeout(initNotes, 500);
            }
        };
        
        initNotes();
        updateNotesMenuLink();
    }
    
    // Обновляем ссылку на заметки в меню на всех страницах
    updateNotesMenuLink();
});

// Дополнительная инициализация при загрузке видео
window.addEventListener('load', function() {
    if (document.querySelector('.video-container')) {
        // Проверяем еще раз после полной загрузки страницы
        setTimeout(() => {
            const videoPlayer = document.getElementById('video-player');
            if (videoPlayer && !videoNotesLoaded) {
                initVideoNotes();
                console.log('Video notes re-initialized after page load');
            }
        }, 1000);
    }
});

// Экспорт функций для использования в других скриптах
window.VideoNotes = {
    init: initVideoNotes,
    openModal: openNoteModal,
    loadNotes: loadVideoNotes,
    formatTime: formatTime,
    parseTimeToSeconds: parseTimeToSeconds,
    initialized: false
};
    