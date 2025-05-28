from django.urls import path
from . import views
from . import gcs_views 
from . import ai_views
from . import material_views
from . import analytics_views
from .voice_assistant import voice_chat, start_voice_recognition, synthesize_text
from django.conf import settings

urlpatterns = [
    path('', views.index, name='index'),  # Main page
    path('video/<str:video_id>/', views.video_detail, name='video_detail_gcs'),  # Video detail page
    
    # Updated channel URL pattern to handle username with @ prefix
    path('channel/<str:username>/', views.channel_view, name='channel'),  # Channel/Author page
    
    path('search/', views.search_results, name='search_results'),  # Search results page
    path('search-page/', views.search_page, name='search_page'),  # Google-like search page
    path('register/', views.register_view, name='register'),  # Registration page
    path('verify-email/', views.verify_email_view, name='verify_email'),  # Email verification page
    path('user-details/', views.user_details_view, name='user_details'),  # New user details page
    path('login/', views.login_view, name='login'),  # Login page
    path('logout/', views.logout_view, name='logout'),  # Logout handler
    path('profile/', views.profile_view, name='profile'),  # User profile
    path('profile/settings/', views.profile_settings_view, name='profile_settings'),  # Profile settings

    # Новые страницы для лайков и истории
    path('liked-videos/', views.liked_videos, name='liked_videos'),  # Понравившиеся видео
    path('watch-history/', views.watch_history, name='watch_history'),  # История просмотров

    path('studio/', gcs_views.studio_view, name='studio'),  # Uses the new GCS-integrated view

    path('become-author/', views.author_application, name='become_author'),  # Author application
    
    # API endpoints for Google Cloud Storage
    path('api/upload-video/', gcs_views.upload_video_to_gcs, name='upload_video_to_gcs'),
    path('api/list-user-videos/', gcs_views.list_user_videos, name='list_user_videos'),
    path('api/list-user-videos/<str:username>/', gcs_views.list_user_videos, name='list_user_videos_for_user'),
    path('api/list-all-videos/', gcs_views.list_all_videos, name='list_all_videos'),
    path('api/delete-video/<str:video_id>/', gcs_views.delete_video_from_gcs, name='delete_video_from_gcs'),
    path('api/get-video-url/<str:video_id>/', gcs_views.get_video_url, name='get_video_url'),
    path('api/get-thumbnail-url/<str:video_id>/', gcs_views.get_thumbnail_url, name='get_thumbnail_url'),
    path('api/add-comment/', gcs_views.add_comment, name='add_comment'),
    path('api/add-reply/', gcs_views.add_reply, name='add_reply'),
    path('api/track-view/', gcs_views.track_video_view, name='track_video_view'),
    
    # New endpoint for getting user profiles with avatar
    path('api/get-user-profile/', views.get_user_profile, name='get_user_profile'),
    
    # New endpoints for like/dislike functionality
    path('api/toggle-video-like/', views.toggle_video_like, name='toggle_video_like'),
    path('api/toggle-video-dislike/', views.toggle_video_dislike, name='toggle_video_dislike'),
    path('api/video-like-status/<str:video_id>/', views.get_video_like_status, name='get_video_like_status'),
    
    path('api/toggle-subscription/', views.toggle_subscription, name='toggle_subscription'),
    path('api/check-subscription/<str:channel_id>/', views.check_subscription, name='check_subscription'),
    path('api/get-subscriptions/', views.get_subscriptions, name='get_subscriptions'),
    
    # AI Chat endpoints
    path('api/ai-chat/', ai_views.AIChatView.as_view(), name='ai_chat'),
    path('api/ai-chat-simple/', ai_views.ai_chat_simple, name='ai_chat_simple'),
    path('api/ai-status/', ai_views.ai_status, name='ai_status'),
    path('api/ai-chat-stats/', ai_views.get_chat_stats, name='ai_chat_stats'),
    
    # Новые endpoints для истории чата
    path('api/get-chat-history/', ai_views.get_chat_history, name='get_chat_history'),
    path('api/clear-chat-history/', ai_views.clear_chat_history, name='clear_chat_history'),
    path('api/voice-chat/', voice_chat, name='voice_chat'),
    path('api/start-voice-recognition/', start_voice_recognition, name='start_voice_recognition'),
    path('api/synthesize-text/', synthesize_text, name='synthesize_text'),
    
    path('library/', material_views.library_view, name='library'),
    path('library/my-materials/', material_views.my_materials_view, name='my_materials'),
    path('library/material/<str:material_id>/', material_views.material_detail_view, name='material_detail'),
    
    # НОВЫЕ URL-Ы ДЛЯ АНАЛИТИКИ
    path('analytics/', analytics_views.analytics_dashboard, name='analytics_dashboard'),
    path('api/analytics/overview/', analytics_views.analytics_api_overview, name='analytics_api_overview'),
    path('api/analytics/video//', analytics_views.analytics_api_detailed, name='analytics_api_detailed'),
    path('api/analytics/export/', analytics_views.analytics_api_export, name='analytics_api_export'),
    
    # Material API URLs
    path('api/upload-material/', material_views.upload_material_view, name='upload_material'),
    path('api/list-user-materials/', material_views.list_user_materials_api, name='list_user_materials_api'),
    path('api/list-user-materials/<str:username>/', material_views.list_user_materials_api, name='list_user_materials_api_user'),
    path('api/download-material/<str:material_id>/', material_views.download_material, name='download_material'),
    path('api/delete-material/<str:material_id>/', material_views.delete_material_view, name='delete_material'),
]

if settings.DEBUG:
    from django.views.defaults import page_not_found
    urlpatterns.append(path('404/', lambda request: page_not_found(request, None)))