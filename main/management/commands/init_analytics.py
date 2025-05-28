"""
Команда Django для инициализации данных аналитики
Запуск: python manage.py init_analytics
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import datetime, timedelta
import random

from main.models import (
    VideoAnalytics, ChannelAnalytics, ViewerDemographics, 
    TrafficSource, AnalyticsGoal, VideoView, VideoLike, Subscription
)
from main.s3_storage import list_user_videos, get_user_profile_from_gcs

class Command(BaseCommand):
    help = 'Initialize analytics data for existing users and videos'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Number of days to generate analytics for (default: 30)'
        )
        parser.add_argument(
            '--users',
            type=str,
            help='Comma-separated list of usernames to process (default: all authors)'
        )
        parser.add_argument(
            '--simulate',
            action='store_true',
            help='Generate simulated analytics data'
        )
    
    def handle(self, *args, **options):
        days = options['days']
        specific_users = options.get('users')
        simulate = options['simulate']
        
        self.stdout.write(
            self.style.SUCCESS(f'Starting analytics initialization for {days} days...')
        )
        
        # Get users to process
        if specific_users:
            usernames = [u.strip() for u in specific_users.split(',')]
            users = User.objects.filter(username__in=usernames, profile__is_author=True)
        else:
            users = User.objects.filter(profile__is_author=True)
        
        self.stdout.write(f'Processing {users.count()} author(s)...')
        
        for user in users:
            self.process_user(user, days, simulate)
        
        self.stdout.write(
            self.style.SUCCESS('Analytics initialization completed!')
        )
    
    def process_user(self, user, days, simulate):
        """Process analytics for a single user"""
        username = user.username
        self.stdout.write(f'Processing user: {username}')
        
        # Get user videos from S3
        user_videos = list_user_videos(username)
        
        if not user_videos:
            self.stdout.write(f'  No videos found for {username}')
            return
        
        self.stdout.write(f'  Found {len(user_videos)} videos')
        
        # Generate analytics for each day
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days)
        
        current_date = start_date
        while current_date <= end_date:
            self.create_daily_analytics(user, user_videos, current_date, simulate)
            current_date += timedelta(days=1)
        
        # Create goals for the user
        self.create_analytics_goals(user)
        
        self.stdout.write(f'  Completed analytics for {username}')
    
    def create_daily_analytics(self, user, user_videos, date, simulate):
        """Create analytics for a specific day"""
        username = user.username
        
        # Channel analytics
        channel_analytics = self.get_or_create_channel_analytics(username, date, simulate)
        
        # Video analytics for each video
        for video in user_videos:
            video_id = video.get('video_id')
            if video_id:
                self.get_or_create_video_analytics(video_id, username, date, simulate)
        
        # Demographics
        self.get_or_create_demographics(username, date, simulate)
        
        # Traffic sources
        self.create_traffic_sources(username, date, simulate)
    
    def get_or_create_channel_analytics(self, username, date, simulate):
        """Get or create channel analytics for a date"""
        analytics, created = ChannelAnalytics.objects.get_or_create(
            channel_owner=username,
            date=date,
            defaults=self.generate_channel_defaults(username, date, simulate)
        )
        
        if created and simulate:
            # Add some realistic variation
            analytics.total_views = random.randint(50, 500)
            analytics.new_subscribers = random.randint(-5, 20)
            analytics.total_likes = random.randint(5, 50)
            analytics.total_dislikes = random.randint(0, 10)
            analytics.total_comments = random.randint(2, 25)
            analytics.save()
        
        return analytics
    
    def get_or_create_video_analytics(self, video_id, username, date, simulate):
        """Get or create video analytics for a date"""
        analytics, created = VideoAnalytics.objects.get_or_create(
            video_id=video_id,
            video_owner=username,
            date=date,
            defaults=self.generate_video_defaults(video_id, username, date, simulate)
        )
        
        if created and simulate:
            # Generate realistic video analytics
            base_views = random.randint(10, 100)
            analytics.views_count = base_views
            analytics.unique_viewers = int(base_views * random.uniform(0.7, 0.9))
            analytics.likes_count = int(base_views * random.uniform(0.02, 0.08))
            analytics.dislikes_count = int(base_views * random.uniform(0.001, 0.02))
            analytics.comments_count = int(base_views * random.uniform(0.01, 0.05))
            
            # Device distribution
            analytics.mobile_views = int(base_views * random.uniform(0.4, 0.6))
            analytics.desktop_views = int(base_views * random.uniform(0.3, 0.5))
            analytics.tablet_views = base_views - analytics.mobile_views - analytics.desktop_views
            
            # Traffic sources
            analytics.direct_traffic = int(base_views * random.uniform(0.1, 0.3))
            analytics.search_traffic = int(base_views * random.uniform(0.2, 0.4))
            analytics.social_traffic = int(base_views * random.uniform(0.1, 0.3))
            analytics.external_traffic = base_views - analytics.direct_traffic - analytics.search_traffic - analytics.social_traffic
            
            analytics.save()
        
        return analytics
    
    def get_or_create_demographics(self, username, date, simulate):
        """Get or create demographics for a date"""
        demographics, created = ViewerDemographics.objects.get_or_create(
            channel_owner=username,
            date=date,
            defaults=self.generate_demographics_defaults(username, date, simulate)
        )
        
        if created and simulate:
            total_viewers = random.randint(50, 300)
            
            # Age distribution
            demographics.age_13_17 = int(total_viewers * random.uniform(0.05, 0.15))
            demographics.age_18_24 = int(total_viewers * random.uniform(0.2, 0.35))
            demographics.age_25_34 = int(total_viewers * random.uniform(0.25, 0.4))
            demographics.age_35_44 = int(total_viewers * random.uniform(0.15, 0.25))
            demographics.age_45_54 = int(total_viewers * random.uniform(0.05, 0.15))
            demographics.age_55_64 = int(total_viewers * random.uniform(0.02, 0.08))
            demographics.age_65_plus = int(total_viewers * random.uniform(0.01, 0.05))
            
            # Gender distribution
            demographics.male_viewers = int(total_viewers * random.uniform(0.4, 0.7))
            demographics.female_viewers = int(total_viewers * random.uniform(0.25, 0.55))
            demographics.other_gender = total_viewers - demographics.male_viewers - demographics.female_viewers
            
            # Device distribution
            demographics.mobile_users = int(total_viewers * random.uniform(0.4, 0.6))
            demographics.desktop_users = int(total_viewers * random.uniform(0.3, 0.5))
            demographics.tablet_users = int(total_viewers * random.uniform(0.05, 0.15))
            demographics.smart_tv_users = total_viewers - demographics.mobile_users - demographics.desktop_users - demographics.tablet_users
            
            # Geography
            demographics.top_country_1_views = int(total_viewers * random.uniform(0.4, 0.7))
            demographics.top_country_2_views = int(total_viewers * random.uniform(0.15, 0.3))
            demographics.top_country_3_views = int(total_viewers * random.uniform(0.05, 0.2))
            
            demographics.save()
        
        return demographics
    
    def create_traffic_sources(self, username, date, simulate):
        """Create traffic sources for a date"""
        if not simulate:
            return
        
        sources = [
            ('kronik_home', 'KRONIK Homepage'),
            ('kronik_search', 'KRONIK Search'),
            ('subscriptions', 'Subscriptions'),
            ('search', 'Google'),
            ('search', 'Yandex'),
            ('social', 'Telegram'),
            ('social', 'VKontakte'),
            ('external', 'External Sites'),
            ('direct', 'Direct'),
        ]
        
        for source_type, source_name in sources:
            # Random chance of having traffic from this source
            if random.random() > 0.7:  # 30% chance
                views = random.randint(5, 50)
                unique_visitors = int(views * random.uniform(0.6, 0.9))
                
                TrafficSource.objects.get_or_create(
                    channel_owner=username,
                    date=date,
                    source_type=source_type,
                    source_name=source_name,
                    defaults={
                        'views_count': views,
                        'unique_visitors': unique_visitors,
                        'bounce_rate': random.uniform(20.0, 70.0),
                        'average_session_duration': timedelta(
                            minutes=random.randint(2, 15),
                            seconds=random.randint(0, 59)
                        )
                    }
                )
    
    def create_analytics_goals(self, user):
        """Create sample analytics goals for user"""
        username = user.username
        
        # Check if user already has goals
        if AnalyticsGoal.objects.filter(user=user).exists():
            return
        
        goals_data = [
            {
                'title': '1000 просмотров в месяц',
                'goal_type': 'views',
                'target_value': 1000,
                'current_value': random.randint(200, 800),
            },
            {
                'title': '100 подписчиков',
                'goal_type': 'subscribers',
                'target_value': 100,
                'current_value': random.randint(20, 80),
            },
            {
                'title': '5% вовлеченность',
                'goal_type': 'engagement',
                'target_value': 5.0,
                'current_value': round(random.uniform(2.0, 4.5), 1),
            }
        ]
        
        start_date = timezone.now().date()
        end_date = start_date + timedelta(days=30)
        
        for goal_data in goals_data:
            AnalyticsGoal.objects.create(
                user=user,
                start_date=start_date,
                end_date=end_date,
                **goal_data
            )
    
    def generate_channel_defaults(self, username, date, simulate):
        """Generate default values for channel analytics"""
        if simulate:
            return {}  # Will be filled in get_or_create_channel_analytics
        
        # Get real data from database
        subscribers = Subscription.objects.filter(channel_id=username).count()
        
        return {
            'total_subscribers': subscribers,
            'new_subscribers': 0,
            'total_views': 0,
            'total_videos': 0,
            'total_likes': 0,
            'total_dislikes': 0,
            'total_comments': 0,
        }
    
    def generate_video_defaults(self, video_id, username, date, simulate):
        """Generate default values for video analytics"""
        if simulate:
            return {}  # Will be filled in get_or_create_video_analytics
        
        # Get real data from database
        views_count = VideoView.objects.filter(
            video_id=video_id,
            video_owner=username,
            viewed_at__date=date
        ).count()
        
        likes_count = VideoLike.objects.filter(
            video_id=video_id,
            video_owner=username,
            is_like=True,
            created_at__date=date
        ).count()
        
        dislikes_count = VideoLike.objects.filter(
            video_id=video_id,
            video_owner=username,
            is_like=False,
            created_at__date=date
        ).count()
        
        return {
            'views_count': views_count,
            'unique_viewers': views_count,  # Simplified
            'likes_count': likes_count,
            'dislikes_count': dislikes_count,
            'comments_count': 0,  # Would need to check S3
        }
    
    def generate_demographics_defaults(self, username, date, simulate):
        """Generate default values for demographics"""
        if simulate:
            return {}  # Will be filled in get_or_create_demographics
        
        return {
            'age_13_17': 0,
            'age_18_24': 0,
            'age_25_34': 0,
            'age_35_44': 0,
            'age_45_54': 0,
            'age_55_64': 0,
            'age_65_plus': 0,
            'male_viewers': 0,
            'female_viewers': 0,
            'other_gender': 0,
            'mobile_users': 0,
            'desktop_users': 0,
            'tablet_users': 0,
            'smart_tv_users': 0,
            'top_country_1': 'Uzbekistan',
            'top_country_1_views': 0,
            'top_country_2': 'Russia',
            'top_country_2_views': 0,
            'top_country_3': 'Kazakhstan',
            'top_country_3_views': 0,
        }