import json
import logging
import time
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.views import View
from django.conf import settings
from django.db import transaction
from asgiref.sync import sync_to_async
import os
import asyncio

logger = logging.getLogger(__name__)

# Современная настройка OpenAI API
try:
    from openai import OpenAI
    
    # Инициализация клиента OpenAI
    client = OpenAI(
        api_key=getattr(settings, 'OPENAI_API_KEY', os.getenv('OPENAI_API_KEY'))
    )
    OPENAI_AVAILABLE = True
except ImportError:
    logger.error("OpenAI library not installed. Install with: pip install openai")
    OPENAI_AVAILABLE = False
    client = None
except Exception as e:
    logger.error(f"Error initializing OpenAI client: {e}")
    OPENAI_AVAILABLE = False
    client = None

class AICreateMixin:
    """Миксин для создания AI ответов с поддержкой streaming и истории"""
    
    def get_system_prompt(self):
        """Возвращает системный промпт для Кроника"""
        return """Ты Кроник ИИ - персональный образовательный помощник платформы KRONIK. 

Твоя роль:
- Помогать пользователям в изучении различных предметов
- Объяснять сложные концепции простым языком
- Отвечать на вопросы по образованию, науке, технологиям
- Давать советы по обучению и развитию навыков
- Рекомендовать ресурсы для изучения

Стиль общения:
- Дружелюбный и поддерживающий
- Объясняй сложные вещи простыми словами
- Используй примеры и аналогии
- Структурируй ответы для лучшего понимания
- Отвечай на узбекском языке
- Учитывай предыдущий контекст беседы

Ограничения:
- Не давай медицинских, юридических или финансовых советов
- Если не знаешь точного ответа, честно об этом скажи
- Направляй к официальным источникам при необходимости
- Поощряй критическое мышление

Всегда помни, что ты помощник в обучении, а не замена учителю или экспертам.
У тебя есть доступ к истории предыдущих сообщений, используй её для более точных и релевантных ответов."""

    async def get_user_context(self, user):
        """Получает контекст пользователя для более персонализированных ответов"""
        if not user.is_authenticated:
            return None

        def get_profile_info(user):
            parts = []
            if hasattr(user, 'profile'):
                profile = user.profile
                if profile.display_name:
                    parts.append(f"Имя: {profile.display_name}")
                if profile.is_author:
                    parts.append("Статус: Автор на платформе")
                if hasattr(profile, 'expertise_areas') and profile.expertise_areas.exists():
                    areas = [area.name for area in profile.expertise_areas.all()]
                    parts.append(f"Области экспертизы: {', '.join(areas)}")
            return parts

        context_parts = await sync_to_async(get_profile_info)(user)
        return "; ".join(context_parts) if context_parts else None

    async def get_chat_history_context(self, user, current_message, context_limit=10):
        from .models import ChatHistory
        logger.debug(f"ChatHistory.get_context_for_ai is async: {asyncio.iscoroutinefunction(ChatHistory.get_context_for_ai)}")

        try:
            def fetch_context(user, limit):
                return ChatHistory.get_context_for_ai(user, limit)

            recent_messages = await sync_to_async(fetch_context)(user, context_limit)
            messages = [{"role": "system", "content": self.get_system_prompt()}]
            user_context = await self.get_user_context(user)
            if user_context:
                messages.append({"role": "system", "content": f"Контекст пользователя: {user_context}"})
            messages.extend(recent_messages)
            messages.append({"role": "user", "content": current_message})
            return messages

        except Exception as e:
            logger.error(f"Error getting chat history context: {e}")
            messages = [{"role": "system", "content": self.get_system_prompt()}]
            user_context = await self.get_user_context(user)
            if user_context:
                messages.append({"role": "system", "content": f"Контекст пользователя: {user_context}"})
            messages.append({"role": "user", "content": current_message})
            return messages


@method_decorator(login_required, name='dispatch')  # Требуем авторизации
@method_decorator(csrf_exempt, name='dispatch')
@method_decorator(require_http_methods(["POST"]), name='dispatch')
class AIChatView(View, AICreateMixin):
    """View для обработки AI чата с сохранением истории"""
    
    def post(self, request):
        try:
            # Проверяем доступность OpenAI
            if not OPENAI_AVAILABLE or not client:
                return JsonResponse({
                    'error': 'AI сервис временно недоступен. Проверьте настройки OpenAI API.'
                }, status=503)
            
            # Парсим JSON данные
            data = json.loads(request.body)
            message = data.get('message', '').strip()
            
            if not message:
                return JsonResponse({'error': 'Сообщение не может быть пустым'}, status=400)
            
            # Получаем контекст с историей чата (последние 10 сообщений)
            messages = self.get_chat_history_context(request.user, message, context_limit=10)
            
            # Создаем streaming response
            response = StreamingHttpResponse(
                self.stream_ai_response(request.user, message, messages),
                content_type='text/plain; charset=utf-8'
            )
            
            # Добавляем только безопасные заголовки для SSE
            response['Cache-Control'] = 'no-cache'
            response['X-Accel-Buffering'] = 'no'  # Для nginx
            
            return response
            
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Неверный формат JSON'}, status=400)
        except Exception as e:
            logger.error(f"Error in AIChatView: {e}")
            return JsonResponse({'error': 'Внутренняя ошибка сервера'}, status=500)
    
    def stream_ai_response(self, user, original_message, messages):
        """Генерирует streaming ответ с сохранением в историю"""
        try:
            start_time = time.time()
            full_response = ""
            
            # Создаем streaming запрос к OpenAI
            try:
                stream = client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=messages,
                    max_tokens=1000,
                    temperature=0.7,
                    stream=True
                )
                
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response += content
                        # Форматируем как Server-Sent Events
                        yield f"data: {json.dumps({'content': content})}\n\n"
                
                # Сохраняем в историю после завершения
                response_time = time.time() - start_time
                self.save_to_history(user, original_message, full_response, 
                                   model_used="gpt-3.5-turbo", response_time=response_time)
                
                # Сигнализируем об окончании
                yield f"data: {json.dumps({'done': True})}\n\n"
                
            except Exception as openai_error:
                error_str = str(openai_error).lower()
                
                if 'authentication' in error_str or 'api key' in error_str:
                    error_message = "Ошибка аутентификации OpenAI API. Проверьте API ключ."
                elif 'rate limit' in error_str or 'quota' in error_str:
                    error_message = "Превышен лимит запросов к OpenAI API. Попробуйте позже."
                elif 'billing' in error_str or 'payment' in error_str:
                    error_message = "Проблема с оплатой OpenAI API. Проверьте баланс аккаунта."
                else:
                    error_message = "Извините, произошла ошибка с AI сервисом. Попробуйте еще раз."
                    
                logger.error(f"OpenAI API Error: {openai_error}")
                yield f"data: {json.dumps({'content': error_message})}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
                
        except Exception as e:
            logger.error(f"Error in stream_ai_response: {e}")
            error_message = "Извините, произошла ошибка. Попробуйте еще раз."
            yield f"data: {json.dumps({'content': error_message})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
    
    async def save_to_history(self, user, message, response, model_used=None, response_time=None):
        """Сохраняет сообщение и ответ в историю с ограничением до 100 сообщений"""
        try:
            from .models import ChatHistory

            async with transaction.atomic():
                # Создаем запись в истории
                await sync_to_async(ChatHistory.objects.create)(
                    user=user,
                    message=message,
                    response=response,
                    model_used=model_used or 'gpt-3.5-turbo',
                    response_time=response_time
                )

                # Очищаем старые сообщения (оставляем последние 100)
                await sync_to_async(ChatHistory.cleanup_old_messages)(user, keep_last=100)

        except Exception as e:
            logger.error(f"Error saving to history: {e}")


@login_required
@csrf_exempt
@require_http_methods(["POST"])"
async def ai_chat_simple(request):
    """Простая версия AI чата без streaming с сохранением истории"""
    try:
        # Проверяем доступность OpenAI
        if not OPENAI_AVAILABLE or not client:
            return JsonResponse({
                'success': False,
                'error': 'AI сервис временно недоступен. Проверьте настройки OpenAI API.'
            }, status=503)
        
        data = json.loads(request.body)
        message = data.get('message', '').strip()
        
        if not message:
            return JsonResponse({'success': False, 'error': 'Сообщение не может быть пустым'}, status=400)
        
        # Создаем экземпляр миксина для использования методов
        ai_mixin = AICreateMixin()
        
        # Получаем контекст с историей (последние 10 сообщений)
        messages = await ai_mixin.get_chat_history_context(request.user, message, context_limit=10)
        
        # Получаем ответ от OpenAI
        try:
            start_time = time.time()
            
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model="gpt-3.5-turbo",
                messages=messages,
                max_tokens=1000,
                temperature=0.7
            )
            
            ai_response = response.choices[0].message.content
            response_time = time.time() - start_time
            
            # Сохраняем в историю
            from asgiref.sync import sync_to_async
            from .models import ChatHistory
            @sync_to_async
            def save_chat_history():
                with transaction.atomic():
                    ChatHistory.objects.create(
                        user=request.user,
                        message=message,
                        response=ai_response,
                        model_used='gpt-3.5-turbo',
                        response_time=response_time,
                        tokens_used=response.usage.total_tokens if response.usage else None
                    )
                    ChatHistory.cleanup_old_messages(request.user, keep_last=100)
            
            await save_chat_history()
            
            return JsonResponse({
                'success': True,
                'input_type': 'text',
                'response': ai_response
            })
            
        except Exception as openai_error:
            error_str = str(openai_error).lower()
            
            if 'authentication' in error_str or 'api key' in error_str:
                error_message = 'Ошибка аутентификации OpenAI API. Проверьте настройки.'
                status_code = 401
            elif 'rate limit' in error_str or 'quota' in error_str:
                error_message = 'Превышен лимит запросов. Попробуйте позже.'
                status_code = 429
            elif 'billing' in error_str or 'payment' in error_str:
                error_message = 'Проблема с оплатой OpenAI API. Проверьте баланс.'
                status_code = 402
            else:
                error_message = 'Ошибка AI сервиса. Попробуйте еще раз.'
                status_code = 500
                
            logger.error(f"OpenAI API Error in simple chat: {openai_error}")
            return JsonResponse({'success': False, 'error': error_message}, status=status_code)
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Неверный формат JSON'}, status=400)
    except Exception as e:
        logger.error(f"Error in ai_chat_simple: {e}")
        return JsonResponse({
            'success': False,
            'error': 'Произошла ошибка при обработке запроса'
        }, status=500)


@login_required
@require_http_methods(["GET"])
def get_chat_history(request):
    """Получить историю чата пользователя (последние 50 сообщений для отображения)"""
    try:
        from .models import ChatHistory
        
        limit = int(request.GET.get('limit', 50))
        limit = min(limit, 100)  # Максимум 100 сообщений для отображения
        
        history = ChatHistory.get_recent_history(request.user, limit)
        
        # Преобразуем в формат для фронтенда
        history_data = []
        for chat in reversed(history):  # Обращаем для хронологического порядка
            history_data.extend([
                {
                    'type': 'user',
                    'content': chat.message,
                    'timestamp': chat.created_at.isoformat()
                },
                {
                    'type': 'assistant',
                    'content': chat.response,
                    'timestamp': chat.created_at.isoformat()
                }
            ])
        
        return JsonResponse({
            'success': True,
            'history': history_data,
            'total_messages': len(history_data)
        })
        
    except Exception as e:
        logger.error(f"Error getting chat history: {e}")
        return JsonResponse({
            'error': 'Ошибка получения истории чата'
        }, status=500)


# Endpoint для очистки истории
@login_required
@csrf_exempt
@require_http_methods(["POST"])
def clear_chat_history(request):
    """Очистить историю чата пользователя"""
    try:
        from .models import ChatHistory
        
        deleted_count = ChatHistory.objects.filter(user=request.user).delete()[0]
        
        return JsonResponse({
            'success': True,
            'deleted_count': deleted_count,
            'message': f'Удалено {deleted_count} сообщений из истории'
        })
        
    except Exception as e:
        logger.error(f"Error clearing chat history: {e}")
        return JsonResponse({
            'error': 'Ошибка очистки истории чата'
        }, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def ai_status(request):
    """Проверяет статус подключения к OpenAI API"""
    try:
        if not OPENAI_AVAILABLE:
            return JsonResponse({
                'success': False,
                'status': 'library_not_installed',
                'message': 'OpenAI library not installed'
            }, status=503)
            
        if not client:
            return JsonResponse({
                'success': False,
                'status': 'client_not_initialized',
                'message': 'OpenAI client not initialized'
            }, status=503)
        
        # Простой тестовый запрос
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=5
        )
        
        return JsonResponse({
            'success': True,
            'status': 'connected',
            'model': 'gpt-3.5-turbo',
            'message': 'OpenAI API is working correctly'
        })
        
    except Exception as e:
        error_str = str(e).lower()
        
        if 'authentication' in error_str or 'api key' in error_str:
            status = 'authentication_error'
            message = 'Invalid or missing API key'
            http_status = 401
        elif 'rate limit' in error_str:
            status = 'rate_limit_error'
            message = 'Rate limit exceeded'
            http_status = 429
        elif 'billing' in error_str:
            status = 'billing_error'
            message = 'Billing issue with OpenAI account'
            http_status = 402
        else:
            status = 'unknown_error'
            message = str(e)
            http_status = 500
            
        logger.error(f"OpenAI status check failed: {e}")
        return JsonResponse({
            'success': False,
            'status': status,
            'message': message
        }, status=http_status)


# Функция для получения статистики чата
@login_required
def get_chat_stats(request):
    """Возвращает статистику использования чата пользователем"""
    try:
        from .models import ChatHistory
        
        total_messages = ChatHistory.objects.filter(user=request.user).count()
        
        # Статистика за последние 30 дней
        from datetime import datetime, timedelta
        thirty_days_ago = datetime.now() - timedelta(days=30)
        recent_messages = ChatHistory.objects.filter(
            user=request.user,
            created_at__gte=thirty_days_ago
        ).count()
        
        stats = {
            'total_messages': total_messages,
            'recent_messages': recent_messages,
            'openai_status': OPENAI_AVAILABLE,
            'max_history': 100
        }
        
        return JsonResponse({
            'success': True,
            'stats': stats
        })
        
    except Exception as e:
        logger.error(f"Error getting chat stats: {e}")
        return JsonResponse({
            'error': 'Ошибка получения статистики'
        }, status=500)