
"""
Speech-to-Text service using Yandex Cloud SpeechKit.
"""
import io
import grpc
import pyaudio
import logging
from typing import Optional, Iterator, Callable, List
import wave

# Импортируем протобуфы из локальной папки cloudapi
from cloudapi.output.yandex.cloud.ai.stt.v3 import stt_pb2
from cloudapi.output.yandex.cloud.ai.stt.v3 import stt_service_pb2_grpc

# Импортируем настройки из Django
from django.conf import settings

logger = logging.getLogger(__name__)

class STTService:
    """Speech-to-Text service using Yandex SpeechKit API."""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize STT service with API key."""
        self.api_key = api_key or settings.YANDEX_API_KEY
        self.format = pyaudio.paInt16
        self.channel = None
        self.stub = None
        self._setup_grpc()
    
    def _setup_grpc(self):
        """Set up gRPC channel and stub."""
        try:
            cred = grpc.ssl_channel_credentials()
            self.channel = grpc.secure_channel(settings.YANDEX_STT_ENDPOINT, cred)
            self.stub = stt_service_pb2_grpc.RecognizerStub(self.channel)
            logger.debug("gRPC channel and stub initialized")
        except Exception as e:
            logger.error(f"Failed to initialize gRPC: {e}")
            raise
    
    def _create_streaming_options(self, languages: List[str] = None) -> stt_pb2.StreamingOptions:
        """Create streaming recognition options."""
        if not languages:
            languages = settings.YANDEX_LANGUAGES
            
        return stt_pb2.StreamingOptions(
            recognition_model=stt_pb2.RecognitionModelOptions(
                audio_format=stt_pb2.AudioFormatOptions(
                    raw_audio=stt_pb2.RawAudio(
                        audio_encoding=stt_pb2.RawAudio.LINEAR16_PCM,
                        sample_rate_hertz=settings.RATE,
                        audio_channel_count=settings.CHANNELS
                    )
                ),
                text_normalization=stt_pb2.TextNormalizationOptions(
                    text_normalization=stt_pb2.TextNormalizationOptions.TEXT_NORMALIZATION_ENABLED,
                    profanity_filter=True,
                    literature_text=False
                ),
                language_restriction=stt_pb2.LanguageRestrictionOptions(
                    restriction_type=stt_pb2.LanguageRestrictionOptions.WHITELIST,
                    language_code=languages
                ),
                audio_processing_type=stt_pb2.RecognitionModelOptions.REAL_TIME
            )
        )
    
    def _generate_requests(self, callback: Callable = None) -> Iterator[stt_pb2.StreamingRequest]:
        """Generate streaming requests from microphone input."""
        # First, yield the streaming options
        options = self._create_streaming_options()
        yield stt_pb2.StreamingRequest(session_options=options)
        
        # Initialize PyAudio
        p = pyaudio.PyAudio()
        stream = p.open(
            format=self.format,
            channels=settings.CHANNELS,
            rate=settings.RATE,
            input=True,
            frames_per_buffer=settings.CHUNK_SIZE
        )
        
        logger.info("Listening to microphone... (Press Ctrl+C to stop)")
        if callback:
            callback("start_listening")
            
        try:
            while True:
                data = stream.read(settings.CHUNK_SIZE, exception_on_overflow=False)
                yield stt_pb2.StreamingRequest(chunk=stt_pb2.AudioChunk(data=data))
        except KeyboardInterrupt:
            logger.info("Stopped microphone input")
            if callback:
                callback("stop_listening")
        finally:
            stream.stop_stream()
            stream.close()
            p.terminate()
            logger.debug("Audio resources released")
    
    def recognize_stream(self, callback: Callable = None) -> Optional[str]:
        """
        Recognize speech from microphone stream.
        
        Args:
            callback: Optional callback function for status updates
            
        Returns:
            Recognized text or None if nothing was recognized
        """
        if not self.api_key:
            raise ValueError("API key is not set")
        
        try:
            metadata = (('authorization', f'Api-Key {self.api_key}'),)
            stream_generator = self._generate_requests(callback)
            responses = self.stub.RecognizeStreaming(stream_generator, metadata=metadata)
            
            recognized_text = ""
            
            for response in responses:
                event_type = response.WhichOneof('Event')
                
                if event_type == 'final' and response.final.alternatives:
                    alternatives = [a.text for a in response.final.alternatives]
                    recognized_text = alternatives[0]
                    logger.info(f"Recognized text: {recognized_text}")
                    if callback:
                        callback("recognized", recognized_text)
                    break
                elif event_type == 'partial' and response.partial.alternatives:
                    alternatives = [a.text for a in response.partial.alternatives]
                    partial_text = alternatives[0]
                    logger.debug(f"Partial text: {partial_text}")
                    if callback:
                        callback("partial", partial_text)
            
            return recognized_text
            
        except grpc.RpcError as err:
            logger.error(f"STT gRPC error: {err.details()} (Code: {err.code()})")
            if callback:
                callback("error", str(err))
            raise
        except Exception as e:
            logger.error(f"STT general error: {str(e)}")
            if callback:
                callback("error", str(e))
            raise
    
    def recognize_file(self, file_path: str) -> Optional[str]:
        """
        Recognize speech from an audio file.
        
        Args:
            file_path: Path to the audio file
            
        Returns:
            Recognized text or None if nothing was recognized
        """
        try:
            # Read WAV file
            with wave.open(file_path, 'rb') as wf:
                if wf.getnchannels() != settings.CHANNELS:
                    raise ValueError(f"Audio file must have {settings.CHANNELS} channel(s)")
                if wf.getsampwidth() != 2:  # 16-bit
                    raise ValueError("Audio file must be 16-bit")
                if wf.getframerate() != settings.RATE:
                    raise ValueError(f"Audio file must have {settings.RATE} Hz sample rate")
                
                # Create recognition request
                options = self._create_streaming_options()
                
                # Generator for file chunks
                def file_chunk_generator():
                    yield stt_pb2.StreamingRequest(session_options=options)
                    
                    chunk_size = settings.CHUNK_SIZE
                    while True:
                        data = wf.readframes(chunk_size)
                        if not data:
                            break
                        yield stt_pb2.StreamingRequest(chunk=stt_pb2.AudioChunk(data=data))
                
                # Send request
                metadata = (('authorization', f'Api-Key {self.api_key}'),)
                responses = self.stub.RecognizeStreaming(file_chunk_generator(), metadata=metadata)
                
                recognized_text = ""
                
                for response in responses:
                    event_type = response.WhichOneof('Event')
                    
                    if event_type == 'final' and response.final.alternatives:
                        alternatives = [a.text for a in response.final.alternatives]
                        recognized_text = alternatives[0]
                        logger.info(f"File recognized text: {recognized_text}")
                        break
                print(f"Recognized text from file: {recognized_text}")
                return recognized_text
                
        except Exception as e:
            logger.error(f"Error recognizing file: {str(e)}")
            return None
        
    def close(self):
        """Close gRPC channel."""
        if self.channel:
            self.channel.close()
            logger.debug("STT gRPC channel closed")