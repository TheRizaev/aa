from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.models import Count, Sum, Avg, Q
from django.utils import timezone
from datetime import datetime, timedelta
import json
import logging
from collections import defaultdict

from .models import VideoView, VideoLike, Subscription, ChatHistory
from .s3_storage import get_bucket, BUCKET_NAME, get_video_metadata, list_user_videos
from .gcs_views import get_user_profile_from_gcs

logger = logging.getLogger(__name__)

@login_required
def analytics_dashboard(request):
    """
    Main analytics dashboard view
    """
    if not request.user.profile.is_author:
        return redirect('become_author')
    
    # Get basic analytics data for initial load
    username = request.user.username
    
    # Get basic stats
    basic_stats = get_basic_analytics_stats(username)
    
    return render(request, 'analytics/analytics_dashboard.html', {
        'basic_stats': basic_stats,
        'username': username
    })

@login_required
@require_http_methods(["GET"])
def analytics_api_overview(request):
    """
    API endpoint for overview analytics data
    """
    try:
        username = request.user.username
        
        # Get date range from request
        days = int(request.GET.get('days', 30))
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        # Get all analytics data
        overview_data = {
            'stats': get_basic_analytics_stats(username),
            'views_over_time': get_views_over_time(username, start_date, end_date),
            'top_videos': get_top_videos(username, limit=10),
            'demographics': get_viewer_demographics(username),
            'engagement': get_engagement_stats(username),
            'revenue': get_revenue_stats(username),
            'growth': get_growth_stats(username, days)
        }
        
        return JsonResponse({
            'success': True,
            'data': overview_data
        })
        
    except Exception as e:
        logger.error(f"Error getting analytics overview: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@login_required
@require_http_methods(["GET"])
def analytics_api_detailed(request, video_id):
    """
    API endpoint for detailed video analytics
    """
    try:
        username = request.user.username
        
        # Get detailed video analytics
        detailed_data = {
            'video_info': get_video_info(username, video_id),
            'views_timeline': get_video_views_timeline(username, video_id),
            'engagement_metrics': get_video_engagement_metrics(username, video_id),
            'viewer_retention': get_viewer_retention(username, video_id),
            'traffic_sources': get_traffic_sources(username, video_id),
            'comments_stats': get_comments_stats(username, video_id)
        }
        
        return JsonResponse({
            'success': True,
            'data': detailed_data
        })
        
    except Exception as e:
        logger.error(f"Error getting detailed analytics for video {video_id}: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@login_required
@require_http_methods(["GET"])
def analytics_api_export(request):
    """
    API endpoint for exporting analytics data
    """
    try:
        username = request.user.username
        format_type = request.GET.get('format', 'json')
        
        if format_type not in ['json', 'csv']:
            return JsonResponse({
                'success': False,
                'error': 'Unsupported format'
            }, status=400)
        
        # Get all analytics data
        export_data = get_export_data(username)
        
        if format_type == 'csv':
            # Generate CSV response
            import csv
            from django.http import HttpResponse
            
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="analytics_{username}_{timezone.now().strftime("%Y%m%d")}.csv"'
            
            writer = csv.writer(response)
            
            # Write CSV headers and data
            write_csv_data(writer, export_data)
            
            return response
        else:
            # Return JSON
            return JsonResponse({
                'success': True,
                'data': export_data,
                'exported_at': timezone.now().isoformat()
            })
        
    except Exception as e:
        logger.error(f"Error exporting analytics: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def get_basic_analytics_stats(username):
    """
    Get basic analytics statistics
    """
    try:
        # Get videos from S3
        user_videos = list_user_videos(username)
        
        if not user_videos:
            return {
                'total_videos': 0,
                'total_views': 0,
                'total_likes': 0,
                'total_dislikes': 0,
                'subscribers': 0,
                'average_watch_time': 0,
                'engagement_rate': 0
            }
        
        # Calculate totals
        total_videos = len(user_videos)
        total_views = sum(int(video.get('views', 0)) for video in user_videos)
        total_likes = sum(int(video.get('likes', 0)) for video in user_videos)
        total_dislikes = sum(int(video.get('dislikes', 0)) for video in user_videos)
        
        # Get subscribers count
        subscribers = Subscription.objects.filter(channel_id=username).count()
        
        # Calculate engagement rate
        total_engagements = total_likes + total_dislikes
        engagement_rate = (total_engagements / total_views * 100) if total_views > 0 else 0
        
        # Get average watch time from ChatHistory (approximate)
        avg_watch_time = ChatHistory.objects.filter(
            user__username=username
        ).aggregate(avg_time=Avg('response_time'))['avg_time'] or 0
        
        return {
            'total_videos': total_videos,
            'total_views': total_views,
            'total_likes': total_likes,
            'total_dislikes': total_dislikes,
            'subscribers': subscribers,
            'average_watch_time': round(avg_watch_time, 2),
            'engagement_rate': round(engagement_rate, 2)
        }
        
    except Exception as e:
        logger.error(f"Error getting basic stats: {e}")
        return {}

def get_views_over_time(username, start_date, end_date):
    """
    Get views over time data for charts
    """
    try:
        # Get views from database
        views_by_date = VideoView.objects.filter(
            video_owner=username,
            viewed_at__gte=start_date,
            viewed_at__lte=end_date
        ).extra({
            'date': "date(viewed_at)"
        }).values('date').annotate(
            views=Count('id')
        ).order_by('date')
        
        # Fill in missing dates with 0 views
        current_date = start_date.date()
        end_date_only = end_date.date()
        views_dict = {item['date']: item['views'] for item in views_by_date}
        
        result = []
        while current_date <= end_date_only:
            result.append({
                'date': current_date.strftime('%Y-%m-%d'),
                'views': views_dict.get(current_date, 0)
            })
            current_date += timedelta(days=1)
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting views over time: {e}")
        return []

def get_top_videos(username, limit=10):
    """
    Get top performing videos
    """
    try:
        user_videos = list_user_videos(username)
        
        if not user_videos:
            return []
        
        # Sort by views and take top videos
        sorted_videos = sorted(
            user_videos, 
            key=lambda x: int(x.get('views', 0)), 
            reverse=True
        )[:limit]
        
        # Add additional metrics
        for video in sorted_videos:
            video_id = video.get('video_id')
            if video_id:
                # Get likes/dislikes from database
                likes_count = VideoLike.objects.filter(
                    video_id=video_id,
                    video_owner=username,
                    is_like=True
                ).count()
                
                dislikes_count = VideoLike.objects.filter(
                    video_id=video_id,
                    video_owner=username,
                    is_like=False
                ).count()
                
                video['likes_db'] = likes_count
                video['dislikes_db'] = dislikes_count
                
                # Calculate engagement rate
                total_views = int(video.get('views', 0))
                total_engagements = likes_count + dislikes_count
                video['engagement_rate'] = (total_engagements / total_views * 100) if total_views > 0 else 0
        
        return sorted_videos
        
    except Exception as e:
        logger.error(f"Error getting top videos: {e}")
        return []

def get_viewer_demographics(username):
    """
    Get viewer demographics data
    """
    try:
        # Get unique viewers
        unique_viewers = VideoView.objects.filter(
            video_owner=username
        ).values('user__id').distinct().count()
        
        # Get returning vs new viewers (simplified)
        total_views = VideoView.objects.filter(video_owner=username).count()
        
        # Calculate approximate demographics
        demographics = {
            'unique_viewers': unique_viewers,
            'total_views': total_views,
            'avg_views_per_viewer': round(total_views / unique_viewers, 2) if unique_viewers > 0 else 0,
            'device_types': [
                {'name': 'Desktop', 'value': 45},
                {'name': 'Mobile', 'value': 35},
                {'name': 'Tablet', 'value': 20}
            ],
            'top_countries': [
                {'country': 'Узбекистан', 'views': int(total_views * 0.6)},
                {'country': 'Россия', 'views': int(total_views * 0.2)},
                {'country': 'Казахстан', 'views': int(total_views * 0.1)},
                {'country': 'Другие', 'views': int(total_views * 0.1)}
            ]
        }
        
        return demographics
        
    except Exception as e:
        logger.error(f"Error getting demographics: {e}")
        return {}

def get_engagement_stats(username):
    """
    Get engagement statistics
    """
    try:
        # Get likes/dislikes
        likes = VideoLike.objects.filter(
            video_owner=username,
            is_like=True
        ).count()
        
        dislikes = VideoLike.objects.filter(
            video_owner=username,
            is_like=False
        ).count()
        
        # Get comments count (from S3)
        total_comments = 0
        user_videos = list_user_videos(username)
        
        for video in user_videos:
            video_id = video.get('video_id')
            if video_id:
                try:
                    from .s3_storage import get_video_comments
                    comments_data = get_video_comments(username, video_id)
                    total_comments += len(comments_data.get('comments', []))
                except:
                    pass
        
        # Get subscribers
        subscribers = Subscription.objects.filter(channel_id=username).count()
        
        # Get subscriber growth over last 30 days
        thirty_days_ago = timezone.now() - timedelta(days=30)
        new_subscribers = Subscription.objects.filter(
            channel_id=username,
            subscribed_at__gte=thirty_days_ago
        ).count()
        
        return {
            'likes': likes,
            'dislikes': dislikes,
            'comments': total_comments,
            'subscribers': subscribers,
            'new_subscribers_30d': new_subscribers,
            'like_dislike_ratio': round(likes / (dislikes + 1), 2)
        }
        
    except Exception as e:
        logger.error(f"Error getting engagement stats: {e}")
        return {}

def get_revenue_stats(username):
    """
    Get revenue statistics (placeholder for future implementation)
    """
    # This is a placeholder for future monetization features
    return {
        'total_revenue': 0.00,
        'revenue_this_month': 0.00,
        'estimated_revenue': 0.00,
        'cpm': 0.00,
        'revenue_by_video': []
    }

def get_growth_stats(username, days=30):
    """
    Get growth statistics over specified period
    """
    try:
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        previous_start = start_date - timedelta(days=days)
        
        # Current period stats
        current_views = VideoView.objects.filter(
            video_owner=username,
            viewed_at__gte=start_date
        ).count()
        
        current_likes = VideoLike.objects.filter(
            video_owner=username,
            created_at__gte=start_date
        ).count()
        
        current_subscribers = Subscription.objects.filter(
            channel_id=username,
            subscribed_at__gte=start_date
        ).count()
        
        # Previous period stats
        previous_views = VideoView.objects.filter(
            video_owner=username,
            viewed_at__gte=previous_start,
            viewed_at__lt=start_date
        ).count()
        
        previous_likes = VideoLike.objects.filter(
            video_owner=username,
            created_at__gte=previous_start,
            created_at__lt=start_date
        ).count()
        
        previous_subscribers = Subscription.objects.filter(
            channel_id=username,
            subscribed_at__gte=previous_start,
            subscribed_at__lt=start_date
        ).count()
        
        # Calculate growth percentages
        def calculate_growth(current, previous):
            if previous == 0:
                return 100 if current > 0 else 0
            return round(((current - previous) / previous) * 100, 2)
        
        return {
            'views_growth': calculate_growth(current_views, previous_views),
            'likes_growth': calculate_growth(current_likes, previous_likes),
            'subscribers_growth': calculate_growth(current_subscribers, previous_subscribers),
            'period_days': days
        }
        
    except Exception as e:
        logger.error(f"Error getting growth stats: {e}")
        return {}

def get_video_info(username, video_id):
    """
    Get detailed video information
    """
    try:
        metadata = get_video_metadata(username, video_id)
        if not metadata:
            return {}
        
        # Add database stats
        db_views = VideoView.objects.filter(
            video_owner=username,
            video_id=video_id
        ).count()
        
        db_likes = VideoLike.objects.filter(
            video_owner=username,
            video_id=video_id,
            is_like=True
        ).count()
        
        db_dislikes = VideoLike.objects.filter(
            video_owner=username,
            video_id=video_id,
            is_like=False
        ).count()
        
        metadata['db_views'] = db_views
        metadata['db_likes'] = db_likes
        metadata['db_dislikes'] = db_dislikes
        
        return metadata
        
    except Exception as e:
        logger.error(f"Error getting video info: {e}")
        return {}

def get_video_views_timeline(username, video_id):
    """
    Get video views timeline for the last 30 days
    """
    try:
        thirty_days_ago = timezone.now() - timedelta(days=30)
        
        views_by_date = VideoView.objects.filter(
            video_owner=username,
            video_id=video_id,
            viewed_at__gte=thirty_days_ago
        ).extra({
            'date': "date(viewed_at)"
        }).values('date').annotate(
            views=Count('id')
        ).order_by('date')
        
        return list(views_by_date)
        
    except Exception as e:
        logger.error(f"Error getting video views timeline: {e}")
        return []

def get_video_engagement_metrics(username, video_id):
    """
    Get detailed engagement metrics for a video
    """
    try:
        likes = VideoLike.objects.filter(
            video_owner=username,
            video_id=video_id,
            is_like=True
        ).count()
        
        dislikes = VideoLike.objects.filter(
            video_owner=username,
            video_id=video_id,
            is_like=False
        ).count()
        
        views = VideoView.objects.filter(
            video_owner=username,
            video_id=video_id
        ).count()
        
        # Get comments
        try:
            from .s3_storage import get_video_comments
            comments_data = get_video_comments(username, video_id)
            comments_count = len(comments_data.get('comments', []))
        except:
            comments_count = 0
        
        engagement_rate = ((likes + dislikes + comments_count) / views * 100) if views > 0 else 0
        
        return {
            'likes': likes,
            'dislikes': dislikes,
            'comments': comments_count,
            'views': views,
            'engagement_rate': round(engagement_rate, 2),
            'like_dislike_ratio': round(likes / (dislikes + 1), 2)
        }
        
    except Exception as e:
        logger.error(f"Error getting video engagement metrics: {e}")
        return {}

def get_viewer_retention(username, video_id):
    """
    Get viewer retention data (simulated for now)
    """
    # This is simulated data - in a real implementation,
    # you would track actual watch time and drop-off points
    return [
        {'time': 0, 'retention': 100},
        {'time': 10, 'retention': 85},
        {'time': 20, 'retention': 75},
        {'time': 30, 'retention': 65},
        {'time': 40, 'retention': 58},
        {'time': 50, 'retention': 52},
        {'time': 60, 'retention': 45},
        {'time': 70, 'retention': 40},
        {'time': 80, 'retention': 35},
        {'time': 90, 'retention': 30},
        {'time': 100, 'retention': 25}
    ]

def get_traffic_sources(username, video_id):
    """
    Get traffic sources data (simulated)
    """
    total_views = VideoView.objects.filter(
        video_owner=username,
        video_id=video_id
    ).count()
    
    # Simulated traffic sources
    return [
        {'source': 'KRONIK Homepage', 'views': int(total_views * 0.4)},
        {'source': 'Search', 'views': int(total_views * 0.25)},
        {'source': 'Subscriptions', 'views': int(total_views * 0.20)},
        {'source': 'External', 'views': int(total_views * 0.10)},
        {'source': 'Direct', 'views': int(total_views * 0.05)}
    ]

def get_comments_stats(username, video_id):
    """
    Get comments statistics
    """
    try:
        from .s3_storage import get_video_comments
        comments_data = get_video_comments(username, video_id)
        comments = comments_data.get('comments', [])
        
        total_comments = len(comments)
        
        # Count replies
        total_replies = sum(len(comment.get('replies', [])) for comment in comments)
        
        # Get recent comments
        recent_comments = sorted(
            comments, 
            key=lambda x: x.get('date', ''), 
            reverse=True
        )[:5]
        
        return {
            'total_comments': total_comments,
            'total_replies': total_replies,
            'recent_comments': recent_comments
        }
        
    except Exception as e:
        logger.error(f"Error getting comments stats: {e}")
        return {}

def get_export_data(username):
    """
    Get all data for export
    """
    try:
        return {
            'basic_stats': get_basic_analytics_stats(username),
            'top_videos': get_top_videos(username, limit=50),
            'demographics': get_viewer_demographics(username),
            'engagement': get_engagement_stats(username),
            'growth': get_growth_stats(username, 30),
            'exported_at': timezone.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting export data: {e}")
        return {}

def write_csv_data(writer, data):
    """
    Write analytics data to CSV
    """
    # Write basic stats
    writer.writerow(['Basic Statistics'])
    writer.writerow(['Metric', 'Value'])
    for key, value in data.get('basic_stats', {}).items():
        writer.writerow([key.replace('_', ' ').title(), value])
    
    writer.writerow([])  # Empty row
    
    # Write top videos
    writer.writerow(['Top Videos'])
    writer.writerow(['Title', 'Views', 'Likes', 'Dislikes', 'Upload Date'])
    for video in data.get('top_videos', []):
        writer.writerow([
            video.get('title', ''),
            video.get('views', 0),
            video.get('likes', 0),
            video.get('dislikes', 0),
            video.get('upload_date', '')
        ])