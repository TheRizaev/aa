import asyncio
import json
from asgiref.sync import async_to_sync
import logging
from typing import Optional, Callable
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
import tempfile
import os
from django.conf import settings
from asgiref.sync import sync_to_async
from .stt_service import STTService
from .tts_service import TTSService
from .ai_views import AICreateMixin

logger = logging.getLogger(__name__)

class VoiceAssistant:
    """Main voice assistant class that coordinates STT, AI, and TTS"""
    
    def __init__(self):
        self.stt_service = STTService()
        self.tts_service = TTSService()
        self.ai_mixin = AICreateMixin()
        
    def cleanup(self):
        """Cleanup resources"""
        if self.stt_service:
            self.stt_service.close()
        if self.tts_service:
            self.tts_service.close()
    
    def truncate_text_for_tts(self, text, max_length=1000):
        """Обрезаем текст для TTS с учетом ограничений Yandex"""
        if len(text) <= max_length:
            return text
        
        # Находим последнее предложение, которое помещается в лимит
        truncated = text[:max_length]
        last_sentence_end = max(
            truncated.rfind('.'),
            truncated.rfind('!'),
            truncated.rfind('?')
        )
        
        if last_sentence_end > 0:
            return truncated[:last_sentence_end + 1]
        
        # Если не нашли конец предложения, обрезаем по последнему пробелу
        last_space = truncated.rfind(' ')
        if last_space > 0:
            return truncated[:last_space] + '...'
        
        return truncated[:max_length-3] + '...'
    
    async def process_voice_message(self, user, audio_data: bytes) -> dict:
        try:
            # 1. Speech to Text
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_audio:
                tmp_audio.write(audio_data)
                tmp_audio_path = tmp_audio.name
            
            transcription = self.stt_service.recognize_file(tmp_audio_path)
            
            if not transcription:
                return {
                    'success': False,
                    'error': 'Не удалось распознать речь'
                }
            
            # 2. Get AI response with shorter max_tokens for voice
            # Используем sync_to_async для получения контекста
            messages = await sync_to_async(self._get_chat_context_sync)(user, transcription)
            ai_response = await self._get_ai_response(messages, max_tokens=150)  # Меньше токенов для голоса
            
            # 3. Truncate response for TTS if needed
            truncated_response = self.truncate_text_for_tts(ai_response, max_length=800)
            
            # 4. Text to Speech
            audio_segment = self.tts_service.synthesize(truncated_response)
            
            if not audio_segment:
                return {
                    'success': False,
                    'error': 'Не удалось синтезировать речь'
                }
            
            # Save audio to temporary file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_output:
                audio_segment.export(tmp_output.name, format='wav')
                output_path = tmp_output.name
            
            # Clean up input file
            os.unlink(tmp_audio_path)
            
            return {
                'success': True,
                'transcription': transcription,
                'ai_response': ai_response,
                'truncated_response': truncated_response if len(ai_response) > len(truncated_response) else None,
                'audio_path': output_path
            }
            
        except Exception as e:
            logger.error(f"Error processing voice message: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _get_chat_context_sync(self, user, message):
        """Get chat context synchronously - для использования через sync_to_async"""
        from .models import ChatHistory
        
        messages = [{"role": "system", "content": self.ai_mixin.get_system_prompt()}]
        
        # Add user context if available
        if hasattr(user, 'profile'):
            profile = user.profile
            context_parts = []
            if profile.display_name:
                context_parts.append(f"Имя: {profile.display_name}")
            if profile.is_author:
                context_parts.append("Статус: Автор на платформе")
            if context_parts:
                messages.append({"role": "system", "content": f"Контекст пользователя: {'; '.join(context_parts)}"})
        
        # Get chat history - синхронно
        recent_messages = ChatHistory.get_context_for_ai(user, 5)  # Меньше контекста для голоса
        messages.extend(recent_messages)
        messages.append({"role": "user", "content": message})
        
        return messages
    
    async def _get_ai_response(self, messages, max_tokens=150):
        """Get response from OpenAI"""
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model="gpt-3.5-turbo",
                messages=messages,
                max_tokens=max_tokens,  # Используем переданное значение
                temperature=0.7
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Error getting AI response: {e}")
            return "Извините, произошла ошибка при обработке запроса."

# Global voice assistant instance
voice_assistant = None

def get_voice_assistant():
    """Get or create voice assistant instance"""
    global voice_assistant
    if not voice_assistant:
        voice_assistant = VoiceAssistant()
    return voice_assistant

@login_required
@csrf_exempt
@require_http_methods(["POST"])
@async_to_sync  # Wrap async view for WSGI
async def voice_chat(request):
    """
    Handle voice chat requests
    Expects audio data in request body
    Returns audio response with transcription and AI response
    """
    try:
        # Get audio data from request
        audio_data = request.body
        
        if not audio_data:
            return JsonResponse({
                'success': False,
                'error': 'Нет аудио данных'
            }, status=400)
        
        # Process voice message
        assistant = get_voice_assistant()
        result = await assistant.process_voice_message(request.user, audio_data)
        
        if not result['success']:
            return JsonResponse(result, status=400)
        
        # Read audio file and return as response
        with open(result['audio_path'], 'rb') as audio_file:
            audio_content = audio_file.read()
        
        # Clean up audio file
        os.unlink(result['audio_path'])
        
        # Save to chat history
        try:
            from .models import ChatHistory
            @sync_to_async
            def save_chat_history():
                ChatHistory.objects.create(
                    user=request.user,
                    message=result['transcription'],
                    response=result['ai_response'],
                    model_used='gpt-3.5-turbo-voice',
                    response_time=0  # Could track actual time
                )
            await save_chat_history()
        except Exception as e:
            logger.error(f"Error saving to chat history: {e}")
        
        # Return response with note if text was truncated
        response_data = {
            'success': True,
            'input_type': 'voice',
            'transcription': result['transcription'],
            'ai_response': result['ai_response'],
            'audio_base64': audio_content.hex()  # Convert to hex for JSON
        }
        
        if result.get('truncated_response'):
            response_data['truncated'] = True
            response_data['truncated_response'] = result['truncated_response']
        
        return JsonResponse(response_data)
        
    except Exception as e:
        logger.error(f"Error in voice_chat: {e}")
        return JsonResponse({
            'success': False,
            'error': 'Ошибка обработки голосового сообщения'
        }, status=500)

@login_required
@csrf_exempt
@require_http_methods(["POST"])
def start_voice_recognition(request):
    """
    Start real-time voice recognition streaming
    """
    try:
        def audio_stream_generator():
            """Generate audio stream events"""
            assistant = get_voice_assistant()
            
            def callback(event_type, data=None):
                """Callback for STT events"""
                if event_type == "start_listening":
                    yield f"data: {json.dumps({'type': 'started'})}\n\n"
                elif event_type == "partial":
                    yield f"data: {json.dumps({'type': 'partial', 'text': data})}\n\n"
                elif event_type == "recognized":
                    yield f"data: {json.dumps({'type': 'final', 'text': data})}\n\n"
                elif event_type == "error":
                    yield f"data: {json.dumps({'type': 'error', 'error': data})}\n\n"
                elif event_type == "stop_listening":
                    yield f"data: {json.dumps({'type': 'stopped'})}\n\n"
            
            # Start recognition
            recognized_text = assistant.stt_service.recognize_stream(callback)
            
            if recognized_text:
                yield f"data: {json.dumps({'type': 'complete', 'text': recognized_text})}\n\n"
        
        response = StreamingHttpResponse(
            audio_stream_generator(),
            content_type='text/event-stream'
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        
        return response
        
    except Exception as e:
        logger.error(f"Error starting voice recognition: {e}")
        return JsonResponse({
            'success': False,
            'error': 'Не удалось запустить распознавание речи'
        }, status=500)

@login_required
@require_http_methods(["POST"])
def synthesize_text(request):
    """
    Synthesize text to speech
    """
    try:
        data = json.loads(request.body)
        text = data.get('text', '').strip()
        
        if not text:
            return JsonResponse({
                'success': False,
                'error': 'Текст не указан'
            }, status=400)
        
        assistant = get_voice_assistant()
        
        # Truncate text if it's too long
        truncated_text = assistant.truncate_text_for_tts(text, max_length=800)
        
        audio_segment = assistant.tts_service.synthesize(truncated_text)
        
        if not audio_segment:
            return JsonResponse({
                'success': False,
                'error': 'Не удалось синтезировать речь'
            }, status=500)
        
        # Export to WAV format
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            audio_segment.export(tmp_file.name, format='wav')
            tmp_path = tmp_file.name
        
        # Read file and convert to base64
        with open(tmp_path, 'rb') as audio_file:
            audio_content = audio_file.read()
        
        # Clean up
        os.unlink(tmp_path)
        
        response_data = {
            'success': True,
            'audio_base64': audio_content.hex()
        }
        
        if len(text) > len(truncated_text):
            response_data['truncated'] = True
            response_data['original_length'] = len(text)
            response_data['truncated_length'] = len(truncated_text)
        
        return JsonResponse(response_data)
        
    except Exception as e:
        logger.error(f"Error synthesizing text: {e}")
        return JsonResponse({
            'success': False,
            'error': 'Ошибка синтеза речи'
        }, status=500)

# Cleanup on module unload
import atexit

def cleanup_voice_assistant():
    global voice_assistant
    if voice_assistant:
        voice_assistant.cleanup()
        voice_assistant = None

atexit.register(cleanup_voice_assistant)