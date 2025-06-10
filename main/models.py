from django.db import models
from django.contrib.auth.models import User
from django.urls import reverse
import os
from django.db.models.signals import post_save
from django.dispatch import receiver

class Category(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name

class Channel(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name

class Video(models.Model):
    title = models.CharField(max_length=200)
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    views = models.CharField(max_length=20)
    upload_date = models.DateTimeField(auto_now_add=True)
    age_text = models.CharField(max_length=50)  # "1 неделя назад", и т.д.
    duration = models.CharField(max_length=10)
    # Removed thumbnail field since we're using GCS for storage
    
    def __str__(self):
        return self.title
    
    
class UserProfile(models.Model):
    GENDER_CHOICES = (
        ('M', 'Мужской'),
        ('F', 'Женский'),
    )
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    bio = models.TextField(max_length=500, blank=True)
    # Removed profile_picture since we're using GCS for storage
    date_joined = models.DateTimeField(auto_now_add=True)
    date_of_birth = models.DateField(null=True, blank=True)
    display_name = models.CharField(max_length=50, blank=True, null=True)  # Added display_name field
    email_verified = models.BooleanField(default=False)
    # Добавляем поле для пола
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES, blank=True, null=True)
    
    # Author fields
    is_author = models.BooleanField(default=False)
    author_application_pending = models.BooleanField(default=False)
    expertise_areas = models.ManyToManyField('ExpertiseArea', blank=True, related_name='experts')
    credentials = models.TextField(blank=True, help_text="Education, certificates and experience")
    
    def __str__(self):
        return f'{self.user.username} Profile'
        
    def get_absolute_url(self):
        return reverse('profile')

class VideoLike(models.Model):
    """
    Model to store video likes and dislikes
    
    This model tracks user interactions with videos (likes/dislikes)
    and ensures each user can only have one interaction per video.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='video_likes')
    video_id = models.CharField(max_length=255)
    video_owner = models.CharField(max_length=255)  # Video owner's user_id (renamed from user_id)
    is_like = models.BooleanField()  # True for like, False for dislike
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('user', 'video_id', 'video_owner')
        verbose_name = 'Video Like'
        verbose_name_plural = 'Video Likes'
        
    def __str__(self):
        action = "liked" if self.is_like else "disliked"
        return f"{self.user.username} {action} video {self.video_id} by {self.video_owner}"
    
class VideoView(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)  # Null для неавторизованных
    video_id = models.CharField(max_length=255)  # ID видео в GCS
    video_owner = models.CharField(max_length=255)  # Владелец видео (user_id)
    session_id = models.CharField(max_length=255, null=True, blank=True)  # Для неавторизованных пользователей
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [
            ('user', 'video_id', 'video_owner'),  # Уникальность для авторизованных
            ('session_id', 'video_id', 'video_owner'),  # Уникальность для неавторизованных
        ]
    
class Subscription(models.Model):
    """
    Model to track user subscriptions to channels
    """
    subscriber = models.ForeignKey(User, on_delete=models.CASCADE, related_name='subscriptions')
    channel_id = models.CharField(max_length=255)  # User ID (with @ prefix) of the channel/author
    subscribed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('subscriber', 'channel_id')
        verbose_name = 'Subscription'
        verbose_name_plural = 'Subscriptions'
        
    def __str__(self):
        return f"{self.subscriber.username} subscribed to {self.channel_id}"    

# Add new model for expertise areas
class ExpertiseArea(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    
    def __str__(self):
        return self.name
    
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
import uuid

class AIChatSession(models.Model):
    """Модель для хранения сессий AI чата"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    session_id = models.CharField(max_length=255, null=True, blank=True)  # Для анонимных пользователей
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'AI Chat Session'
        verbose_name_plural = 'AI Chat Sessions'
    
    def __str__(self):
        if self.user:
            return f"Chat session for {self.user.username} - {self.created_at}"
        return f"Anonymous chat session - {self.created_at}"

class AIChatMessage(models.Model):
    """Модель для хранения сообщений AI чата"""
    MESSAGE_TYPES = (
        ('user', 'User Message'),
        ('ai', 'AI Response'),
        ('system', 'System Message'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AIChatSession, on_delete=models.CASCADE, related_name='messages')
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    # Метаданные для AI ответов
    model_used = models.CharField(max_length=50, null=True, blank=True)
    tokens_used = models.IntegerField(null=True, blank=True)
    response_time = models.FloatField(null=True, blank=True)  # В секундах
    
    # Флаги для модерации
    is_flagged = models.BooleanField(default=False)
    flagged_reason = models.CharField(max_length=255, null=True, blank=True)
    
    class Meta:
        ordering = ['timestamp']
        verbose_name = 'AI Chat Message'
        verbose_name_plural = 'AI Chat Messages'
    
    def __str__(self):
        content_preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"{self.message_type}: {content_preview}"

class AIUsageStats(models.Model):
    """Модель для статистики использования AI"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='ai_stats')
    total_messages = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)
    total_sessions = models.IntegerField(default=0)
    
    # Дневные лимиты
    daily_messages = models.IntegerField(default=0)
    daily_tokens = models.IntegerField(default=0)
    last_reset_date = models.DateField(auto_now_add=True)
    
    # Популярные темы (JSON поле)
    popular_topics = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'AI Usage Stats'
        verbose_name_plural = 'AI Usage Stats'
    
    def __str__(self):
        return f"AI Stats for {self.user.username}"
    
    def reset_daily_limits(self):
        """Сброс дневных лимитов"""
        today = timezone.now().date()
        if self.last_reset_date < today:
            self.daily_messages = 0
            self.daily_tokens = 0
            self.last_reset_date = today
            self.save()
    
    def can_send_message(self, daily_limit=100):
        """Проверка возможности отправки сообщения"""
        self.reset_daily_limits()
        return self.daily_messages < daily_limit
    
    def increment_usage(self, tokens_used=0):
        """Увеличение счетчиков использования"""
        self.total_messages += 1
        self.daily_messages += 1
        self.total_tokens += tokens_used
        self.daily_tokens += tokens_used
        self.save()

class AIFeedback(models.Model):
    """Модель для обратной связи по AI ответам"""
    FEEDBACK_TYPES = (
        ('like', 'Like'),
        ('dislike', 'Dislike'),
        ('report', 'Report Issue'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(AIChatMessage, on_delete=models.CASCADE, related_name='feedback')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    feedback_type = models.CharField(max_length=10, choices=FEEDBACK_TYPES)
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('message', 'user')
        verbose_name = 'AI Feedback'
        verbose_name_plural = 'AI Feedback'
    
    def __str__(self):
        return f"{self.feedback_type} feedback from {self.user.username}"
    
class ChatHistory(models.Model):
    """Модель для хранения истории чата пользователя"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_history')
    message = models.TextField()
    response = models.TextField()
    is_voice = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Метаданные
    model_used = models.CharField(max_length=50, default='gpt-3.5-turbo')
    tokens_used = models.IntegerField(null=True, blank=True)
    response_time = models.FloatField(null=True, blank=True)  # В секундах
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Chat History'
        verbose_name_plural = 'Chat Histories'
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]
    
    def __str__(self):
        message_preview = self.message[:50] + "..." if len(self.message) > 50 else self.message
        return f"{self.user.username}: {message_preview}"
    
    @classmethod
    def get_recent_history(cls, user, limit=100):
        """Получить последние сообщения пользователя для отображения в интерфейсе"""
        return cls.objects.filter(user=user).order_by('-created_at')[:limit]
    
    @classmethod
    def get_context_for_ai(cls, user, limit=10):
        """
        Получить контекст для AI (последние сообщения в формате для OpenAI)
        Возвращает только последние 10 пар сообщений для контекста
        """
        recent_messages = cls.objects.filter(
            user=user
        ).order_by('-created_at')[:limit]
        
        # Преобразуем в формат для OpenAI API (в обратном порядке для хронологии)
        context = []
        for chat in reversed(recent_messages):
            context.append({"role": "user", "content": chat.message})
            context.append({"role": "assistant", "content": chat.response})
        
        return context
    
    @classmethod
    def cleanup_old_messages(cls, user, keep_last=100):
        """
        Удалить старые сообщения, оставив только последние 100
        Это поддерживает историю в разумных пределах
        """
        try:
            # Получаем ID сообщений, которые нужно оставить
            messages_to_keep = cls.objects.filter(
                user=user
            ).order_by('-created_at')[:keep_last].values_list('id', flat=True)
            
            # Удаляем все остальные сообщения
            deleted_count = cls.objects.filter(
                user=user
            ).exclude(id__in=list(messages_to_keep)).delete()[0]
            
            return deleted_count
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error cleaning up old messages for user {user.username}: {e}")
            return 0
    
    @classmethod
    def get_user_stats(cls, user):
        """Получить статистику использования чата пользователем"""
        from datetime import datetime, timedelta
        
        total_messages = cls.objects.filter(user=user).count()
        
        # Сообщения за последние 7 дней
        week_ago = datetime.now() - timedelta(days=7)
        recent_messages = cls.objects.filter(
            user=user,
            created_at__gte=week_ago
        ).count()
        
        # Средняя длина ответов
        responses = cls.objects.filter(user=user).values_list('response', flat=True)
        avg_response_length = sum(len(r) for r in responses) / len(responses) if responses else 0
        
        return {
            'total_messages': total_messages,
            'recent_messages': recent_messages,
            'avg_response_length': round(avg_response_length, 1)
        }

class ChatSession(models.Model):
    """Модель для группировки сообщений в сессии"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    session_name = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-last_activity']
        verbose_name = 'Chat Session'
        verbose_name_plural = 'Chat Sessions'
    
    def __str__(self):
        return f"{self.user.username} - {self.session_name or 'Session'} ({self.created_at.date()})"
    
    def get_messages_count(self):
        return self.chat_messages.count()
    
    def get_last_message_time(self):
        last_message = self.chat_messages.order_by('-created_at').first()
        return last_message.created_at if last_message else self.created_at

class ChatMessage(models.Model):
    """Детальная модель для сообщений в сессии"""
    
    MESSAGE_TYPES = (
        ('user', 'User Message'),
        ('assistant', 'AI Response'),
        ('system', 'System Message'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='chat_messages')
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Метаданные для AI сообщений
    model_used = models.CharField(max_length=50, null=True, blank=True)
    tokens_used = models.IntegerField(null=True, blank=True)
    response_time = models.FloatField(null=True, blank=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = 'Chat Message'
        verbose_name_plural = 'Chat Messages'
    
    def __str__(self):
        content_preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"{self.message_type}: {content_preview}"
    

class MaterialCategory(models.Model):
    """Категории материалов"""
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=50, default='📚')  # Эмодзи иконка
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Material Category'
        verbose_name_plural = 'Material Categories'
        ordering = ['name']
    
    def __str__(self):
        return self.name

class Material(models.Model):
    """Учебные материалы (книги, PDF, документы и т.д.)"""
    
    MATERIAL_TYPES = [
        ('book', '📚 Книга'),
        ('pdf', '📄 PDF документ'),
        ('presentation', '📊 Презентация'),
        ('document', '📝 Документ'),
        ('archive', '📦 Архив'),
        ('spreadsheet', '📈 Таблица'),
        ('image', '🖼️ Изображение'),
        ('audio', '🎵 Аудио'),
        ('other', '📎 Другое'),
    ]
    
    # Основная информация
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200, verbose_name='Название')
    description = models.TextField(verbose_name='Описание')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='materials')
    
    # Файл и метаданные
    file_path = models.CharField(max_length=500)  # Путь в S3
    file_name = models.CharField(max_length=255)  # Оригинальное имя файла
    file_size = models.BigIntegerField()  # Размер в байтах
    file_type = models.CharField(max_length=20, choices=MATERIAL_TYPES)
    mime_type = models.CharField(max_length=100)
    
    # Статистика
    download_count = models.PositiveIntegerField(default=0)
    
    # Временные метки
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Material'
        verbose_name_plural = 'Materials'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['author', '-created_at']),
            models.Index(fields=['file_type', '-created_at']),
            models.Index(fields=['-download_count']),
        ]
    
    def __str__(self):
        return self.title
    
    @property
    def formatted_file_size(self):
        """Отформатированный размер файла"""
        size = self.file_size
        for unit in ['Б', 'КБ', 'МБ', 'ГБ']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} ТБ"
    
    @property
    def file_extension(self):
        """Расширение файла"""
        return os.path.splitext(self.file_name)[1].lower()
    
    def get_absolute_url(self):
        return reverse('material_detail', kwargs={'material_id': f"{self.author.username}__{self.id}"})

class MaterialDownload(models.Model):
    """История скачиваний материалов"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='material_downloads')
    material = models.ForeignKey(Material, on_delete=models.CASCADE, related_name='downloads')
    downloaded_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    
    class Meta:
        verbose_name = 'Material Download'
        verbose_name_plural = 'Material Downloads'
        ordering = ['-downloaded_at']
        unique_together = ('user', 'material')  # Каждый пользователь может скачать материал только один раз
    
    def __str__(self):
        return f"{self.user.username} downloaded {self.material.title}"

class MaterialRating(models.Model):
    """Рейтинги материалов"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    material = models.ForeignKey(Material, on_delete=models.CASCADE, related_name='ratings')
    rating = models.PositiveSmallIntegerField(choices=[(i, i) for i in range(1, 6)])  # 1-5 звезд
    review = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('user', 'material')
        verbose_name = 'Material Rating'
        verbose_name_plural = 'Material Ratings'
    
    def __str__(self):
        return f"{self.user.username} rated {self.material.title}: {self.rating}/5"

class MaterialCollection(models.Model):
    """Коллекции материалов (папки пользователя)"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='material_collections')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    materials = models.ManyToManyField(Material, blank=True)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Material Collection'
        verbose_name_plural = 'Material Collections'
        ordering = ['-updated_at']
        unique_together = ('user', 'name')
    
    def __str__(self):
        return f"{self.user.username} - {self.name}"
    
    @property
    def materials_count(self):
        return self.materials.count()






# Добавьте эти модели в main/models.py

from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import datetime, timedelta
import uuid

class AnalyticsSession(models.Model):
    """
    Модель для отслеживания сессий аналитики
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='analytics_sessions')
    session_start = models.DateTimeField(auto_now_add=True)
    session_end = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    
    # Данные сессии
    pages_viewed = models.PositiveIntegerField(default=0)
    total_time_spent = models.DurationField(default=timedelta(0))
    
    class Meta:
        verbose_name = 'Analytics Session'
        verbose_name_plural = 'Analytics Sessions'
        ordering = ['-session_start']
    
    def __str__(self):
        return f"Analytics session for {self.user.username} - {self.session_start}"

class VideoAnalytics(models.Model):
    """
    Детальная аналитика по видео
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    video_id = models.CharField(max_length=255)  # ID видео в GCS
    video_owner = models.CharField(max_length=255)  # Владелец видео
    
    # Ежедневная статистика
    date = models.DateField()
    views_count = models.PositiveIntegerField(default=0)
    unique_viewers = models.PositiveIntegerField(default=0)
    likes_count = models.PositiveIntegerField(default=0)
    dislikes_count = models.PositiveIntegerField(default=0)
    comments_count = models.PositiveIntegerField(default=0)
    shares_count = models.PositiveIntegerField(default=0)
    
    # Время просмотра
    total_watch_time = models.DurationField(default=timedelta(0))
    average_watch_time = models.DurationField(default=timedelta(0))
    
    # Источники трафика
    direct_traffic = models.PositiveIntegerField(default=0)
    search_traffic = models.PositiveIntegerField(default=0)
    social_traffic = models.PositiveIntegerField(default=0)
    external_traffic = models.PositiveIntegerField(default=0)
    
    # Демографические данные
    mobile_views = models.PositiveIntegerField(default=0)
    desktop_views = models.PositiveIntegerField(default=0)
    tablet_views = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('video_id', 'video_owner', 'date')
        verbose_name = 'Video Analytics'
        verbose_name_plural = 'Video Analytics'
        ordering = ['-date']
        indexes = [
            models.Index(fields=['video_owner', '-date']),
            models.Index(fields=['video_id', '-date']),
        ]
    
    def __str__(self):
        return f"Analytics for {self.video_id} on {self.date}"
    
    @property
    def engagement_rate(self):
        """Вычисляет коэффициент вовлеченности"""
        if self.views_count == 0:
            return 0
        total_engagements = self.likes_count + self.dislikes_count + self.comments_count
        return (total_engagements / self.views_count) * 100
    
    @property
    def retention_rate(self):
        """Вычисляет коэффициент удержания зрителей"""
        if self.views_count == 0:
            return 0
        # Упрощенный расчет - можно улучшить с реальными данными времени просмотра
        return min((self.total_watch_time.total_seconds() / 60) / self.views_count, 100)

class ChannelAnalytics(models.Model):
    """
    Аналитика канала по дням
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    channel_owner = models.CharField(max_length=255)  # Владелец канала
    
    # Дата аналитики
    date = models.DateField()
    
    # Основные метрики
    total_views = models.PositiveIntegerField(default=0)
    total_subscribers = models.PositiveIntegerField(default=0)
    new_subscribers = models.IntegerField(default=0)  # Может быть отрицательным
    total_videos = models.PositiveIntegerField(default=0)
    
    # Вовлеченность
    total_likes = models.PositiveIntegerField(default=0)
    total_dislikes = models.PositiveIntegerField(default=0)
    total_comments = models.PositiveIntegerField(default=0)
    total_shares = models.PositiveIntegerField(default=0)
    
    # Время просмотра
    total_watch_time = models.DurationField(default=timedelta(0))
    average_session_duration = models.DurationField(default=timedelta(0))
    
    # Доходы (для будущей монетизации)
    estimated_revenue = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    ad_revenue = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('channel_owner', 'date')
        verbose_name = 'Channel Analytics'
        verbose_name_plural = 'Channel Analytics'
        ordering = ['-date']
        indexes = [
            models.Index(fields=['channel_owner', '-date']),
        ]
    
    def __str__(self):
        return f"Channel analytics for {self.channel_owner} on {self.date}"
    
    @property
    def engagement_rate(self):
        """Общий коэффициент вовлеченности канала"""
        if self.total_views == 0:
            return 0
        total_engagements = self.total_likes + self.total_dislikes + self.total_comments
        return (total_engagements / self.total_views) * 100

class ViewerDemographics(models.Model):
    """
    Демографические данные зрителей
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    channel_owner = models.CharField(max_length=255)
    date = models.DateField()
    
    # Возрастные группы
    age_13_17 = models.PositiveIntegerField(default=0)
    age_18_24 = models.PositiveIntegerField(default=0)
    age_25_34 = models.PositiveIntegerField(default=0)
    age_35_44 = models.PositiveIntegerField(default=0)
    age_45_54 = models.PositiveIntegerField(default=0)
    age_55_64 = models.PositiveIntegerField(default=0)
    age_65_plus = models.PositiveIntegerField(default=0)
    
    # Пол
    male_viewers = models.PositiveIntegerField(default=0)
    female_viewers = models.PositiveIntegerField(default=0)
    other_gender = models.PositiveIntegerField(default=0)
    
    # Устройства
    mobile_users = models.PositiveIntegerField(default=0)
    desktop_users = models.PositiveIntegerField(default=0)
    tablet_users = models.PositiveIntegerField(default=0)
    smart_tv_users = models.PositiveIntegerField(default=0)
    
    # География (топ страны)
    top_country_1 = models.CharField(max_length=100, default='Uzbekistan')
    top_country_1_views = models.PositiveIntegerField(default=0)
    top_country_2 = models.CharField(max_length=100, default='Russia')
    top_country_2_views = models.PositiveIntegerField(default=0)
    top_country_3 = models.CharField(max_length=100, default='Kazakhstan')
    top_country_3_views = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('channel_owner', 'date')
        verbose_name = 'Viewer Demographics'
        verbose_name_plural = 'Viewer Demographics'
        ordering = ['-date']
    
    def __str__(self):
        return f"Demographics for {self.channel_owner} on {self.date}"

class TrafficSource(models.Model):
    """
    Источники трафика
    """
    SOURCE_TYPES = [
        ('direct', 'Прямой переход'),
        ('search', 'Поисковые системы'),
        ('social', 'Социальные сети'),
        ('external', 'Внешние сайты'),
        ('kronik_home', 'Главная KRONIK'),
        ('kronik_search', 'Поиск KRONIK'),
        ('subscriptions', 'Подписки'),
        ('notifications', 'Уведомления'),
        ('email', 'Email'),
        ('other', 'Другое'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    video_id = models.CharField(max_length=255, null=True, blank=True)  # Если для конкретного видео
    channel_owner = models.CharField(max_length=255)
    date = models.DateField()
    
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
    source_name = models.CharField(max_length=255)  # Конкретное название (Google, VK, etc.)
    views_count = models.PositiveIntegerField(default=0)
    unique_visitors = models.PositiveIntegerField(default=0)
    
    # Дополнительные метрики
    bounce_rate = models.FloatField(default=0.0)  # Процент отказов
    average_session_duration = models.DurationField(default=timedelta(0))
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Traffic Source'
        verbose_name_plural = 'Traffic Sources'
        ordering = ['-date', '-views_count']
        indexes = [
            models.Index(fields=['channel_owner', '-date']),
            models.Index(fields=['video_id', '-date']),
        ]
    
    def __str__(self):
        return f"{self.source_name} ({self.source_type}) - {self.views_count} views"

class AnalyticsReport(models.Model):
    """
    Сохраненные отчеты аналитики
    """
    REPORT_TYPES = [
        ('daily', 'Ежедневный'),
        ('weekly', 'Еженедельный'),
        ('monthly', 'Ежемесячный'),
        ('quarterly', 'Квартальный'),
        ('yearly', 'Годовой'),
        ('custom', 'Пользовательский'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='analytics_reports')
    
    title = models.CharField(max_length=255)
    report_type = models.CharField(max_length=20, choices=REPORT_TYPES)
    
    # Период отчета
    start_date = models.DateField()
    end_date = models.DateField()
    
    # Данные отчета (JSON)
    report_data = models.JSONField(default=dict)
    
    # Настройки отчета
    include_videos = models.BooleanField(default=True)
    include_demographics = models.BooleanField(default=True)
    include_traffic = models.BooleanField(default=True)
    include_revenue = models.BooleanField(default=False)
    
    # Автоматическая генерация
    is_automated = models.BooleanField(default=False)
    next_generation_date = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Analytics Report'
        verbose_name_plural = 'Analytics Reports'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} ({self.report_type}) - {self.user.username}"
    
    def generate_report_data(self):
        """Генерирует данные отчета"""
        # Здесь будет логика генерации отчета
        # Пока заглушка
        self.report_data = {
            'generated_at': timezone.now().isoformat(),
            'period': f"{self.start_date} - {self.end_date}",
            'summary': {},
            'details': {}
        }
        self.save()

class AnalyticsGoal(models.Model):
    """
    Цели аналитики
    """
    GOAL_TYPES = [
        ('views', 'Просмотры'),
        ('subscribers', 'Подписчики'),
        ('engagement', 'Вовлеченность'),
        ('watch_time', 'Время просмотра'),
        ('revenue', 'Доход'),
        ('custom', 'Пользовательская'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='analytics_goals')
    
    title = models.CharField(max_length=255)
    goal_type = models.CharField(max_length=20, choices=GOAL_TYPES)
    target_value = models.FloatField()  # Целевое значение
    current_value = models.FloatField(default=0.0)  # Текущее значение
    
    # Период цели
    start_date = models.DateField()
    end_date = models.DateField()
    
    # Статус
    is_active = models.BooleanField(default=True)
    is_achieved = models.BooleanField(default=False)
    achievement_date = models.DateTimeField(null=True, blank=True)
    
    # Уведомления
    notify_on_progress = models.BooleanField(default=True)
    notify_on_achievement = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Analytics Goal'
        verbose_name_plural = 'Analytics Goals'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} - {self.current_value}/{self.target_value}"
    
    @property
    def progress_percentage(self):
        """Процент достижения цели"""
        if self.target_value == 0:
            return 0
        return min((self.current_value / self.target_value) * 100, 100)
    
    def check_achievement(self):
        """Проверяет, достигнута ли цель"""
        if not self.is_achieved and self.current_value >= self.target_value:
            self.is_achieved = True
            self.achievement_date = timezone.now()
            self.save()
            return True
        return False

class AnalyticsAlert(models.Model):
    """
    Алерты и уведомления аналитики
    """
    ALERT_TYPES = [
        ('spike', 'Резкий рост'),
        ('drop', 'Резкое падение'),
        ('goal_achieved', 'Цель достигнута'),
        ('threshold', 'Превышен порог'),
        ('anomaly', 'Аномалия'),
        ('milestone', 'Веха'),
    ]
    
    SEVERITY_LEVELS = [
        ('low', 'Низкая'),
        ('medium', 'Средняя'),
        ('high', 'Высокая'),
        ('critical', 'Критическая'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='analytics_alerts')
    
    alert_type = models.CharField(max_length=20, choices=ALERT_TYPES)
    severity = models.CharField(max_length=10, choices=SEVERITY_LEVELS, default='medium')
    
    title = models.CharField(max_length=255)
    message = models.TextField()
    
    # Связанные данные
    related_video_id = models.CharField(max_length=255, null=True, blank=True)
    related_metric = models.CharField(max_length=100, null=True, blank=True)
    metric_value = models.FloatField(null=True, blank=True)
    
    # Статус
    is_read = models.BooleanField(default=False)
    is_dismissed = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Analytics Alert'
        verbose_name_plural = 'Analytics Alerts'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} ({self.severity}) - {self.user.username}"
    
    def mark_as_read(self):
        """Отмечает алерт как прочитанный"""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save()

# Функции для автоматического создания аналитики
def create_daily_analytics(channel_owner, date=None):
    """
    Создает ежедневную аналитику для канала
    """
    if date is None:
        date = timezone.now().date()
    
    # Получаем или создаем запись
    analytics, created = ChannelAnalytics.objects.get_or_create(
        channel_owner=channel_owner,
        date=date,
        defaults={
            'total_views': 0,
            'total_subscribers': 0,
            'new_subscribers': 0,
            'total_videos': 0
        }
    )
    
    return analytics

def update_video_analytics(video_id, video_owner, date=None):
    """
    Обновляет аналитику видео
    """
    if date is None:
        date = timezone.now().date()
    
    analytics, created = VideoAnalytics.objects.get_or_create(
        video_id=video_id,
        video_owner=video_owner,
        date=date,
        defaults={
            'views_count': 0,
            'unique_viewers': 0,
            'likes_count': 0,
            'dislikes_count': 0,
            'comments_count': 0
        }
    )
    
    return analytics


class VideoNote(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='video_notes')
    video_id = models.CharField(max_length=255)  # GCS video ID
    video_owner = models.CharField(max_length=255)  # User ID владельца видео
    video_title = models.CharField(max_length=500, blank=True)  # Для удобства
    title = models.CharField(max_length=200)  # Название заметки
    content = models.TextField(blank=True)  # Содержание заметки (опционально)
    timestamp = models.IntegerField()  # Время в секундах
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'video_id']),
            models.Index(fields=['user', 'created_at']),
        ]

    def __str__(self):
        return f"{self.title} - {self.user.username} ({self.format_timestamp()})"

    def format_timestamp(self):
        """Форматирует timestamp в формат MM:SS или HH:MM:SS"""
        hours = self.timestamp // 3600
        minutes = (self.timestamp % 3600) // 60
        seconds = self.timestamp % 60
        
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        else:
            return f"{minutes:02d}:{seconds:02d}"

    @property
    def video_url(self):
        """Возвращает URL видео с таймкодом"""
        return f"/video/{self.video_owner}__{self.video_id}/?t={self.timestamp}"
    
class NotificationType(models.TextChoices):
    """Типы уведомлений"""
    NEW_VIDEO = 'new_video', 'Новое видео'
    NEW_MATERIAL = 'new_material', 'Новый материал'
    COMMENT_REPLY = 'comment_reply', 'Ответ на комментарий'
    COMMENT_LIKE = 'comment_like', 'Лайк на комментарий'
    VIDEO_LIKE = 'video_like', 'Лайк на видео'
    NEW_SUBSCRIBER = 'new_subscriber', 'Новый подписчик'
    MENTION = 'mention', 'Упоминание'
    SYSTEM = 'system', 'Системное уведомление'

class Notification(models.Model):
    """Модель для уведомлений"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    
    # Тип уведомления
    notification_type = models.CharField(max_length=20, choices=NotificationType.choices)
    
    # Основная информация
    title = models.CharField(max_length=255)
    message = models.TextField()
    
    # Связанные объекты (опционально)
    from_user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='sent_notifications')
    video_id = models.CharField(max_length=255, null=True, blank=True)
    video_owner = models.CharField(max_length=255, null=True, blank=True)
    material_id = models.CharField(max_length=255, null=True, blank=True)
    comment_id = models.CharField(max_length=255, null=True, blank=True)
    
    # Дополнительные данные (JSON)
    extra_data = models.JSONField(default=dict, blank=True)
    
    # Статус
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Ссылка для перехода
    action_url = models.CharField(max_length=500, null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['user', 'is_read']),
            models.Index(fields=['notification_type', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.title}"
    
    def mark_as_read(self):
        """Отмечает уведомление как прочитанное"""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])
    
    @property
    def time_since_created(self):
        """Возвращает время с момента создания в удобном формате"""
        now = timezone.now()
        diff = now - self.created_at
        
        if diff.seconds < 60:
            return "только что"
        elif diff.seconds < 3600:
            minutes = diff.seconds // 60
            return f"{minutes} мин назад"
        elif diff.days == 0:
            hours = diff.seconds // 3600
            return f"{hours} ч назад"
        elif diff.days == 1:
            return "вчера"
        elif diff.days < 7:
            return f"{diff.days} дн назад"
        elif diff.days < 30:
            weeks = diff.days // 7
            return f"{weeks} нед назад"
        else:
            return self.created_at.strftime("%d.%m.%Y")
    
    @classmethod
    def get_unread_count(cls, user):
        """Получает количество непрочитанных уведомлений для пользователя"""
        return cls.objects.filter(user=user, is_read=False).count()
    
    @classmethod
    def mark_all_as_read(cls, user):
        """Отмечает все уведомления пользователя как прочитанные"""
        return cls.objects.filter(user=user, is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )

class NotificationSettings(models.Model):
    """Настройки уведомлений пользователя"""
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='notification_settings')
    
    # Настройки для разных типов уведомлений
    new_videos_enabled = models.BooleanField(default=True)
    new_materials_enabled = models.BooleanField(default=True)
    comment_replies_enabled = models.BooleanField(default=True)
    comment_likes_enabled = models.BooleanField(default=True)
    video_likes_enabled = models.BooleanField(default=True)
    new_subscribers_enabled = models.BooleanField(default=True)
    mentions_enabled = models.BooleanField(default=True)
    system_notifications_enabled = models.BooleanField(default=True)
    
    # Email уведомления
    email_notifications_enabled = models.BooleanField(default=False)
    email_frequency = models.CharField(
        max_length=20,
        choices=[
            ('instant', 'Мгновенно'),
            ('daily', 'Ежедневно'),
            ('weekly', 'Еженедельно'),
            ('never', 'Никогда'),
        ],
        default='never'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Notification Settings'
        verbose_name_plural = 'Notification Settings'
    
    def __str__(self):
        return f"Notification settings for {self.user.username}"
    
    def is_enabled_for_type(self, notification_type):
        """Проверяет, включены ли уведомления данного типа"""
        type_mapping = {
            NotificationType.NEW_VIDEO: self.new_videos_enabled,
            NotificationType.NEW_MATERIAL: self.new_materials_enabled,
            NotificationType.COMMENT_REPLY: self.comment_replies_enabled,
            NotificationType.COMMENT_LIKE: self.comment_likes_enabled,
            NotificationType.VIDEO_LIKE: self.video_likes_enabled,
            NotificationType.NEW_SUBSCRIBER: self.new_subscribers_enabled,
            NotificationType.MENTION: self.mentions_enabled,
            NotificationType.SYSTEM: self.system_notifications_enabled,
        }
        return type_mapping.get(notification_type, True)

# Сигналы для автоматического создания настроек уведомлений
@receiver(post_save, sender=User)
def create_notification_settings(sender, instance, created, **kwargs):
    """Создает настройки уведомлений для нового пользователя"""
    if created:
        NotificationSettings.objects.create(user=instance)
        
# Функции для создания уведомлений
def create_notification(user, notification_type, title, message, **kwargs):
    """
    Универсальная функция для создания уведомлений
    
    Args:
        user: Пользователь, которому отправляется уведомление
        notification_type: Тип уведомления (из NotificationType)
        title: Заголовок уведомления
        message: Текст уведомления
        **kwargs: Дополнительные параметры (from_user, video_id, action_url и т.д.)
    """
    # Проверяем настройки пользователя
    settings, created = NotificationSettings.objects.get_or_create(user=user)
    
    if not settings.is_enabled_for_type(notification_type):
        return None
    
    notification = Notification.objects.create(
        user=user,
        notification_type=notification_type,
        title=title,
        message=message,
        **kwargs
    )
    
    return notification

def notify_new_video(video_owner, video_id, video_title):
    """Уведомление о новом видео для подписчиков"""
    from .models import Subscription
    
    subscribers = Subscription.objects.filter(channel_id=video_owner).select_related('subscriber')
    
    for subscription in subscribers:
        create_notification(
            user=subscription.subscriber,
            notification_type=NotificationType.NEW_VIDEO,
            title="Новое видео",
            message=f"На канале появилось новое видео: {video_title}",
            from_user=subscription.subscriber.objects.filter(username=video_owner.replace('@', '')).first(),
            video_id=video_id,
            video_owner=video_owner,
            action_url=f"/video/{video_owner}__{video_id}/",
            extra_data={'video_title': video_title}
        )

def notify_new_material(material_owner, material_id, material_title):
    """Уведомление о новом материале для подписчиков"""
    from .models import Subscription
    
    subscribers = Subscription.objects.filter(channel_id=material_owner).select_related('subscriber')
    
    for subscription in subscribers:
        create_notification(
            user=subscription.subscriber,
            notification_type=NotificationType.NEW_MATERIAL,
            title="Новый материал",
            message=f"На канале появился новый материал: {material_title}",
            from_user=subscription.subscriber.objects.filter(username=material_owner.replace('@', '')).first(),
            material_id=material_id,
            action_url=f"/library/material/{material_owner}__{material_id}/",
            extra_data={'material_title': material_title}
        )

def notify_comment_reply(comment_owner, reply_author, video_id, video_owner, reply_text):
    """Уведомление об ответе на комментарий"""
    if comment_owner == reply_author:
        return  # Не уведомляем о собственных ответах
    
    create_notification(
        user=comment_owner,
        notification_type=NotificationType.COMMENT_REPLY,
        title="Ответ на комментарий",
        message=f"{reply_author.profile.display_name or reply_author.username} ответил на ваш комментарий",
        from_user=reply_author,
        video_id=video_id,
        video_owner=video_owner,
        action_url=f"/video/{video_owner}__{video_id}/",
        extra_data={'reply_text': reply_text[:100]}
    )

def notify_comment_like(comment_owner, liker, video_id, video_owner):
    """Уведомление о лайке комментария"""
    if comment_owner == liker:
        return  # Не уведомляем о собственных лайках
    
    create_notification(
        user=comment_owner,
        notification_type=NotificationType.COMMENT_LIKE,
        title="Лайк на комментарий",
        message=f"{liker.profile.display_name or liker.username} оценил ваш комментарий",
        from_user=liker,
        video_id=video_id,
        video_owner=video_owner,
        action_url=f"/video/{video_owner}__{video_id}/"
    )

def notify_video_like(video_owner_username, liker, video_id, video_title):
    """Уведомление о лайке видео"""
    try:
        video_owner = User.objects.get(username=video_owner_username.replace('@', ''))
        if video_owner == liker:
            return  # Не уведомляем о собственных лайках
        
        create_notification(
            user=video_owner,
            notification_type=NotificationType.VIDEO_LIKE,
            title="Лайк на видео",
            message=f"{liker.profile.display_name or liker.username} оценил ваше видео: {video_title}",
            from_user=liker,
            video_id=video_id,
            video_owner=video_owner_username,
            action_url=f"/video/{video_owner_username}__{video_id}/",
            extra_data={'video_title': video_title}
        )
    except User.DoesNotExist:
        pass

def notify_new_subscriber(channel_owner_username, subscriber):
    """Уведомление о новом подписчике"""
    try:
        channel_owner = User.objects.get(username=channel_owner_username.replace('@', ''))
        
        create_notification(
            user=channel_owner,
            notification_type=NotificationType.NEW_SUBSCRIBER,
            title="Новый подписчик",
            message=f"{subscriber.profile.display_name or subscriber.username} подписался на ваш канал",
            from_user=subscriber,
            action_url=f"/channel/{channel_owner_username}/",
            extra_data={'subscriber_name': subscriber.profile.display_name or subscriber.username}
        )
    except User.DoesNotExist:
        pass