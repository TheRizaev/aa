function createVideoCard(videoData, delay = 0) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.style.animationDelay = `${delay}ms`;
    
    // Добавляем обработчик клика, который перенаправляет на страницу видео
    card.onclick = function() {
        // Используем составной ID: user_id + video_id
        const videoUrl = `/video/${videoData.user_id}__${videoData.video_id}/`;
        window.location.href = videoUrl;
    };

    // Определяем путь к превью, с запасным вариантом
    const previewPath = videoData.thumbnail_url ? 
        videoData.thumbnail_url : 
        `/static/placeholder.jpg`;

    // Определяем имя канала: предпочитаем display_name, затем channel, затем user_id
    const channelName = videoData.display_name || videoData.channel || videoData.user_id || "";
    
    // Используем только изображение превью вместо видео
    card.innerHTML = `
        <div class="thumbnail">
            <img src="${previewPath}" alt="${videoData.title}" loading="lazy" onerror="this.src='/static/placeholder.jpg'">
            <div class="duration">${videoData.duration || "00:00"}</div>
        </div>
        <div class="video-info">
            <div class="video-title">${videoData.title}</div>
            <div class="channel-name">${channelName}</div>
            <div class="video-stats">
                <span>${videoData.views_formatted || videoData.views || "0 просмотров"}</span>
                <span>• ${videoData.upload_date_formatted || (videoData.upload_date ? videoData.upload_date.slice(0, 10) : "Недавно")}</span>
            </div>
        </div>
    `;

    return card;
}

// Переменные для хранения данных
let videoData = [];
let totalVideos = 0;
let currentIndex = 0;
const videosPerPage = 20;
let loadingSpinner, videosContainer;
let isLoading = false;

// Загрузка видео из GCS
function loadVideosFromGCS() {
    if (isLoading) return;
    
    isLoading = true;
    
    console.log(`Fetching videos: offset=${currentIndex}, limit=${videosPerPage}`);
    
    // Используем оптимизированный API endpoint с указанием, что thumbnail URL нужны только на первой загрузке
    const needThumbnails = currentIndex === 0 ? 'false' : 'false';
    
    // Use list-all-videos endpoint to get videos from all users
    fetch(`/api/list-all-videos/?offset=${currentIndex}&limit=${videosPerPage}&only_metadata=${needThumbnails}`)
        .then(response => response.json())
        .then(data => {
            isLoading = false;
            
            console.log('API response:', data);
            
            if (data.success && data.videos) {
                videoData.push(...data.videos);
                totalVideos = data.total || videoData.length;
                
                if (videosContainer) {
                    if (currentIndex === 0) {
                        videosContainer.innerHTML = '';
                    }
                    
                    data.videos.forEach((video, index) => {
                        const card = createVideoCard(video, index * 100);
                        videosContainer.appendChild(card);
                    });
                    
                    currentIndex += data.videos.length;
                    
                    if (videoData.length === 0) {
                        const emptyState = document.createElement('div');
                        emptyState.className = 'empty-state';
                        emptyState.innerHTML = `
                            <div style="text-align: center; padding: 40px 20px;">
                                <div style="font-size: 48px; margin-bottom: 20px;">🐰</div>
                                <h3>Пока нет видео</h3>
                                <p>Видео появятся здесь, когда авторы начнут их загружать</p>
                            </div>
                        `;
                        videosContainer.appendChild(emptyState);
                    } else {
                        // Если это первичная загрузка, включим отложенную загрузку миниатюр
                        if (currentIndex === data.videos.length) {
                            setTimeout(lazyLoadThumbnails, 100);
                        }
                    }
                }
            } else {
                console.error('API returned no videos:', data);
            }
        })
        .catch(error => {
            isLoading = false;
            console.error('Error fetching videos:', error);
        });
}

// Функция для перемешивания массива (алгоритм Фишера-Йейтса)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Загрузка дополнительных видео с отложенной загрузкой изображений
function loadMoreVideos() {
    if (isLoading || currentIndex >= totalVideos) return;
    
    isLoading = true;
    
    loadVideosFromGCS();
}

// Оптимизированный обработчик прокрутки с дебаунсингом
let scrollTimeout;
function handleScroll() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
        if (!videosContainer) return;
        
        const lastVideoCard = videosContainer.querySelector('.video-card:last-child');
        
        if (lastVideoCard) {
            const lastVideoRect = lastVideoCard.getBoundingClientRect();
            const offset = 200;
            
            if (lastVideoRect.bottom <= window.innerHeight + offset && !isLoading) {
                console.log('Triggering loadMoreVideos');
                loadMoreVideos();
            }
        }
    }, 100);
}

function showPopularSearchTerms(terms, searchDropdown) {
    if (!searchDropdown) return;
    
    searchDropdown.innerHTML = '';
    
    // Create a header for popular terms
    const header = document.createElement('div');
    header.className = 'search-header';
    header.textContent = 'Популярные запросы';
    searchDropdown.appendChild(header);
    
    // Add each popular term
    terms.forEach(term => {
        const termItem = document.createElement('div');
        termItem.className = 'search-term';
        termItem.innerHTML = `
            <div class="search-term-icon">🔍</div>
            <div class="search-term-text">${term}</div>
        `;
        
        termItem.addEventListener('click', function() {
            // Set the search input to this term and redirect to search
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = term;
                window.location.href = `/search?query=${encodeURIComponent(term)}`;
            }
        });
        
        searchDropdown.appendChild(termItem);
    });
    
    searchDropdown.classList.add('show');
}

// Функция для отображения результатов поиска в выпадающем списке
function showSearchResults(results, searchDropdown, query) {
    if (!searchDropdown) return;
    
    searchDropdown.innerHTML = '';
    
    if (results.length === 0) {
        // If no results, show a message and popular search terms
        const noResults = document.createElement('div');
        noResults.className = 'search-no-results';
        noResults.textContent = `Нет результатов для "${query}"`;
        searchDropdown.appendChild(noResults);
        
        // Create a "perform search" item
        const searchAllItem = document.createElement('div');
        searchAllItem.className = 'search-all-item';
        searchAllItem.innerHTML = `
            <div class="search-all-icon">🔍</div>
            <div class="search-all-text">Искать <strong>${query}</strong></div>
        `;
        
        searchAllItem.addEventListener('click', function() {
            window.location.href = `/search?query=${encodeURIComponent(query)}`;
        });
        
        searchDropdown.appendChild(searchAllItem);
        searchDropdown.classList.add('show');
        return;
    }
    
    // First, add a "search for" item at the top
    const searchItem = document.createElement('div');
    searchItem.className = 'search-term';
    searchItem.innerHTML = `
        <div class="search-term-icon">🔍</div>
        <div class="search-term-text">Искать <strong>${query}</strong></div>
    `;
    
    searchItem.addEventListener('click', function() {
        window.location.href = `/search?query=${encodeURIComponent(query)}`;
    });
    
    searchDropdown.appendChild(searchItem);
    
    // Then add video results
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'search-header';
    resultsHeader.textContent = 'Видео';
    searchDropdown.appendChild(resultsHeader);
    
    // Limit the number of results for the dropdown
    const displayResults = results.slice(0, 5);
    
    displayResults.forEach(video => {
        // Determine the path to the preview, with a fallback
        const previewPath = video.thumbnail_url ? 
            video.thumbnail_url : 
            `/static/placeholder.jpg`;
        
        // Determine the channel name for display
        const channelName = video.display_name || video.channel || video.user_id || '';
            
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result';
        resultItem.innerHTML = `
            <div class="search-thumbnail">
                <img src="${previewPath}" loading="lazy" onerror="this.src='/static/placeholder.jpg'" alt="${video.title}">
            </div>
            <div class="search-info">
                <div class="search-title">${video.title}</div>
                <div class="search-channel">${channelName}</div>
            </div>
        `;
        
        resultItem.addEventListener('click', function() {
            window.location.href = `/video/${video.user_id}__${video.video_id}/`;
        });
        
        searchDropdown.appendChild(resultItem);
    });
    
    // If there are more results, add a link to "Show all results"
    if (results.length > 5) {
        const showMore = document.createElement('div');
        showMore.className = 'search-more';
        showMore.textContent = 'Показать все результаты';
        
        showMore.addEventListener('click', function() {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                // Redirect to search results page
                window.location.href = `/search?query=${encodeURIComponent(searchInput.value)}`;
            }
        });
        
        searchDropdown.appendChild(showMore);
    }
    
    searchDropdown.classList.add('show');
}

// Function to search for videos locally
function searchVideos(query) {
    if (!query.trim() || !videoData || !videoData.length) return [];
    
    query = query.toLowerCase();
    let results = videoData.filter(video => 
        (video.title && video.title.toLowerCase().includes(query)) || 
        (video.display_name && video.display_name.toLowerCase().includes(query)) ||
        (video.channel && video.channel.toLowerCase().includes(query)) ||
        (video.description && video.description.toLowerCase().includes(query)) ||
        (video.user_id && video.user_id.toLowerCase().includes(query))
    );
    
    // Сортируем результаты по релевантности
    results.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        
        // Точное совпадение с заголовком
        if (titleA === query && titleB !== query) return -1;
        if (titleB === query && titleA !== query) return 1;
        
        // Заголовок начинается с запроса
        if (titleA.startsWith(query) && !titleB.startsWith(query)) return -1;
        if (titleB.startsWith(query) && !titleA.startsWith(query)) return 1;
        
        // Заголовок содержит запрос
        const aContains = titleA.includes(query);
        const bContains = titleB.includes(query);
        if (aContains && !bContains) return -1;
        if (bContains && !aContains) return 1;
        
        // Сортировка по просмотрам (если все остальное равно)
        const viewsA = parseInt(a.views || 0);
        const viewsB = parseInt(b.views || 0);
        return viewsB - viewsA;
    });
    
    // Логируем, чтобы при отладке видеть, что нашлось
    console.log(`Поиск по "${query}" нашел ${results.length} результатов`);
    if (results.length > 0) {
        console.log("Первые 3 результата:", results.slice(0, 3).map(v => v.title));
    }
    
    return results;
}

// Функция для настройки поиска
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const searchDropdown = document.getElementById('search-dropdown');
    const searchButton = document.querySelector('.search-button');
    
    if (!searchInput || !searchDropdown) return;
    
    // Popular search terms
    const popularSearchTerms = [
        "Программирование Python",
        "Математический анализ",
        "Основы физики",
        "Химические эксперименты",
        "История цивилизаций"
    ];
    
    // Debouncing for search while typing
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        if (searchTimeout) clearTimeout(searchTimeout);
        
        const query = this.value.trim();
        
        // If query is empty, show popular search terms
        if (!query) {
            showPopularSearchTerms(popularSearchTerms, searchDropdown);
            return;
        }
        
        // Add delay before search
        searchTimeout = setTimeout(() => {
            // Make an API request to search
            fetch(`/api/list-all-videos/?offset=0&limit=10`)
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.videos) {
                        // Filter videos by query
                        const filteredVideos = data.videos.filter(video => {
                            const title = video.title && video.title.toLowerCase();
                            const description = video.description && video.description.toLowerCase();
                            const channel = (video.channel || video.display_name || video.user_id || "").toLowerCase();
                            const queryLower = query.toLowerCase();
                            
                            return (title && title.includes(queryLower)) || 
                                   (description && description.includes(queryLower)) || 
                                   (channel && channel.includes(queryLower));
                        });
                        
                        showSearchResults(filteredVideos, searchDropdown, query);
                    } else {
                        showSearchResults([], searchDropdown, query);
                    }
                })
                .catch(error => {
                    console.error('Error fetching search results:', error);
                    showSearchResults([], searchDropdown, query);
                });
        }, 300);
    });
    
    searchInput.addEventListener('focus', function() {
        const query = this.value.trim();
        if (!query) {
            showPopularSearchTerms(popularSearchTerms, searchDropdown);
        } else {
            fetch(`/api/list-all-videos/?offset=0&limit=10`)
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.videos) {
                        // Filter videos by query
                        const queryLower = query.toLowerCase();
                        const filteredVideos = data.videos.filter(video => {
                            const title = video.title && video.title.toLowerCase();
                            const description = video.description && video.description.toLowerCase();
                            const channel = (video.channel || video.display_name || video.user_id || "").toLowerCase();
                            
                            return (title && title.includes(queryLower)) || 
                                   (description && description.includes(queryLower)) || 
                                   (channel && channel.includes(queryLower));
                        });
                        
                        showSearchResults(filteredVideos, searchDropdown, query);
                    } else {
                        showSearchResults([], searchDropdown, query);
                    }
                })
                .catch(error => {
                    console.error('Error fetching search results:', error);
                    showSearchResults([], searchDropdown, query);
                });
        }
    });
    
    document.addEventListener('click', function(e) {
        if (searchInput && searchDropdown && 
            !searchInput.contains(e.target) && 
            !searchDropdown.contains(e.target)) {
            searchDropdown.classList.remove('show');
        }
    });
    
    if (searchButton) {
        searchButton.addEventListener('click', function() {
            if (searchInput.value.trim()) {
                window.location.href = `/search?query=${encodeURIComponent(searchInput.value)}`;
            }
        });
    }
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && this.value.trim()) {
            window.location.href = `/search?query=${encodeURIComponent(this.value)}`;
        }
    });
}

// Функция для настройки сворачивания/разворачивания боковой панели
function setupSidebar() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContainer = document.querySelector('.main-container');
    
    if (!sidebarToggle || !sidebar || !mainContainer) return;
    
    // Загружаем сохраненное состояние сайдбара
    const savedSidebarState = localStorage.getItem('kronik-sidebar-collapsed');
    if (savedSidebarState === 'true') {
        sidebar.classList.add('collapsed');
        mainContainer.classList.add('expanded');
    }
    
    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
        mainContainer.classList.toggle('expanded');
        
        // Сохраняем состояние сайдбара
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('kronik-sidebar-collapsed', isCollapsed.toString());
    });
}

function setupLanguageToggle() {
    const languageToggle = document.querySelector('.theme-toggle'); // Используем существующую кнопку
    const body = document.body;
    const toggleText = document.querySelector('.toggle-text');
    
    if (!languageToggle || !toggleText) return;
    
    // Языки и их отображение
    const languages = {
        'ru': { name: 'Русский', icon: '🇷🇺', next: 'en' },
        'en': { name: 'English', icon: '🇬🇧', next: 'uz' },
        'uz': { name: 'O\'zbek', icon: '🇺🇿', next: 'ru' }
    };
    
    // Загружаем сохраненный язык при загрузке страницы
    let currentLang = localStorage.getItem('kronik-language') || 'ru';
    
    // Устанавливаем начальный язык
    body.setAttribute('data-language', currentLang);
    updateLanguageUI(currentLang);
    
    // Обновляем UI кнопки для отображения языка
    function updateLanguageUI(lang) {
        const langData = languages[lang];
        languageToggle.innerHTML = `
            <span class="lang-icon">${langData.icon}</span>
            <span class="lang-text">${langData.name}</span>
        `;
        
        // Применяем переводы
        applyTranslations(lang);
    }
    
    // Обработчик клика для переключения языка
    languageToggle.addEventListener('click', function() {
        currentLang = languages[currentLang].next;
        body.setAttribute('data-language', currentLang);
        updateLanguageUI(currentLang);
        
        // Сохраняем выбранный язык в localStorage
        localStorage.setItem('kronik-language', currentLang);
    });
}

// Function to make sidebar menu items active when clicked
function setupSidebarMenuItems() {
    const menuItems = document.querySelectorAll('.sidebar .menu-item');
    
    if (!menuItems.length) return;
    
    menuItems.forEach(item => {
        // Skip items that already have onclick handlers (like Studio and Home)
        if (item.getAttribute('onclick')) return;
        
        item.addEventListener('click', function() {
            // Remove active class from all items
            menuItems.forEach(i => i.classList.remove('active'));
            // Add active class to clicked item
            this.classList.add('active');
        });
    });
}

// Функция для настройки переключения темы
function setupThemeToggle() {
    const themeToggle = document.querySelector('.theme-toggle');
    const body = document.body;
    const themeTransition = document.querySelector('.theme-transition');
    const toggleText = document.querySelector('.toggle-text');
    
    if (!themeToggle || !themeTransition || !toggleText) return;
    
    // Загружаем сохраненную тему при загрузке страницы
    const savedTheme = localStorage.getItem('kronik-theme');
    if (savedTheme) {
        if (savedTheme === 'light') {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
        } else {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
        }
    }
    
    themeToggle.addEventListener('click', function() {
        const isDark = body.classList.contains('dark-theme');
        themeTransition.className = `theme-transition ${isDark ? 'light' : 'dark'} animating`;
        
        setTimeout(() => {
            body.classList.toggle('dark-theme');
            body.classList.toggle('light-theme');
            
            // Обновляем текст кнопки
            const newTheme = body.classList.contains('light-theme') ? 'light' : 'dark';
            
            // Сохраняем выбранную тему в localStorage
            localStorage.setItem('kronik-theme', newTheme);
        }, 500);
        
        setTimeout(() => {
            themeTransition.classList.remove('animating');
        }, 1500);
    });
}

// Функция для настройки пользовательского меню
function setupUserMenu() {
    const userMenu = document.querySelector('.user-menu');
    const userDropdown = document.querySelector('.user-dropdown');
    
    if (!userMenu || !userDropdown) return;
    
    userMenu.addEventListener('click', function(e) {
        e.stopPropagation();
        userDropdown.classList.toggle('show');
    });
    
    // Закрытие выпадающего меню по клику вне него
    document.addEventListener('click', function(e) {
        if (userMenu && userDropdown && 
            !userMenu.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    });
}

// Функция для настройки мобильного меню
function setupMobileMenu() {
    const mobileMenuButton = document.querySelector('.mobile-menu-button');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.overlay');
    
    if (!sidebar || !overlay) return;
    
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', function() {
            sidebar.classList.toggle('show');
            overlay.classList.toggle('show');
        });
    }
    
    overlay.addEventListener('click', function() {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    });
}

// Функция для настройки категорий
function setupCategories() {
    const categoryChips = document.querySelectorAll('.category-chip');
    
    if (!categoryChips.length || !videosContainer) return;
    
    categoryChips.forEach(chip => {
        chip.addEventListener('click', function() {
            // Убираем активный класс у всех элементов
            categoryChips.forEach(c => c.classList.remove('active'));
            // Добавляем активный класс к выбранному элементу
            this.classList.add('active');
            
            // Сбрасываем индекс для правильной загрузки
            currentIndex = 0;
            
            // Очищаем контейнер
            videosContainer.innerHTML = '';
            
            // Показываем спиннер загрузки
            
            // Добавляем небольшую задержку для отображения UX загрузки
            setTimeout(() => {
                // Если выбрана категория "Все", загружаем все видео
                if (category === 'все') {
                    // Перемешиваем видео заново для разнообразия
                    shuffleArray(videoData);
                    
                    // Загружаем первую партию видео
                    for (let i = 0; i < Math.min(videosPerPage, videoData.length); i++) {
                        const card = createVideoCard(videoData[i], i * 50); // Уменьшаем задержку для быстрой загрузки
                        videosContainer.appendChild(card);
                        currentIndex++;
                    }
                } else {
                    // Фильтруем видео по категории
                    const filteredVideos = videoData.filter(video => {
                        // Проверяем категорию видео (если она есть)
                        if (video.category) {
                            return video.category.toLowerCase().includes(category);
                        }
                        return false;
                    });
                    
                    // Перемешиваем отфильтрованные видео
                    shuffleArray(filteredVideos);
                    
                    // Если нет видео в этой категории
                    if (filteredVideos.length === 0) {
                        const emptyState = document.createElement('div');
                        emptyState.className = 'empty-state';
                        emptyState.innerHTML = `
                            <div style="text-align: center; padding: 40px 20px;">
                                <div style="font-size: 48px; margin-bottom: 20px;">🐰</div>
                                <h3>Нет видео в категории "${this.textContent}"</h3>
                                <p>Попробуйте выбрать другую категорию или загляните позже</p>
                            </div>
                        `;
                        videosContainer.appendChild(emptyState);
                    } else {
                        // Добавляем отфильтрованные видео
                        for (let i = 0; i < Math.min(videosPerPage, filteredVideos.length); i++) {
                            const card = createVideoCard(filteredVideos[i], i * 50);
                            videosContainer.appendChild(card);
                        }
                    }
                }
                
                // Скрываем спиннер загрузки
            }, 300);
        });
    });
}

// Функция применения переводов
function applyTranslations(lang) {
    const translations = {
        'ru': {
            'search-placeholder': 'Поиск...',
            'main-page': 'Главная',
            'courses': 'Курсы',
            'library': 'Библиотека',
            'subscriptions': 'Подписки',
            'studio': 'Студия',
            'liked': 'Понравившиеся',
            'history': 'История просмотров',
            'playlists': 'Мои плейлисты',
            'progress': 'Прогресс обучения',
            'notes': 'Заметки',
            'schedule': 'Расписание',
            'search': 'Поиск',
            'profile': 'Мой профиль',
            'settings': 'Настройки',
            'become-author': 'Стать автором',
            'my-courses': 'Мои курсы',
            'help': 'Помощь',
            'logout': 'Выход',
            'login': 'Войти',
            'register': 'Регистрация',
            'notifications': 'Уведомления',
            'no-notifications': 'У вас пока нет уведомлений',
            'auth-required': 'Авторизуйтесь, чтобы видеть уведомления',
            'no-subscriptions': 'У вас пока нет подписок',
            'you-section': 'ВЫ',
            'tools-section': 'ИНСТРУМЕНТЫ'
        },
        'en': {
            'search-placeholder': 'Search...',
            'main-page': 'Home',
            'courses': 'Courses',
            'library': 'Library',
            'subscriptions': 'Subscriptions',
            'studio': 'Studio',
            'liked': 'Liked videos',
            'history': 'Watch history',
            'playlists': 'My playlists',
            'progress': 'Learning progress',
            'notes': 'Notes',
            'schedule': 'Schedule',
            'search': 'Search',
            'profile': 'My profile',
            'settings': 'Settings',
            'become-author': 'Become an author',
            'my-courses': 'My courses',
            'help': 'Help',
            'logout': 'Sign out',
            'login': 'Sign in',
            'register': 'Sign up',
            'notifications': 'Notifications',
            'no-notifications': 'You have no notifications yet',
            'auth-required': 'Sign in to see notifications',
            'no-subscriptions': 'You have no subscriptions yet',
            'you-section': 'YOU',
            'tools-section': 'TOOLS'
        },
        'uz': {
            'search-placeholder': 'Qidirish...',
            'main-page': 'Bosh sahifa',
            'courses': 'Kurslar',
            'library': 'Kutubxona',
            'subscriptions': 'Obunalar',
            'studio': 'Studiya',
            'liked': 'Yoqtirilgan videolar',
            'history': 'Ko\'rish tarixi',
            'playlists': 'Mening pleylistlarim',
            'progress': 'O\'rganish jarayoni',
            'notes': 'Eslatmalar',
            'schedule': 'Jadval',
            'search': 'Qidiruv',
            'profile': 'Mening profilim',
            'settings': 'Sozlamalar',
            'become-author': 'Muallif bo\'lish',
            'my-courses': 'Mening kurslarim',
            'help': 'Yordam',
            'logout': 'Chiqish',
            'login': 'Kirish',
            'register': 'Ro\'yxatdan o\'tish',
            'notifications': 'Bildirishnomalar',
            'no-notifications': 'Sizda hali bildirishnomalar yo\'q',
            'auth-required': 'Bildirishnomalarni ko\'rish uchun tizimga kiring',
            'no-subscriptions': 'Sizda hali obunalar yo\'q',
            'you-section': 'SIZ',
            'tools-section': 'VOSITALAR'
        }
    };
    
    // Применяем переводы к элементам с data-translate атрибутом
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[lang] && translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });
    
    // Обновляем placeholder у поиска
    const searchInput = document.getElementById('search-input');
    if (searchInput && translations[lang]['search-placeholder']) {
        searchInput.placeholder = translations[lang]['search-placeholder'];
    }
    
    // Обновляем текст в меню
    const menuTranslations = {
        'Главная': translations[lang]['main-page'],
        'Home': translations[lang]['main-page'],
        'Bosh sahifa': translations[lang]['main-page'],
        'Курсы': translations[lang]['courses'],
        'Courses': translations[lang]['courses'],
        'Kurslar': translations[lang]['courses'],
        'Библиотека': translations[lang]['library'],
        'Library': translations[lang]['library'],
        'Kutubxona': translations[lang]['library'],
        'Подписки': translations[lang]['subscriptions'],
        'Subscriptions': translations[lang]['subscriptions'],
        'Obunalar': translations[lang]['subscriptions'],
        'Студия': translations[lang]['studio'],
        'Studio': translations[lang]['studio'],
        'Studiya': translations[lang]['studio'],
        'Понравившиеся': translations[lang]['liked'],
        'Liked videos': translations[lang]['liked'],
        'Yoqtirilgan videolar': translations[lang]['liked'],
        'История просмотров': translations[lang]['history'],
        'Watch history': translations[lang]['history'],
        'Ko\'rish tarixi': translations[lang]['history'],
        'Мои плейлисты': translations[lang]['playlists'],
        'My playlists': translations[lang]['playlists'],
        'Mening pleylistlarim': translations[lang]['playlists'],
        'Прогресс обучения': translations[lang]['progress'],
        'Learning progress': translations[lang]['progress'],
        'O\'rganish jarayoni': translations[lang]['progress'],
        'Заметки': translations[lang]['notes'],
        'Notes': translations[lang]['notes'],
        'Eslatmalar': translations[lang]['notes'],
        'Расписание': translations[lang]['schedule'],
        'Schedule': translations[lang]['schedule'],
        'Jadval': translations[lang]['schedule'],
        'Поиск': translations[lang]['search'],
        'Search': translations[lang]['search'],
        'Qidiruv': translations[lang]['search'],
        'ВЫ': translations[lang]['you-section'],
        'YOU': translations[lang]['you-section'],
        'SIZ': translations[lang]['you-section'],
        'ИНСТРУМЕНТЫ': translations[lang]['tools-section'],
        'TOOLS': translations[lang]['tools-section'],
        'VOSITALAR': translations[lang]['tools-section']
    };
    
    // Обновляем текст в sidebar
    document.querySelectorAll('.menu-text, .sidebar-title').forEach(element => {
        const currentText = element.textContent.trim();
        if (menuTranslations[currentText]) {
            element.textContent = menuTranslations[currentText];
        }
    });
    
    // Обновляем dropdown menu
    const dropdownTranslations = {
        'Мой профиль': translations[lang]['profile'],
        'My profile': translations[lang]['profile'],
        'Mening profilim': translations[lang]['profile'],
        'Настройки': translations[lang]['settings'],
        'Settings': translations[lang]['settings'],
        'Sozlamalar': translations[lang]['settings'],
        'Стать автором': translations[lang]['become-author'],
        'Become an author': translations[lang]['become-author'],
        'Muallif bo\'lish': translations[lang]['become-author'],
        'Мои курсы': translations[lang]['my-courses'],
        'My courses': translations[lang]['my-courses'],
        'Mening kurslarim': translations[lang]['my-courses'],
        'Помощь': translations[lang]['help'],
        'Help': translations[lang]['help'],
        'Yordam': translations[lang]['help'],
        'Выход': translations[lang]['logout'],
        'Sign out': translations[lang]['logout'],
        'Chiqish': translations[lang]['logout']
    };
    
    document.querySelectorAll('.dropdown-item').forEach(item => {
        const textElement = item.querySelector('div:last-child');
        if (textElement) {
            const currentText = textElement.textContent.trim();
            if (dropdownTranslations[currentText]) {
                textElement.textContent = dropdownTranslations[currentText];
            }
        }
    });
    
    // Обновляем кнопки входа/регистрации
    const loginButton = document.querySelector('.login-button');
    const registerButton = document.querySelector('.register-button');
    
    if (loginButton) {
        loginButton.textContent = translations[lang]['login'];
    }
    if (registerButton) {
        registerButton.textContent = translations[lang]['register'];
    }
    
    // Обновляем уведомления
    const notificationHeader = document.querySelector('.notification-header h3');
    if (notificationHeader) {
        notificationHeader.textContent = translations[lang]['notifications'];
    }
    
    const emptyNotifications = document.querySelector('.empty-notifications p');
    if (emptyNotifications) {
        emptyNotifications.textContent = translations[lang]['no-notifications'];
    }
    
    const authRequired = document.querySelector('.notification-login-required p');
    if (authRequired) {
        authRequired.textContent = translations[lang]['auth-required'];
    }
    
    // Обновляем кнопки в уведомлениях
    const notifLoginBtn = document.querySelector('.notification-login-btn');
    const notifRegisterBtn = document.querySelector('.notification-register-btn');
    
    if (notifLoginBtn) {
        notifLoginBtn.textContent = translations[lang]['login'];
    }
    if (notifRegisterBtn) {
        notifRegisterBtn.textContent = translations[lang]['register'];
    }
    
    // Обновляем подписки
    const noSubscriptions = document.querySelector('.no-subscriptions');
    if (noSubscriptions) {
        noSubscriptions.textContent = translations[lang]['no-subscriptions'];
    }
}

document.querySelectorAll('.show-replies-btn').forEach(button => {
    button.addEventListener('click', function() {
        const isShown = this.getAttribute('data-shown') === 'true';
        const repliesContainer = this.nextElementSibling;
        
        if (repliesContainer && repliesContainer.classList.contains('qa-replies')) {
            const replyCount = repliesContainer.querySelectorAll('.qa-reply').length;
            
            if (isShown) {
                // Hide replies
                repliesContainer.style.display = 'none';
                this.textContent = `Показать ответы (${replyCount})`;
                this.setAttribute('data-shown', 'false');
            } else {
                // Show replies
                repliesContainer.style.display = 'block';
                this.textContent = 'Скрыть ответы';
                this.setAttribute('data-shown', 'true');
            }
        }
    });
});
// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    videosContainer = document.getElementById('videos-container');
    
    if (videosContainer && videosContainer.children.length === 0) {
        console.log('Initial video load');
        loadVideosFromGCS();
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    setupSearch();
    setupSidebar();
    setupLanguageToggle(); // Заменяем setupThemeToggle на setupLanguageToggle
    setupUserMenu();
    setupMobileMenu();
    setupCategories();
    setupSidebarMenuItems();
});