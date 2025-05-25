"""
Text-to-Speech service using Yandex Cloud SpeechKit.
"""
import io
import grpc
import logging
from typing import Optional

import pydub
from pydub import AudioSegment

# Импортируем протобуфы из локальной папки cloudapi
from cloudapi.output.yandex.cloud.ai.tts.v3 import tts_pb2
from cloudapi.output.yandex.cloud.ai.tts.v3 import tts_service_pb2_grpc

from django.conf import settings

# Configure pydub with ffmpeg paths
AudioSegment.converter = settings.FFMPEG_PATH
AudioSegment.ffprobe = settings.FFPROBE_PATH
AudioSegment.ffmpeg = settings.FFMPEG_PATH

logger = logging.getLogger(__name__)

class TTSService:
    """Text-to-Speech service using Yandex SpeechKit API."""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize TTS service with API key."""
        self.api_key = api_key or settings.YANDEX_API_KEY
        self.channel = None
        self.stub = None
        self._setup_grpc()
        
    def _setup_grpc(self):
        """Set up gRPC channel and stub."""
        try:
            cred = grpc.ssl_channel_credentials()
            self.channel = grpc.secure_channel(settings.YANDEX_TTS_ENDPOINT, cred)
            self.stub = tts_service_pb2_grpc.SynthesizerStub(self.channel)
            logger.debug("TTS gRPC channel and stub initialized")
        except Exception as e:
            logger.error(f"Failed to initialize TTS gRPC: {e}")
            raise
    
    def _create_synthesis_request(self, text: str, voice: str = None, 
                                 role: str = None, speed: float = None) -> tts_pb2.UtteranceSynthesisRequest:
        """Create a synthesis request with specified parameters."""
        # Use defaults if not specified
        voice = voice or settings.VOICE
        role = role or settings.VOICE_ROLE
        speed = speed or settings.VOICE_SPEED
        
        return tts_pb2.UtteranceSynthesisRequest(
            text=text,
            output_audio_spec=tts_pb2.AudioFormatOptions(
                container_audio=tts_pb2.ContainerAudio(
                    container_audio_type=tts_pb2.ContainerAudio.WAV
                )
            ),
            hints=[
                tts_pb2.Hints(voice=voice),
                tts_pb2.Hints(role=role),
                tts_pb2.Hints(speed=speed),
            ],
            loudness_normalization_type=tts_pb2.UtteranceSynthesisRequest.LUFS
        )
    
    def synthesize(self, text: str, voice: str = None, 
                  role: str = None, speed: float = None) -> Optional[AudioSegment]:
        """
        Synthesize speech from text.
        
        Args:
            text: Text to synthesize
            voice: Voice identifier
            role: Voice role (friendly, neutral, etc.)
            speed: Speech speed factor
            
        Returns:
            AudioSegment object or None if synthesis failed
        """
        MAX_TEXT_LENGTH = 2000
        if not text:
            logger.warning("Empty text for synthesis")
            return None
            
        if len(text) > MAX_TEXT_LENGTH:
            logger.warning(f"Text is too long for synthesis (length: {len(text)}). Truncating to {MAX_TEXT_LENGTH} characters.")
            text = text[:MAX_TEXT_LENGTH]
        
        if not self.api_key:
            raise ValueError("API key is not set")
    
        request = self._create_synthesis_request(text, voice, role, speed)
        logger.info(f"Synthesizing text: {text[:50]}{'...' if len(text) > 50 else ''}")
        
        try:
            metadata = (('authorization', f'Api-Key {self.api_key}'),)
            response_iterator = self.stub.UtteranceSynthesis(request, metadata=metadata)
            
            audio_data = io.BytesIO()
            for response in response_iterator:
                audio_data.write(response.audio_chunk.data)
                
            # Reset position for reading
            audio_data.seek(0)
            
            # Convert to AudioSegment
            audio_segment = AudioSegment.from_wav(audio_data)
            logger.debug(f"Audio synthesized, duration: {len(audio_segment)/1000:.2f}s")
            
            return audio_segment
            
        except grpc.RpcError as err:
            logger.error(f"TTS gRPC error: {err.details()} (Code: {err.code()})")
            raise
        except Exception as e:
            logger.error(f"TTS general error: {str(e)}")
            raise
    
    def synthesize_to_file(self, text: str, output_file: str, 
                          voice: str = None, role: str = None, 
                          speed: float = None) -> bool:
        """
        Synthesize speech and save to file.
        
        Args:
            text: Text to synthesize
            output_file: Path to save the audio file
            voice, role, speed: Same as in synthesize()
            
        Returns:
            True if successful, False otherwise
        """
        try:
            audio = self.synthesize(text, voice, role, speed)
            if audio:
                audio.export(output_file, format="wav")
                logger.info(f"Audio saved to {output_file}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to save audio: {str(e)}")
            return False
    
    def close(self):
        """Close gRPC channel."""
        if self.channel:
            self.channel.close()
            logger.debug("TTS gRPC channel closed")