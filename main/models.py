from django.db import models
from django.contrib.auth.models import User
from django.urls import reverse
import os

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
    
    DIFFICULTY_LEVELS = [
        ('beginner', '🌱 Начальный'),
        ('intermediate', '🌿 Средний'),
        ('advanced', '🌳 Продвинутый'),
        ('expert', '🏆 Экспертный'),
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
    
    # Классификация
    category = models.ForeignKey(MaterialCategory, on_delete=models.SET_NULL, null=True, blank=True)
    difficulty_level = models.CharField(max_length=20, choices=DIFFICULTY_LEVELS, default='beginner')
    tags = models.CharField(max_length=500, blank=True, help_text='Теги через запятую')
    
    # Статистика
    download_count = models.PositiveIntegerField(default=0)
    view_count = models.PositiveIntegerField(default=0)
    rating_sum = models.PositiveIntegerField(default=0)
    rating_count = models.PositiveIntegerField(default=0)
    
    # Настройки доступа
    is_public = models.BooleanField(default=True)
    is_premium = models.BooleanField(default=False)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    
    # Временные метки
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # SEO и превью
    preview_image_path = models.CharField(max_length=500, blank=True)  # Путь к превью изображению
    excerpt = models.CharField(max_length=300, blank=True)  # Краткое описание
    
    class Meta:
        verbose_name = 'Material'
        verbose_name_plural = 'Materials'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['author', '-created_at']),
            models.Index(fields=['category', '-created_at']),
            models.Index(fields=['file_type', '-created_at']),
            models.Index(fields=['-download_count']),
        ]
    
    def __str__(self):
        return self.title
    
    @property
    def average_rating(self):
        """Средний рейтинг материала"""
        if self.rating_count == 0:
            return 0
        return round(self.rating_sum / self.rating_count, 1)
    
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
        return reverse('material_detail', kwargs={'pk': self.pk})

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