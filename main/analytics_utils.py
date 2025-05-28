"""
Утилиты для работы с аналитикой KRONIK
"""

from django.utils import timezone
from django.db.models import Sum, Avg, Count, Q
from datetime import datetime, timedelta
import logging
import json

from .models import (
    VideoAnalytics, ChannelAnalytics, ViewerDemographics, 
    TrafficSource, AnalyticsGoal, AnalyticsAlert,
    VideoView, VideoLike, Subscription
)
from .s3_storage import list_user_videos, get_video_metadata

logger = logging.getLogger(__name__)

class AnalyticsProcessor:
    """Основной класс для обработки аналитики"""
    
    def __init__(self, username):
        self.username = username
    
    def update_daily_analytics(self, date=None):
        """Обновляет ежедневную аналитику"""
        if date is None:
            date = timezone.now().date()
        
        try:
            # Обновляем аналитику канала
            self.update_channel_analytics(date)
            
            # Обновляем аналитику видео
            self.update_videos_analytics(date)
            
            # Обновляем демографию
            self.update_demographics(date)
            
            # Проверяем цели
            self.check_analytics_goals()
            
            # Проверяем алерты
            self.check_analytics_alerts(date)
            
            logger.info(f"Updated analytics for {self.username} on {date}")
            return True
            
        except Exception as e:
            logger.error(f"Error updating analytics for {self.username}: {e}")
            return False
    
    def update_channel_analytics(self, date):
        """Обновляет аналитику канала за день"""
        # Получаем или создаем запись
        analytics, created = ChannelAnalytics.objects.get_or_create(
            channel_owner=self.username,
            date=date,
            defaults={
                'total_views': 0,
                'total_subscribers': 0,
                'new_subscribers': 0,
                'total_videos': 0
            }
        )
        
        # Подсчитываем реальные данные
        # Общие просмотры за день
        daily_views = VideoView.objects.filter(
            video_owner=self.username,
            viewed_at__date=date
        ).count()
        
        # Текущее количество подписчиков
        total_subscribers = Subscription.objects.filter(
            channel_id=self.username
        ).count()
        
        # Новые подписчики за день
        new_subscribers = Subscription.objects.filter(
            channel_id=self.username,
            subscribed_at__date=date
        ).count()
        
        # Общее количество видео
        user_videos = list_user_videos(self.username)
        total_videos = len(user_videos)
        
        # Лайки и дизлайки за день
        daily_likes = VideoLike.objects.filter(
            video_owner=self.username,
            created_at__date=date,
            is_like=True
        ).count()
        
        daily_dislikes = VideoLike.objects.filter(
            video_owner=self.username,
            created_at__date=date,
            is_like=False
        ).count()
        
        # Обновляем данные
        analytics.total_views = daily_views
        analytics.total_subscribers = total_subscribers
        analytics.new_subscribers = new_subscribers
        analytics.total_videos = total_videos
        analytics.total_likes = daily_likes
        analytics.total_dislikes = daily_dislikes
        analytics.save()
        
        return analytics
    
    def update_videos_analytics(self, date):
        """Обновляет аналитику всех видео пользователя"""
        user_videos = list_user_videos(self.username)
        
        for video in user_videos:
            video_id = video.get('video_id')
            if video_id:
                self.update_video_analytics(video_id, date)
    
    def update_video_analytics(self, video_id, date):
        """Обновляет аналитику конкретного видео"""
        analytics, created = VideoAnalytics.objects.get_or_create(
            video_id=video_id,
            video_owner=self.username,
            date=date,
            defaults={
                'views_count': 0,
                'unique_viewers': 0,
                'likes_count': 0,
                'dislikes_count': 0,
                'comments_count': 0
            }
        )
        
        # Подсчитываем реальные данные за день
        daily_views = VideoView.objects.filter(
            video_id=video_id,
            video_owner=self.username,
            viewed_at__date=date
        ).count()
        
        unique_viewers = VideoView.objects.filter(
            video_id=video_id,
            video_owner=self.username,
            viewed_at__date=date
        ).values('user').distinct().count()
        
        daily_likes = VideoLike.objects.filter(
            video_id=video_id,
            video_owner=self.username,
            created_at__date=date,
            is_like=True
        ).count()
        
        daily_dislikes = VideoLike.objects.filter(
            video_id=video_id,
            video_owner=self.username,
            created_at__date=date,
            is_like=False
        ).count()
        
        # Обновляем данные
        analytics.views_count = daily_views
        analytics.unique_viewers = unique_viewers
        analytics.likes_count = daily_likes
        analytics.dislikes_count = daily_dislikes
        analytics.save()
        
        return analytics
    
    def update_demographics(self, date):
        """Обновляет демографические данные"""
        demographics, created = ViewerDemographics.objects.get_or_create(
            channel_owner=self.username,
            date=date,
            defaults={
                'mobile_users': 0,
                'desktop_users': 0,
                'tablet_users': 0,
                'top_country_1': 'Uzbekistan',
                'top_country_1_views': 0,
                'top_country_2': 'Russia',
                'top_country_2_views': 0,
                'top_country_3': 'Kazakhstan',
                'top_country_3_views': 0
            }
        )
        
        # Здесь можно добавить логику сбора демографических данных
        # Пока используем упрощенную версию
        
        return demographics
    
    def check_analytics_goals(self):
        """Проверяет достижение целей аналитики"""
        active_goals = AnalyticsGoal.objects.filter(
            user__username=self.username,
            is_active=True,
            is_achieved=False
        )
        
        for goal in active_goals:
            # Обновляем текущее значение цели
            current_value = self.get_goal_current_value(goal)
            goal.current_value = current_value
            
            # Проверяем достижение
            if goal.check_achievement():
                # Создаем алерт о достижении цели
                self.create_goal_achievement_alert(goal)
            
            goal.save()
    
    def get_goal_current_value(self, goal):
        """Получает текущее значение для цели"""
        goal_type = goal.goal_type
        start_date = goal.start_date
        end_date = min(goal.end_date, timezone.now().date())
        
        if goal_type == 'views':
            return VideoView.objects.filter(
                video_owner=self.username,
                viewed_at__date__gte=start_date,
                viewed_at__date__lte=end_date
            ).count()
        
        elif goal_type == 'subscribers':
            return Subscription.objects.filter(
                channel_id=self.username
            ).count()
        
        elif goal_type == 'engagement':
            # Вычисляем средний коэффициент вовлеченности
            analytics = VideoAnalytics.objects.filter(
                video_owner=self.username,
                date__gte=start_date,
                date__lte=end_date
            ).aggregate(
                total_views=Sum('views_count'),
                total_likes=Sum('likes_count'),
                total_dislikes=Sum('dislikes_count'),
                total_comments=Sum('comments_count')
            )
            
            total_views = analytics['total_views'] or 0
            total_engagements = (
                (analytics['total_likes'] or 0) +
                (analytics['total_dislikes'] or 0) +
                (analytics['total_comments'] or 0)
            )
            
            if total_views > 0:
                return (total_engagements / total_views) * 100
            return 0
        
        elif goal_type == 'watch_time':
            # Приблизительное время просмотра
            return VideoView.objects.filter(
                video_owner=self.username,
                viewed_at__date__gte=start_date,
                viewed_at__date__lte=end_date
            ).count() * 5  # Примерно 5 минут на просмотр
        
        return goal.current_value
    
    def check_analytics_alerts(self, date):
        """Проверяет условия для создания алертов"""
        try:
            # Проверяем резкие изменения в просмотрах
            self.check_views_spike_or_drop(date)
            
            # Проверяем аномалии в вовлеченности
            self.check_engagement_anomalies(date)
            
            # Проверяем вехи (milestones)
            self.check_milestones(date)
            
        except Exception as e:
            logger.error(f"Error checking alerts for {self.username}: {e}")
    
    def check_views_spike_or_drop(self, date):
        """Проверяет резкие изменения в просмотрах"""
        # Получаем данные за последние 7 дней
        last_week = ChannelAnalytics.objects.filter(
            channel_owner=self.username,
            date__gte=date - timedelta(days=7),
            date__lt=date
        ).aggregate(avg_views=Avg('total_views'))
        
        avg_views = last_week['avg_views'] or 0
        
        # Получаем просмотры за сегодня
        today_analytics = ChannelAnalytics.objects.filter(
            channel_owner=self.username,
            date=date
        ).first()
        
        if today_analytics and avg_views > 0:
            today_views = today_analytics.total_views
            change_percent = ((today_views - avg_views) / avg_views) * 100
            
            # Создаем алерт при изменении более чем на 50%
            if abs(change_percent) > 50:
                alert_type = 'spike' if change_percent > 0 else 'drop'
                severity = 'high' if abs(change_percent) > 100 else 'medium'
                
                title = f"{'Резкий рост' if change_percent > 0 else 'Резкое падение'} просмотров"
                message = f"Просмотры {'выросли' if change_percent > 0 else 'упали'} на {abs(change_percent):.1f}% по сравнению со средним значением за неделю"
                
                AnalyticsAlert.objects.create(
                    user_id=self.get_user_id(),
                    alert_type=alert_type,
                    severity=severity,
                    title=title,
                    message=message,
                    related_metric='views',
                    metric_value=today_views
                )
    
    def check_engagement_anomalies(self, date):
        """Проверяет аномалии в вовлеченности"""
        # Аналогично проверке просмотров, но для вовлеченности
        pass
    
    def check_milestones(self, date):
        """Проверяет достижение важных вех"""
        # Получаем общую статистику
        total_subscribers = Subscription.objects.filter(
            channel_id=self.username
        ).count()
        
        total_views = VideoView.objects.filter(
            video_owner=self.username
        ).count()
        
        # Проверяем вехи подписчиков
        subscriber_milestones = [100, 500, 1000, 5000, 10000]
        for milestone in subscriber_milestones:
            if total_subscribers >= milestone:
                # Проверяем, не создавали ли уже этот алерт
                existing_alert = AnalyticsAlert.objects.filter(
                    user_id=self.get_user_id(),
                    alert_type='milestone',
                    related_metric='subscribers',
                    metric_value=milestone
                ).exists()
                
                if not existing_alert:
                    AnalyticsAlert.objects.create(
                        user_id=self.get_user_id(),
                        alert_type='milestone',
                        severity='medium',
                        title=f'Достигнута веха: {milestone} подписчиков!',
                        message=f'Поздравляем! Ваш канал достиг {milestone} подписчиков.',
                        related_metric='subscribers',
                        metric_value=milestone
                    )
        
        # Проверяем вехи просмотров
        views_milestones = [1000, 5000, 10000, 50000, 100000]
        for milestone in views_milestones:
            if total_views >= milestone:
                existing_alert = AnalyticsAlert.objects.filter(
                    user_id=self.get_user_id(),
                    alert_type='milestone',
                    related_metric='views',
                    metric_value=milestone
                ).exists()
                
                if not existing_alert:
                    AnalyticsAlert.objects.create(
                        user_id=self.get_user_id(),
                        alert_type='milestone',
                        severity='medium',
                        title=f'Достигнута веха: {milestone} просмотров!',
                        message=f'Поздравляем! Ваши видео набрали {milestone} просмотров.',
                        related_metric='views',
                        metric_value=milestone
                    )
    
    def create_goal_achievement_alert(self, goal):
        """Создает алерт о достижении цели"""
        if goal.notify_on_achievement:
            AnalyticsAlert.objects.create(
                user=goal.user,
                alert_type='goal_achieved',
                severity='medium',
                title=f'Цель достигнута: {goal.title}',
                message=f'Поздравляем! Вы достигли цели "{goal.title}" со значением {goal.current_value}.',
                related_metric=goal.goal_type,
                metric_value=goal.current_value
            )
    
    def get_user_id(self):
        """Получает ID пользователя по username"""
        from django.contrib.auth.models import User
        try:
            user = User.objects.get(username=self.username)
            return user.id
        except User.DoesNotExist:
            return None

class AnalyticsReportGenerator:
    """Генератор отчетов аналитики"""
    
    def __init__(self, username, start_date, end_date):
        self.username = username
        self.start_date = start_date
        self.end_date = end_date
    
    def generate_comprehensive_report(self):
        """Генерирует комплексный отчет"""
        report_data = {
            'period': {
                'start_date': self.start_date.isoformat(),
                'end_date': self.end_date.isoformat(),
                'days_count': (self.end_date - self.start_date).days + 1
            },
            'summary': self.get_summary_metrics(),
            'videos': self.get_videos_performance(),
            'demographics': self.get_demographics_summary(),
            'traffic': self.get_traffic_summary(),
            'trends': self.get_trends_analysis(),
            'recommendations': self.get_recommendations()
        }
        
        return report_data
    
    def get_summary_metrics(self):
        """Получает сводные метрики"""
        channel_analytics = ChannelAnalytics.objects.filter(
            channel_owner=self.username,
            date__gte=self.start_date,
            date__lte=self.end_date
        )
        
        if not channel_analytics.exists():
            return {}
        
        summary = channel_analytics.aggregate(
            total_views=Sum('total_views'),
            avg_daily_views=Avg('total_views'),
            total_new_subscribers=Sum('new_subscribers'),
            total_likes=Sum('total_likes'),
            total_dislikes=Sum('total_dislikes'),
            total_comments=Sum('total_comments')
        )
        
        # Добавляем вычисленные метрики
        total_engagements = (
            (summary['total_likes'] or 0) +
            (summary['total_dislikes'] or 0) +
            (summary['total_comments'] or 0)
        )
        
        summary['total_engagements'] = total_engagements
        summary['engagement_rate'] = (
            (total_engagements / (summary['total_views'] or 1)) * 100
        )
        
        return summary
    
    def get_videos_performance(self):
        """Получает производительность видео"""
        video_analytics = VideoAnalytics.objects.filter(
            video_owner=self.username,
            date__gte=self.start_date,
            date__lte=self.end_date
        ).values('video_id').annotate(
            total_views=Sum('views_count'),
            total_likes=Sum('likes_count'),
            total_dislikes=Sum('dislikes_count'),
            total_comments=Sum('comments_count'),
            avg_engagement=Avg('views_count')
        ).order_by('-total_views')
        
        # Добавляем метаданные видео
        enriched_videos = []
        for video in video_analytics:
            video_metadata = get_video_metadata(self.username, video['video_id'])
            
            enriched_video = {
                **video,
                'title': video_metadata.get('title', 'Unknown') if video_metadata else 'Unknown',
                'upload_date': video_metadata.get('upload_date', '') if video_metadata else '',
                'engagement_rate': (
                    (video['total_likes'] + video['total_dislikes'] + video['total_comments']) /
                    max(video['total_views'], 1) * 100
                )
            }
            enriched_videos.append(enriched_video)
        
        return enriched_videos[:10]  # Топ 10 видео
    
    def get_demographics_summary(self):
        """Получает сводку по демографии"""
        demographics = ViewerDemographics.objects.filter(
            channel_owner=self.username,
            date__gte=self.start_date,
            date__lte=self.end_date
        ).aggregate(
            total_mobile=Sum('mobile_users'),
            total_desktop=Sum('desktop_users'),
            total_tablet=Sum('tablet_users'),
            total_male=Sum('male_viewers'),
            total_female=Sum('female_viewers')
        )
        
        return demographics
    
    def get_traffic_summary(self):
        """Получает сводку по источникам трафика"""
        traffic = TrafficSource.objects.filter(
            channel_owner=self.username,
            date__gte=self.start_date,
            date__lte=self.end_date
        ).values('source_type').annotate(
            total_views=Sum('views_count'),
            total_visitors=Sum('unique_visitors')
        ).order_by('-total_views')
        
        return list(traffic)
    
    def get_trends_analysis(self):
        """Анализирует тренды"""
        # Сравнение с предыдущим периодом
        period_length = (self.end_date - self.start_date).days + 1
        previous_start = self.start_date - timedelta(days=period_length)
        previous_end = self.start_date - timedelta(days=1)
        
        current_metrics = self.get_summary_metrics()
        
        previous_analytics = ChannelAnalytics.objects.filter(
            channel_owner=self.username,
            date__gte=previous_start,
            date__lte=previous_end
        ).aggregate(
            total_views=Sum('total_views'),
            total_new_subscribers=Sum('new_subscribers'),
            total_likes=Sum('total_likes')
        )
        
        trends = {}
        for metric in ['total_views', 'total_new_subscribers', 'total_likes']:
            current = current_metrics.get(metric, 0) or 0
            previous = previous_analytics.get(metric, 0) or 0
            
            if previous > 0:
                change_percent = ((current - previous) / previous) * 100
            else:
                change_percent = 100 if current > 0 else 0
            
            trends[metric] = {
                'current': current,
                'previous': previous,
                'change_percent': round(change_percent, 1)
            }
        
        return trends
    
    def get_recommendations(self):
        """Генерирует рекомендации"""
        recommendations = []
        
        summary = self.get_summary_metrics()
        engagement_rate = summary.get('engagement_rate', 0)
        
        if engagement_rate < 2:
            recommendations.append({
                'type': 'engagement',
                'title': 'Улучшите вовлеченность',
                'description': 'Ваш коэффициент вовлеченности ниже среднего. Попробуйте задавать вопросы в видео и отвечать на комментарии.'
            })
        
        avg_daily_views = summary.get('avg_daily_views', 0)
        if avg_daily_views < 50:
            recommendations.append({
                'type': 'promotion',
                'title': 'Продвигайте контент',
                'description': 'Делитесь своими видео в социальных сетях и тематических сообществах.'
            })
        
        # Добавляем общие рекомендации
        recommendations.extend([
            {
                'type': 'consistency',
                'title': 'Регулярность загрузок',
                'description': 'Загружайте видео регулярно, чтобы поддерживать интерес аудитории.'
            },
            {
                'type': 'quality',
                'title': 'Качество контента',
                'description': 'Фокусируйтесь на создании полезного и качественного образовательного контента.'
            }
        ])
        
        return recommendations

# Глобальные функции
def update_user_analytics(username, date=None):
    """Обновляет аналитику пользователя"""
    processor = AnalyticsProcessor(username)
    return processor.update_daily_analytics(date)

def generate_user_report(username, start_date, end_date):
    """Генерирует отчет для пользователя"""
    generator = AnalyticsReportGenerator(username, start_date, end_date)
    return generator.generate_comprehensive_report()

def check_all_users_analytics():
    """Проверяет аналитику всех пользователей (для cron задач)"""
    from django.contrib.auth.models import User
    
    authors = User.objects.filter(profile__is_author=True)
    today = timezone.now().date()
    
    for user in authors:
        try:
            update_user_analytics(user.username, today)
        except Exception as e:
            logger.error(f"Error updating analytics for {user.username}: {e}")