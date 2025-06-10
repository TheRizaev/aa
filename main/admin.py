# В main/admin.py
from django.contrib import admin
from .models import Category, Channel, Video, UserProfile, ExpertiseArea, Subscription
from .models import VideoNote
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'is_author', 'author_application_pending', 'date_joined')
    list_filter = ('is_author', 'author_application_pending')
    search_fields = ('user__username', 'user__email')
    filter_horizontal = ('expertise_areas',)
    
    actions = ['approve_author', 'reject_author']
    
    def approve_author(self, request, queryset):
        for profile in queryset:
            profile.is_author = True
            profile.author_application_pending = False
            profile.save()
            
            # Можно добавить отправку уведомления пользователю
            
        self.message_user(request, f"{queryset.count()} заявок на авторство одобрено")
    approve_author.short_description = "Одобрить выбранные заявки на авторство"
    
    def reject_author(self, request, queryset):
        queryset.update(author_application_pending=False)
        self.message_user(request, f"{queryset.count()} заявок на авторство отклонено")
    reject_author.short_description = "Отклонить выбранные заявки на авторство"

class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('subscriber', 'channel_id', 'subscribed_at')
    list_filter = ('subscribed_at',)
    search_fields = ('subscriber__username', 'channel_id')
    date_hierarchy = 'subscribed_at'

admin.site.register(UserProfile, UserProfileAdmin)
admin.site.register(ExpertiseArea)
admin.site.register(Category)
admin.site.register(Channel)
admin.site.register(Video)
admin.site.register(Subscription, SubscriptionAdmin)

@admin.register(VideoNote)
class VideoNoteAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'video_title', 'formatted_timestamp', 'created_at')
    list_filter = ('created_at', 'updated_at')
    search_fields = ('title', 'content', 'video_title', 'user__username')
    readonly_fields = ('created_at', 'updated_at', 'formatted_timestamp', 'video_url')
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('title', 'content', 'user')
        }),
        ('Видео', {
            'fields': ('video_id', 'video_owner', 'video_title', 'timestamp', 'formatted_timestamp', 'video_url')
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def formatted_timestamp(self, obj):
        return obj.format_timestamp()
    formatted_timestamp.short_description = 'Время'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')
    
    def has_change_permission(self, request, obj=None):
        if obj is not None:
            return obj.user == request.user or request.user.is_superuser
        return True
    
    def has_delete_permission(self, request, obj=None):
        if obj is not None:
            return obj.user == request.user or request.user.is_superuser
        return True