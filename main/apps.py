
from django.apps import AppConfig

class MainConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'main'
    
    def ready(self):
        import main.signals  # Your existing imports
        import main.s3_utils  # Your existing imports