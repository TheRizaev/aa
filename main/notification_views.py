from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.core.paginator import Paginator
from django.utils import timezone
import json
import logging

logger = logging.getLogger(__name__)

@login_required
@require_http_methods(["GET"])
def get_notifications(request):
    """
    API для получения уведомлений пользователя
    """
    try:
        from .models import Notification
        
        # Получаем параметры пагинации
        try:
            offset = int(request.GET.get('offset', 0))
        except (ValueError, TypeError):
            offset = 0
            
        try:
            limit = int(request.GET.get('limit', 20))
        except (ValueError, TypeError):
            limit = 20
        
        # Максимум 50 уведомлений за запрос
        limit = min(limit, 50)
        
        # Получаем уведомления пользователя
        notifications_query = Notification.objects.filter(
            user=request.user
        ).order_by('-created_at')
        
        # Применяем пагинацию
        total_count = notifications_query.count()
        notifications = notifications_query[offset:offset + limit]
        
        # Подготавливаем данные для фронтенда
        notifications_data = []
        for notification in notifications:
            # Получаем информацию об отправителе
            from_user_data = None
            if notification.from_user:
                try:
                    from .s3_storage import get_user_profile_from_gcs
                    profile = get_user_profile_from_gcs(notification.from_user.username)
                    from_user_data = {
                        'username': notification.from_user.username,
                        'display_name': profile.get('display_name') if profile else notification.from_user.username,
                        'avatar_url': profile.get('avatar_url') if profile else None
                    }
                except Exception as e:
                    logger.error(f"Error getting user profile for notification: {e}")
                    from_user_data = {
                        'username': notification.from_user.username,
                        'display_name': notification.from_user.username,
                        'avatar_url': None
                    }
            
            notification_data = {
                'id': str(notification.id),
                'type': notification.notification_type,
                'title': notification.title,
                'message': notification.message,
                'is_read': notification.is_read,
                'created_at': notification.created_at.isoformat(),
                'time_since_created': notification.time_since_created,
                'action_url': notification.action_url,
                'from_user': from_user_data,
                'extra_data': notification.extra_data
            }
            
            notifications_data.append(notification_data)
        
        # Получаем количество непрочитанных уведомлений
        unread_count = Notification.get_unread_count(request.user)
        
        return JsonResponse({
            'success': True,
            'notifications': notifications_data,
            'total_count': total_count,
            'unread_count': unread_count,
            'has_more': offset + limit < total_count
        })
        
    except Exception as e:
        logger.error(f"Error getting notifications: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e),
            'notifications': [],
            'total_count': 0,
            'unread_count': 0,
            'has_more': False
        }, status=500)

@login_required
@require_http_methods(["GET"])
def get_unread_count(request):
    """
    API для получения количества непрочитанных уведомлений
    """
    try:
        from .models import Notification
        
        unread_count = Notification.get_unread_count(request.user)
        
        return JsonResponse({
            'success': True,
            'unread_count': unread_count
        })
        
    except Exception as e:
        logger.error(f"Error getting unread count: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e),
            'unread_count': 0
        }, status=500)

@login_required
@csrf_exempt
@require_http_methods(["POST"])
def mark_notification_as_read(request):
    """
    API для отметки уведомления как прочитанного
    """
    try:
        from .models import Notification
        
        data = json.loads(request.body)
        notification_id = data.get('notification_id')
        
        if not notification_id:
            return JsonResponse({
                'success': False,
                'error': 'Не указан ID уведомления'
            }, status=400)
        
        try:
            notification = Notification.objects.get(
                id=notification_id,
                user=request.user
            )
            
            notification.mark_as_read()
            
            # Получаем обновленное количество непрочитанных
            unread_count = Notification.get_unread_count(request.user)
            
            return JsonResponse({
                'success': True,
                'unread_count': unread_count
            })
            
        except Notification.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Уведомление не найдено'
            }, status=404)
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Неверный формат JSON'
        }, status=400)
    except Exception as e:
        logger.error(f"Error marking notification as read: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@login_required
@csrf_exempt
@require_http_methods(["POST"])
def mark_all_notifications_as_read(request):
    """
    API для отметки всех уведомлений как прочитанных
    """
    try:
        from .models import Notification
        
        marked_count = Notification.mark_all_as_read(request.user)
        
        return JsonResponse({
            'success': True,
            'marked_count': marked_count,
            'unread_count': 0
        })
        
    except Exception as e:
        logger.error(f"Error marking all notifications as read: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@login_required
@csrf_exempt
@require_http_methods(["DELETE"])
def delete_notification(request, notification_id):
    """
    API для удаления уведомления
    """
    try:
        from .models import Notification
        
        try:
            notification = Notification.objects.get(
                id=notification_id,
                user=request.user
            )
            
            notification.delete()
            
            # Получаем обновленное количество непрочитанных
            unread_count = Notification.get_unread_count(request.user)
            
            return JsonResponse({
                'success': True,
                'unread_count': unread_count
            })
            
        except Notification.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Уведомление не найдено'
            }, status=404)
        
    except Exception as e:
        logger.error(f"Error deleting notification: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@login_required
def notification_settings_view(request):
    """
    Страница настроек уведомлений
    """
    try:
        from .models import NotificationSettings
        
        settings, created = NotificationSettings.objects.get_or_create(user=request.user)
        
        if request.method == 'POST':
            # Обновляем настройки
            settings.new_videos_enabled = request.POST.get('new_videos_enabled') == 'on'
            settings.new_materials_enabled = request.POST.get('new_materials_enabled') == 'on'
            settings.comment_replies_enabled = request.POST.get('comment_replies_enabled') == 'on'
            settings.comment_likes_enabled = request.POST.get('comment_likes_enabled') == 'on'
            settings.video_likes_enabled = request.POST.get('video_likes_enabled') == 'on'
            settings.new_subscribers_enabled = request.POST.get('new_subscribers_enabled') == 'on'
            settings.mentions_enabled = request.POST.get('mentions_enabled') == 'on'
            settings.system_notifications_enabled = request.POST.get('system_notifications_enabled') == 'on'
            settings.email_notifications_enabled = request.POST.get('email_notifications_enabled') == 'on'
            settings.email_frequency = request.POST.get('email_frequency', 'never')
            
            settings.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Настройки успешно сохранены'
            })
        
        return render(request, 'notifications/settings.html', {
            'settings': settings
        })
        
    except Exception as e:
        logger.error(f"Error in notification settings: {e}")
        if request.method == 'POST':
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=500)
        else:
            return render(request, 'notifications/settings.html', {
                'error': str(e)
            })

@login_required
@csrf_exempt
@require_http_methods(["POST"])
def update_notification_settings(request):
    """
    API для обновления настроек уведомлений
    """
    try:
        from .models import NotificationSettings
        
        data = json.loads(request.body)
        
        settings, created = NotificationSettings.objects.get_or_create(user=request.user)
        
        # Обновляем настройки из данных запроса
        for field_name, value in data.items():
            if hasattr(settings, field_name):
                setattr(settings, field_name, value)
        
        settings.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Настройки успешно обновлены'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Неверный формат JSON'
        }, status=400)
    except Exception as e:
        logger.error(f"Error updating notification settings: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

# Утилитарные функции для создания уведомлений
def create_video_notification(video_owner, video_id, video_title):
    """Создает уведомления о новом видео для всех подписчиков"""
    try:
        from .models import notify_new_video
        notify_new_video(video_owner, video_id, video_title)
        logger.info(f"Created video notifications for {video_owner}")
    except Exception as e:
        logger.error(f"Error creating video notifications: {e}")

def create_material_notification(material_owner, material_id, material_title):
    """Создает уведомления о новом материале для всех подписчиков"""
    try:
        from .models import notify_new_material
        notify_new_material(material_owner, material_id, material_title)
        logger.info(f"Created material notifications for {material_owner}")
    except Exception as e:
        logger.error(f"Error creating material notifications: {e}")

def create_subscription_notification(channel_owner, subscriber):
    """Создает уведомление о новом подписчике"""
    try:
        from .models import notify_new_subscriber
        notify_new_subscriber(channel_owner, subscriber)
        logger.info(f"Created subscription notification for {channel_owner}")
    except Exception as e:
        logger.error(f"Error creating subscription notification: {e}")

def create_like_notification(video_owner, liker, video_id, video_title):
    """Создает уведомление о лайке видео"""
    try:
        from .models import notify_video_like
        notify_video_like(video_owner, liker, video_id, video_title)
        logger.info(f"Created like notification for {video_owner}")
    except Exception as e:
        logger.error(f"Error creating like notification: {e}")

def create_comment_reply_notification(comment_owner, reply_author, video_id, video_owner, reply_text):
    """Создает уведомление об ответе на комментарий"""
    try:
        from .models import notify_comment_reply
        notify_comment_reply(comment_owner, reply_author, video_id, video_owner, reply_text)
        logger.info(f"Created comment reply notification")
    except Exception as e:
        logger.error(f"Error creating comment reply notification: {e}")