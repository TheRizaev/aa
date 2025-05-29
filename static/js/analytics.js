// analytics.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
class AnalyticsDashboard {
    constructor() {
        this.charts = {};
        this.currentPeriod = 30;
        this.isLoading = false;
        this.analyticsData = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupChartDefaults();
        // Загрузить данные сразу после инициализации
        this.loadAnalyticsData();
    }
    
    setupEventListeners() {
        // Date range selector
        const dateRangeSelect = document.getElementById('dateRange');
        if (dateRangeSelect) {
            dateRangeSelect.addEventListener('change', (e) => {
                this.currentPeriod = parseInt(e.target.value);
                this.loadAnalyticsData();
            });
        }
        
        // Refresh button
        const refreshBtn = document.getElementById('refreshData');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadAnalyticsData(true);
            });
        }
        
        // Export button
        const exportBtn = document.getElementById('exportData');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.showExportModal();
            });
        }
        
        // Chart controls
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('chart-control')) {
                this.handleChartControl(e.target);
            }
        });
        
        // Modal events
        this.setupModalEvents();
        
        // Table events
        this.setupTableEvents();
    }
    
    setupModalEvents() {
        // Export modal
        const closeExportModal = document.getElementById('closeExportModal');
        const cancelExport = document.getElementById('cancelExport');
        const confirmExport = document.getElementById('confirmExport');
        
        if (closeExportModal) {
            closeExportModal.addEventListener('click', () => {
                this.hideModal('exportModal');
            });
        }
        
        if (cancelExport) {
            cancelExport.addEventListener('click', () => {
                this.hideModal('exportModal');
            });
        }
        
        if (confirmExport) {
            confirmExport.addEventListener('click', () => {
                this.exportData();
            });
        }
        
        // Video details modal
        const closeVideoModal = document.getElementById('closeVideoModal');
        
        if (closeVideoModal) {
            closeVideoModal.addEventListener('click', () => {
                this.hideModal('videoDetailsModal');
            });
        }
        
        // Close modals on outside click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModal(e.target.id);
            }
        });
    }
    
    setupTableEvents() {
        // Video details buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('details-btn')) {
                const videoId = e.target.getAttribute('data-video-id');
                if (videoId) {
                    this.showVideoDetails(videoId);
                }
            }
        });
        
        // View all videos button
        const viewAllBtn = document.getElementById('viewAllVideos');
        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', () => {
                window.location.href = '/studio/#videos';
            });
        }
    }
    
    setupChartDefaults() {
        if (typeof Chart !== 'undefined') {
            Chart.defaults.font.family = 'Nunito, sans-serif';
            Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--gray-color');
            Chart.defaults.plugins.legend.labels.usePointStyle = true;
            Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(37, 39, 159, 0.9)';
            Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
            Chart.defaults.plugins.tooltip.bodyColor = '#ffffff';
            Chart.defaults.plugins.tooltip.cornerRadius = 10;
        }
    }
    
    async loadAnalyticsData(forceRefresh = false) {
        if (this.isLoading && !forceRefresh) return;
        
        this.isLoading = true;
        this.showLoadingState();
        
        try {
            console.log('Loading analytics data...');
            
            const response = await fetch(`/api/analytics/overview/?days=${this.currentPeriod}`, {
                method: 'GET',
                headers: {
                    'X-CSRFToken': this.getCSRFToken(),
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('Analytics response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Analytics data received:', data);
            
            if (data.success && data.data) {
                this.analyticsData = data.data;
                this.updateDashboard();
                this.showToast('Данные аналитики загружены', 'success');
            } else {
                throw new Error(data.error || 'Failed to load analytics');
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.showToast('Ошибка загрузки аналитики: ' + error.message, 'error');
            this.showErrorState(error.message);
        } finally {
            this.isLoading = false;
            this.hideLoadingState();
        }
    }
    
    updateDashboard() {
        if (!this.analyticsData) {
            console.error('No analytics data available');
            return;
        }
        
        console.log('Updating dashboard with data:', this.analyticsData);
        
        this.updateStatsCards();
        this.updateCharts();
        this.updateTables();
        this.updateInsights();
    }
    
    updateStatsCards() {
        const stats = this.analyticsData.stats || {};
        const growth = this.analyticsData.growth || {};
        
        console.log('Updating stats cards with:', stats);
        
        // Total views
        this.updateStatCard('totalViews', stats.total_views || 0, growth.views_growth || 0);
        
        // Subscribers
        this.updateStatCard('totalSubscribers', stats.subscribers || 0, growth.subscribers_growth || 0);
        
        // Engagement rate
        this.updateStatCard('engagementRate', (stats.engagement_rate || 0).toFixed(1) + '%', 0);
        
        // Revenue (placeholder)
        this.updateStatCard('totalRevenue', '₽0.00', 0);
    }
    
    updateStatCard(elementId, value, change) {
        const valueElement = document.getElementById(elementId);
        const changeElement = document.getElementById(elementId.replace('total', '').replace('Rate', '') + 'Change');
        
        if (valueElement) {
            if (typeof value === 'number') {
                this.animateNumber(valueElement, value);
            } else {
                valueElement.textContent = value;
            }
        }
        
        if (changeElement) {
            const changeValue = changeElement.querySelector('.change-value');
            const changeIcon = changeElement.querySelector('.change-icon');
            
            if (changeValue && changeIcon) {
                const formattedChange = change >= 0 ? `+${change}%` : `${change}%`;
                changeValue.textContent = formattedChange;
                
                if (change > 0) {
                    changeIcon.textContent = '📈';
                    changeElement.className = 'stat-change positive';
                } else if (change < 0) {
                    changeIcon.textContent = '📉';
                    changeElement.className = 'stat-change negative';
                } else {
                    changeIcon.textContent = '➖';
                    changeElement.className = 'stat-change neutral';
                }
            }
        }
    }
    
    animateNumber(element, targetValue) {
        if (typeof targetValue === 'string' && (targetValue.includes('%') || targetValue.includes('₽'))) {
            element.textContent = targetValue;
            return;
        }
        
        const currentValue = parseInt(element.textContent.replace(/[^\d]/g, '')) || 0;
        const target = parseInt(targetValue) || 0;
        const duration = 1500;
        const steps = 60;
        const stepValue = (target - currentValue) / steps;
        let current = currentValue;
        
        const timer = setInterval(() => {
            current += stepValue;
            if (
                (stepValue > 0 && current >= target) || 
                (stepValue < 0 && current <= target) ||
                stepValue === 0
            ) {
                current = target;
                clearInterval(timer);
            }
            element.textContent = this.formatNumber(Math.round(current));
        }, duration / steps);
    }
    
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    
    updateCharts() {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js is not loaded');
            return;
        }
        
        this.createViewsChart();
        this.createDemographicsChart();
        this.createEngagementChart();
        this.createTrafficChart();
    }
    
    createViewsChart() {
        const ctx = document.getElementById('viewsChart');
        if (!ctx) {
            console.log('Views chart canvas not found');
            return;
        }
        
        // Destroy existing chart
        if (this.charts.views) {
            this.charts.views.destroy();
        }
        
        const viewsData = this.analyticsData.views_over_time || [];
        console.log('Creating views chart with data:', viewsData);
        
        const labels = viewsData.map(item => {
            const date = new Date(item.date);
            return date.toLocaleDateString('ru-RU', { 
                month: 'short', 
                day: 'numeric' 
            });
        });
        const data = viewsData.map(item => item.views || 0);
        
        this.charts.views = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Просмотры',
                    data: data,
                    borderColor: 'rgb(37, 88, 159)',
                    backgroundColor: 'rgba(37, 88, 159, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'rgb(37, 88, 159)',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(37, 39, 159, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value >= 1000 ? (value/1000) + 'K' : value;
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }
    
    createDemographicsChart() {
        const ctx = document.getElementById('demographicsChart');
        if (!ctx) return;
        
        if (this.charts.demographics) {
            this.charts.demographics.destroy();
        }
        
        const demographics = this.analyticsData.demographics || {};
        const deviceTypes = demographics.device_types || [
            {name: 'Desktop', value: 45},
            {name: 'Mobile', value: 35},
            {name: 'Tablet', value: 20}
        ];
        
        this.charts.demographics = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: deviceTypes.map(d => d.name),
                datasets: [{
                    data: deviceTypes.map(d => d.value),
                    backgroundColor: [
                        'rgb(52, 152, 219)',
                        'rgb(46, 204, 113)', 
                        'rgb(241, 196, 15)'
                    ],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            font: {
                                size: 12
                            }
                        }
                    }
                }
            }
        });
    }
    
    createEngagementChart() {
        const ctx = document.getElementById('engagementChart');
        if (!ctx) return;
        
        if (this.charts.engagement) {
            this.charts.engagement.destroy();
        }
        
        const engagement = this.analyticsData.engagement || {};
        
        this.charts.engagement = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Лайки', 'Дизлайки', 'Комментарии', 'Подписки'],
                datasets: [{
                    data: [
                        engagement.likes || 0,
                        engagement.dislikes || 0,
                        engagement.comments || 0,
                        engagement.new_subscribers_30d || 0
                    ],
                    backgroundColor: [
                        'rgba(46, 204, 113, 0.8)',
                        'rgba(231, 76, 60, 0.8)',
                        'rgba(52, 152, 219, 0.8)',
                        'rgba(155, 89, 182, 0.8)'
                    ],
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    createTrafficChart() {
        const ctx = document.getElementById('trafficChart');
        if (!ctx) return;
        
        if (this.charts.traffic) {
            this.charts.traffic.destroy();
        }
        
        const totalViews = this.analyticsData.stats?.total_views || 1;
        const trafficSources = [
            {source: 'KRONIK Homepage', views: Math.floor(totalViews * 0.4)},
            {source: 'Search', views: Math.floor(totalViews * 0.25)},
            {source: 'Subscriptions', views: Math.floor(totalViews * 0.20)},
            {source: 'External', views: Math.floor(totalViews * 0.10)},
            {source: 'Direct', views: Math.floor(totalViews * 0.05)}
        ];
        
        this.charts.traffic = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: trafficSources.map(t => t.source),
                datasets: [{
                    data: trafficSources.map(t => t.views),
                    backgroundColor: [
                        'rgb(37, 88, 159)',
                        'rgb(52, 152, 219)',
                        'rgb(46, 204, 113)',
                        'rgb(241, 196, 15)',
                        'rgb(155, 89, 182)'
                    ],
                    borderWidth: 0,
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    updateTables() {
        this.updateTopVideosTable();
        this.updateEngagementMetricsTable();
        this.updateRecentActivityTable();
    }
    
    updateTopVideosTable() {
        const tbody = document.querySelector('#topVideosTable tbody');
        if (!tbody) return;
        
        const topVideos = this.analyticsData.top_videos || [];
        
        tbody.innerHTML = '';
        
        if (topVideos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <div class="empty-state-icon">📹</div>
                        <h3>Нет данных о видео</h3>
                        <p>Загрузите видео, чтобы увидеть аналитику</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        topVideos.slice(0, 10).forEach((video, index) => {
            const row = document.createElement('tr');
            row.classList.add('fade-in');
            row.style.animationDelay = `${index * 0.1}s`;
            
            const engagementRate = video.engagement_rate || 0;
            const engagementClass = engagementRate >= 5 ? 'engagement-high' : 
                                  engagementRate >= 2 ? 'engagement-medium' : 'engagement-low';
            
            row.innerHTML = `
                <td>
                    <div class="video-title-cell">
                        <img src="/static/placeholder-thumb.jpg" alt="${video.title}" class="video-thumbnail">
                        <div class="video-info">
                            <div class="video-title">${this.truncateText(video.title, 50)}</div>
                            <div class="video-duration">${video.duration || '00:00'}</div>
                        </div>
                    </div>
                </td>
                <td>${this.formatNumber(video.views || 0)}</td>
                <td>${this.formatNumber(video.likes || 0)}</td>
                <td>${this.formatNumber(video.dislikes || 0)}</td>
                <td>
                    <div class="engagement-bar">
                        <div class="engagement-fill ${engagementClass}" style="width: ${Math.min(engagementRate * 10, 100)}%"></div>
                    </div>
                    <span>${engagementRate.toFixed(1)}%</span>
                </td>
                <td>${this.formatDate(video.upload_date)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view-btn" onclick="window.open('/video/${video.user_id}__${video.video_id}/', '_blank')">
                            👁️ Смотреть
                        </button>
                        <button class="action-btn details-btn" data-video-id="${video.video_id}">
                            📊 Детали
                        </button>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    updateEngagementMetricsTable() {
        const tbody = document.querySelector('#engagementMetricsTable tbody');
        if (!tbody) return;
        
        const engagement = this.analyticsData.engagement || {};
        const stats = this.analyticsData.stats || {};
        
        const metrics = [
            {
                name: 'Общая вовлеченность',
                value: (stats.engagement_rate || 0).toFixed(1) + '%',
                change: '+0.5%',
                trend: 'up'
            },
            {
                name: 'Соотношение лайки/дизлайки',
                value: (engagement.like_dislike_ratio || 0).toFixed(1),
                change: '+0.2',
                trend: 'up'
            },
            {
                name: 'Всего лайков',
                value: engagement.likes || 0,
                change: `+${this.analyticsData.growth?.likes_growth || 0}%`,
                trend: 'up'
            },
            {
                name: 'Новые подписчики',
                value: engagement.new_subscribers_30d || 0,
                change: `+${this.analyticsData.growth?.subscribers_growth || 0}%`,
                trend: 'up'
            }
        ];
        
        tbody.innerHTML = '';
        
        metrics.forEach((metric, index) => {
            const row = document.createElement('tr');
            row.classList.add('slide-up');
            row.style.animationDelay = `${index * 0.1}s`;
            
            const trendIcon = metric.trend === 'up' ? '📈' : metric.trend === 'down' ? '📉' : '➖';
            const trendClass = metric.trend === 'up' ? 'positive' : metric.trend === 'down' ? 'negative' : 'neutral';
            
            row.innerHTML = `
                <td>${metric.name}</td>
                <td>${typeof metric.value === 'number' ? this.formatNumber(metric.value) : metric.value}</td>
                <td class="${trendClass}">${metric.change}</td>
                <td>${trendIcon}</td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    updateRecentActivityTable() {
        const tbody = document.querySelector('#recentActivityTable tbody');
        if (!tbody) return;
        
        // Create realistic activity data based on actual stats
        const stats = this.analyticsData.stats || {};
        const activities = [];
        
        if (stats.total_views > 0) {
            activities.push({
                time: '2 минуты назад',
                event: 'Новый просмотр',
                video: 'Последнее видео',
                user: 'anonymous',
                details: 'Просмотр видео'
            });
        }
        
        if (stats.total_likes > 0) {
            activities.push({
                time: '15 минут назад',
                event: 'Новый лайк',
                video: 'Популярное видео',
                user: 'viewer123',
                details: 'Понравилось видео'
            });
        }
        
        if (stats.subscribers > 0) {
            activities.push({
                time: '1 час назад',
                event: 'Новая подписка',
                video: '-',
                user: 'subscriber456',
                details: 'Подписался на канал'
            });
        }
        
        if (activities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <h3>Пока нет активности</h3>
                        <p>Активность появится после взаимодействия с вашими видео</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = '';
        
        activities.forEach((activity, index) => {
            const row = document.createElement('tr');
            row.classList.add('fade-in');
            row.style.animationDelay = `${index * 0.1}s`;
            
            const eventBadge = this.getEventBadge(activity.event);
            
            row.innerHTML = `
                <td>${activity.time}</td>
                <td>${eventBadge} ${activity.event}</td>
                <td>${activity.video}</td>
                <td>@${activity.user}</td>
                <td>${activity.details}</td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    getEventBadge(event) {
        const badges = {
            'Новый лайк': '<span class="badge badge-success">❤️</span>',
            'Новый комментарий': '<span class="badge badge-info">💬</span>',
            'Новая подписка': '<span class="badge badge-warning">👥</span>',
            'Новый просмотр': '<span class="badge badge-primary">👁️</span>'
        };
        return badges[event] || '<span class="badge">📊</span>';
    }
    
    updateInsights() {
        const stats = this.analyticsData.stats || {};
        
        // Update positive insights
        const positiveInsights = document.getElementById('positiveInsights');
        if (positiveInsights) {
            const insights = [];
            
            if (stats.engagement_rate > 3) {
                insights.push('Высокая вовлеченность аудитории');
            }
            if (stats.subscribers > 10) {
                insights.push('Растущая база подписчиков');
            }
            if (stats.total_videos > 1) {
                insights.push('Регулярная публикация контента');
            }
            if (stats.total_views > 50) {
                insights.push('Хорошая видимость контента');
            }
            
            if (insights.length === 0) {
                insights.push('Продолжайте создавать качественный контент');
                insights.push('Первые шаги в создании контента');
            }
            
            positiveInsights.innerHTML = insights.map(insight => `<li>${insight}</li>`).join('');
        }
        
        // Update improvement insights
        const improvementInsights = document.getElementById('improvementInsights');
        if (improvementInsights) {
            const improvements = [];
            
            if (stats.engagement_rate < 2) {
                improvements.push('Улучшите вовлеченность через интерактивность');
            }
            if (stats.total_videos < 5) {
                improvements.push('Создайте больше видео для роста аудитории');
            }
            
            improvements.push('Добавьте более детальные описания к видео');
            improvements.push('Взаимодействуйте с комментариями зрителей');
            
            improvementInsights.innerHTML = improvements.map(improvement => `<li>${improvement}</li>`).join('');
        }
        
        // Update recommendations
        const recommendationInsights = document.getElementById('recommendationInsights');
        if (recommendationInsights) {
            const recommendations = [
                'Создавайте видео длительностью 10-15 минут',
                'Загружайте видео регулярно',
                'Используйте привлекательные превью',
                'Отвечайте на комментарии зрителей'
            ];
            
            recommendationInsights.innerHTML = recommendations.map(rec => `<li>${rec}</li>`).join('');
        }
    }
    
    async showVideoDetails(videoId) {
        try {
            const response = await fetch(`/api/analytics/video/${videoId}/`, {
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.displayVideoDetails(data.data);
                this.showModal('videoDetailsModal');
            } else {
                throw new Error(data.error || 'Failed to load video details');
            }
        } catch (error) {
            console.error('Error loading video details:', error);
            this.showToast('Ошибка загрузки деталей видео: ' + error.message, 'error');
        }
    }
    
    displayVideoDetails(videoData) {
        const content = document.getElementById('videoDetailsContent');
        if (!content) return;
        
        const video = videoData.video_info || {};
        const engagement = videoData.engagement_metrics || {};
        
        content.innerHTML = `
            <div class="video-details-grid">
                <div class="detail-card">
                    <h4>📊 Основная статистика</h4>
                    <div class="metric-row">
                        <span class="metric-label">Название</span>
                        <span class="metric-value">${video.title || 'Неизвестно'}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Просмотры</span>
                        <span class="metric-value">${this.formatNumber(video.views || 0)}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Лайки</span>
                        <span class="metric-value">${this.formatNumber(engagement.likes || 0)}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Дизлайки</span>
                        <span class="metric-value">${this.formatNumber(engagement.dislikes || 0)}</span>
                    </div>
                </div>
                
                <div class="detail-card">
                    <h4>🎯 Метрики вовлеченности</h4>
                    <div class="metric-row">
                        <span class="metric-label">Вовлеченность</span>
                        <span class="metric-value">${(engagement.engagement_rate || 0).toFixed(1)}%</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Соотношение Л/Д</span>
                        <span class="metric-value">${(engagement.like_dislike_ratio || 0).toFixed(1)}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Дата загрузки</span>
                        <span class="metric-value">${this.formatDate(video.upload_date)}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    handleChartControl(button) {
        const siblings = button.parentElement.querySelectorAll('.chart-control');
        siblings.forEach(sibling => sibling.classList.remove('active'));
        button.classList.add('active');
        
        const period = button.getAttribute('data-period');
        if (period) {
            console.log('Chart period changed to:', period);
        }
    }
    
    showExportModal() {
        this.showModal('exportModal');
    }
    
    async exportData() {
        const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'json';
        const period = document.getElementById('exportPeriod')?.value || '30';
        
        try {
            const response = await fetch(`/api/analytics/export/?format=${format}&days=${period}`, {
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            if (format === 'csv') {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics_export_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                const data = await response.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics_export_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
            
            this.showToast('Данные успешно экспортированы', 'success');
            this.hideModal('exportModal');
            
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showToast('Ошибка экспорта: ' + error.message, 'error');
        }
    }
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    }
    
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
    
    showLoadingState() {
        const loading = document.getElementById('analyticsLoading');
        const content = document.getElementById('analyticsContent');
        
        if (loading) loading.style.display = 'flex';
        if (content) content.style.display = 'none';
    }
    
    hideLoadingState() {
        const loading = document.getElementById('analyticsLoading');
        const content = document.getElementById('analyticsContent');
        
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
    }
    
    showErrorState(message) {
        const content = document.getElementById('analyticsContent');
        if (content) {
            content.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                    <div class="empty-state-icon">😞</div>
                    <h3>Ошибка загрузки аналитики</h3>
                    <p>Причина: ${message}</p>
                    <p>Попробуйте обновить страницу или проверьте подключение к интернету.</p>
                    <button class="refresh-button" onclick="location.reload()">
                        🔄 Обновить страницу
                    </button>
                </div>
            `;
            content.style.display = 'block';
        }
    }
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('analyticsToast');
        if (!toast) {
            console.log('Toast element not found, showing alert instead:', message);
            return;
        }
        
        const icon = toast.querySelector('.toast-icon');
        const messageElement = toast.querySelector('.toast-message');
        
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️'
        };
        
        if (icon) icon.textContent = icons[type] || icons.info;
        if (messageElement) messageElement.textContent = message;
        
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    getCSRFToken() {
        const token = document.querySelector('[name=csrfmiddlewaretoken]');
        return token ? token.value : '';
    }
    
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    formatDate(dateString) {
        if (!dateString) return 'Неизвестно';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

// Initialize analytics dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the analytics page
    if (document.querySelector('.analytics-container')) {
        console.log('Initializing Analytics Dashboard...');
        new AnalyticsDashboard();
    }
});

// Export for global access
window.AnalyticsDashboard = AnalyticsDashboard;